"""원고/파이프라인 CRUD. 그래프 CRUD는 store/graph.py(후속). 여기는 project·chapter·manuscript·run·autosave."""

from datetime import datetime, timezone

from builder.const import AUTOSAVE_KEEP
from builder.store.db import get_conn


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── projects (+ 기본 시즌) ──
def create_project(title: str) -> int:
    with get_conn() as c:
        cur = c.execute("INSERT INTO projects(title,created_at,updated_at) VALUES(?,?,?)",
                        (title, _now(), _now()))
        pid = cur.lastrowid
        c.execute("INSERT INTO seasons(project_id,idx,title) VALUES(?,1,'시즌 1')", (pid,))
        return pid


def list_projects() -> list[dict]:
    with get_conn() as c:
        return [dict(r) for r in c.execute("SELECT * FROM projects ORDER BY updated_at DESC")]


def rename_project(pid: int, title: str) -> None:
    with get_conn() as c:
        c.execute("UPDATE projects SET title=?, updated_at=? WHERE id=?", (title, _now(), pid))


def delete_project(pid: int) -> None:
    with get_conn() as c:
        sids = [r["id"] for r in c.execute("SELECT id FROM seasons WHERE project_id=?", (pid,))]
        cids = [r["id"] for r in c.execute("SELECT id FROM chapters WHERE project_id=?", (pid,))]
        _wipe_chapters(c, cids)
        for sid in sids:
            c.execute("DELETE FROM seasons WHERE id=?", (sid,))
        c.execute("DELETE FROM projects WHERE id=?", (pid,))


# ── seasons ──
def create_season(project_id: int, title: str = "", idx: int = 0) -> int:
    with get_conn() as c:
        nxt = c.execute("SELECT COALESCE(MAX(idx),0)+1 v FROM seasons WHERE project_id=?",
                        (project_id,)).fetchone()["v"]
        cur = c.execute("INSERT INTO seasons(project_id,idx,title) VALUES(?,?,?)",
                        (project_id, idx or nxt, title or f"시즌 {nxt}"))
        return cur.lastrowid


def list_seasons(project_id: int) -> list[dict]:
    with get_conn() as c:
        return [dict(r) for r in c.execute(
            "SELECT * FROM seasons WHERE project_id=? ORDER BY idx,id", (project_id,))]


def rename_season(sid: int, title: str) -> None:
    with get_conn() as c:
        c.execute("UPDATE seasons SET title=? WHERE id=?", (title, sid))


def delete_season(sid: int) -> None:
    with get_conn() as c:
        cids = [r["id"] for r in c.execute("SELECT id FROM chapters WHERE season_id=?", (sid,))]
        _wipe_chapters(c, cids)
        c.execute("DELETE FROM seasons WHERE id=?", (sid,))


def move_season(sid: int, project_id: int) -> None:
    """시즌을 다른 작품으로 이동 — 소속 화들의 project_id까지 함께 갱신."""
    with get_conn() as c:
        nxt = c.execute("SELECT COALESCE(MAX(idx),0)+1 v FROM seasons WHERE project_id=?",
                        (project_id,)).fetchone()["v"]
        c.execute("UPDATE seasons SET project_id=?, idx=? WHERE id=?", (project_id, nxt, sid))
        c.execute("UPDATE chapters SET project_id=? WHERE season_id=?", (project_id, sid))


# ── chapters (시즌 소속, + 초기 run/draft) ──
def create_chapter(season_id: int, title: str = "", idx: int = 0) -> int:
    with get_conn() as c:
        s = c.execute("SELECT project_id FROM seasons WHERE id=?", (season_id,)).fetchone()
        if not s:
            raise ValueError("season not found")
        cur = c.execute("INSERT INTO chapters(project_id,season_id,idx,title) VALUES(?,?,?,?)",
                        (s["project_id"], season_id, idx, title))
        cid = cur.lastrowid
        c.execute("INSERT INTO pipeline_runs(chapter_id,state,updated_at) VALUES(?,?,?)",
                  (cid, "DRAFT", _now()))
        c.execute("INSERT INTO manuscripts(chapter_id,kind,text,version,created_at) VALUES(?,?,?,?,?)",
                  (cid, "draft", "", 1, _now()))
    from builder.store import version  # 지연 import(순환 회피)
    version.create(cid, "", kind="draft")  # 초기 head 버전
    return cid


