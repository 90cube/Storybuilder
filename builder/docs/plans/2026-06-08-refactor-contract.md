# 리팩토링 인터페이스 계약서 (Architect) — 단일 출처

> 백엔드·프런트 빌더는 이 계약을 **그대로** 구현한다. 시그니처/필드명 변경 금지(변경 필요 시 컨트롤러에 보고).
> 짝 계획: `2026-06-08-frontend-refactor.md`.

## 1. `/run/{chapter_id}` 응답 스키마 (B2 ⇒ F7 교차점)
```ts
// GET /api/run/{chapter_id}
type RunInfo = {
  state: string;            // 현재 FSM 상태 (예 "DRAFT")
  states: string[];         // 전체 순서 (스테퍼 렌더용) = pipeline.STATES
  canAdvanceTo: string[];   // pipeline.TRANSITIONS[state]
  tools: {                  // 우측 '구조화' 버튼 활성 규칙을 서버로 이관
    detect: boolean;        // 캐릭터 감지 가능?  (state != "DRAFT")
    canon: boolean;         // 정사 추출 가능?    (state != "DRAFT")
  };
};
```
- 기존 `GET /api/chapter/{id}/run`(states 반환)와 **별개로** `/api/run/{id}`를 신설(또는 기존 확장).
  프런트는 `/api/run/{id}` 하나로 state·states·canAdvanceTo·tools를 받는다.

## 2. `lib/api.ts` — 순수 fetch (F2)
- 기본 헬퍼 `j/post/put/del` 이전. 모든 타입(`Project, Season, Chapter, ChapterDetail, CanonItem, GraphEntity, SchemaInfo, EntityRow, RelationRow, TimelineRow, SecretRow, EntityFull, RunInfo`) 이전.
- 함수는 **현 `useCreator` 메서드명·시그니처 그대로** export (예):
```ts
export const listProjects = () => j<Project[]>("/api/projects");
export const listSeasons = (projectId: number) => j<Season[]>(`/api/seasons?project=${projectId}`);
export const getChapter = (id: number) => j<ChapterDetail>(`/api/chapter/${id}`);
export const runInfo = (id: number) => j<RunInfo>(`/api/run/${id}`);          // 신규
export const gen = (chapter_id: number, mode: string, system?: string) => post(...) as Promise<...>;
// ... canonDiff, canonPromote, detect, assist, registerEntity, analyze, stageToCausal,
//     assistEdit, assistTranslate, getStyle, setStyle, graphEntities, getSchema,
//     listEntitiesByType, getEntityDetail, saveEntity, deleteEntity, addRelationTyped,
//     deleteRelation, addTimeline, addSecret, rename/delete/move project|season|chapter, saveText, advance
```
- `useCreator()`는 **상태(`projects`,`states`)+`reloadProjects`만** 보유, 나머지는 `...api`로 재노출 →
  **반환 객체 모양 100% 유지** (소비처 무수정 보장).

## 3. `app/CreatorProvider.tsx` — Context (F3)
```ts
type CreatorCtx = ReturnType<typeof useCreator> & { currentProj: number | null; setCurrentProj: (n:number|null)=>void };
export const CreatorProvider: React.FC<{children:React.ReactNode}>;
export function useCreatorCtx(): CreatorCtx;   // EntityEditor·LaneCanvas·PartialEditBar가 api/projectId prop 대신 사용
```

## 4. 분해 훅 시그니처 (F4·F5·F6)
```ts
// explorer/useProjectTree.ts
type ProjectTree = {
  expProj:Set<number>; expSeason:Set<number>;
  seasonsByProj:Record<number,Season[]>; chBySeason:Record<number,Chapter[]>;
  toggleProject:(p:number)=>void; toggleSeason:(s:number)=>void;
  addSeason:(p:number)=>Promise<void>; addChapter:(s:number)=>Promise<void>;
  onRenameProject; onDelProject; onRenameSeason; onDelSeason;
  onRenameChapter; onDelChapter; onMoveSeason; onMoveChapter; // 현 WriterShell 시그니처 유지
};
export function useProjectTree(opts:{ onOpenChapter:(id:number)=>void; onActiveInvalidated:(pred)=>void }): ProjectTree;

// editor/useChapterDraft.ts
type ChapterDraft = {
  text:string; saved:string; sel:{start:number;end:number;text:string}|null;
  onText:(v:string)=>void; onSelectText:(e)=>void; doSave:()=>Promise<void>;
  replaceSelection:(s:string)=>void; insertAfterSelection:(s:string)=>void; setSel:(v)=>void;
};
export function useChapterDraft(opts:{ chapterId:number|null; initialText:string }): ChapterDraft;

// pipeline/usePipeline.ts
type PipelineState = {
  busy:string; result:{kind:string;text:string}|null; cands; cards; canon; analysis; stagedNote:string;
  onToggle:(mode:string)=>Promise<void>; accept:()=>Promise<void>; onDetect; onAssist; onRegister;
  onCanonDiff; onPromote; analyzeNow; onStage; onConfirmDraft;
};
export function usePipeline(opts:{ active:ChapterDetail|null; setActive; text:string; doSave; refreshDb; currentProj }): PipelineState;
```

## 5. `lib/genActions.ts` (F1 → F7에서 서버기반화)
```ts
// F1 (초기): 클라 규칙
export function genActions(cur:string, hasText:boolean): {mode:string;label:string;enabled:boolean;active:boolean}[];
// F7 (최종): 서버 RunInfo 기반
export function genActions(run:RunInfo|null, hasText:boolean): {...}[];
```
- F7에서 `pipeline.ts`의 하드코딩 `TRANSITIONS/STATE_ORDER`는 제거, 표시 헬퍼(`stateIdx`)만 잔존하거나 `run.states` 인덱스로 대체.

## 6. 백엔드 분리 (B1) — import 경로 불변
- `from builder.store import repo` / `repo.create_project(...)` 등 **모든 외부 호출부 무수정**.
  `repo`,`entity`를 패키지로 바꾸되 `__init__`에서 전량 재노출.

## 불변식 (전 태스크)
- 행동 불변. 검증 게이트: 백엔드 `pytest tests -q`(11+신규 그린), 프런트 `npm run test && npm run build`(그린).
- 1파일 1역할 ~200줄. 최종 `WriterShell.tsx ≤ 200줄`.
