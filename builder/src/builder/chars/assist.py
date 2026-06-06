"""신캐 프로필 생성. GBNF로 카드 JSON 강제."""

import json

from builder.llm import client
from builder.llm.world import world_name, world_intro
from builder.extract.grammar import CHARACTER_GBNF


def _system(world: str | None) -> str:
    return (f"너는 〈{world_name(world)}〉 세계관 캐릭터 설정 작가다.\n{world_intro(world)}\n"
            "주어진 이름과 맥락에 맞는 신규 캐릭터 프로필을 만든다. 세계관 정합성을 지키고 "
            "기존 설정과 충돌하지 않게 한다. 오직 지정된 JSON 형식으로만 출력한다.")


def assist(name: str, context: str = "", world: str = "") -> dict:
    """이름 + 세계관 맥락 → {name, category, description, speech_style, relations[]}."""
    user = (f"신규 캐릭터 '{name}'의 프로필을 만들어라.\n"
            f"[참고 맥락]\n{context or '(없음)'}")
    raw = client.chat_grammar(_system(world), user, CHARACTER_GBNF, temperature=0.6, max_tokens=1024)
    try:
        card = json.loads(raw)
    except json.JSONDecodeError:
        card = {"name": name, "category": "character", "description": raw,
                "speech_style": "", "relations": []}
    card.setdefault("name", name)
    return card