def list_chapters(season_id: int) -> list[dict]:
    with get_conn() as c:
        rows = c.execute("""SELECT ch.*, r.state FROM chapters ch
                            LEFT JOIN pipeline_runs r ON r.chapter_id = ch.id
                            WHERE ch.season_id=? ORDER BY ch.idx, ch.id""", (season_id,))
        return [dict(r) for r in rows]


def rename_chapter(cid: int, title: str) -> None:
    with get_conn() as c:
        c.execute("UPDATE chapters SET title=? WHERE id=?", (title, cid))


def _wipe_chapters(c, cids: list[int]) -> None:
    """화들과 그 종속(원고·런·자동저장·생성잡)을 제거. 같은 트랜잭션 내."""
    for cid in cids:
        for t in ("manuscripts", "pipeline_runs", "autosaves", "gen_jobs"):
            c.execute(f"DELETE FROM {t} WHERE chapter_id=?", (cid,))
        c.execute("DELETE FROM chapters WHERE id=?", (cid,))


def delete_chapter(cid: int) -> None:
    with get_conn() as c:
        _wipe_chapters(c, [cid])


def move_chapter(cid: int, season_id: int) -> None:
    """화를 다른 시즌으로 이동 — 대상 시즌의 작품(project_id)까지 따라간다."""
    with get_conn() as c:
        s = c.execute("SELECT project_id FROM seasons WHERE id=?", (season_id,)).fetchone()
        if not s:
            raise ValueError("season not found")
        nxt = c.execute("SELECT COALESCE(MAX(idx),0)+1 v FROM chapters WHERE season_id=?",
                        (season_id,)).fetchone()["v"]
        c.execute("UPDATE chapters SET season_id=?, project_id=?, idx=? WHERE id=?",
                  (season_id, s["project_id"], nxt, cid))


def get_chapter(chapter_id: int) -> dict | None:
    with get_conn() as c:
        ch = c.execute("SELECT * FROM chapters WHERE id=?", (chapter_id,)).fetchone()
        if not ch:
            return None
        run = c.execute("SELECT state,payload_json FROM pipeline_runs WHERE chapter_id=?",
                        (chapter_id,)).fetchone()
        texts = {}
        for r in c.execute("""SELECT kind,text,version FROM manuscripts
                              WHERE chapter_id=? ORDER BY version""", (chapter_id,)):
            texts[r["kind"]] = {"text": r["text"], "version": r["version"]}
        result = {"chapter": dict(ch),
                  "state": run["state"] if run else "DRAFT",
                  "texts": texts}
    from builder.store import version  # 에디터 본문 = 현재 head 버전(본문모델 단일화)
    result["texts"]["current"] = {"text": version.head_text(chapter_id),
                                  "version": version.head_id(chapter_id) or 0}
    return result


# ── manuscripts / autosave ──
def save_draft_text(chapter_id: int, text: str) -> None:
    """현재 draft 원고를 갱신 + autosave 스냅샷. (10s idle 자동저장이 호출)"""
    with get_conn() as c:
        st = c.execute("SELECT state FROM pipeline_runs WHERE chapter_id=?",
                       (chapter_id,)).fetchone()
        c.execute("""UPDATE manuscripts SET text=?, version=version+1
                     WHERE chapter_id=? AND kind='draft'""", (text, chapter_id))
        c.execute("INSERT INTO autosaves(chapter_id,text,state,ts) VALUES(?,?,?,?)",
                  (chapter_id, text, st["state"] if st else "DRAFT", _now()))
        # 무한누적 방지: 이 화의 오래된 스냅샷은 최근 AUTOSAVE_KEEP개만 남기고 정리(같은 트랜잭션).
        c.execute("""DELETE FROM autosaves WHERE chapter_id=? AND id NOT IN
                     (SELECT id FROM autosaves WHERE chapter_id=? ORDER BY id DESC LIMIT ?)""",
                  (chapter_id, chapter_id, AUTOSAVE_KEEP))
    from builder.store import version  # 에디터 본문은 head 버전 — 자동저장이 head 갱신(in-place)
    version.update_head_text(chapter_id, text)


