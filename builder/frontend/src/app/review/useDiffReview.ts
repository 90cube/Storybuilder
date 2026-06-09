/** diff 리뷰 상태 훅 — 진입 시 diff 1회 계산, 문단별 결정, 병합 반환. 종료·화전환 시 상태 전부 해제(RAM 최소). */
import { useCallback, useEffect, useState } from "react";
import { diffParas, merge, type Decision, type Segment } from "../../lib/paraDiff";

export type ReviewState = {
  title: string;             // 상단 바 제목 ("다듬기 결과 검토" 등)
  revertTo: number | null;   // 전부취소 시 복귀할 head 버전 id (부분수정은 null = 폐기만)
  segs: Segment[]; sep: string;
  decisions: Decision[];     // non-same 세그먼트 순서, 기본 accept
};

export function useDiffReview(chapterId: number | null) {
  const [st, setSt] = useState<ReviewState | null>(null);
  useEffect(() => { setSt(null); }, [chapterId]); // 화 전환 → 리뷰 폐기(head는 서버 보존)

  /** 리뷰 진입. 변경 없으면 false(진입 안 함). */
  const enter = useCallback((base: string, incoming: string, revertTo: number | null, title: string): boolean => {
    if (base === incoming) return false;
    const { segs, sep } = diffParas(base, incoming);
    const n = segs.filter((s) => s.kind !== "same").length;
    if (n === 0) return false;
    setSt({ title, revertTo, segs, sep, decisions: Array(n).fill("accept") });
    return true;
  }, []);

  const decide = useCallback((i: number, d: Decision) =>
    setSt((s) => s && { ...s, decisions: s.decisions.map((x, k) => (k === i ? d : x)) }), []);

  /** 현재 결정으로 병합본 반환 + 상태 해제. 리뷰 중 아니면 null. */
  const finish = useCallback((): string | null => {
    if (!st) return null;
    const m = merge(st.segs, st.decisions, st.sep);
    setSt(null);
    return m;
  }, [st]);

  /** 전체 수락 + 즉시 병합(완성본 기본 동선 — 한 클릭). */
  const finishAll = useCallback((): string | null => {
    if (!st) return null;
    const m = merge(st.segs, st.decisions.map(() => "accept" as Decision), st.sep);
    setSt(null);
    return m;
  }, [st]);

  const discard = useCallback(() => setSt(null), []);
  return { st, enter, decide, finish, finishAll, discard };
}
