"""추출 후보 vs 현 그래프 3-way diff + 승격. (기획서 ⑥)

change: 추가(신규) / 변경(기존 존재) / 충돌(tbg 모순 — 후속에서 정밀화).
"""

from builder.store import graph


def diff_against_graph(extracted: dict) -> dict:
    known = graph.known_names()
    ents = []
    for e in extracted.get("entities", []):
        nm = (e.get("name") or "").strip()
        if not nm:
            continue
        ents.append({**e, "change": "변경" if nm in known else "추가"})
    rels = [{**r, "change": "추가"} for r in extracted.get("relations", [])]
    evs = [{**ev, "change": "추가"} for ev in extracted.get("events", [])]
    return {"entities": ents, "relations": rels, "events": evs}


def promote(entities: list[dict], relations: list[dict]) -> dict:
    """승인된 항목을 canon으로 승격(source=canon, status=confirmed)."""
    n_e = n_r = 0
    for e in entities:
        graph.upsert_entity({**e, "source": "canon", "status": "confirmed"})
        n_e += 1
    for r in relations:
        if r.get("from") and r.get("to"):
            graph.add_relation(r["from"], r.get("rel", "관련"), r["to"])
            n_r += 1
    return {"entities": n_e, "relations": n_r}
