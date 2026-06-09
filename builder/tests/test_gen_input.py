import sys, tempfile
from pathlib import Path
sys.path.insert(0, "src")
import builder.store.db as db


def _fresh():
    db.CREATOR_DB = Path(tempfile.mktemp(suffix=".db"))
    db.init_db()


def _chapter(c):
    pid = c.post("/api/projects", json={"title": "작"}).json()["id"]
    sid = c.get(f"/api/seasons?project={pid}").json()[0]["id"]
    cid = c.post("/api/chapters", json={"season_id": sid, "title": "1화"}).json()["id"]
    return pid, cid


def test_gen_reads_latest_not_draft(monkeypatch):
    _fresh()
    from builder.gen import modes
    cap = {}

    def fake_gen(mode, text, **k):
        cap["src"] = text
        return ("polish", "OUT")
    monkeypatch.setattr(modes, "generate", fake_gen)
    from builder.store import repo
    from builder.api.app import create_app
    from fastapi.testclient import TestClient
    c = TestClient(create_app())
    pid, cid = _chapter(c)
    c.put(f"/api/chapter/{cid}/text", json={"text": "초안본문"})
    repo.add_manuscript(cid, "polish", "폴리시본문")   # 최신본
    c.post("/api/gen", json={"chapter_id": cid, "mode": "polish"})
    assert cap["src"] == "폴리시본문"   # draft가 아니라 최신본을 입력으로


def test_latest_prose_scoped_to_chapter():
    _fresh()
    from builder.store import repo
    pid = repo.create_project("작")
    sid = repo.list_seasons(pid)[0]["id"]
    c1 = repo.create_chapter(sid, "1화")
    c2 = repo.create_chapter(sid, "2화")
    repo.add_manuscript(c1, "draft", "1화 문체")
    repo.add_manuscript(c2, "draft", "2화 문체")   # 프로젝트 전체 최신
    assert repo.latest_prose(pid, chapter_id=c1) == "1화 문체"   # 현재 화 한정
    assert repo.latest_prose(pid) == "2화 문체"                  # 스코프 없으면 전체 최신
