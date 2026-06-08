"""파이프라인 상태머신(FSM). 화 1개의 일생. 순수 도메인 — DB·프레임워크 불의존.

기획서 §3의 13단계. SHIP은 경계(앱 폼 밖)이라 여기선 종착만 표시.
"""

# 순서대로의 상태 목록.
STATES: list[str] = [
    "DRAFT", "POLISH", "CHAR_DETECT", "DB_WRITE", "DB_SYNC", "REVISE",
    "EXPAND", "CTX_RESET_A", "PARTIAL_POLISH", "CTX_RESET_B", "EXTRACT",
    "DB_SYNC2", "CHAPTER_SAVE", "SHIP",
]

# 각 상태에서 갈 수 있는 다음 상태들(루프·회귀 포함).
TRANSITIONS: dict[str, list[str]] = {
    "DRAFT": ["POLISH"],
    "POLISH": ["POLISH", "CHAR_DETECT", "REVISE", "EXPAND"],  # 루프/회귀
    "CHAR_DETECT": ["DB_WRITE", "REVISE"],
    "DB_WRITE": ["DB_SYNC"],
    "DB_SYNC": ["REVISE"],
    "REVISE": ["REVISE", "POLISH", "CHAR_DETECT", "EXPAND"],  # 루프/회귀
    "EXPAND": ["CTX_RESET_A"],
    "CTX_RESET_A": ["PARTIAL_POLISH"],
    "PARTIAL_POLISH": ["CTX_RESET_B"],
    "CTX_RESET_B": ["EXTRACT"],
    "EXTRACT": ["DB_SYNC2"],
    "DB_SYNC2": ["CHAPTER_SAVE"],
    "CHAPTER_SAVE": ["SHIP", "DRAFT"],  # 다음 화로 또는 출하(경계)
    "SHIP": [],
}

# 사람 토글로 직접 발동하는 상태(나머지는 자동/조건).
TOGGLE_STATES = {"POLISH", "EXPAND"}
# 컨텍스트 강제 초기화 지점.
RESET_STATES = {"CTX_RESET_A", "CTX_RESET_B"}


def can_advance(frm: str, to: str) -> bool:
    return to in TRANSITIONS.get(frm, [])


def next_default(frm: str) -> str | None:
    """그 상태의 가장 자연스러운 다음(첫 전이). 막다른 곳이면 None."""
    nxt = TRANSITIONS.get(frm, [])
    return nxt[0] if nxt else None


def is_terminal(state: str) -> bool:
    return not TRANSITIONS.get(state)
