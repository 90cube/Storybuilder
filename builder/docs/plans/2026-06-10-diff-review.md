# 문단 diff 리뷰 (빨강/초록 + 문단별 확인/취소) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 생성(다듬기·완성본)·부분수정 결과를 IDE merge 뷰처럼 빨강(전)/초록(후)으로 보여주고 문단 단위로 적용/취소한 병합본을 저장한다.

**Architecture:** 프론트 전용(백엔드 변경 0). 서버는 기존대로 생성 결과를 새 head 버전으로 만들고, 프론트가 에디터 자리에서 diff 리뷰 → 병합본 저장(`update_head_text` 경로가 자식 manual 노드 생성) 또는 기존 `version/revert`로 전부 취소. RAM 최소화: diff는 진입 시 1회 계산, 상태는 세그먼트+결정만 보유, 종료 시 null 해제.

**Tech Stack:** React 19 + TS, jsdiff(`diff` v9, `diffArrays`·`diffWordsWithSpace`만 임포트), CSS Modules. 스펙: `builder/docs/specs/2026-06-10-diff-review-design.md`

**환경 주의:**
- frontend는 **pnpm** (npm 금지 — `workspace:` 에러). cwd `builder/frontend`.
- 게이트는 `pnpm build`(tsc -b + vite, noUnusedLocals 포함). vitest 없음 — 단위테스트 대신 빌드 + 최종 Playwright E2E.
- git은 `git -C D:/DNF_storybuilder …`. 작업 브랜치 `feat/diff-review` (main에서 분기).
- 커밋 메시지 끝: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

## 파일 구조

| 파일 | 책임 |
|------|------|
| `builder/frontend/src/lib/paraDiff.ts` 생성 | 순수 diff 모듈: 문단 분리(빈줄/줄 폴백)·세그먼트화·단어 토큰·merge |
| `builder/frontend/src/app/review/useDiffReview.ts` 생성 | 리뷰 상태 훅: enter(1회 diff)·decide·finish/finishAll·discard, 화 전환 시 자동 폐기 |
| `builder/frontend/src/app/review/DiffReviewPane.tsx` 생성 | 리뷰 뷰: 상단 바 + 문단 카드(빨강/초록·단어 강조·적용/취소 토글) |
| `builder/frontend/src/app/review/review.module.css` 생성 | 리뷰 전용 스타일(토큰 `--blood`/`--jade` 기반) |
| `builder/frontend/src/app/pipeline/usePipeline.ts` 수정 | onToggle: applyText 대신 리뷰 진입(revertTo 캡처 포함) |
| `builder/frontend/src/app/WriterShell.tsx` 수정 | review 훅 결선·writeCenter 분기·부분수정 래퍼·가드 |
| `builder/frontend/src/app/editor/useChapterDraft.ts` 수정 | `paused` 옵션(리뷰 중 자동저장 정지) |

---

### Task 1: jsdiff 의존성 + paraDiff 순수 모듈

**Files:**
- Modify: `builder/frontend/package.json` (pnpm add)
- Create: `builder/frontend/src/lib/paraDiff.ts`

- [ ] **Step 1: 브랜치 생성 + 의존성 추가**

```bash
git -C D:/DNF_storybuilder checkout -b feat/diff-review
cd D:/DNF_storybuilder/builder/frontend
pnpm add diff@^9.0.0
```
Expected: `dependencies`에 `"diff": "^9.0.0"` 추가. (v9는 TS 타입 내장 — `@types/diff` 설치 금지.)

- [ ] **Step 2: paraDiff.ts 작성**

```ts
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
```

- [ ] **Step 3: 빌드 게이트**

Run: `cd D:/DNF_storybuilder/builder/frontend; pnpm build`
Expected: `✓ built` (타입 에러 0)

- [ ] **Step 4: Commit**

```bash
git -C D:/DNF_storybuilder add builder/frontend/package.json builder/frontend/pnpm-lock.yaml builder/frontend/src/lib/paraDiff.ts
git -C D:/DNF_storybuilder commit -m "feat(review): paraDiff 순수 모듈 + jsdiff v9"
```

---

### Task 2: useDiffReview 상태 훅

