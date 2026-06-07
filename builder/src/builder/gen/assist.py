"""부분수정/번역 보조: 선택 텍스트를 문맥·문체·캐릭터 카드와 함께 다듬거나(draft) 보강(enrich)."""

import json
import re

from builder.llm import client
from builder.llm.world import world_name, world_intro


def _parse(raw: str) -> dict:
    s = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.M).strip()
    m = re.search(r"\{.*\}", s, re.S)
    if not m:
        raise ValueError("assist: JSON 파싱 실패")
    return json.loads(m.group(0))


def _char_block(cards: list[dict]) -> str:
    if not cards:
        return ""
    lines = [f"- {c['name']}: 말투={c.get('speech_style') or '미정'}, 성격={c.get('personality') or '미정'}"
             for c in cards]
    return "[등장 캐릭터 카드]\n" + "\n".join(lines) + "\n\n"


def edit(selected: str, before: str = "", after: str = "", world: str = "", style: str = "",
         char_cards: list[dict] | None = None, mode: str = "draft",
         n_rewrite: int = 3, n_continue: int = 2) -> dict:
    """mode='draft'=다듬기/이어쓰기, 'enrich'=완성본 보강+충돌. raw-JSON 파싱 결과 반환."""
    cards = char_cards or []
    w = world_name(world)
    if mode == "enrich":
        instr = (f"선택 부분을 〈{w}〉 완성본 수준으로 보강하라(묘사·세부 확장, 설정·말투 일관). "
                 f"수정안 {n_rewrite}개, 이어쓰기 {n_continue}개. 기존 설정과 모순되면 conflicts에 적어라.")
        keys = '{"rewrites":[문자열...],"continuations":[문자열...],"conflicts":[{"entity":..,"issue":..,"suggestion":..}]}'
    else:
        instr = (f"선택 부분을 문체·말투에 맞게 자연스럽게 다듬어라(사건·설정 불변). "
                 f"수정안 {n_rewrite}개, 이어쓸 문장 {n_continue}개.")
        keys = '{"rewrites":[문자열...],"continuations":[문자열...]}'
    sys = (f"{world_intro(world)}\n너는 이 작품의 집필 보조자다. 문체·캐릭터 말투·세계관·인과 일관성을 지킨다. "
           f"주어진 자료에만 근거하라. 다른 말 없이 JSON만 출력하라: {keys}")
    user = (
        (f"[문체 지침]\n{style}\n\n" if style else "")
        + _char_block(cards)
        + f"[앞 문맥]\n{before[-600:]}\n\n[선택(수정 대상)]\n{selected}\n\n[뒤 문맥]\n{after[:400]}\n\n{instr}"
    )
    raw = client.chat(sys, user, temperature=0.7 if mode == "enrich" else 0.5, max_tokens=4096)
    d = _parse(raw)
    return {"rewrites": d.get("rewrites", []) or [],
            "continuations": d.get("continuations", []) or [],
            "conflicts": d.get("conflicts", []) or []}


def translate(text: str, world: str = "") -> str:
    sys = ("주어진 텍스트의 언어를 감지해 한국어면 영어로, 그 외 언어면 한국어로 자연스럽게 번역하라. "
           "설명 없이 번역문만 출력.")
    return client.chat(sys, text, temperature=0.2, max_tokens=4096).strip()
