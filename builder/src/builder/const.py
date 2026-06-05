"""상수·경로·설정. 하드코딩 금지 — 값은 전부 여기 모은다."""

from pathlib import Path

# 저장소 루트 기준 절대 경로 (const.py = builder/src/builder/const.py).
REPO_ROOT = Path(__file__).resolve().parents[3]
CORPUS_DIR = REPO_ROOT / "corpus"
EVENT_CHAIN = CORPUS_DIR / "event_chain.json"
DRAFTS_DIR = REPO_ROOT / "builder" / "drafts"

# event_chain.json sources 키 → belief 갱신 가중치.
# dfu = ground truth(정사), rrw/namu = 보완재.
SOURCE_WEIGHTS: dict[str, float] = {
    "dfu": 1.5,
    "rrw": 0.8,
    "namu": 0.5,
}

# 로컬 LLM (WSL/Windows llama-server, OpenAI 호환). 서빙 구현에 안 묶이게 URL만 본다.
LLM_BASE_URL = "http://127.0.0.1:8080"
MODEL_NAME = "gemma-4-31B-it-Q4_K_M.unsloth.gguf"
LLM_TIMEOUT = 600  # 초
