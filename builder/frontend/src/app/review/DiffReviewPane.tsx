/** diff 리뷰 뷰 — 에디터 자리 교체 렌더. 문단 카드(빨강 전/초록 후, 단어 강조) + 적용/취소. 로직은 훅·상위 소유. */
import { Button } from "../../components/primitives";
import type { Decision } from "../../lib/paraDiff";
import type { ReviewState } from "./useDiffReview";
import c from "./review.module.css";

type Props = {
  st: ReviewState;
  busy: boolean;                              // 저장/되돌리기 네트워크 중 버튼 잠금
  onDecide: (i: number, d: Decision) => void;
  onAcceptAll: () => void;                    // 전체 수락 + 완료 (한 클릭)
  onCancelAll: () => void;                    // 전부 취소 (gen: head 되돌리기 / 부분수정: 폐기)
  onFinish: () => void;                       // 현재 결정으로 병합 저장
};

export function DiffReviewPane({ st, busy, onDecide, onAcceptAll, onCancelAll, onFinish }: Props) {
  const total = st.decisions.length;
  const rejected = st.decisions.filter((d) => d === "reject").length;
  let d = -1; // non-same 세그먼트 누적 인덱스(merge와 동일 순서)
  return (
    <div className={c.pane}>
      <div className={c.bar}>
        <span className={c.title}>{st.title}</span>
        <span className={c.count}>변경 {total}곳{rejected ? ` · 취소 ${rejected}` : ""}</span>
        <Button disabled={busy} onClick={onAcceptAll}>전체 수락</Button>
        <Button disabled={busy} onClick={onCancelAll}>전체 취소</Button>
        <Button variant="primary" disabled={busy} onClick={onFinish}>완료</Button>
      </div>
      <div className={c.body}>
        {st.segs.map((s, i) => {
          if (s.kind === "same") return <p key={i} className={c.same}>{s.text}</p>;
          const di = ++d;
          const acc = st.decisions[di] === "accept";
          return (
            <div key={i} className={c.hunk}>
              <div className={c.btns}>
                <button className={c.tog} data-kind="ok" data-on={acc}
                  onClick={() => onDecide(di, "accept")}>✓ 적용</button>
                <button className={c.tog} data-kind="no" data-on={!acc}
                  onClick={() => onDecide(di, "reject")}>✗ 취소</button>
              </div>
              {s.kind !== "added" && (
                <div className={c.del} data-active={!acc}>
                  {s.kind === "changed"
                    ? s.words.filter((w) => w.t !== "ins").map((w, k) => <span key={k} data-t={w.t}>{w.v}</span>)
                    : s.before}
                </div>
              )}
              {s.kind !== "removed" && (
                <div className={c.ins} data-active={acc}>
                  {s.kind === "changed"
                    ? s.words.filter((w) => w.t !== "del").map((w, k) => <span key={k} data-t={w.t}>{w.v}</span>)
                    : s.after}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
