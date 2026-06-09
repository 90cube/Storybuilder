"""생성 모드 정의 + 실행. 데이터(모드 스펙) + 얇은 호출."""

from builder.llm import client
from builder.llm.world import world_name, world_intro


# 모드별 지시 한 줄(공통 시스템에 결합). expand의 '확장'과 polish의 '보존'이 충돌하지 않게 분리.
_MODE_SYS: dict[str, str] = {
    "draft": "원문의 사건·설정은 유지하며, 흐름과 문장을 자연스럽게 다시 정리한다.",
    "polish": "원문의 사건·설정·인물 상태는 그대로 두고, 문장·리듬·가독성만 다듬는다.",
    "expand": "기존 사건 골격과 설정은 유지하되, 장면 묘사·심리·대사를 풍부하게 확장한다(분량을 크게 키운다).",
}


def build_system(world: str = "", mode: str = "polish") -> str:
    """모드별 시스템 프롬프트. 문체는 고정하지 않고 문체 지침에 위임(결과 납작해짐 방지)."""
    return (f"너는 〈{world_name(world)}〉의 소설 작가이자 편집자다.\n{world_intro(world)}\n"
            "세계관 정합성과 인물의 말투·성격·상태를 지키고, 인물의 동기와 인과로 장면을 굴린다. "
            f"{_MODE_SYS.get(mode, _MODE_SYS['polish'])} "
            "문체·톤은 주어진 문체 지침을 따르고, 없으면 작품 기존 산문의 결을 잇는다. "
            "한국어로 쓴다. 출력은 본문만. 메타발언·사족·머리말 금지.")

# mode → (저장 kind, temperature, max_tokens, 지시)
MODES: dict[str, tuple[str, float, int, str]] = {
    # 저장 kind는 작업용 'draft'와 충돌 안 나게 'redraft'(제안본). 채택 시 saveText가 draft에 반영.
    "draft": ("redraft", 0.7, 6144,
              "아래 초안을 비슷한 분량으로, 흐름과 문장을 더 매끄럽게 다시 써라. 사건·설정은 유지."),
    "polish": ("polish", 0.5, 8192,
               "아래 원문의 의미·사건을 그대로 두고, 문체·리듬·가독성만 다듬어라. 어색한 문장 교정. "
               "원문 분량을 끝까지 유지하고 중간에 자르지 말 것."),
    "expand": ("expand", 0.8, 16384,
               "아래 원문을 완성본 원고로 확장하라(목표 12000자 이상). 장면 묘사·심리·대사를 보강하되 "
               "기존 사건 순서와 설정을 어기지 말 것. 끝까지 완결할 것."),
}


def generate(mode: str, text: str, world: str = "", system: str | None = None) -> tuple[str, str]:
    """(저장 kind, 결과 본문)을 돌려준다. system 지정 시 그것이 우선(사용자 마스터프롬프트)."""
    if mode not in MODES:
        raise ValueError(f"알 수 없는 생성 모드: {mode}")
    kind, temp, max_tokens, instr = MODES[mode]
    user = f"{instr}\n\n[원문]\n{text or '(빈 초안)'}"
    out = client.chat(system or build_system(world, mode), user, temperature=temp, max_tokens=max_tokens)
    return kind, out
