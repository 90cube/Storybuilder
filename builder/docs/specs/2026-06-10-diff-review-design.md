# 문단 diff 리뷰 (빨강/초록 + 문단별 확인/취소) — 설계

2026-06-10 승인. 생성(다듬기·완성본)과 부분수정 결과를 통째로 반영하는 대신,
IDE merge 뷰처럼 수정 전(빨강)/후(초록)를 한 화면에서 보고 **문단 단위로 적용/취소**한다.

## 결정 사항 (사용자 확정)

| 항목 | 결정 |
|------|------|
| 수락/거절 단위 | **문단(빈줄 블록)**. 문단 안 변경 단어는 인라인 강조 |
| 적용 범위 | **전부** — 다듬기(polish)·완성본(expand)·부분수정(assist/edit) |
| 배치 | **에디터 자리에 인라인 교체** (리뷰 모드 ↔ 편집 모드 전환) |
| 접근법 | **A. 버전트리 합성형** — 서버는 기존대로 생성 결과를 새 head 버전으로. 리뷰·병합은 프론트. RAM 최소 |
| 제약 | **RAM 최소화** — 에디터 프레임워크 도입 금지, diff 캐시 금지, 본문은 서버 보관 |

## 아키텍처 — 백엔드 변경 0

기존 버전 히스토리(versions 트리 + head 포인터)가 토대. 신규는 프론트 3파일 + 결선 3곳.

| 파일 | 역할 | 규모 |
|------|------|------|
| `lib/paraDiff.ts` 신규 | 순수 diff 모듈(프레임워크 0). 문단 분리 → LCS → 세그먼트 + 단어 토큰, `merge` | ~150줄 |
| `app/review/useDiffReview.ts` 신규 | 리뷰 상태 훅. 진입/결정 토글/완료/전부취소. 종료 시 상태 null 해제 | ~80줄 |
| `app/review/DiffReviewPane.tsx` 신규 + `review.module.css` | 리뷰 뷰. 문단 카드(빨강 전/초록 후) + [✓ 적용]/[✗ 취소], 상단 일괄 바 | ~150줄 + ~120줄 |
| `app/pipeline/usePipeline.ts` 수정 | `onToggle`: `applyText` 대신 리뷰 진입(revert 대상 head 캡처 포함) | ~10줄 |
| `app/PartialEditBar.tsx` · `WriterShell.tsx` 수정 | 부분수정 적용 → 리뷰 진입 결선, 에디터↔리뷰 뷰 전환 | ~20줄 |
| `api.ts` | 변경 없음 (`listVersions`·`revertVersion` 기존 사용) | 0 |

의존성: `diff`(jsdiff) 1개 추가. `diffArrays`·`diffWordsWithSpace`만 임포트(트리쉐이크).

## paraDiff.ts — 순수 모듈 계약

```ts
type WordTok = { v: string; t: "same" | "del" | "ins" };
type Segment =
  | { kind: "same";    text: string }
  | { kind: "changed"; before: string; after: string; words: WordTok[] }
  | { kind: "added";   after: string }
  | { kind: "removed"; before: string };
type Decision = "accept" | "reject";   // 기본값 accept

function splitParas(text: string): string[];
function diffParas(base: string, incoming: string): Segment[];
function merge(segs: Segment[], decisions: Decision[]): string;  // decisions는 non-same 세그먼트 순서
```

- **문단 분리**: 빈줄(`\n{2,}`)이 있으면 빈줄 블록 단위. 빈줄이 없는 원고(웹소설식 한 줄=한 문단)는
  줄(`\n`) 단위로 자동 폴백. merge 시 구분자는 각각 `\n\n` / `\n`으로 정규화.
- **세그먼트화**: `diffArrays`(문단 LCS) → 인접 removed+added 쌍은 changed로 병합(쌍 초과분은 단독 세그먼트).
- **단어 토큰**: changed 쌍에만 `diffWordsWithSpace(before, after)` → 빨강 줄엔 same+del, 초록 줄엔 same+ins 렌더.
- **merge 규칙**: same→text · changed→accept?after:before · added→accept?after:"" · removed→accept?"":before.

## 흐름 — 버전 트리와의 합성

