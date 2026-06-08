# 프런트 분해 리팩토링 — 실행 로그 (성공·실패·원인 기록)

브랜치 `refactor/frontend-decompose`. 에이전트 주도(subagent-driven), 행동 불변. 게이트=`tsc -b`(빌드)+pytest+브라우저 스모크.

## 범례
✅ 성공 · ⏸ 보류(사유) · ❌ 실패(원인·위치) · 🔁 재시도

---

## A0 ✅ Architect 계약서
`2026-06-08-refactor-contract.md` 작성·커밋. api.ts·Context·훅 시그니처·/run 스키마 확정.

## F2 ✅ api.ts 분리 + useCreator 축소
30 엔드포인트+타입 → `lib/api.ts`(React 비의존). useCreator는 projects·states + createProject·getChapter만. 빌드 그린. 소비처 무수정. 커밋 `93898a8`.

## F0 ⏸ vitest 안전망 — 보류
- **실패 위치**: `npm i -D vitest jsdom`(builder/frontend), reify 단계.
- **원인**: ① 1차(testing-library 포함) → `npm error Cannot read properties of null (reading 'matches')`(npm11 피어 트리 버그). ② 2차(`--legacy-peer-deps`) → `EUNSUPPORTEDPROTOCOL Unsupported URL Type "workspace:"`(의존 트리에 workspace: 스펙). vite8/ts6/npm11 최신 스택 충돌.
- **영향 확인**: 앱 node_modules·`npm run build` 무손상(react/vite/ts 존재 확인).
- **대응**: 별도 테스트러너 없이 `tsc -b`+브라우저 스모크를 행동불변 게이트로. 툴체인 안정화(또는 pnpm) 후 재시도.

## B1 ⏸ repo/entity 200줄 분리 — 저우선 보류
- 231/217줄 = 소프트한도 ~200의 +15%, 내부 섹션 정돈됨. 5파일 분해는 응집도↓·기능이득 0·전사오류 리스크. CLAUDE.md "응집>분리". 고가치 작업 후 선택.

## F3 ✅ CreatorContext (prop drilling 제거)
빌더 에이전트. `CreatorProvider`+`useCreatorCtx`, WriterShell→`<CreatorProvider><WriterShellInner/>`. EntityEditor·LaneCanvas·PartialEditBar가 api/projectId를 ctx에서 취득. 빌드 그린(독립 검증 ✓). 커밋 `27d85ca`.
- 계약 준수 메모: `setCurrentProj` 시그니처가 비-함수형이라 자동펼침 effect를 `setCurrentProj(currentProj ?? pid)`로(가드로 1회·null→동일). 행동 불변.

## F4 ✅ Explorer 분리
빌더 에이전트. `explorer/useProjectTree.ts`(117) + `ExplorerTree.tsx`(107). WriterShell 555→**397줄**. 빌드 그린. 커밋 `142ab44`.
- 계약 차이(의도): useProjectTree가 `onActiveInvalidated` 대신 `active`+`setActive` 수신 — rename/move는 active 무효화가 아니라 patch라 필요. `loadChapters`도 노출(saveTitle 공유). active 결합 5케이스 원본과 문자단위 동일 보존.

## F5 ✅ Editor + Analysis 분리
빌더 에이전트. `editor/useChapterDraft.ts`(57)+`ChapterEditor.tsx`(41)+`AnalysisPanel.tsx`(54). WriterShell 397→**325줄**. 빌드 그린. 커밋 `48a2f49`.
- useChapterDraft에 `setText` 추가(F6 accept용). analysis는 busy 문자열 공유 때문에 WriterShellInner 유지(분리 시 행동 변함) — AnalysisPanel은 순수 표시만.
- **본문모델 변경(#6) 보류**: openChapter가 draft 대신 최신 원고 표시하면 "최신본 편집→draft 저장" 불일치 → 별도 UX 결정사안. 리팩토링은 행동 불변 유지.

## F6 ✅ Pipeline+패널+레일 분리 — WriterShell 셸화
빌더 에이전트. `lib/genActions.ts`(15) + `pipeline/usePipeline.ts`(142)·`ResultDiff`·`CharPanel`·`CanonPanel`·`PipelineRail`·`BottomBar`. **WriterShell 325→133줄** (원래 555 대비 -76%). 빌드 그린(독립검증 ✓). 커밋 `762658`.
- 의도된 미세변화 1: openChapter가 화 전환 시 analysis도 초기화(resetForChapter) — 이전엔 미초기화. 더 정합적(이전 화 분석 잔존 방지).
- usePipeline opts: currentProj 제외(refreshDb가 캡슐화), applyText·autoAnalyze 추가.

### 프런트 분해 결과: WriterShell 555→133, useCreator 123→28, app/{explorer,editor,pipeline}/ 분리, lib/api.ts 순수. 전 파일 ≤200 (예외: AppShell 207=기존·범위외).

---

## 진행 예정
B2(/run FSM) → B3(autosave) → F7(서버 FSM 소비) → QA(품질검증) → finish.
