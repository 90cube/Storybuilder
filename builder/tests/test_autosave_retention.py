import sys, tempfile
from pathlib import Path
sys.path.insert(0, "src")
import builder.store.db as db


def _fresh():
    db.CREATOR_DB = Path(tempfile.mktemp(suffix=".db"))
    db.init_db()


def test_autosave_keeps_recent_20():
    _fresh()
    from builder.store import repo
    from builder.store.db import get_conn
    pid = repo.create_project("작품")
    sid = repo.list_seasons(pid)[0]["id"]
    cid = repo.create_chapter(sid, "1화")
    for i in range(25):
        repo.save_draft_text(cid, f"v{i}")
    with get_conn() as c:
        n = c.execute("SELECT COUNT(*) n FROM autosaves WHERE chapter_id=?", (cid,)).fetchone()["n"]
    assert n == 20  # 무한누적 방지: 최근 20개만 보존
