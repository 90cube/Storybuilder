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
