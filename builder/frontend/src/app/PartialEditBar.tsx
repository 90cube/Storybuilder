/** 선택 시 하단 부분수정 컴포넌트 — 선택 영역을 다듬기(초안)/보강+엔티티(확정 후) 후보로 교체. */
import { useState } from "react";
import { Button, Spinner } from "../components/primitives";
import type { useCreator, CanonItem } from "../lib/useCreator";
import w from "./writer.module.css";

type Api = ReturnType<typeof useCreator>;
type Sel = { start: number; end: number; text: string };
type Result = {
  rewrites: string[]; continuations: string[];
  conflicts: { entity?: string; issue?: string; suggestion?: string }[];
  mode: string; entities: { added: CanonItem[]; changed: CanonItem[] };
};

const SRC: { v: string; label: string }[] = [
  { v: "field", label: "문체 필드" }, { v: "auto", label: "자동 샘플" }, { v: "base", label: "기본" },
];

export function PartialEditBar({ api, chapterId, projectId, sel, onReplace, onInsert, onClose }: {
  api: Api; chapterId: number; projectId: number | null; sel: Sel;
  onReplace: (s: string) => void; onInsert: (s: string) => void; onClose: () => void;
}) {
  const [src, setSrc] = useState("field");
  const [busy, setBusy] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [trans, setTrans] = useState("");
  const [err, setErr] = useState("");

  const run = async () => {
    setBusy("edit"); setErr(""); setRes(null); setTrans("");
    try {
      setRes(await api.assistEdit(chapterId, { selected: sel.text, before: "", after: "", style_source: src }));
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(""); }
  };
  const translate = async () => {
    setBusy("trans"); setErr(""); setTrans("");
    try { setTrans((await api.assistTranslate(chapterId, sel.text)).text); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(""); }
  };
  const register = async (e: CanonItem) => {
    if (projectId == null) return;
    try { await api.stageToCausal(chapterId, { events: [], entities: [e], relations: [] }); }
    catch { /* */ }
  };

  return (
    <div className={w.peBar}>
      <div className={w.peHead}>
        <span className={w.peSnip}>“{sel.text.length > 40 ? sel.text.slice(0, 40) + "…" : sel.text}”</span>
        <span className={w.peSrc}>
          문체:
          {SRC.map((o) => (
            <button key={o.v} className={w.peSrcBtn} data-on={src === o.v} onClick={() => setSrc(o.v)}>{o.label}</button>
          ))}
        </span>
        <span className={w.peTools}>
          <Button variant="primary" disabled={!!busy} onClick={run}>
            {busy === "edit" ? <><Spinner /> 수정…</> : "AI 부분수정"}</Button>
          <Button disabled={!!busy} onClick={translate}>{busy === "trans" ? <><Spinner /> 번역…</> : "번역"}</Button>
          <Button variant="ghost" onClick={onClose}>닫기</Button>
        </span>
      </div>
      {err && <div className={w.peErr}>⚠ {err}</div>}
      {trans && (
        <div className={w.peRow}>
          <span className={w.peKind}>번역</span><span className={w.peCand}>{trans}</span>
          <Button onClick={() => onReplace(trans)}>적용</Button>
        </div>
      )}
      {res && (
        <div className={w.peBody}>
          {res.rewrites.map((r, i) => (
            <div key={"r" + i} className={w.peRow}>
              <span className={w.peKind}>수정안</span><span className={w.peCand}>{r}</span>
              <Button onClick={() => onReplace(r)}>적용(교체)</Button>
            </div>
          ))}
          {res.continuations.map((cn, i) => (
            <div key={"c" + i} className={w.peRow}>
              <span className={w.peKind} data-cont="true">이어쓰기</span><span className={w.peCand}>{cn}</span>
              <Button onClick={() => onInsert(cn)}>삽입</Button>
            </div>
          ))}
          {res.conflicts.map((cf, i) => (
            <div key={"x" + i} className={w.peConflict}>⚠ {cf.entity}: {cf.issue} {cf.suggestion ? `→ ${cf.suggestion}` : ""}</div>
          ))}
          {!!res.entities.added.length && (
            <div className={w.peEnts}>
              <span className={w.peKind}>새 엔티티</span>
              {res.entities.added.map((e, i) => (
                <span key={i} className={w.peEnt}>{e.name}<button className={w.peReg} onClick={() => register(e)}>＋등록</button></span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
