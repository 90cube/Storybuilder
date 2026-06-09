import sys, tempfile
from pathlib import Path
sys.path.insert(0, "src")
import builder.store.db as db


def _fresh():
    db.CREATOR_DB = Path(tempfile.mktemp(suffix=".db"))
    db.init_db()


def test_version_create_head_revert_branch():
    _fresh()
    from builder.store import repo, version
    pid = repo.create_project("작")
    sid = repo.list_seasons(pid)[0]["id"]
    cid = repo.create_chapter(sid, "1화")
    v1 = version.create(cid, "초안", kind="draft")          # head=v1
    v2 = version.create(cid, "다듬기본", kind="polish")      # parent=v1, head=v2
    assert version.head_text(cid) == "다듬기본"
    version.set_head(cid, v1)                                # 되돌리기(비파괴)
    assert version.head_text(cid) == "초안"
    v3 = version.create(cid, "분기본", kind="polish")        # parent=현 head(v1) → 분기
    rows = version.list(cid)
    assert len(rows) == 3
    assert {r["id"]: r["parent_id"] for r in rows}[v3] == v1   # v3 부모 = v1
    assert version.head_text(cid) == "분기본"
