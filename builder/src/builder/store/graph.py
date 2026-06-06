"""그래프 CRUD: entities/relations/events (작품별 격리). 원고 CRUD는 repo.py."""

import json
import re
from datetime import datetime, timezone

from builder.store.db import get_conn


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slug(name: str) -> str:
    s = re.sub(r"\s+", "_", name.strip().lower())
    return re.sub(r"[^\w가-힣]", "", s) or "entity"


def _eid(project_id: int, name: str) -> str:
    """엔티티 id = '{project_id}:{slug}' — 작품 간 동명이인 충돌·누수 차단."""
    return f"{project_id}:{_slug(name)}"


def pid_of(eid: str) -> int | None:
    """프리픽스된 id에서 project_id 추출. 구(舊) 비프리픽스 id면 None."""
    head = eid.split(":", 1)[0]
    return int(head) if head.isdigit() else None


def known_names(project_id: int) -> set[str]:
    with get_conn() as c:
        return {r["name"] for r in c.execute(
            "SELECT name FROM entities WHERE project_id=?", (project_id,))}


def list_entities(project_id: int, limit: int = 2000) -> list[dict]:
    with get_conn() as c:
        return [dict(r) for r in c.execute(
            "SELECT id,name,category,description,source,confidence,status FROM entities "
            "WHERE project_id=? ORDER BY name LIMIT ?", (project_id, limit))]


def upsert_entity(ent: dict, project_id: int, who: str = "creator") -> str:
    """이름 기준 upsert(작품 한정). 신규=insert, 기존=description 보강 + version++."""
    name = (ent.get("name") or "").strip()
    if not name:
        raise ValueError("entity name required")
    eid = ent.get("id") or _eid(project_id, name)
    with get_conn() as c:
        row = c.execute("SELECT id FROM entities WHERE id=? OR (project_id=? AND name=?)",
                        (eid, project_id, name)).fetchone()
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
        c.execute("""INSERT INTO entities(id,project_id,name,category,description,persona_json,relations_json,
                     source,status,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                  (eid, project_id, name, *payload))
        c.execute("INSERT OR IGNORE INTO aliases(project_id,alias,entity_id) VALUES(?,?,?)",
                  (project_id, name, eid))
        return eid


def add_relation(from_name: str, rel: str, to_name: str, project_id: int, who: str = "creator") -> None:
    """양방향 주입(역관계 포함)은 entity.set_relation 에 위임 — 단일 경로 유지."""
    from builder.store import entity  # 지연 import: graph↔entity 순환 회피
    entity.set_relation(from_name, rel, to_name, project_id, who)
