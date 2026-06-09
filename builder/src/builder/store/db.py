"""SQLite 연결 + 스키마 초기화. 연결 책임만."""

import sqlite3
from pathlib import Path

from builder.const import CREATOR_DB

_SCHEMA = Path(__file__).with_name("schema.sql")


def get_conn() -> sqlite3.Connection:
    """row_factory=Row, FK on 연결을 돌려준다."""
    conn = sqlite3.connect(CREATOR_DB)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    """스키마를 (없으면) 생성하고 마이그레이션. 앱 기동 시 1회."""
    CREATOR_DB.parent.mkdir(parents=True, exist_ok=True)
    with get_conn() as conn:
        conn.executescript(_SCHEMA.read_text(encoding="utf-8"))
        _migrate(conn)


def _migrate(conn) -> None:
    """기존 DB: chapters.season_id 추가 + 프로젝트별 기본 '시즌 1' 백필 + entities.data_json 추가."""
    cols = [r["name"] for r in conn.execute("PRAGMA table_info(chapters)")]
    if "season_id" not in cols:
        conn.execute("ALTER TABLE chapters ADD COLUMN season_id INTEGER")
    conn.execute("CREATE INDEX IF NOT EXISTS ix_chapters_season ON chapters(season_id)")
    # 스키마주도 타입 필드 blob (구 DB에는 없음)
    ecols = [r["name"] for r in conn.execute("PRAGMA table_info(entities)")]
    if "data_json" not in ecols:
        conn.execute("ALTER TABLE entities ADD COLUMN data_json TEXT")
    pcols = [r["name"] for r in conn.execute("PRAGMA table_info(projects)")]
    if "style_guide" not in pcols:
        conn.execute("ALTER TABLE projects ADD COLUMN style_guide TEXT")
    tcols = [r["name"] for r in conn.execute("PRAGMA table_info(timeline)")]
    if "chapter_id" not in tcols:
        conn.execute("ALTER TABLE timeline ADD COLUMN chapter_id INTEGER")
    rcols = [r["name"] for r in conn.execute("PRAGMA table_info(pipeline_runs)")]
    if "head_version_id" not in rcols:
        conn.execute("ALTER TABLE pipeline_runs ADD COLUMN head_version_id INTEGER")
    _migrate_project_scope(conn)
    _migrate_categories(conn)
    _migrate_seed_versions(conn)
    _migrate_fsm_states(conn)


# 구 14상태 → 슬림 6단계 리맵(FSM 슬림화). 멱등.
_FSM_REMAP = {
    "CHAR_DETECT": "POLISH", "DB_WRITE": "POLISH", "DB_SYNC": "POLISH", "REVISE": "POLISH",
    "CTX_RESET_A": "EXPAND", "PARTIAL_POLISH": "EXPAND", "CTX_RESET_B": "EXPAND",
    "DB_SYNC2": "EXTRACT", "CHAPTER_SAVE": "PROMOTE",
}


def _migrate_fsm_states(conn) -> None:
    for old, new in _FSM_REMAP.items():
        conn.execute("UPDATE pipeline_runs SET state=? WHERE state=?", (new, old))


def _migrate_seed_versions(conn) -> None:
    """기존 화(버전 없음)에 현재 본문(final>expand>polish>draft)으로 초기 버전 시드 + head 지정. 멱등."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    for r in conn.execute("SELECT chapter_id FROM pipeline_runs WHERE head_version_id IS NULL").fetchall():
        cid = r["chapter_id"]
        text = ""
        for kind in ("final", "expand", "polish", "draft"):
            m = conn.execute("SELECT text FROM manuscripts WHERE chapter_id=? AND kind=? ORDER BY version DESC LIMIT 1",
                             (cid, kind)).fetchone()
            if m and m["text"]:
                text = m["text"]; break
        vid = conn.execute("""INSERT INTO versions(chapter_id,parent_id,kind,text,label,created_at,created_by)
                              VALUES(?,?,?,?,?,?,?)""", (cid, None, "draft", text, "", now, "migrate")).lastrowid
        conn.execute("UPDATE pipeline_runs SET head_version_id=? WHERE chapter_id=?", (vid, cid))


def _migrate_categories(conn) -> None:
    """기존 엔티티의 한국어 category(인물·사물 등)를 스키마 타입 키(character·item…)로 정규화.
    엔티티 편집기 탭이 타입 키로 필터하므로, 정규화해야 추출된 엔티티가 탭에 보인다."""
    from builder.schemadef.loader import CATEGORY_ALIASES  # 지연 import(순수 모듈)
    for alias, t in CATEGORY_ALIASES.items():
        conn.execute("UPDATE entities SET category=? WHERE category=?", (t, alias))


def _migrate_project_scope(conn) -> None:
    """그래프 테이블을 작품별로 격리: project_id 컬럼 추가 + 기존 행은 최소 project로 귀속."""
    first = conn.execute("SELECT MIN(id) AS m FROM projects").fetchone()
    pid = first["m"] if first else None
    for tbl in ("entities", "relations", "events", "timeline", "secrets", "edit_log"):
        cols = [r["name"] for r in conn.execute(f"PRAGMA table_info({tbl})")]
        if "project_id" not in cols:
            conn.execute(f"ALTER TABLE {tbl} ADD COLUMN project_id INTEGER")
            if pid is not None:
                conn.execute(f"UPDATE {tbl} SET project_id=? WHERE project_id IS NULL", (pid,))
    # aliases: PK를 (project_id, alias) 복합키로 — ALTER 불가라 재생성
    acols = [r["name"] for r in conn.execute("PRAGMA table_info(aliases)")]
    if "project_id" not in acols:
        conn.execute("ALTER TABLE aliases RENAME TO aliases_old")
        conn.execute("CREATE TABLE aliases (project_id INTEGER, alias TEXT, entity_id TEXT, "
                     "PRIMARY KEY (project_id, alias))")
        conn.execute("INSERT OR IGNORE INTO aliases(project_id,alias,entity_id) "
                     "SELECT ?, alias, entity_id FROM aliases_old", (pid,))
        conn.execute("DROP TABLE aliases_old")
    conn.execute("CREATE INDEX IF NOT EXISTS ix_entities_project ON entities(project_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS ix_relations_project ON relations(project_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS ix_events_project ON events(project_id)")
    for p in conn.execute("SELECT id FROM projects").fetchall():
        pid = p["id"]
        s = conn.execute("SELECT id FROM seasons WHERE project_id=? ORDER BY idx,id LIMIT 1",
                         (pid,)).fetchone()
        sid = s["id"] if s else conn.execute(
            "INSERT INTO seasons(project_id,idx,title) VALUES(?,1,'시즌 1')", (pid,)).lastrowid
        conn.execute("UPDATE chapters SET season_id=? WHERE project_id=? AND season_id IS NULL",
                     (sid, pid))
