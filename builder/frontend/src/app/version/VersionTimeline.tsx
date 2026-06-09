/** 버전 타임라인(렌더 전용) — 최신순 리스트. '이 버전으로'=되돌리기(비파괴), 현재 head 배지. */
import type { VersionRow } from "../../lib/useCreator";
import w from "../writer.module.css";

const KIND: Record<string, string> = {
  draft: "✎ 초안", polish: "✨ 다듬기", expand: "➕ 완성본",
  partial: "✂ 부분수정", manual: "✎ 편집", accept: "✓ 채택",
};

export function VersionTimeline({ versions, head, onRevert }: {
  versions: VersionRow[];
  head: number | null;
  onRevert: (id: number) => void;
}) {
  if (!versions.length) return null;
  return (
    <div className={w.verPanel}>
      <div className={w.verHead}>버전 히스토리 ({versions.length})</div>
      {[...versions].reverse().map((v) => (
        <div key={v.id} className={w.verRow} data-head={v.id === head}>
          <span className={w.verKind}>{KIND[v.kind] || "• " + v.kind}</span>
          <span className={w.verTime}>{(v.created_at || "").slice(11, 16)}</span>
          {v.id === head
            ? <span className={w.verNow}>현재</span>
            : <button className={w.verBtn} onClick={() => onRevert(v.id)}>이 버전으로</button>}
        </div>
      ))}
    </div>
  );
}
