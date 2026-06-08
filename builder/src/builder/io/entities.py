"""엔티티 목록 로드 + 검색. 인물 피커가 쓰는 데이터 소스 (타이핑 대신 선택용)."""

import json
from functools import lru_cache

from builder.const import CHARACTER_MASTER

# 사람으로 다룰 카테고리 (인물 피커 기본 필터).
PERSON_CATEGORIES = {"character", "adventurer", "apostle"}


@lru_cache(maxsize=1)
def _all() -> list[dict]:
    raw = json.loads(CHARACTER_MASTER.read_text(encoding="utf-8"))
    out = []
    for i, e in enumerate(raw):
        out.append({
            "id": f"{e.get('dfu_id', i)}-{i}",
            "name": e.get("name", ""),
            "category": e.get("category", ""),
            "summary": (e.get("description", "") or "")[:140],
            "relations": [r for r in (e.get("relations") or []) if isinstance(r, str)],
        })
    return out


def search_entities(q: str = "", category: str = "person", limit: int = 50) -> list[dict]:
    """이름 부분일치 검색. category='person'이면 인물 계열만."""
    items = _all()
    if category == "person":
        items = [e for e in items if e["category"] in PERSON_CATEGORIES]
    elif category and category != "all":
        items = [e for e in items if e["category"] == category]
    if q:
        ql = q.lower()
        items = [e for e in items if ql in e["name"].lower()]
    return items[:limit]