### 다듬기/완성본 (usePipeline.onToggle)
1. `doSave()` (기존) → **`revertTo = (await api.listVersions(cid)).head` 캡처** (doSave 뒤·gen 앞 — 저장이 head를 바꿀 수 있으므로)
2. `api.gen(...)` — 서버는 기존대로 결과를 새 head 버전 생성(kind=polish/expand)
3. `applyText(r.text)` 대신 **`enterReview(base=직전 본문, incoming=r.text, revertTo)`** + state/버전 갱신은 기존대로
4. 리뷰 종료 3갈래:
   - **완료(부분 수락)**: `merged = merge(...)` → `setText(merged)` + `doSave()` → 기존 `update_head_text` 경로가
     생성 버전의 자식 manual 노드 생성. 트리: `… → 다듬기(전체본) → 병합(선별)` — 전체본도 보존
   - **전부 수락**: merged == 생성본 → 저장 시 동일텍스트 no-op (기존 체크)
   - **전부 취소**: `api.revertVersion(cid, revertTo)` → `setText(base)` — head만 복귀(비파괴)

### 부분수정 (PartialEditBar)
- `적용(교체)`/`삽입` 클릭 → 즉시 반영 대신 **교체를 적용한 전문**을 incoming으로 같은 리뷰 진입
  (서버 버전 없음 → revertTo 없음 → 전부취소 = 리뷰 폐기, 본문 무변경)
- 완료 시 `setText(merged)` + `doSave()` (기존 replaceSelection과 동일한 저장 경로)

### 리뷰 모드 규칙
- 리뷰 중 에디터 편집 차단(뷰가 에디터를 대체). 파이프라인 생성 버튼도 busy 처리로 차단.
- 리뷰 중 화 전환 → 리뷰 폐기. head는 생성본이므로 버전 타임라인에서 언제든 복구 가능.

## UI 명세 (DiffReviewPane)

- 상단 바: `"{모드} 결과 검토 — 변경 N곳"` + `[전체 수락] [전체 취소] [완료]`
  (완성본처럼 대부분 새 문단인 경우 [전체 수락]이 기본 동선)
- same 문단: 일반 본문색 그대로
- changed: 빨강 카드(전, 배경 tint + del 단어 강조) 위 / 초록 카드(후, ins 단어 강조) 아래 + 우측 [✓ 적용]/[✗ 취소] 토글
- added: 초록 카드만 / removed: 빨강 카드만 — 동일 토글
- 취소된 세그먼트는 빨강 쪽 활성·초록 쪽 흐림으로 즉시 시각 반영
- 색은 기존 디자인 토큰에 diff용 변수 2~3개 추가(빨강/초록 tint)

## RAM 절약 결정

- CodeMirror 등 에디터 프레임워크 도입 없음 — textarea 유지, 리뷰 뷰는 정적 렌더
- diff는 리뷰 진입 시 1회 계산, 종료(완료·취소·화전환) 시 상태 전부 null — 캐시 없음
- 버전 본문은 서버 SQLite에만. 프론트는 리뷰 동안 base/incoming 2벌 + 세그먼트만 보유
- 문단 단위라 수만 자 화도 세그먼트 수십 개 수준 (LCS는 문단 배열 위에서만)

## 엣지 케이스

| 상황 | 동작 |
|------|------|
| 생성 결과 == 현재 본문 | 리뷰 진입 없이 "변경 없음" 안내 (버전도 동일텍스트 no-op) |
| 빈 초안에서 첫 생성 | 전부 added(초록) — 정상 동작 |
| 완성본(대부분 신규) | changed/added 다수 — [전체 수락] 동선 |
| revert 실패(네트워크 등) | alert + 리뷰 유지(재시도 가능) |
| 전부 취소 후 완료 누름 | merge 결과가 base와 사실상 동일 — manual 노드 1개 생길 수 있음(허용) |

## 검증

- 백엔드 무변경 → pytest 기존 30개 그대로 통과 확인
- `pnpm build`(tsc -b + vite) 게이트 — noUnusedLocals 포함
- Playwright 브라우저 E2E: 초안 작성 → 다듬기 → 리뷰 뷰 확인(빨강/초록·단어 강조) →
  일부 문단 취소 → 완료 → 에디터에 병합본 + 버전 트리에 병합 노드 확인 → 전부 취소 시나리오로 head 복귀 확인
- `paraDiff.ts`는 순수 모듈로 격리(향후 vitest 도입 시 단위테스트 1순위)
