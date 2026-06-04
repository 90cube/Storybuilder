"""상수·소스 가중치. 하드코딩 금지 — 값은 전부 여기 모은다."""

# event_chain.json sources 키 → belief 갱신 가중치.
# dfu = ground truth(정사), rrw/namu = 보완재.
SOURCE_WEIGHTS: dict[str, float] = {
    "dfu": 1.5,
    "rrw": 0.8,
    "namu": 0.5,
}

# corpus 입력 경로 (editor 산출물).
CORPUS_DIR = "../corpus"
EVENT_CHAIN = "event_chain.json"
