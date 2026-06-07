"""추출 후보 vs 현 그래프 3-way diff + 승격. (기획서 ⑥)

change: 추가(신규) / 변경(기존 존재) / 충돌(tbg 모순 — 후속에서 정밀화).
"""

from builder.store import graph
from builder.schemadef import loader


def diff_against_graph(extracted: dict, project_id: int) -> dict:
    known = graph.known_names(project_id)
    ents = []
    for e in extracted.get("entities", []):
        nm = (e.get("name") or "").strip()
        if not nm:
            continue
        ents.append({**e, "change": "변경" if nm in known else "추가"})
    rels = [{**r, "change": "추가"} for r in extracted.get("relations", [])]
    evs = [{**ev, "change": "추가"} for ev in extracted.get("events", [])]
    return {"entities": ents, "relations": rels, "events": evs}


def stage_draft(extracted: dict, project_id: int) -> dict:
    """분석 결과를 'draft_auto'/'pending' 임시 티어로 작품 그래프에 스테이징.

    정사(confirmed/canon)는 protect로 보호, FSM 미관여. 기존 slug 키로 재커밋 중복 흡수.
    """
    n_e = n_r = n_v = 0
    for e in extracted.get("entities", []):
        if (e.get("name") or "").strip():
            graph.upsert_entity({**e, "category": loader.normalize_category(e.get("category")),
                                 "source": "draft_auto", "status": "pending"}, project_id, protect=True)
            n_e += 1
    for v in extracted.get("events", []):
        if v.get("title") or v.get("name"):
            graph.upsert_event({**v, "source": "draft_auto", "status": "pending"}, project_id, protect=True)
            n_v += 1
    for r in extracted.get("relations", []):
        if r.get("from") and r.get("to"):
            graph.add_relation(r["from"], r.get("rel", "관련"), r["to"], project_id,
                               source="draft_auto", protect=True)
            n_r += 1
    return {"entities": n_e, "relations": n_r, "events": n_v}


def promote(entities: list[dict], relations: list[dict], project_id: int,
            events: list[dict] | None = None) -> dict:
    """승인된 항목을 canon으로 승격(작품 한정, source=canon, status=confirmed). 사건은 인과 캔버스에 반영."""
    n_e = n_r = n_v = 0
    for e in entities:
        graph.upsert_entity({**e, "category": loader.normalize_category(e.get("category")),
                             "source": "canon", "status": "confirmed"}, project_id)
        n_e += 1
    for r in relations:
        if r.get("from") and r.get("to"):
            graph.add_relation(r["from"], r.get("rel", "관련"), r["to"], project_id)
            n_r += 1
    for v in (events or []):
        if v.get("title") or v.get("name"):
            graph.upsert_event({**v, "source": "canon", "status": "confirmed"}, project_id)
            n_v += 1
    return {"entities": n_e, "relations": n_r, "events": n_v}
