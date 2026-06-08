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

---

## 진행 예정 (에이전트 순차)
F5(Editor+Analysis+본문모델) → F6(Pipeline+패널+레일, WriterShell≤200) → B2(/run FSM) → F7(서버 FSM 소비) → QA(품질검증) → finish.
