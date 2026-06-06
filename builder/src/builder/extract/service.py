"""산문 → 구조 추출. GBNF로 JSON 강제 → 파싱. (기획서 ②·CHAR_DETECT)"""

import json

from builder.llm import client
from builder.extract.grammar import EXTRACT_GBNF

SYSTEM = """\
너는 〈던전앤파이터(아라드)〉 세계관 구조 추출기다.
주어진 산문에서 사건(events)·등장 존재(entities)·관계(relations)만 추출한다.
산문에 없는 것을 지어내지 마라. 추측 금지. 모르면 빈 문자열.
오직 지정된 JSON 형식으로만 출력한다."""


def extract_from_text(text: str) -> dict:
    """청크(~2000자) 산문 → {events, entities, relations}. GBNF 강제라 항상 유효 JSON."""
    user = f"다음 산문에서 구조를 추출하라.\n\n[산문]\n{text}"
    raw = client.chat_grammar(SYSTEM, user, EXTRACT_GBNF, temperature=0.1, max_tokens=4096)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"events": [], "entities": [], "relations": [], "_raw": raw}


def detect_new_characters(text: str, known_names: set[str]) -> list[dict]:
    """추출된 entities 중 기존에 없던 인물 후보."""
    data = extract_from_text(text)
    out = []
    for e in data.get("entities", []):
        nm = (e.get("name") or "").strip()
        if nm and nm not in known_names:
            out.append(e)
    return out
