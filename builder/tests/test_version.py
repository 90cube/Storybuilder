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
    assert len(rows) == 4   # 초기 draft(create_chapter) + v1 + v2 + v3
    assert {r["id"]: r["parent_id"] for r in rows}[v3] == v1   # v3 부모 = v1(분기)
    assert version.head_text(cid) == "분기본"


def test_chapter_initial_version_and_autosave_head():
    _fresh()
    from builder.store import repo, version
    pid = repo.create_project("작")
    sid = repo.list_seasons(pid)[0]["id"]
    cid = repo.create_chapter(sid, "1화")
    assert version.head_text(cid) == ""          # 초기 빈 draft 버전이 head
    repo.save_draft_text(cid, "새본문")
    assert version.head_text(cid) == "새본문"     # 자동저장이 head를 in-place 갱신
    assert len(version.list(cid)) == 1            # draft head in-place → 노드 안 늘어남
    assert repo.get_chapter(cid)["texts"]["current"]["text"] == "새본문"  # 에디터 본문 = head


def test_api_gen_creates_version_and_revert(monkeypatch):
    _fresh()
    from builder.gen import modes
    monkeypatch.setattr(modes, "generate", lambda mode, text, **k: (mode, f"[{mode}]{text}"))
    from builder.store import version
    from builder.api.app import create_app
    from fastapi.testclient import TestClient
    c = TestClient(create_app())
    pid = c.post("/api/projects", json={"title": "작"}).json()["id"]
    sid = c.get(f"/api/seasons?project={pid}").json()[0]["id"]
    cid = c.post("/api/chapters", json={"season_id": sid, "title": "1화"}).json()["id"]
    c.put(f"/api/chapter/{cid}/text", json={"text": "원안"})        # head(초기 draft) in-place=원안
    before = len(c.get(f"/api/chapter/{cid}/versions").json()["versions"])
    c.post("/api/gen", json={"chapter_id": cid, "mode": "polish"})  # 결과가 새 head 버전
    vs = c.get(f"/api/chapter/{cid}/versions").json()["versions"]
    assert len(vs) == before + 1
    assert version.head_text(cid) == "[polish]원안"                  # 입력=head(원안) → 결과가 head
    r = c.post("/api/version/revert", json={"chapter_id": cid, "version_id": vs[0]["id"]}).json()
    assert r["text"] == "원안"                                      # 되돌리기(비파괴) → 본문 복귀


def test_migrate_seeds_legacy_chapter():
    _fresh()
    import builder.store.db as dbmod
    from builder.store import repo, version
    from builder.store.db import get_conn
    pid = repo.create_project("p")
    sid = repo.list_seasons(pid)[0]["id"]
    # 레거시 데이터 시뮬레이션: create_chapter 우회로 버전 없이 화·run(head NULL)·draft 원고만 존재.
    with get_conn() as c:
        c.execute("INSERT INTO chapters(project_id,season_id,idx,title) VALUES(?,?,0,'old')", (pid, sid))
        cid = c.execute("SELECT last_insert_rowid() id").fetchone()["id"]
        c.execute("INSERT INTO pipeline_runs(chapter_id,state,updated_at) VALUES(?,'DRAFT','t')", (cid,))
        c.execute("INSERT INTO manuscripts(chapter_id,kind,text,version,created_at) VALUES(?,'draft','옛본문',1,'t')", (cid,))
        dbmod._migrate_seed_versions(c)
    assert version.head_text(cid) == "옛본문"   # 기존 화도 현재 본문으로 head 시드