**Files:**
- Create: `builder/frontend/src/app/review/useDiffReview.ts`

- [ ] **Step 1: 훅 작성**

```ts
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
    const m = merge(st.segs, st.segs.filter((s) => s.kind !== "same").map(() => "accept" as Decision), st.sep);
    setSt(null);
    return m;
  }, [st]);

  const discard = useCallback(() => setSt(null), []);
  return { st, enter, decide, finish, finishAll, discard };
}
```

- [ ] **Step 2: 빌드 게이트**

Run: `cd D:/DNF_storybuilder/builder/frontend; pnpm build`
Expected: `✓ built`. (주의: 이 시점엔 훅이 미사용 — noUnusedLocals는 모듈 export엔 미적용이라 통과)

- [ ] **Step 3: Commit**

```bash
git -C D:/DNF_storybuilder add builder/frontend/src/app/review/useDiffReview.ts
git -C D:/DNF_storybuilder commit -m "feat(review): useDiffReview 리뷰 상태 훅"
```

---

### Task 3: DiffReviewPane 뷰 + 스타일

**Files:**
- Create: `builder/frontend/src/app/review/DiffReviewPane.tsx`
- Create: `builder/frontend/src/app/review/review.module.css`

- [ ] **Step 1: review.module.css 작성**

(디자인 토큰: 빨강 `--blood`, 초록 `--jade`, 본문 `--text`/`--text-dim`, 경계 `--line` — `src/styles/tokens.css`에 이미 존재. tint는 color-mix.)

```css
/* 문단 diff 리뷰 — 빨강(전)/초록(후) 카드 + 적용/취소 토글. 한 화면=한 파일. */
.pane { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.bar {
  display: flex; align-items: center; gap: 8px; padding: 8px 12px;
  border-bottom: 1px solid var(--line); flex: none;
}
.title { font-size: var(--fs-sm); color: var(--text); font-weight: 600; }
.count { font-size: var(--fs-xs); color: var(--text-dim); margin-right: auto; }
.body { flex: 1; overflow-y: auto; padding: 12px 16px; font-family: var(--font-body); }
.same { color: var(--text-dim); margin: 0 0 10px; white-space: pre-wrap; line-height: 1.7; }
.hunk {
  display: grid; grid-template-columns: 1fr auto; gap: 4px 10px;
  margin: 0 0 12px; align-items: start;
}
.del, .ins {
  grid-column: 1; padding: 6px 10px; border-radius: var(--r-sm);
  white-space: pre-wrap; line-height: 1.7; border-left: 3px solid transparent;
  opacity: 0.45; transition: opacity 0.15s;
}
.del { background: color-mix(in srgb, var(--blood) 10%, transparent); border-left-color: var(--blood); }
.ins { background: color-mix(in srgb, var(--jade) 10%, transparent); border-left-color: var(--jade); }
.del[data-active="true"], .ins[data-active="true"] { opacity: 1; }
.del span[data-t="del"] { background: color-mix(in srgb, var(--blood) 35%, transparent); border-radius: 2px; }
.ins span[data-t="ins"] { background: color-mix(in srgb, var(--jade) 30%, transparent); border-radius: 2px; }
.btns { grid-column: 2; grid-row: 1 / span 2; display: flex; flex-direction: column; gap: 4px; }
.tog {
  font-size: var(--fs-xs); padding: 3px 8px; border-radius: var(--r-sm);
  border: 1px solid var(--line); background: transparent; color: var(--text-dim); cursor: pointer;
}
.tog[data-on="true"][data-kind="ok"] { border-color: var(--jade); color: var(--jade); }
.tog[data-on="true"][data-kind="no"] { border-color: var(--blood); color: var(--blood); }
```

- [ ] **Step 2: DiffReviewPane.tsx 작성**

```tsx
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
```

- [ ] **Step 3: 빌드 게이트**

Run: `cd D:/DNF_storybuilder/builder/frontend; pnpm build`
Expected: `✓ built`

- [ ] **Step 4: Commit**

```bash
git -C D:/DNF_storybuilder add builder/frontend/src/app/review/
git -C D:/DNF_storybuilder commit -m "feat(review): DiffReviewPane 뷰 + 스타일"
```

