"""화 시점 인물 상태 캡처: 화 본문+인물카드(직전 상태 포함) → [{name,state,change}]. 타임라인 자동 기록용."""

import json
import re

from builder.llm import client
from builder.llm.world import world_intro


def _parse(raw: str) -> list:
    s = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.M).strip()
    m = re.search(r"\[.*\]", s, re.S) or re.search(r"\{.*\}", s, re.S)
    if not m:
        raise ValueError("statecap: JSON 파싱 실패")
    d = json.loads(m.group(0))
    return d if isinstance(d, list) else [d]


def _cards_block(cards: list[dict]) -> str:
    return "\n".join(
        f"- {c['name']} (말투={c.get('speech_style') or '미정'}, 성격={c.get('personality') or '미정'}) "
        f"| 직전 상태: {c.get('prev_state') or '없음'}" for c in cards)


def capture(text: str, cards: list[dict], world: str = "") -> list[dict]:
    """등장 인물(cards)의 이 화 시점 상세 상태+변화. cards 비면 LLM 호출 없이 []."""
    if not cards:
        return []
    sys = (f"{world_intro(world)}\n너는 이 작품 분석가다. 화 본문과 인물 카드에만 근거하라. "
           '다른 말 없이 JSON 배열만 출력: '
           '[{"name":"인물","state":"이 화 시점 상세 상태(감정·처지·목표·관계 변화 구체적으로)","change":"직전 대비 변화"}]')
    user = (f"[인물 카드]\n{_cards_block(cards)}\n\n[이 화 본문]\n{text}\n\n"
            "지시: 위 인물 각각의 이 화 시점 상세 상태와 직전 대비 변화를 본문 근거로 적어라. 본문에 없으면 제외.")
    raw = client.chat(sys, user, temperature=0.3, max_tokens=2000)
    out = []
    for r in _parse(raw):
        nm = (r.get("name") or "").strip()
        if nm:
            out.append({"name": nm, "state": (r.get("state") or "").strip(),
                        "change": (r.get("change") or "").strip()})
    return out
