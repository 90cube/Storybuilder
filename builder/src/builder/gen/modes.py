"""생성 모드 정의 + 실행. 데이터(모드 스펙) + 얇은 호출."""

from builder.llm import client

SYSTEM = """\
너는 〈던전앤파이터(아라드)〉 세계관 소설 편집자이자 작가다.
세계관 정합성을 지키고, 과장된 미사여구·클리셰를 피하며, 구체적 동기와 인과로 장면을 굴린다.
원문의 사건·설정·인물 상태를 임의로 바꾸지 않는다. 한국어로, 자연스러운 소설 문체로 쓴다.
출력은 본문만. 메타발언·사족·머리말 금지."""

# mode → (저장 kind, temperature, max_tokens, 지시)
MODES: dict[str, tuple[str, float, int, str]] = {
    # 저장 kind는 작업용 'draft'와 충돌 안 나게 'redraft'(제안본). 채택 시 saveText가 draft에 반영.
    "draft": ("redraft", 0.7, 2600,
              "아래 초안을 같은 분량(~2000자)으로, 흐름과 문장을 더 매끄럽게 다시 써라. 사건·설정은 유지."),
    "polish": ("polish", 0.5, 2800,
               "아래 원문의 의미·사건을 그대로 두고, 문체·리듬·가독성만 다듬어라. 어색한 문장 교정."),
    "expand": ("expand", 0.8, 8192,
               "아래 원문을 완성본 원고로 확장하라(목표 12000자 이상). 장면 묘사·심리·대사를 보강하되 "
               "기존 사건 순서와 설정을 어기지 말 것."),
}


def generate(mode: str, text: str, system: str | None = None) -> tuple[str, str]:
    """(저장 kind, 결과 본문)을 돌려준다."""
    if mode not in MODES:
        raise ValueError(f"알 수 없는 생성 모드: {mode}")
    kind, temp, max_tokens, instr = MODES[mode]
    user = f"{instr}\n\n[원문]\n{text or '(빈 초안)'}"
    out = client.chat(system or SYSTEM, user, temperature=temp, max_tokens=max_tokens)
    return kind, out
