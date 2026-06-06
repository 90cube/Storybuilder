"""엔티티 store: 스키마검증·양방향관계·버전잠금·편집로그·타임라인·비밀. (graph.py는 추출/canon 경로 전용)"""

import json

from builder.store.db import get_conn
from builder.store.graph import _now, _slug
from builder.schemadef import loader


class ValidationError(ValueError):
    """필수 항목 누락 등 스키마 검증 실패."""


class VersionConflict(RuntimeError):
    """낙관적 잠금 충돌: 다른 사용자가 먼저 수정."""


def _dumps(v) -> str:
    return json.dumps(v, ensure_ascii=False)


def _log(c, who, op, kind, target_id, before, after) -> None:
    c.execute("""INSERT INTO edit_log(ts,who,op,target_kind,target_id,before_json,after_json)
                 VALUES(?,?,?,?,?,?,?)""",
              (_now(), who, op, kind, str(target_id),
               _dumps(before) if before is not None else None,
               _dumps(after) if after is not None else None))


# ── 엔티티(타입 폼) ──
def validate(type_: str, data: dict) -> list[str]:
    """누락된 필수 필드 키 목록. 빈 리스트면 통과."""
    missing = []
    for k in loader.required_keys(type_):
        v = data.get(k)
        if v is None or (isinstance(v, str) and not v.strip()) or (isinstance(v, list) and not v):
            missing.append(k)
    return missing


def save_entity(type_: str, data: dict, who: str = "creator",
                expected_version: int | None = None) -> dict:
    """타입 폼 저장(생성/수정). 필수검증 + 버전잠금 + data_json + 편집로그."""
    if not loader.type_def(type_):
        raise ValidationError(f"미정의 타입: {type_}")
    miss = validate(type_, data)
    if miss:
        raise ValidationError("필수 항목 누락: " + ", ".join(miss))
    name = (data.get("name") or "").strip()
    eid = (data.get("id") or _slug(name)).strip()
    # 시스템/공통을 뺀 타입 필드만 data_json 으로 보존
    fields = {f["key"] for f in loader.form_fields(type_)}
    payload = {k: v for k, v in data.items() if k in fields and k != "name"}
    desc = data.get("summary") or data.get("description") or ""
    with get_conn() as c:
        row = c.execute("SELECT * FROM entities WHERE id=?", (eid,)).fetchone()
        if row:
            if expected_version is not None and row["version"] != expected_version:
                raise VersionConflict(f"버전 충돌: DB={row['version']} 요청={expected_version}")
            before = dict(row)
            c.execute("""UPDATE entities SET name=?,category=?,description=?,data_json=?,
                         source=?,status=?,updated_at=?,updated_by=?,version=version+1 WHERE id=?""",
                      (name, type_, desc, _dumps(payload),
                       data.get("source", row["source"]), data.get("status", row["status"]),
                       _now(), who, eid))
            _log(c, who, "update", "entity", eid, before, {**payload, "name": name, "type": type_})
            ver = row["version"] + 1
        else:
            c.execute("""INSERT INTO entities(id,name,category,description,data_json,source,status,
                         updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?,?)""",
                      (eid, name, type_, desc, _dumps(payload),
                       data.get("source", "authored"), data.get("status", "confirmed"), _now(), who))
            c.execute("INSERT OR IGNORE INTO aliases(alias,entity_id) VALUES(?,?)", (name, eid))
            _log(c, who, "create", "entity", eid, None, {**payload, "name": name, "type": type_})
            ver = 1
    return {"id": eid, "version": ver}


def get_entity(eid: str) -> dict | None:
    with get_conn() as c:
        r = c.execute("SELECT * FROM entities WHERE id=?", (eid,)).fetchone()
        if not r:
            return None
        d = dict(r)
        d["data"] = json.loads(d.get("data_json") or "{}")
        return d


def list_by_type(type_: str, limit: int = 2000) -> list[dict]:
    with get_conn() as c:
        return [dict(r) for r in c.execute(
            "SELECT id,name,category,description,source,status,version,updated_at "
            "FROM entities WHERE category=? ORDER BY name LIMIT ?", (type_, limit))]


