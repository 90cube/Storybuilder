/** 버전 미리보기(렌더 전용) — 현재본 vs 선택 버전의 문단 diff(읽기전용). 빨강=돌아가면 사라질 부분, 초록=생길 부분. */
import { useMemo } from "react";
import { Button } from "../../components/primitives";
import { diffParas } from "../../lib/paraDiff";
import type { VersionRow } from "../../lib/useCreator";
import c from "../review/review.module.css";

const KIND: Record<string, string> = {
  draft: "✎ 초안", polish: "✨ 다듬기", expand: "➕ 완성본",
  partial: "✂ 부분수정", manual: "✎ 편집", accept: "✓ 채택",
};

export function VersionPreviewPane({ row, text, currentText, onRevert, onClose }: {
  row: VersionRow;
  text: string;          // 선택한 버전의 전문
  currentText: string;   // 현재(head) 본문
  onRevert: () => void;
  onClose: () => void;
}) {
  // 미리보기 열려 있는 동안 1회만 계산 (RAM: 닫으면 상위에서 상태 해제)
  const { segs } = useMemo(() => diffParas(currentText, text), [currentText, text]);
  const changed = segs.filter((s) => s.kind !== "same").length;
  const same = changed === 0;
  return (
    <div className={c.pane}>
      <div className={c.bar}>
        <span className={c.title}>버전 미리보기 — {KIND[row.kind] || row.kind} {(row.created_at || "").slice(11, 16)}</span>
        <span className={c.count}>{same ? "현재본과 동일" : `현재본과 다른 곳 ${changed}`}</span>
        <Button variant="primary" disabled={same} onClick={onRevert}>이 버전으로 되돌리기</Button>
        <Button onClick={onClose}>닫기</Button>
      </div>
      <div className={c.body}>
        {segs.map((s, i) => {
          if (s.kind === "same") return <p key={i} className={c.same}>{s.text}</p>;
          return (
            <div key={i} className={c.hunk}>
              {s.kind !== "added" && (
                <div className={c.del} data-active="true">
                  {s.kind === "changed"
                    ? s.words.filter((w) => w.t !== "ins").map((w, k) => <span key={k} data-t={w.t}>{w.v}</span>)
                    : s.before}
                </div>
              )}
              {s.kind !== "removed" && (
                <div className={c.ins} data-active="true">
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
