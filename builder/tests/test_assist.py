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