---

### Task 4: 결선 — usePipeline·WriterShell·useChapterDraft

**Files:**
- Modify: `builder/frontend/src/app/pipeline/usePipeline.ts` (Opts 타입 + onToggle, 현재 71-83행)
- Modify: `builder/frontend/src/app/WriterShell.tsx` (훅 결선·writeCenter·부분수정 래퍼·가드)
- Modify: `builder/frontend/src/app/editor/useChapterDraft.ts` (paused 옵션)

- [ ] **Step 1: useChapterDraft에 paused 추가**

시그니처와 자동저장 effect만 변경 (리뷰 중 base 본문이 head(생성본)와 달라 자동저장이 잡음 노드를 만들기 때문):

```ts
export function useChapterDraft(opts: { chapterId: number | null; initialText: string; paused?: boolean }) {
  const { chapterId, initialText, paused } = opts;
```

자동저장 effect(현재 49-54행)를:

```ts
  // 무동작 N초 후 자동저장 (블러/생성전 즉시저장과 병행). 리뷰 중(paused)엔 정지 — 잡음 버전 방지.
  useEffect(() => {
    if (chapterId == null || paused) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(doSave, CHAPTER_AUTOSAVE_MS);
    return () => window.clearTimeout(timer.current);
  }, [text, chapterId, doSave, paused]);
```

- [ ] **Step 2: usePipeline — Opts에 enterReview 추가 + onToggle 교체**

Opts 타입(현재 12-22행)에 한 줄 추가:

```ts
  enterReview: (base: string, incoming: string, revertTo: number | null, title: string) => boolean;
```

구조분해(25행)에 `enterReview` 추가. onToggle(현재 71-83행)을 다음으로 교체:

```ts
  // ── 생성 → diff 리뷰: 결과는 서버에서 이미 새 head 버전. 에디터 교체 대신 문단 리뷰 진입. ──
  const MODE_LABEL: Record<string, string> = { draft: "초안", polish: "다듬기", expand: "완성본" };
  const onToggle = async (mode: string) => {
    if (!active || busy) return;
    setBusy(mode);
    try {
      await doSave();  // 현재 head를 먼저 저장(생성 입력)
      const cid2 = active.chapter.id;
      const revertTo = (await api.listVersions(cid2)).head;  // 저장 직후 head = 전부취소 복귀점
      const base = text;
      const r = await api.gen(cid2, mode);
      setActive({ ...active, state: r.state });
      refreshVersions();                       // 새 버전 노드 타임라인 반영
      if (!enterReview(base, r.text, revertTo, `${MODE_LABEL[mode] ?? mode} 결과 검토`)) {
        applyText(r.text);                     // 변경 없음 — 본문 동기화만
        alert("변경 없음 — 생성 결과가 현재 본문과 같습니다.");
      }
    } catch (e) { alert("생성 실패: " + (e as Error).message); }
    finally { setBusy(""); }
  };
```

(참고: `applyText`는 변경-없음 분기에서 계속 사용 — Opts에서 제거하지 말 것.)

- [ ] **Step 3: WriterShell 결선**

import 추가:

```tsx
import { useDiffReview } from "./review/useDiffReview";
import { DiffReviewPane } from "./review/DiffReviewPane";
```

훅 생성 순서 변경 — review를 draft보다 먼저(47-50행 부근을 다음으로):

```tsx
  // 본문 초안: chapterId 변화로 자동 초기화. 리뷰 중(paused)엔 자동저장 정지.
  const cid = active?.chapter.id ?? null;
  const review = useDiffReview(cid);
  const draft = useChapterDraft({ chapterId: cid, paused: review.st != null,
    initialText: active?.texts.current?.text ?? active?.texts.draft?.text ?? "" });
  const { text, saved, sel, onText, onSelectText, doSave, setSel } = draft;
```

(주의: `replaceSelection`·`insertAfterSelection` 구조분해 제거 — 아래 래퍼로 대체, noUnusedLocals 에러 방지.)

usePipeline 호출(59-60행)에 enterReview 전달:

