"""스키마 로더: editor/schema/*.json 을 읽어 타입·필드·역관계를 돌려준다. IO만(검증 로직 없음)."""

import json
from functools import lru_cache

from builder.const import SCHEMA_DIR

# 시스템 필드(자동 채움/숨김) — 폼에 노출하지 않는다.
SYSTEM_KEYS = {"id", "type", "provenance"}
# 별도 테이블로 다루는 믹스인 — 폼의 일반 필드와 분리 표시.
MIXIN_TABLES = ("relations", "timeline", "secrets")


def _read(name: str) -> dict:
    path = SCHEMA_DIR / name
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def base_fields() -> list[dict]:
    """모든 타입 공통 필드(_base.json)."""
    return _read("_base.json").get("base_fields", [])


@lru_cache(maxsize=1)
def relations() -> list[dict]:
    """관계 역방향 레지스트리(_relations.json): [{rel, inverse}]."""
    return _read("_relations.json").get("relations", [])


def inverse_of(rel: str) -> str | None:
    """rel 의 역관계. 없으면 None(대칭/미등록)."""
    for r in relations():
        if r.get("rel") == rel:
            return r.get("inverse")
    return None


@lru_cache(maxsize=1)
def types() -> dict[str, dict]:
    """타입명 → {label, fields(base+타입), mixins}. _ 로 시작하는 파일은 메타라 제외."""
    out: dict[str, dict] = {}
    base = base_fields()
    for f in sorted(SCHEMA_DIR.glob("*.json")):
        if f.name.startswith("_"):
            continue
        d = json.loads(f.read_text(encoding="utf-8"))
        t = d.get("type")
        if not t:
            continue
        out[t] = {
            "type": t,
            "label": d.get("label", t),
            "fields": base + d.get("fields", []),
            "mixins": d.get("mixins", []),
        }
    return out


def type_def(t: str) -> dict | None:
    return types().get(t)


# 추출기(LLM)가 주는 한/영 카테고리 → 스키마 타입 키 별칭.
CATEGORY_ALIASES: dict[str, str] = {
    "인물": "character", "사람": "character", "person": "character", "char": "character",
    "장소": "location", "지역": "location", "place": "location",
    "사물": "item", "물건": "item", "아이템": "item", "object": "item",
    "사건": "event", "이벤트": "event",
    "개념": "concept", "컨셉": "concept",
    "집단": "group", "무리": "group", "팀": "group",
    "조직": "organization", "단체": "organization", "세력": "organization", "길드": "organization",
}


def normalize_category(cat: str | None) -> str:
    """추출 카테고리(한/영 혼용)를 스키마 타입 키로 정규화. 매칭 실패 시 'character'."""
    c = (cat or "").strip()
    if not c:
        return "character"
    if c in types():
        return c
    low = c.lower()
    if low in types():
        return low
    return CATEGORY_ALIASES.get(c) or CATEGORY_ALIASES.get(low) or "character"


def form_fields(t: str) -> list[dict]:
    """폼에 그릴 필드(시스템 필드 제외)."""
    td = type_def(t)
    if not td:
        return []
    return [f for f in td["fields"] if f.get("key") not in SYSTEM_KEYS and not f.get("system")]


def required_keys(t: str) -> list[str]:
    """타입의 필수 필드 키 목록(검증용, 시스템 필드 제외)."""
    return [f["key"] for f in form_fields(t) if f.get("required")]