def add_manuscript(chapter_id: int, kind: str, text: str) -> int:
    """생성 결과(polish/expand/final)를 새 버전으로 적재."""
    with get_conn() as c:
        v = c.execute("SELECT COALESCE(MAX(version),0)+1 v FROM manuscripts WHERE chapter_id=? AND kind=?",
                      (chapter_id, kind)).fetchone()["v"]
        cur = c.execute("INSERT INTO manuscripts(chapter_id,kind,text,version,created_at) VALUES(?,?,?,?,?)",
                        (chapter_id, kind, text, v, _now()))
        return cur.lastrowid


# ── pipeline run ──
def world_of(chapter_id: int) -> str:
    """화가 속한 프로젝트(작품) 제목 = 세계관 이름."""
    with get_conn() as c:
        r = c.execute("""SELECT p.title FROM chapters ch JOIN projects p ON p.id=ch.project_id
                         WHERE ch.id=?""", (chapter_id,)).fetchone()
        return r["title"] if r else ""


def project_title(pid: int) -> str:
    """작품(project) 제목 = 세계관 이름. project_id 기준(레인 생성 등 world 주입용)."""
    with get_conn() as c:
        r = c.execute("SELECT title FROM projects WHERE id=?", (pid,)).fetchone()
        return r["title"] if r else ""


def project_of(chapter_id: int) -> int | None:
    """화가 속한 프로젝트(작품) id — 그래프를 작품별로 격리할 때 사용."""
    with get_conn() as c:
        r = c.execute("SELECT project_id FROM chapters WHERE id=?", (chapter_id,)).fetchone()
        return r["project_id"] if r else None


def story_seq(chapter_id: int) -> int:
    """스토리 순서 정수 = season.idx*1000000 + chapter.id (시즌·생성 순서 단조). 타임라인 정렬/'현재'용."""
    with get_conn() as c:
        r = c.execute("""SELECT COALESCE(s.idx,0) sidx, ch.id cid FROM chapters ch
                         LEFT JOIN seasons s ON s.id=ch.season_id WHERE ch.id=?""", (chapter_id,)).fetchone()
        return (r["sidx"] * 1000000 + r["cid"]) if r else 0


def chapter_label(chapter_id: int) -> str:
    with get_conn() as c:
        r = c.execute("SELECT title FROM chapters WHERE id=?", (chapter_id,)).fetchone()
        return (r["title"] or f"화 {chapter_id}") if r and r["title"] else f"화 {chapter_id}"


def get_state(chapter_id: int) -> str:
    with get_conn() as c:
        r = c.execute("SELECT state FROM pipeline_runs WHERE chapter_id=?", (chapter_id,)).fetchone()
        return r["state"] if r else "DRAFT"


def set_state(chapter_id: int, state: str, payload_json: str | None = None) -> None:
    with get_conn() as c:
        c.execute("""UPDATE pipeline_runs SET state=?, payload_json=COALESCE(?,payload_json), updated_at=?
                     WHERE chapter_id=?""", (state, payload_json, _now(), chapter_id))


def get_style(pid: int) -> str:
    """작품 문체 지침(없으면 빈 문자열)."""
    with get_conn() as c:
        r = c.execute("SELECT style_guide FROM projects WHERE id=?", (pid,)).fetchone()
        return (r["style_guide"] or "") if r and r["style_guide"] is not None else ""


def set_style(pid: int, text: str) -> None:
    with get_conn() as c:
        c.execute("UPDATE projects SET style_guide=?, updated_at=? WHERE id=?", (text, _now(), pid))


def latest_prose(pid: int, limit: int = 800, chapter_id: int | None = None) -> str:
    """문체 자동 샘플용 산문. chapter_id 주면 그 화 한정(현재 화 기준), 없으면 작품 전체 최신."""
    with get_conn() as c:
        if chapter_id is not None:
            r = c.execute("""SELECT text FROM manuscripts WHERE chapter_id=? AND text IS NOT NULL AND text!=''
                             ORDER BY id DESC LIMIT 1""", (chapter_id,)).fetchone()
        else:
            r = c.execute("""SELECT m.text FROM manuscripts m JOIN chapters ch ON ch.id=m.chapter_id
                             WHERE ch.project_id=? AND m.text IS NOT NULL AND m.text!=''
                             ORDER BY m.id DESC LIMIT 1""", (pid,)).fetchone()
        return (r["text"][:limit] if r else "")