```tsx
  const pipe = usePipeline({ active, setActive, text, doSave, applyText: draft.setText, refreshDb,
    refreshVersions: versions.reload, autoAnalyze, setAutoAnalyze, enterReview: review.enter });
```

리뷰 완료/취소 핸들러 + 부분수정 래퍼 (saveTitle 아래에 추가):

```tsx
  // ── diff 리뷰 핸들러: 병합 저장 / 전부 취소(head 복귀 또는 폐기) ──
  const [revBusy, setRevBusy] = useState(false);
  const applyMerged = async (m: string | null) => {
    if (m == null) return;
    setRevBusy(true);
    try { draft.setText(m); await draft.doSave(); versions.reload(); }  // 병합본 → head 갱신/자식 노드
    finally { setRevBusy(false); }
  };
  const cancelReview = async () => {
    const r = review.st;
    if (!r || cid == null) return;
    if (r.revertTo == null) { review.discard(); return; }   // 부분수정: 폐기 = 원문 유지
    setRevBusy(true);
    try {
      const res = await api.revertVersion(cid, r.revertTo); // head만 복귀(비파괴)
      draft.setText(res.text); versions.reload(); review.discard();
    } catch (e) { alert("되돌리기 실패: " + (e as Error).message); }
    finally { setRevBusy(false); }
  };
  // 부분수정 적용 → 즉시 교체 대신 같은 리뷰로(교체 반영한 전문을 incoming으로)
  const reviewReplace = (s: string) => {
    if (!sel) return;
    review.enter(text, text.slice(0, sel.start) + s + text.slice(sel.end), null, "부분수정 검토");
    setSel(null);
  };
  const reviewInsert = (s: string) => {
    if (!sel) return;
    review.enter(text, text.slice(0, sel.end) + "\n" + s + text.slice(sel.end), null, "부분수정 검토");
    setSel(null);
  };
```

BottomBar 결선(83-85행)에서 onReplace/onInsert 교체:

```tsx
      <BottomBar chapterId={active.chapter.id} cur={cur} text={text} busy={pipe.busy} sel={sel}
        onReplace={reviewReplace} onInsert={reviewInsert} onCloseSel={() => setSel(null)}
        onRegistered={refreshDb} onToggle={pipe.onToggle} onConfirmDraft={pipe.onConfirmDraft} />
```

writeCenter 분기(90-97행)에 리뷰 우선 삽입:

```tsx
  const writeCenter = !active
    ? <div className={w.placeholder}>좌측에서 화를 열거나 새로 만드세요.</div>
    : pipe.canon
      ? <CanonPanel canon={pipe.canon} onPromote={pipe.onPromote} onClose={pipe.closeCanon} />
      : pipe.cands
        ? <CharPanel cands={pipe.cands} cards={pipe.cards} busy={pipe.busy}
            onAssist={pipe.onAssist} onRegister={pipe.onRegister} onClose={pipe.closeCands} />
        : review.st
          ? <DiffReviewPane st={review.st} busy={revBusy} onDecide={review.decide}
              onAcceptAll={() => void applyMerged(review.finishAll())}
              onCancelAll={() => void cancelReview()}
              onFinish={() => void applyMerged(review.finish())} />
          : editor;
```

리뷰 중 우측 레일 가드(114-119행) — 구조화 도구·버전 되돌리기 차단:

```tsx
  const right = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, overflow: "auto" }}>
      <PipelineRail active={active} text={text} busy={review.st ? "review" : pipe.busy}
        onDetect={pipe.onDetect} onCanonDiff={pipe.onCanonDiff} />
      {active && <VersionTimeline versions={versions.versions} head={versions.head}
        onRevert={review.st ? async () => {} : versions.revert} />}
    </div>
  );
```

- [ ] **Step 4: 빌드 게이트**

Run: `cd D:/DNF_storybuilder/builder/frontend; pnpm build`
Expected: `✓ built` (미사용 변수·타입 에러 0)

- [ ] **Step 5: Commit**

```bash
git -C D:/DNF_storybuilder add builder/frontend/src/app/pipeline/usePipeline.ts builder/frontend/src/app/WriterShell.tsx builder/frontend/src/app/editor/useChapterDraft.ts
git -C D:/DNF_storybuilder commit -m "feat(review): 생성·부분수정을 문단 diff 리뷰로 결선"
```

