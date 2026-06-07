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


def test_statecap_capture(monkeypatch):
    from builder.gen import statecap
    monkeypatch.setattr(statecap.client, "chat",
                        lambda *a, **k: '```json\n[{"name":"카인","state":"각성, 분노","change":"라이터를 주움"}]\n```')
    out = statecap.capture("카인이 라이터를 주웠다.",
                           [{"name": "카인", "speech_style": "짧게", "personality": "냉정", "prev_state": "평온"}],
                           world="작품")
    assert out == [{"name": "카인", "state": "각성, 분노", "change": "라이터를 주움"}]
    assert statecap.capture("x", [], world="작품") == []  # 카드 없으면 호출 없이 []


def test_promote_writes_timeline():
    _fresh()
    from builder.store import repo, entity, graph
    from builder.canon import diff as canon
    pid = repo.create_project("작품")
    sid = repo.list_seasons(pid)[0]["id"]
    cid = repo.create_chapter(sid, "1화")
    ents = [{"name": "카인", "category": "인물", "change": "추가",
             "state": "각성, 분노", "statechange": "라이터를 주움"}]
    canon.promote(ents, [], pid, [], chapter_id=cid)
    eid = f"{pid}:{graph._slug('카인')}"
    tl = entity.list_timeline(eid)
    assert len(tl) == 1 and tl[0]["state"] == "각성, 분노" and tl[0]["chapter_id"] == cid


def test_diff_attaches_states():
    _fresh()
    from builder.store import repo
    from builder.canon import diff as canon
    pid = repo.create_project("작품")
    extracted = {"entities": [{"name": "카인"}], "relations": [], "events": []}
    states = [{"name": "카인", "state": "분노", "change": "각성"}]
    d = canon.diff_against_graph(extracted, pid, states=states)
    assert d["entities"][0]["state"] == "분노" and d["entities"][0]["statechange"] == "각성"