def delete_entity(eid: str, who: str = "creator") -> None:
    with get_conn() as c:
        row = c.execute("SELECT * FROM entities WHERE id=?", (eid,)).fetchone()
        if not row:
            return
        c.execute("DELETE FROM entities WHERE id=?", (eid,))
        c.execute("DELETE FROM relations WHERE from_id=? OR to_id=?", (eid, eid))
        c.execute("DELETE FROM aliases WHERE entity_id=?", (eid,))
        _log(c, who, "delete", "entity", eid, dict(row), None)


# ── 관계 (양방향 주입) ──
def _pair_id(a: str, b: str) -> str:
    lo, hi = sorted([a, b])
    return f"p_{lo}_{hi}"


def set_relation(from_name: str, rel: str, to_name: str, who: str = "creator") -> None:
    """정방향 + (등록된) 역방향을 같은 pair_id 로 주입. 제자→스승 처럼."""
    a, b = _slug(from_name), _slug(to_name)
    pid = _pair_id(a, b)
    inv = loader.inverse_of(rel)
    with get_conn() as c:
        c.execute("""INSERT OR REPLACE INTO relations(id,from_id,rel,to_id,pair_id,source,updated_at,updated_by)
                     VALUES(?,?,?,?,?,?,?,?)""",
                  (f"{a}-{rel}-{b}", a, rel, b, pid, "authored", _now(), who))
        if inv:
            c.execute("""INSERT OR REPLACE INTO relations(id,from_id,rel,to_id,pair_id,source,updated_at,updated_by)
                         VALUES(?,?,?,?,?,?,?,?)""",
                      (f"{b}-{inv}-{a}", b, inv, a, pid, "authored", _now(), who))
        _log(c, who, "create", "relation", f"{a}-{rel}-{b}", None,
             {"from": a, "rel": rel, "to": b, "inverse": inv})


def list_relations(eid: str) -> list[dict]:
    with get_conn() as c:
        return [dict(r) for r in c.execute(
            "SELECT id,from_id,rel,to_id,pair_id FROM relations WHERE from_id=? OR to_id=? ORDER BY rel",
            (eid, eid))]


def delete_pair(pair_id: str, who: str = "creator") -> None:
    with get_conn() as c:
        c.execute("DELETE FROM relations WHERE pair_id=?", (pair_id,))
        _log(c, who, "delete", "relation", pair_id, {"pair_id": pair_id}, None)


# ── 타임라인 ──
def add_timeline(eid: str, era: str, state: str, note: str = "", seq: int = 0,
                 who: str = "creator") -> int:
    with get_conn() as c:
        rid = c.execute("""INSERT INTO timeline(entity_id,seq,era,state,note,created_at,created_by)
                           VALUES(?,?,?,?,?,?,?)""",
                        (eid, seq, era, state, note, _now(), who)).lastrowid
        _log(c, who, "create", "timeline", rid, None, {"entity": eid, "era": era, "state": state})
        return rid


def list_timeline(eid: str) -> list[dict]:
    with get_conn() as c:
        return [dict(r) for r in c.execute(
            "SELECT * FROM timeline WHERE entity_id=? ORDER BY seq,id", (eid,))]


# ── 비밀/인지상태 ──
def add_secret(eid: str, fact: str, known_by: list | None = None, reveal_at: str = "",
               who: str = "creator") -> int:
    with get_conn() as c:
        rid = c.execute("""INSERT INTO secrets(entity_id,fact,known_by_json,reveal_at,created_at,created_by)
                           VALUES(?,?,?,?,?,?)""",
                        (eid, fact, _dumps(known_by or []), reveal_at, _now(), who)).lastrowid
        _log(c, who, "create", "secret", rid, None, {"entity": eid, "fact": fact})
        return rid


def list_secrets(eid: str) -> list[dict]:
    with get_conn() as c:
        return [dict(r) for r in c.execute(
            "SELECT * FROM secrets WHERE entity_id=? ORDER BY id", (eid,))]


# ── 편집 로그 ──
def recent_log(limit: int = 100) -> list[dict]:
    with get_conn() as c:
        return [dict(r) for r in c.execute(
            "SELECT * FROM edit_log ORDER BY id DESC LIMIT ?", (limit,))]
