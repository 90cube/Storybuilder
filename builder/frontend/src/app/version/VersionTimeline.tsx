/** 버전 트리(렌더 전용) — parent_id로 트리 구성, 분기에서만 들여쓰기 + 연결선. 되돌리기·현재 배지. */
import type { VersionRow } from "../../lib/useCreator";
import w from "../writer.module.css";

const KIND: Record<string, string> = {
  draft: "✎ 초안", polish: "✨ 다듬기", expand: "➕ 완성본",
  partial: "✂ 부분수정", manual: "✎ 편집", accept: "✓ 채택",
};

/** 트리 평탄화: 선형 사슬은 같은 깊이, 분기(자식 2+)에서만 깊이+1. */
function treeRows(versions: VersionRow[]): { v: VersionRow; depth: number }[] {
  const kids = new Map<number | null, VersionRow[]>();
  for (const v of versions) {
    const arr = kids.get(v.parent_id) ?? [];
    arr.push(v); kids.set(v.parent_id, arr);
  }
  const rows: { v: VersionRow; depth: number }[] = [];
  const seen = new Set<number>();
  const visit = (v: VersionRow, depth: number) => {
    if (seen.has(v.id)) return;
    seen.add(v.id);
    rows.push({ v, depth });
    const cs = kids.get(v.id) ?? [];
    cs.forEach((c) => visit(c, depth + (cs.length > 1 ? 1 : 0)));  // 분기일 때만 들여쓰기
  };
  (kids.get(null) ?? []).forEach((r) => visit(r, 0));
  for (const v of versions) if (!seen.has(v.id)) visit(v, 0);   // 고아 노드 누락 방지
  return rows;
}

export function VersionTimeline({ versions, head, onRevert, onPreview }: {
  versions: VersionRow[];
  head: number | null;
  onRevert: (id: number) => void;
  onPreview: (v: VersionRow) => void;
}) {
  if (!versions.length) return null;
  const rows = treeRows(versions);
  return (
    <div className={w.verPanel}>
      <div className={w.verHead}>버전 트리 ({versions.length})</div>
      {rows.map(({ v, depth }) => (
        <div key={v.id} className={w.verRow} data-head={v.id === head} style={{ paddingLeft: 6 + depth * 16 }}>
          {depth > 0 && <span className={w.verBranch}>└</span>}
          <span className={w.verMain} title="클릭하면 현재본과 비교 미리보기" onClick={() => onPreview(v)}>
            <span className={w.verKind}>{KIND[v.kind] || "• " + v.kind}</span>
            {(v.excerpt || "").trim() && <span className={w.verExcerpt}>“{v.excerpt.replace(/\s+/g, " ").trim()}”</span>}
          </span>
          <span className={w.verTime}>{(v.created_at || "").slice(11, 16)}</span>
          {v.id === head
            ? <span className={w.verNow}>현재</span>
            : <button className={w.verBtn} onClick={() => onRevert(v.id)}>이 버전으로</button>}
        </div>
      ))}
    </div>
  );
}
