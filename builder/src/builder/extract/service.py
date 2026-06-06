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


def detect_new_characters(text: str, known_names: set[str], mode: str = "raw", world: str = "") -> list[dict]:
    data = extract_from_text(text, mode, world)
    out = []
    for e in data.get("entities", []):
        nm = (e.get("name") or "").strip()
        if nm and nm not in known_names:
            out.append(e)
    return out
