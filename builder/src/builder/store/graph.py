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


def upsert_entity(ent: dict, project_id: int, who: str = "creator", protect: bool = False) -> str:
    """이름 기준 upsert(작품 한정). 신규=insert, 기존=description 보강 + version++.

    protect=True면 이미 확정(status='confirmed')된 행은 덮어쓰지 않는다(정사 보호).
    """
    name = (ent.get("name") or "").strip()
    if not name:
        raise ValueError("entity name required")
    eid = ent.get("id") or _eid(project_id, name)
    with get_conn() as c:
        row = c.execute("SELECT id,status FROM entities WHERE id=? OR (project_id=? AND name=?)",
                        (eid, project_id, name)).fetchone()
        if row and protect and row["status"] == "confirmed":
            return row["id"]
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


def add_relation(from_name: str, rel: str, to_name: str, project_id: int,
                 who: str = "creator", source: str = "authored", protect: bool = False) -> None:
    """양방향 주입(역관계 포함)은 entity.set_relation 에 위임 — 단일 경로 유지."""
    from builder.store import entity  # 지연 import: graph↔entity 순환 회피
    entity.set_relation(from_name, rel, to_name, project_id, who, source=source, protect=protect)


# ── 사건(events) — 작품별 인과 캔버스 백엔드 ──
def list_events(project_id: int) -> list[dict]:
    """인과 캔버스용 사건 목록(작품 한정). corpus가 아니라 이 작품의 events."""
    with get_conn() as c:
        rows = c.execute(
            "SELECT id,title,era,sequence,source,causal_out_json,chars_json FROM events "
            "WHERE project_id=? ORDER BY sequence,id", (project_id,)).fetchall()
    return [{"id": r["id"], "title": r["title"] or "", "era": r["era"] or "",
             "sequence": r["sequence"] or 0, "source": r["source"] or "fan",
             "causal_out": json.loads(r["causal_out_json"] or "[]"),
             "characters": json.loads(r["chars_json"] or "[]")} for r in rows]


def events_by_id(project_id: int) -> dict[str, dict]:
    """generate_pair/validate가 쓰는 {id: 사건dict} 맵(작품 한정, corpus 형태로 변환)."""
    out: dict[str, dict] = {}
    for e in list_events(project_id):
        out[e["id"]] = {
            "event_id": e["id"], "title": e["title"], "era": e["era"],
            "sequence": e["sequence"], "causal_out": e["causal_out"],
            "characters_involved": [{"name": n} for n in e["characters"]],
        }
    return out


def upsert_event(ev: dict, project_id: int, who: str = "creator", protect: bool = False) -> str:
    """사건 등록/보강(작품 한정). id = '{project_id}:evt:{slug}'.

    protect=True면 이미 확정(status='confirmed')된 사건은 덮어쓰지 않는다(정사 보호).
    """
    title = (ev.get("title") or ev.get("name") or "").strip()
    if not title:
        raise ValueError("event title required")
    eid = ev.get("id") or f"{project_id}:evt:{_slug(title)}"
    chars = ev.get("characters") or ev.get("chars") or []
    cout = ev.get("causal_out") or []
    with get_conn() as c:
        row = c.execute("SELECT id,status FROM events WHERE id=? OR (project_id=? AND title=?)",
                        (eid, project_id, title)).fetchone()
        if row and protect and row["status"] == "confirmed":
            return row["id"]
        if row:
            c.execute("""UPDATE events SET title=?,era=?,what=?,sequence=?,causal_out_json=?,chars_json=?,
                         source=?,status=?,updated_at=?,updated_by=?,version=version+1 WHERE id=?""",
                      (title, ev.get("era", ""), ev.get("what", ev.get("description", "")),
                       ev.get("sequence", 0), json.dumps(cout, ensure_ascii=False),
                       json.dumps(chars, ensure_ascii=False),
                       ev.get("source", "fan"), ev.get("status", "pending"), _now(), who, row["id"]))
            return row["id"]
        c.execute("""INSERT INTO events(id,project_id,title,era,what,sequence,causal_out_json,chars_json,
                     source,status,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                  (eid, project_id, title, ev.get("era", ""),
                   ev.get("what", ev.get("description", "")), ev.get("sequence", 0),
                   json.dumps(cout, ensure_ascii=False), json.dumps(chars, ensure_ascii=False),
                   ev.get("source", "fan"), ev.get("status", "pending"), _now(), who))
        return eid


def entities_in_text(project_id: int, text: str, limit: int = 12) -> list[dict]:
    """본문에 이름이 등장하는 (작품) 엔티티 + 말투/성격 카드(부분수정 프롬프트 주입용)."""
    out: list[dict] = []
    with get_conn() as c:
        rows = c.execute(
            "SELECT name,category,description,data_json FROM entities WHERE project_id=? ORDER BY name",
            (project_id,)).fetchall()
    for r in rows:
        nm = r["name"]
        if nm and nm in text:
            d = json.loads(r["data_json"] or "{}")
            persona = d.get("personality_traits") or d.get("mbti") or ""
            if isinstance(persona, list):
                persona = ", ".join(persona)
            out.append({"name": nm, "category": r["category"] or "",
                        "speech_style": d.get("speech_style", ""),
                        "personality": persona,
                        "summary": r["description"] or d.get("summary", "")})
            if len(out) >= limit:
                break
    return out