---

### Task 5: 통합 검증 (백엔드 무변경 확인 + 브라우저 E2E)

**Files:** 없음 (검증만)

- [ ] **Step 1: pytest — 백엔드 무변경 확인**

Run: `cd D:/DNF_storybuilder/builder; ./.venv/Scripts/python.exe -m pytest -q`
Expected: `30 passed`

- [ ] **Step 2: 서비스 확인/기동**

- 백엔드: `http://127.0.0.1:8000/api/projects` 200 (아니면 `cd D:/DNF_storybuilder/builder; ./.venv/Scripts/python.exe -m builder.main` 백그라운드)
- LLM: llama-server `http://127.0.0.1:8080` (응답 없으면 사용자에게 보고 — 직접 기동 금지)
- 프론트: vite dev가 IPv6 ::1만 바인딩하므로 **`http://localhost:5173`** 사용(127.0.0.1 금지).
  **주의**: 코드 변경 후 HMR이 새 파일을 못 잡는 사례 있음 — 기존 `pnpm dev` 프로세스를 죽이고 재기동 후 검증.

- [ ] **Step 3: Playwright E2E 시나리오**

1. `localhost:5173` 접속 → 새 프로젝트 `__DIFFQA__` 생성 → 시즌1에 새 화 생성·열기
2. 에디터에 2문단 초안 입력(빈줄 구분), 저장 대기:
   `카인은 폐허가 된 수도원 앞에 멈춰 섰다.\n\n멀리서 낡은 종이 울렸고, 그는 검을 고쳐 쥐었다.`
3. `초안 확정 →` 클릭(DRAFT→POLISH) → `✨ 원고 다듬기` 클릭
4. **검증 A**: 에디터 자리에 리뷰 뷰 — 상단 `다듬기 결과 검토 · 변경 N곳`, 빨강/초록 카드, changed 카드에 단어 강조 span 존재 (스크린샷)
5. 첫 변경 문단 `✗ 취소` 클릭 → 빨강 활성/초록 흐림 토글 확인 → `완료`
6. **검증 B**: 에디터 복귀, 본문 = 취소한 문단은 원문 + 나머지는 생성문 병합. 우측 버전 트리에 manual(병합) 노드 추가 확인
7. 다시 `✨ 원고 다듬기` → 리뷰에서 `전체 취소`
8. **검증 C**: 에디터 본문이 6의 병합본 그대로(head 복귀), 버전 트리 head 배지가 병합 노드에
9. 본문 일부 드래그 선택 → `AI 부분수정` → 수정안 `적용(교체)` → **검증 D**: 리뷰 진입(부분수정 검토), `완료`로 반영
10. 정리: `__DIFFQA__` 프로젝트 삭제(이제 그래프행까지 cascade)

- [ ] **Step 4: 실패 시**

원인 파악 후 해당 Task로 돌아가 수정 → 빌드 → 재검증. 수정분은 해당 Task 커밋에 squash하지 말고 `fix(review): …`로 추가 커밋.

- [ ] **Step 5: 마무리**

superpowers:finishing-a-development-branch 사용 — pytest 30 + pnpm build 재확인 후 옵션 제시(관례: main ff-merge → editor 동기화 → 양쪽 push → 브랜치 삭제).

---

## Self-Review 체크

- 스펙 커버리지: 문단 분리 폴백(T1)·세그먼트/단어 토큰(T1)·리뷰 훅+화전환 폐기(T2)·UI 카드/토글/일괄(T3)·gen 3갈래+revertTo 캡처 순서(T4 S2)·부분수정 경로(T4 S3)·자동저장 정지(T4 S1)·우측 레일 가드(T4 S3)·변경없음 안내(T4 S2)·E2E(T5) — 전부 매핑
- 타입 일관성: `Segment`/`Decision`/`WordTok`(T1) ↔ `ReviewState`(T2) ↔ Pane props(T3) ↔ 결선(T4) 동일 명칭 사용
- 플레이스홀더: 없음 (모든 코드 스텝에 전체 코드 포함)
