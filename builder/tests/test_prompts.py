import sys
sys.path.insert(0, "src")
from builder.llm import prompts

_IP = ("던전앤파이터", "아라드", "마계", "천계")


def test_system_is_world_injected_and_ip_free():
    s = prompts.system("헬레보어")
    assert "헬레보어" in s                 # 작품명 주입
    for ip in _IP:
        assert ip not in s                 # 기성 IP 고유어 없음


def test_default_system_ip_free():
    for ip in _IP:
        assert ip not in prompts.SYSTEM


def test_lane_prompts_ip_free():
    ev = {"era": "1막", "title": "사건", "what": "무슨 일", "characters_involved": []}
    op = prompts.original_prompt(ev, ev)
    for ip in _IP:
        assert ip not in op
