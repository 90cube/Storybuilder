import sys
sys.path.insert(0, "src")
from builder.gen import assist


def test_edit_includes_wider_before_context(monkeypatch):
    cap = {}

    def fake_chat(sysmsg, user, **k):
        cap["user"] = user
        return '{"rewrites":["x"],"continuations":[]}'
    monkeypatch.setattr(assist.client, "chat", fake_chat)

    before = "머리표시" + "가" * 1000  # 앞부분이 옛 600자 윈도우 밖
    assist.edit("선택", before=before, after="", mode="draft")
    assert "머리표시" in cap["user"]  # 폭 확대로 앞 문맥이 잘리지 않음
