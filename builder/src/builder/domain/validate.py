"""tbg 가드레일: 삽입이 타임라인(순서·순환·모순)을 깨뜨리는지 검증."""

import tbg

from builder.const import SOURCE_WEIGHTS


def _build_graph(by_id: dict[str, dict]) -> tbg.BeliefGraph:
    """corpus 사건 → belief graph. 인과 엣지는 dfu 출처 evidence로 강하게."""
    g = tbg.BeliefGraph(prior_config=tbg.PriorConfig(source_weights=SOURCE_WEIGHTS))
    for eid, e in by_id.items():
        g.add_node(tbg.EventNode(id=eid, label=e.get("title", eid),
                                 era=e.get("era"), sources=["dfu"]))
    upd = tbg.BayesianUpdater(g)
    for eid, e in by_id.items():
        for tgt in e.get("causal_out", []):
            if tgt in by_id and not g.has_edge(eid, tgt):
                g.init_uniform(eid, tgt)
                upd.update_edge(eid, tgt, tbg.Evidence(
                    key=f"causal:{eid}->{tgt}", supports_forward=True,
                    strength=0.9, source="dfu"))
    return g


def validate_insertion(by_id: dict[str, dict], before_id: str, after_id: str,
                       new_id: str, new_era: str | None) -> dict:
    """before → new → after 가삽입 후 검증. {is_valid, errors, warnings} 요약."""
    g = _build_graph(by_id)
    g.add_node(tbg.EventNode(id=new_id, label=new_id, era=new_era, sources=["draft"]))
    upd = tbg.BayesianUpdater(g)
    for a, b in ((before_id, new_id), (new_id, after_id)):
        g.init_uniform(a, b)
        upd.update_edge(a, b, tbg.Evidence(key=f"draft:{a}->{b}",
                        supports_forward=True, strength=0.8, source="draft"))
    r = tbg.Validator().validate(g)
    # 신규 삽입과 무관한 corpus 자체 경고(미증거 등)는 노이즈라 제외.
    rel = [w for w in r.warnings if new_id in w]
    return {"is_valid": r.is_valid, "errors": r.errors, "warnings": rel}
