import sys, tempfile
from pathlib import Path
sys.path.insert(0, "src")
import builder.store.db as db

# 작품 격리 그래프 테이블(project_id 키) — delete_project가 모두 비워야 한다.
_GRAPH_TABLES = ("entities", "relations", "events", "timeline", "secrets", "edit_log", "aliases")


def _fresh():
    db.CREATOR_DB = Path(tempfile.mktemp(suffix=".db"))
    db.init_db()


def _seed_graph(c, pid: int) -> None:
    """작품 pid에 귀속된 그래프 행을 테이블마다 1개씩 심는다."""
    eid = f"{pid}:karin"
    c.execute("INSERT INTO entities(id,project_id,name) VALUES(?,?,?)", (eid, pid, "카린"))
    c.execute("INSERT INTO relations(id,project_id,from_id,rel,to_id) VALUES(?,?,?,?,?)",
              (f"{pid}:r1", pid, eid, "친구", f"{pid}:other"))
    c.execute("INSERT INTO events(id,project_id,title) VALUES(?,?,?)", (f"{pid}:e1", pid, "각성"))
    c.execute("INSERT INTO timeline(project_id,entity_id,state) VALUES(?,?,?)", (pid, eid, "분노"))
    c.execute("INSERT INTO secrets(project_id,entity_id,fact) VALUES(?,?,?)", (pid, eid, "정체"))
    c.execute("INSERT INTO edit_log(project_id,op,target_id) VALUES(?,?,?)", (pid, "add", eid))
    c.execute("INSERT INTO aliases(project_id,alias,entity_id) VALUES(?,?,?)", (pid, "카린이", eid))


def _counts(c, pid: int) -> dict:
    return {t: c.execute(f"SELECT COUNT(*) n FROM {t} WHERE project_id=?", (pid,)).fetchone()["n"]
            for t in _GRAPH_TABLES}


def test_delete_project_clears_graph_tables():
    _fresh()
    from builder.store import repo
    from builder.store.db import get_conn
    pid = repo.create_project("작품")
    with get_conn() as c:
        _seed_graph(c, pid)
    # 사전 조건: 심은 행이 실제로 있어야 의미 있는 검증.
    with get_conn() as c:
        assert all(n > 0 for n in _counts(c, pid).values())

    repo.delete_project(pid)

    with get_conn() as c:
        left = _counts(c, pid)
        assert left == {t: 0 for t in _GRAPH_TABLES}, f"고아 그래프 행 잔존: {left}"
        assert c.execute("SELECT COUNT(*) n FROM projects WHERE id=?", (pid,)).fetchone()["n"] == 0


def test_delete_project_keeps_other_projects():
    """삭제는 해당 작품에만 국한 — 다른 작품의 그래프 행은 보존."""
    _fresh()
    from builder.store import repo
    from builder.store.db import get_conn
    keep = repo.create_project("보존")
    drop = repo.create_project("삭제")
    with get_conn() as c:
        _seed_graph(c, keep)
        _seed_graph(c, drop)

    repo.delete_project(drop)

    with get_conn() as c:
        assert all(n > 0 for n in _counts(c, keep).values()), "다른 작품 그래프 행이 함께 삭제됨"
        assert all(n == 0 for n in _counts(c, drop).values())
