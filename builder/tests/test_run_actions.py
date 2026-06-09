import sys, tempfile
from pathlib import Path
sys.path.insert(0, "src")
import builder.store.db as db


def _fresh():
    db.CREATOR_DB = Path(tempfile.mktemp(suffix=".db"))
    db.init_db()


def test_run_actions_shape():
    _fresh()
    from builder.api.app import create_app
    from fastapi.testclient import TestClient
    c = TestClient(create_app())
    pid = c.post("/api/projects", json={"title": "a"}).json()["id"]
    sid = c.get(f"/api/seasons?project={pid}").json()[0]["id"]
    cid = c.post("/api/chapters", json={"season_id": sid, "title": "1화"}).json()["id"]
    r = c.get(f"/api/run/{cid}").json()
    assert r["state"] == "DRAFT"
    assert "POLISH" in r["canAdvanceTo"]
    assert r["states"][0] == "DRAFT" and "SHIP" in r["states"]
    assert r["tools"] == {"detect": False, "canon": False}  # DRAFT는 구조화 도구 비활성


def test_pipeline_slim_6_stages():
    from builder.domain import pipeline
    assert pipeline.STATES == ["DRAFT", "POLISH", "EXPAND", "EXTRACT", "PROMOTE", "SHIP"]
    assert pipeline.can_advance("DRAFT", "POLISH")
    assert pipeline.can_advance("POLISH", "POLISH")    # 다듬기 무한 루프
    assert pipeline.can_advance("POLISH", "EXPAND")
    assert pipeline.can_advance("EXPAND", "EXTRACT")
    assert pipeline.can_advance("EXTRACT", "PROMOTE")
    assert pipeline.can_advance("PROMOTE", "SHIP")
    assert pipeline.is_terminal("SHIP")
    assert not pipeline.can_advance("POLISH", "CHAR_DETECT")   # 제거된 상태로의 전이 불가


def test_migrate_fsm_states_remaps_legacy():
    _fresh()
    import builder.store.db as dbmod
    from builder.store import repo
    from builder.store.db import get_conn
    pid = repo.create_project("p")
    sid = repo.list_seasons(pid)[0]["id"]
    cid = repo.create_chapter(sid, "1화")
    with get_conn() as c:  # 레거시 상태 주입
        c.execute("UPDATE pipeline_runs SET state='CHAPTER_SAVE' WHERE chapter_id=?", (cid,))
        dbmod._migrate_fsm_states(c)
    assert repo.get_state(cid) == "PROMOTE"   # 제거된 상태 → 슬림 단계로 리맵
