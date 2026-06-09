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


def test_gen_reads_head_version(monkeypatch):
    _fresh()
    from builder.gen import modes
    cap = {}

    def fake_gen(mode, text, **k):
        cap["src"] = text
        return ("polish", "OUT")
    monkeypatch.setattr(modes, "generate", fake_gen)
    from builder.store import version
    from builder.api.app import create_app
    from fastapi.testclient import TestClient
    c = TestClient(create_app())
    pid, cid = _chapter(c)
    c.put(f"/api/chapter/{cid}/text", json={"text": "원안"})   # head(초기 draft)=원안
    version.create(cid, "다듬은본", kind="polish")              # head=다듬은본
    c.post("/api/gen", json={"chapter_id": cid, "mode": "expand"})
    assert cap["src"] == "다듬은본"   # gen 입력 = 현재 head 버전(과거 draft 아님)


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
