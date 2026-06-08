import sys, tempfile
from pathlib import Path
sys.path.insert(0, "src")

import builder.store.db as db


def _fresh_db():
    p = Path(tempfile.mktemp(suffix=".db"))
    db.CREATOR_DB = p
    db.init_db()
    return p


def test_style_roundtrip():
    _fresh_db()
    from builder.store import repo
    pid = repo.create_project("작품A")
    assert repo.get_style(pid) == ""
    repo.set_style(pid, "건조한 단문, 명사 중심")
    assert repo.get_style(pid) == "건조한 단문, 명사 중심"


def test_entities_in_text():
    _fresh_db()
    from builder.store import repo, entity, graph
    pid = repo.create_project("작품B")
    entity.save_entity("character", {"name": "카잔", "summary": "광폭화의 시초",
                                     "speech_style": "짧게 끊어 말한다"}, pid)
    cards = graph.entities_in_text(pid, "그때 카잔이 낮게 외쳤다.")
    assert cards and cards[0]["name"] == "카잔"
    assert "끊어" in cards[0]["speech_style"]
    assert graph.entities_in_text(pid, "아무도 없었다.") == []


def test_assist_edit_draft(monkeypatch):
    from builder.gen import assist
    monkeypatch.setattr(assist.client, "chat",
                        lambda *a, **k: '```json\n{"rewrites":["다듬은 문장"],"continuations":["다음 문장"]}\n```')
    r = assist.edit("원문 문장", before="앞", after="뒤", world="작품", mode="draft")
    assert r["rewrites"] == ["다듬은 문장"]
    assert r["continuations"] == ["다음 문장"]
    assert r["conflicts"] == []


def test_assist_edit_enrich_passes_cards(monkeypatch):
    from builder.gen import assist
    seen = {}
    def fake_chat(system, user, **k):
        seen["user"] = user
        return '{"rewrites":["보강"],"continuations":[],"conflicts":[{"entity":"카잔","issue":"모순","suggestion":"대안"}]}'
    monkeypatch.setattr(assist.client, "chat", fake_chat)
    r = assist.edit("카잔이 웃었다", world="작품", mode="enrich",
                    char_cards=[{"name": "카잔", "speech_style": "짧게", "personality": "냉정"}])
    assert "카잔" in seen["user"] and "짧게" in seen["user"]
    assert r["conflicts"][0]["entity"] == "카잔"


def _client(monkeypatch):
    _fresh_db()
    from builder.gen import assist
    monkeypatch.setattr(assist.client, "chat",
                        lambda *a, **k: '{"rewrites":["다듬음"],"continuations":["이어"],"conflicts":[]}')
    from builder.api.app import create_app
    from fastapi.testclient import TestClient
    return TestClient(create_app())


def test_api_style_and_edit(monkeypatch):
    c = _client(monkeypatch)
    pid = c.post("/api/projects", json={"title": "작품C"}).json()["id"]
    sid = c.get(f"/api/seasons?project={pid}").json()[0]["id"]
    cid = c.post("/api/chapters", json={"season_id": sid, "title": "1화"}).json()["id"]
    # 문체 저장/조회
    assert c.put(f"/api/projects/{pid}/style", json={"text": "건조체"}).status_code == 200
    assert c.get(f"/api/projects/{pid}/style").json()["text"] == "건조체"
    # 부분수정(DRAFT 상태 → mode=draft)
    r = c.post("/api/assist/edit", json={"chapter_id": cid, "selected": "원문",
                                         "before": "앞", "after": "뒤", "style_source": "field"}).json()
    assert r["mode"] == "draft"
    assert r["rewrites"] == ["다듬음"] and r["continuations"] == ["이어"]
    # 번역
    assert "text" in c.post("/api/assist/translate", json={"chapter_id": cid, "text": "안녕"}).json()
