"""원고/파이프라인 CRUD. 그래프 CRUD는 store/graph.py(후속). 여기는 project·chapter·manuscript·run·autosave."""

from datetime import datetime, timezone

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
        return cid


def list_chapters(season_id: int) -> list[dict]:
    with get_conn() as c:
        rows = c.execute("""SELECT ch.*, r.state FROM chapters ch
                            LEFT JOIN pipeline_runs r ON r.chapter_id = ch.id
                            WHERE ch.season_id=? ORDER BY ch.idx, ch.id""", (season_id,))
        return [dict(r) for r in rows]


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
        return {"chapter": dict(ch),
                "state": run["state"] if run else "DRAFT",
                "texts": texts}


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


def add_manuscript(chapter_id: int, kind: str, text: str) -> int:
    """생성 결과(polish/expand/final)를 새 버전으로 적재."""
    with get_conn() as c:
        v = c.execute("SELECT COALESCE(MAX(version),0)+1 v FROM manuscripts WHERE chapter_id=? AND kind=?",
                      (chapter_id, kind)).fetchone()["v"]
        cur = c.execute("INSERT INTO manuscripts(chapter_id,kind,text,version,created_at) VALUES(?,?,?,?,?)",
                        (chapter_id, kind, text, v, _now()))
        return cur.lastrowid


# ── pipeline run ──
def get_state(chapter_id: int) -> str:
    with get_conn() as c:
        r = c.execute("SELECT state FROM pipeline_runs WHERE chapter_id=?", (chapter_id,)).fetchone()
        return r["state"] if r else "DRAFT"


def set_state(chapter_id: int, state: str, payload_json: str | None = None) -> None:
    with get_conn() as c:
        c.execute("""UPDATE pipeline_runs SET state=?, payload_json=COALESCE(?,payload_json), updated_at=?
                     WHERE chapter_id=?""", (state, payload_json, _now(), chapter_id))
