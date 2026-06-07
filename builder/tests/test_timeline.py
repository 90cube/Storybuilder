import sys, tempfile
from pathlib import Path
sys.path.insert(0, "src")
import builder.store.db as db


def _fresh():
    db.CREATOR_DB = Path(tempfile.mktemp(suffix=".db"))
    db.init_db()


def test_upsert_timeline_idempotent_and_latest():
    _fresh()
    from builder.store import repo, entity
    pid = repo.create_project("작품")
    sid = repo.list_seasons(pid)[0]["id"]
    cid = repo.create_chapter(sid, "1화")
    eid = f"{pid}:karin"
    # 같은 (eid, chapter) 두 번 → 1행, 갱신
    entity.upsert_timeline(eid, cid, 1001, "1화", "평온함", "")
    entity.upsert_timeline(eid, cid, 1001, "1화", "각성, 분노", "라이터를 주움")
    tl = entity.list_timeline(eid)
    assert len(tl) == 1
    assert tl[0]["state"] == "각성, 분노" and tl[0]["chapter_id"] == cid
    assert entity.latest_state(eid) == "각성, 분노"


def test_story_seq_and_label():
    _fresh()
    from builder.store import repo
    pid = repo.create_project("작품")
    sid = repo.list_seasons(pid)[0]["id"]
    c1 = repo.create_chapter(sid, "1화")
    c2 = repo.create_chapter(sid, "2화")
    assert repo.story_seq(c2) > repo.story_seq(c1)   # 생성 순서 단조
    assert repo.chapter_label(c1) == "1화"
    assert repo.chapter_label(99999).startswith("화 ")  # 없는 화 폴백
