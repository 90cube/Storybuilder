/** 초안 분석 패널 렌더 — 노드·엣지·사건 실시간 표시 + 자동토글/분석/인과추가 버튼. 상태·로직은 상위가 소유. */
import { Button, Spinner, Toggle } from "../../components/primitives";
import { type CanonItem } from "../../lib/useCreator";
import w from "../writer.module.css";

type Analysis = { events: CanonItem[]; entities: CanonItem[]; relations: CanonItem[] } | null;

type Props = {
  analysis: Analysis;
  stagedNote: string;
  autoAnalyze: boolean;
  busy: string;
  onAutoAnalyze: (on: boolean) => void;
  analyzeNow: () => void;
  onStage: () => void;
};

export function AnalysisPanel({ analysis, stagedNote, autoAnalyze, busy, onAutoAnalyze, analyzeNow, onStage }: Props) {
  return (
    <div className={w.analysisPanel}>
      <div className={w.analysisHead}>
        <span>초안 분석 — 노드·엣지·사건</span>
        {analysis && <span className={w.aCount}>사건 {analysis.events.length} · 노드 {analysis.entities.length} · 엣지 {analysis.relations.length}</span>}
        {stagedNote && <span className={w.aStaged}>✓ {stagedNote}</span>}
        <span className={w.aTools}>
          <span className={w.muted}>자동</span><Toggle on={autoAnalyze} onChange={onAutoAnalyze} />
          <Button disabled={busy === "analyze"} onClick={analyzeNow}>
            {busy === "analyze" ? <><Spinner /> 분석…</> : "분석"}</Button>
          <Button variant="primary" disabled={!analysis || busy === "stage"} onClick={onStage}>
            {busy === "stage" ? <><Spinner /> 추가…</> : "인과로 추가"}</Button>
        </span>
      </div>
      {analysis ? (
        <div className={w.analysisBody}>
          <div className={w.aCol}>
            <div className={w.aColH}>사건 ({analysis.events.length})</div>
            {analysis.events.map((e, i) => <div key={i} className={w.aItem}>📅 {e.title}</div>)}
            {!analysis.events.length && <div className={w.aEmpty}>—</div>}
          </div>
          <div className={w.aCol}>
            <div className={w.aColH}>노드 ({analysis.entities.length})</div>
            {analysis.entities.map((e, i) => <div key={i} className={w.aItem}>◆ {e.name} <span className={w.muted}>{e.category}</span></div>)}
            {!analysis.entities.length && <div className={w.aEmpty}>—</div>}
          </div>
          <div className={w.aCol}>
            <div className={w.aColH}>엣지 ({analysis.relations.length})</div>
            {analysis.relations.map((r, i) => <div key={i} className={w.aItem}>{r.from} <span className={w.muted}>—{r.rel}→</span> {r.to}</div>)}
            {!analysis.relations.length && <div className={w.aEmpty}>—</div>}
          </div>
        </div>
      ) : <div className={w.aEmpty} style={{ padding: 12 }}>「분석」을 누르거나 자동을 켜면 초안의 사건·노드·엣지가 실시간으로 표시됩니다.</div>}
    </div>
  );
}
