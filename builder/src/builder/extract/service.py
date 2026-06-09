"""산문 → 구조(events/entities/relations) 추출. 두 모드:
- raw     : 자유 생성 + 견고 파서 (문법 미강제). 풍부하지만 가끔 보정 필요.
- grammar : GBNF로 디코딩 시점 강제. 구조 보장하지만 납작해질 수 있음.
실패 시 raw→grammar 폴백.
"""

import json
import re

from builder.llm import client
from builder.llm.world import world_name, world_intro
from builder.extract.grammar import EXTRACT_GBNF

_SCHEMA_HINT = (
    '{"events":[{"title","era","what","chars":[{"name","before","after"}]}],'
    ' "entities":[{"name","category","description"}],'
    ' "relations":[{"from","rel","to"}]}'
)


def _system_raw(world: str | None) -> str:
    return (f"너는 〈{world_name(world)}〉 세계관 구조 추출기다.\n{world_intro(world)}\n"
            "산문에서 사건(events)·등장 존재(entities, 인물·장소·조직 포함)·관계(relations)를 "
            "뽑아 **JSON으로만** 답한다.\n"
            f"형식: {_SCHEMA_HINT}\n"
            "산문에 없는 것은 지어내지 마라(추측 금지). 코드펜스·설명·머리말 없이 JSON 객체만 출력.")


def _system_grammar(world: str | None) -> str:
    return (f"너는 〈{world_name(world)}〉 세계관 구조 추출기다.\n{world_intro(world)}\n"
            "주어진 산문에서 events·entities(인물·장소·조직)·relations만 추출한다. "
            "없는 것은 지어내지 마라. 오직 지정된 JSON 형식으로만 출력한다.")


_EMPTY = {"events": [], "entities": [], "relations": []}


def _parse(raw: str) -> dict | None:
    """raw 텍스트에서 첫 JSON 객체를 견고하게 추출."""
    s = re.sub(r"```(?:json)?", "", raw).strip()
    m = re.search(r"\{.*\}", s, re.S)  # 첫 { … } 블록
    try:
        return json.loads(m.group(0) if m else s)
    except Exception:
        return None


def extract_raw(text: str, world: str = "") -> dict:
    raw = client.chat(_system_raw(world), f"[산문]\n{text}", temperature=0.15, max_tokens=4096)
    return _parse(raw) or {**_EMPTY, "_raw": raw[:400], "_parse_failed": True}


def extract_grammar(text: str, world: str = "") -> dict:
    raw = client.chat_grammar(_system_grammar(world), f"다음 산문에서 구조를 추출하라.\n\n[산문]\n{text}",
                              EXTRACT_GBNF, temperature=0.1, max_tokens=4096)
    return _parse(raw) or {**_EMPTY, "_raw": raw[:400], "_parse_failed": True}


def extract_from_text(text: str, mode: str = "raw", world: str = "") -> dict:
    """mode='raw'(기본) | 'grammar'. raw 파싱 실패 시 grammar 폴백."""
    if mode == "grammar":
        return extract_grammar(text, world)
    out = extract_raw(text, world)
    if out.get("_parse_failed"):
        out = extract_grammar(text, world)  # 안전망
        out["_fallback"] = "grammar"
    return out


_SCHEMA_HINT_STATE = (
    '{"events":[{"title","era","what","chars":[{"name","before","after"}]}],'
    ' "entities":[{"name","category","description","state","statechange"}],'
    ' "relations":[{"from","rel","to"}]}'
)


def _cards_block(cards: list[dict]) -> str:
    if not cards:
        return ""
    lines = [f"- {c['name']}: 말투={c.get('speech_style') or '미정'}, 성격={c.get('personality') or '미정'} "
             f"| 직전 상태: {c.get('prev_state') or '없음'}" for c in cards]
    return "[기존 인물 카드(참고: 말투·성격·직전 상태)]\n" + "\n".join(lines) + "\n\n"


def extract_with_states(text: str, cards: list[dict] | None = None, world: str = "") -> dict:
    """정사 단계 **단일 LLM 호출**: 사건·엔티티(+이 화 시점 상태)·관계를 한 번에 추출.

    각 인물 entity에 state(이 화 시점 상태)·statechange(직전 대비 변화)를 채운다.
    cards = 기존 인물 DB 카드(말투·성격·직전 상태)를 참고로 주입. 추출+상태캡처 2호출→1호출.
    """
    sys = (f"너는 〈{world_name(world)}〉 세계관 구조 추출기다.\n{world_intro(world)}\n"
           "산문에서 사건(events)·등장 존재(entities, 인물·장소·조직)·관계(relations)를 뽑는다. "
           "각 인물 entity에는 이 화 시점의 상태(state)와 직전 대비 변화(statechange)를 본문 근거로 채워라"
           "(본문에 근거 없으면 비워둔다).\n"
           f"형식: {_SCHEMA_HINT_STATE}\n"
           "산문에 없는 것은 지어내지 마라. 코드펜스·설명·머리말 없이 JSON 객체만 출력.")
    user = _cards_block(cards or []) + f"[산문]\n{text}"
    raw = client.chat(sys, user, temperature=0.2, max_tokens=4096)
    return _parse(raw) or {**_EMPTY, "_raw": raw[:400], "_parse_failed": True}


def detect_new_characters(text: str, known_names: set[str], mode: str = "raw", world: str = "") -> list[dict]:
    data = extract_from_text(text, mode, world)
    out = []
    for e in data.get("entities", []):
        nm = (e.get("name") or "").strip()
        if nm and nm not in known_names:
            out.append(e)
    return out
