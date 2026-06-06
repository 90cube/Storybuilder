"""부분 다듬기(Notion식). 전체 원고 컨텍스트로 문체 일관성만 패치, 사건·설정 불변."""

from builder.llm import client

PARTIAL_SYSTEM = """\
너는 완성된 장편 원고의 문체 일관성만 다듬는 편집자다.
사건·설정·인물 상태·전개 순서를 절대 바꾸지 않는다. 오직 문체·어조·리듬을 전체에 걸쳐 일관되게 통일하고,
어색한 문장만 매끄럽게 고친다. 새 내용 추가 금지. 한국어 본문만 출력."""


def partial_polish(full_text: str) -> str:
    """완성본 전문을 받아(강제 초기화된 새 세션) 문체 일관 패치본을 돌려준다."""
    user = f"다음 완성 원고의 문체를 전체에 걸쳐 일관되게 다듬어라(사건·설정 불변):\n\n{full_text}"
    return client.chat(PARTIAL_SYSTEM, user, temperature=0.4, max_tokens=8192)
