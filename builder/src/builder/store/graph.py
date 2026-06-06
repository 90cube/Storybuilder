"""그래프 CRUD: entities/relations/events. 원고 CRUD는 repo.py."""

import json
import re
from datetime import datetime, timezone

from builder.store.db import get_conn


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slug(name: str) -> str:
    s = re.sub(r"\s+", "_", name.strip().lower())
    return re.sub(r"[^\w가-힣]", "", s) or "entity"


def known_names() -> set[str]:
    with get_conn() as c:
        return {r["name"] for r in c.execute("SELECT name FROM entities")}


def list_entities(limit: int = 2000) -> list[dict]:
    with get_conn() as c:
        return [dict(r) for r in c.execute(
            "SELECT id,name,category,description,source,confidence,status FROM entities ORDER BY name LIMIT ?", (limit,))]


def upsert_entity(ent: dict, who: str = "creator") -> str:
    """이름 기준 upsert. 신규=insert(pending/fan), 기존=description 보강 + version++."""
    name = (ent.get("name") or "").strip()
    if not name:
        raise ValueError("entity name required")
    eid = ent.get("id") or _slug(name)
    with get_conn() as c:
        row = c.execute("SELECT id FROM entities WHERE id=? OR name=?", (eid, name)).fetchone()
        payload = (
            ent.get("category", "character"),
            ent.get("description", ""),
            json.dumps({"speech_style": ent.get("speech_style", "")}, ensure_ascii=False),
            json.dumps(ent.get("relations", []), ensure_ascii=False),
            ent.get("source", "fan"),
            ent.get("status", "pending"),
            _now(), who,
        )
        if row:
            c.execute("""UPDATE entities SET category=?,description=?,persona_json=?,relations_json=?,
                         source=?,status=?,updated_at=?,updated_by=?,version=version+1 WHERE id=?""",
                      (*payload, row["id"]))
            return row["id"]
        c.execute("""INSERT INTO entities(id,name,category,description,persona_json,relations_json,
                     source,status,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?)""",
                  (eid, name, *payload))
        # 별칭
        c.execute("INSERT OR IGNORE INTO aliases(alias,entity_id) VALUES(?,?)", (name, eid))
        return eid


def add_relation(from_name: str, rel: str, to_name: str, who: str = "creator") -> None:
    """양방향 주입(역관계 포함)은 entity.set_relation 에 위임 — 단일 경로 유지."""
    from builder.store import entity  # 지연 import: graph↔entity 순환 회피
    entity.set_relation(from_name, rel, to_name, who)
