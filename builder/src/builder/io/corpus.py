"""corpus(event_chain.json) 로드 + 드래프트 저장. 파일 I/O만 담당."""

import json
from datetime import datetime, timezone

from builder.const import EVENT_CHAIN, DRAFTS_DIR


def load_events() -> tuple[dict[str, dict], list[dict]]:
    """event_chain.json을 읽어 (id→사건 맵, sequence 정렬 리스트)를 돌려준다."""
    raw = json.loads(EVENT_CHAIN.read_text(encoding="utf-8"))
    events = raw.get("events", [])
    by_id = {e["event_id"]: e for e in events}
    ordered = sorted(events, key=lambda e: e.get("sequence", 0))
    return by_id, ordered


def save_draft(draft: dict) -> str:
    """드래프트를 builder/drafts/<id>.json 으로 저장하고 경로를 돌려준다."""
    DRAFTS_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = DRAFTS_DIR / f"draft_{stamp}.json"
    path.write_text(json.dumps(draft, ensure_ascii=False, indent=2), encoding="utf-8")
    return str(path)
