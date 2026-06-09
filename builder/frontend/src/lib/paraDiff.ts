/** 문단 diff 순수 모듈 — 분리·세그먼트화·단어 토큰·병합. 프레임워크 0(React/DOM 불의존). */
import { diffArrays, diffWordsWithSpace } from "diff";

export type WordTok = { v: string; t: "same" | "del" | "ins" };
export type Segment =
  | { kind: "same"; text: string }
  | { kind: "changed"; before: string; after: string; words: WordTok[] }
  | { kind: "added"; after: string }
  | { kind: "removed"; before: string };
export type Decision = "accept" | "reject";

/** 문단 분리 — 빈줄 블록 우선, 빈줄 없는 원고(한 줄=한 문단)는 줄 단위 폴백. */
export function splitParas(text: string): { paras: string[]; sep: string } {
  const t = text.replace(/\r\n/g, "\n").trim();
  if (!t) return { paras: [], sep: "\n\n" };
  if (/\n{2,}/.test(t)) return { paras: t.split(/\n{2,}/).map((p) => p.trim()), sep: "\n\n" };
  return { paras: t.split("\n").map((p) => p.trim()), sep: "\n" };
}

function mkChanged(before: string, after: string): Segment {
  const words: WordTok[] = diffWordsWithSpace(before, after).map((c) => ({
    v: c.value, t: c.added ? "ins" : c.removed ? "del" : "same",
  }));
  return { kind: "changed", before, after, words };
}

/** 문단 LCS → 세그먼트. 인접 removed+added는 순서쌍으로 changed 병합, 초과분은 단독. sep은 생성 결과(incoming) 문단 스타일. */
export function diffParas(base: string, incoming: string): { segs: Segment[]; sep: string } {
  const b = splitParas(base);
  const n = splitParas(incoming);
  const raw = diffArrays(b.paras, n.paras);
  const segs: Segment[] = [];
  let i = 0;
  while (i < raw.length) {
    const r = raw[i];
    if (!r.added && !r.removed) {
      for (const p of r.value) segs.push({ kind: "same", text: p });
      i++; continue;
    }
    const nxt = raw[i + 1];
    if (r.removed && nxt?.added) {
      const del = r.value, ins = nxt.value, k = Math.min(del.length, ins.length);
      for (let j = 0; j < k; j++) segs.push(mkChanged(del[j], ins[j]));
      for (let j = k; j < del.length; j++) segs.push({ kind: "removed", before: del[j] });
      for (let j = k; j < ins.length; j++) segs.push({ kind: "added", after: ins[j] });
      i += 2; continue;
    }
    if (r.removed) for (const p of r.value) segs.push({ kind: "removed", before: p });
    else for (const p of r.value) segs.push({ kind: "added", after: p });
    i++;
  }
  return { segs, sep: n.sep };
}

/** 결정 반영 병합. decisions는 non-same 세그먼트 순서. removed의 취소(reject)=원문 유지. */
export function merge(segs: Segment[], decisions: Decision[], sep: string): string {
  const out: string[] = [];
  let d = 0;
  for (const s of segs) {
    if (s.kind === "same") { out.push(s.text); continue; }
    const acc = decisions[d++] === "accept";
    if (s.kind === "changed") out.push(acc ? s.after : s.before);
    else if (s.kind === "added") { if (acc) out.push(s.after); }
    else if (!acc) out.push(s.before);
  }
  return out.join(sep);
}
