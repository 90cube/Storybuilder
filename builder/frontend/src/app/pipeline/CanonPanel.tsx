/** 정사 승격 목록 렌더 — 엔티티·관계·사건 diff + 전체 승격·닫기(상태표시 포함). 로직은 usePipeline 소유. */
import { Button } from "../../components/primitives";
import { type CanonItem } from "../../lib/useCreator";
import w from "../writer.module.css";

type Canon = { entities: CanonItem[]; relations: CanonItem[]; events: CanonItem[] };

type Props = {
  canon: Canon;
  onPromote: () => void;
  onClose: () => void;
};

export function CanonPanel({ canon, onPromote, onClose }: Props) {
  return (
    <div className={w.editorWrap}>
      <div className={w.diffHead}>
        <span>정사 승격 · 엔티티 {canon.entities.length} · 관계 {canon.relations.length} · 사건 {canon.events.length}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <Button variant="primary" onClick={onPromote}>전체 승격 → canon</Button>
          <Button variant="ghost" onClick={onClose}>닫기</Button>
        </span>
      </div>
      <div className={w.charList}>
        {canon.entities.map((e, i) => <div key={"e" + i} className={w.canonRow} data-change={e.change}><span className={w.cTag}>{e.change}</span><b>{e.name}</b><span className={w.charDesc}> {e.description}</span>{e.state ? <span className={w.canonState}> · 상태: {e.state}</span> : null}</div>)}
        {canon.relations.map((r, i) => <div key={"r" + i} className={w.canonRow} data-change={r.change}><span className={w.cTag}>{r.change}</span>{r.from} —{r.rel}→ {r.to}</div>)}
        {canon.events.map((v, i) => <div key={"v" + i} className={w.canonRow} data-change={v.change}><span className={w.cTag}>{v.change}</span>📅 {v.title}</div>)}
        {!canon.entities.length && !canon.relations.length && !canon.events.length && <div className={w.placeholder} style={{ height: "auto", padding: 24 }}>추출된 노드/엣지 없음</div>}
      </div>
    </div>
  );
}
