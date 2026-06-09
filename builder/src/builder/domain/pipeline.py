"""파이프라인 상태머신(FSM). 화 1개의 일생. 순수 도메인 — DB·프레임워크 불의존.

슬림 6단계(DRAFT·POLISH·EXPAND·EXTRACT·PROMOTE·SHIP). SHIP은 경계(앱 폼 밖)이라 종착만 표시.
구 14상태는 store.db._FSM_REMAP으로 흡수/리맵.
"""

# 슬림 6단계(사용자가 보는 한 화의 일생). 컨텍스트 초기화·DB 동기화는 단계 내부 동작으로 흡수.
# 캐릭터 감지·부분수정은 단계가 아닌 '도구'(상태 변경 없음).
STATES: list[str] = ["DRAFT", "POLISH", "EXPAND", "EXTRACT", "PROMOTE", "SHIP"]

# 각 상태에서 갈 수 있는 다음 상태들(루프 포함).
TRANSITIONS: dict[str, list[str]] = {
    "DRAFT": ["POLISH"],
    "POLISH": ["POLISH", "EXPAND"],      # 다듬기 무한 루프 + 완성본으로
    "EXPAND": ["EXPAND", "EXTRACT"],     # 완성본 루프 + 정사 추출로
    "EXTRACT": ["PROMOTE"],
    "PROMOTE": ["SHIP", "DRAFT"],        # 다음 화로 또는 출하(경계)
    "SHIP": [],
}

# 사람 토글로 직접 발동하는 상태(나머지는 자동/조건).
TOGGLE_STATES = {"POLISH", "EXPAND"}


def can_advance(frm: str, to: str) -> bool:
    return to in TRANSITIONS.get(frm, [])


def next_default(frm: str) -> str | None:
    """그 상태의 가장 자연스러운 다음(첫 전이). 막다른 곳이면 None."""
    nxt = TRANSITIONS.get(frm, [])
    return nxt[0] if nxt else None


def is_terminal(state: str) -> bool:
    return not TRANSITIONS.get(state)
