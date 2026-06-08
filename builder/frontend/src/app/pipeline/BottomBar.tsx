/** 에디터 하단 바 렌더 — 선택 있으면 부분수정, 없으면 생성 바(genActions + 초안 확정). 로직은 상위 소유. */
import { Button, Spinner } from "../../components/primitives";
import { genActions } from "../../lib/genActions";
import { PartialEditBar } from "../PartialEditBar";
import w from "../writer.module.css";

type Sel = { start: number; end: number; text: string } | null;

type Props = {
  chapterId: number;
  cur: string;
  text: string;
  busy: string;
  sel: Sel;
  onReplace: (s: string) => void;
  onInsert: (s: string) => void;
  onCloseSel: () => void;
  onRegistered: () => void;
  onToggle: (mode: string) => void;
  onConfirmDraft: () => void;
};

export function BottomBar(p: Props) {
  if (p.sel) {
    return (
      <PartialEditBar chapterId={p.chapterId} sel={p.sel}
        onReplace={p.onReplace} onInsert={p.onInsert} onClose={p.onCloseSel} onRegistered={p.onRegistered} />
    );
  }
  return (
    <div className={w.genBar}>
      <span className={w.genLbl}>생성</span>
      {genActions(p.cur, !!p.text).map((a) => (
        <Button key={a.mode} variant={a.active ? "primary" : "default"}
          disabled={!a.enabled || !!p.busy} onClick={() => p.onToggle(a.mode)}>
          {p.busy === a.mode ? <><Spinner /> 생성 중…</> : a.label}
        </Button>
      ))}
      {p.cur === "DRAFT" && (
        <Button variant="primary" disabled={!p.text || !!p.busy} onClick={p.onConfirmDraft}>초안 확정 →</Button>
      )}
    </div>
  );
}
