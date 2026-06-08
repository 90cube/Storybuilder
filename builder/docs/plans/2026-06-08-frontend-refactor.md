# 프런트 분해 + 구조 정리 리팩토링 계획 (행동 불변)

> **For agentic workers:** 이 계획은 **행동 변화 0(behavior-preserving)** 리팩토링이다. 각 태스크는
> "추출/이동 → 와이어 → 빌드·테스트 그린"으로 닫힌다. 단계는 체크박스(`- [ ]`)로 추적.

**Goal:** `WriterShell.tsx`(555줄 god-component)와 `useCreator.ts`(30+ 메서드 god-hook)를
1파일1역할(~200줄)로 분해하고, 프런트 테스트 안전망을 깔고, FSM 전이 규칙을 백엔드 단일 진실원으로
모은다. 백엔드 store도 200줄 규칙에 맞춰 분리하고 autosave 비대를 잡는다.

**Architecture:** 두 트랙 병렬. **백엔드 트랙(B)** = repo/entity 분리 + FSM 가용액션 엔드포인트 +
autosave 보존정책(레이어 내부, pytest가 게이트). **프런트 트랙(F)** = vitest 안전망 → 순수로직 추출 →
`api.ts`+Context → WriterShell 3분할(Explorer/Editor/Pipeline) → FSM 엔드포인트 소비. 트랙은
독립 레이어라 병렬 가능, 교차점은 F7↔B2(FSM 엔드포인트) 한 곳뿐.

**Tech Stack:** React 19 + Vite + TS · vitest + @testing-library/react(신규) · FastAPI + pytest(기존).

**근거(코드리뷰):** WriterShell 555줄·useCreator 30메서드·프런트 테스트 0·FSM 전이 이중화
(`WriterShell.tsx:269` ↔ `domain/pipeline.py`)·repo.py 231/entity.py 217·autosave 무한누적.

**작업 환경:** 경로는 `builder/` 기준. git은 repo 루트(`git -C D:/DNF_storybuilder`).
**전용 브랜치 `refactor/frontend-decompose`** (editor에서 분기, 푸시는 사용자 승인 시).
빌드=`cd frontend && npm run build`(tsc -b + vite). 프런트테스트=`npm run test`. 백엔드=`.venv/Scripts/python.exe -m pytest`.

---

## 의존성 그래프 (실행 순서)
```
Backend track (병렬):   B1 ─ B2 ─ B3
Frontend track:         F0 ─ F1 ─ F2 ─ F3 ─ F4 ─ F5 ─ F6 ─ F7
교차 의존:                                              F7 ⇐ B2 (FSM 엔드포인트)
```
- B1/B2/B3는 프런트와 무관 → 프런트 빌더와 **동시 진행**.
- F7만 B2 완료 후 시작(동기점). 나머지 F는 순차(같은 파일 WriterShell을 점진 분해하므로 직렬).

## File Structure (목표)
```
frontend/src/
  lib/
    api.ts            ← (신규) 순수 fetch 함수 30개 (useCreator에서 이전)
    useCreator.ts     ← (축소) projects·states 상태 + api 재노출만
    genActions.ts     ← (신규) 상태→버튼/도구 순수 함수 (테스트 대상)
    genActions.test.ts← (신규)
    pipeline.ts       ← (축소) 표시용 헬퍼만, 전이규칙은 서버로
  app/
    WriterShell.tsx   ← (축소 ~120줄) 레이아웃 조립만
    CreatorProvider.tsx ← (신규) api+currentProj Context
    explorer/ExplorerTree.tsx + useProjectTree.ts
    editor/ChapterEditor.tsx + useChapterDraft.ts + AnalysisPanel.tsx
    pipeline/usePipeline.ts + PipelineRail.tsx + ResultDiff.tsx + CharPanel.tsx + CanonPanel.tsx
src/builder/
  store/repo/ (structure.py·manuscript.py·run.py) 또는 repo.py 파사드 유지
  store/entity/ 동일
  api/structure_routes.py  ← GET /run/{id} 가용액션 확장
  api/gen_routes.py 등 영향 없음
```

---

# 백엔드 트랙 (B) — 프런트와 병렬

## B1: repo.py / entity.py 200줄 분리

**Files:** `src/builder/store/repo.py`(231)·`entity.py`(217) → 패키지화 · Test: 기존 `tests/*`

- [ ] **Step 1: 회귀 기준선** — `.venv/Scripts/python.exe -m pytest tests -q` → 11 passed 확인(스냅샷).
- [ ] **Step 2: repo 패키지화 (파사드 보존)** — `store/repo.py`를 `store/repo/__init__.py`로 옮기고
  내부를 3파일로 분리하되 **import 경로 불변**:
  - `repo/structure.py`: project·season·chapter CRUD/이동 (`create_project`…`move_chapter`)
  - `repo/manuscript.py`: `save_draft_text`·`add_manuscript`·`get_chapter`·`latest_prose`
  - `repo/run.py`: `get_state`·`set_state`·`story_seq`·`chapter_label`·`world_of`·`project_of`·`get_style`·`set_style`
  - `repo/__init__.py`: `from .structure import *` 등으로 **기존 `from builder.store import repo; repo.create_project` 100% 유지**.
- [ ] **Step 3: entity 동일 분리** — `entity/__init__.py` 파사드 + `entity/crud.py`·`entity/relations.py`·`entity/timeline.py`. 외부 호출부 불변.
- [ ] **Step 4: 검증** — `pytest tests -q` → **여전히 11 passed**(행동 불변 증명). 각 파일 200줄 이하 확인.
- [ ] **Step 5: 커밋** — `git -C D:/DNF_storybuilder add builder/src/builder/store && git -C D:/DNF_storybuilder commit -m "refactor(store): repo·entity 200줄 규칙 분리(파사드 보존)"`

## B2: FSM 가용액션 엔드포인트 (단일 진실원)

**Files:** `src/builder/api/structure_routes.py`(또는 기존 `/run` 라우트) · `src/builder/domain/pipeline.py`(읽기) · Test: `tests/test_run_actions.py`(신규)

- [ ] **Step 1: 실패 테스트** — `tests/test_run_actions.py`:
```python
import sys, tempfile; from pathlib import Path; sys.path.insert(0,"src")
import builder.store.db as db
def _fresh(): db.CREATOR_DB=Path(tempfile.mktemp(suffix=".db")); db.init_db()
def test_run_actions_shape():
    _fresh()
    from builder.api.app import create_app; from fastapi.testclient import TestClient
    c=TestClient(create_app())
    pid=c.post("/api/projects",json={"title":"a"}).json()["id"]
    sid=c.get(f"/api/seasons?project={pid}").json()[0]["id"]
    cid=c.post("/api/chapters",json={"season_id":sid,"title":"1화"}).json()["id"]
    r=c.get(f"/api/run/{cid}").json()
    assert r["state"]=="DRAFT"
    assert "canAdvanceTo" in r and "POLISH" in r["canAdvanceTo"]
    assert "states" in r  # 전체 순서(스테퍼용)
```
- [ ] **Step 2: 실패 확인** — `pytest tests/test_run_actions.py -q` → FAIL.
- [ ] **Step 3: 구현** — `GET /run/{chapter_id}` 응답을 `{state, states, canAdvanceTo, tools}`로 확장.
  `canAdvanceTo = pipeline.TRANSITIONS.get(state, [])`, `tools`=현재 상태에서 허용된 도구
  (`detect`는 state!="DRAFT", `canon` 동일 — 현 프런트 disabled 규칙을 서버로 이관).
- [ ] **Step 4: 통과 + 회귀** — `pytest tests -q` 전부 PASS.
- [ ] **Step 5: 커밋** — `refactor(api): /run 가용액션·tools 반환(FSM 단일 진실원)`

## B3: autosave 보존정책

**Files:** `src/builder/store/repo/manuscript.py` · Test: `tests/test_autosave_retention.py`(신규)

- [ ] **Step 1: 실패 테스트** — 같은 화 25회 저장 후 `autosaves` 행이 **최근 20개로 제한**됨을 assert.
- [ ] **Step 2: 구현** — `save_draft_text`에 `DELETE FROM autosaves WHERE chapter_id=? AND id NOT IN (SELECT id ... ORDER BY id DESC LIMIT 20)` 추가. 상수 `AUTOSAVE_KEEP=20`은 `const.py`.
- [ ] **Step 3: 통과 + 회귀** — `pytest tests -q` 전부 PASS.
- [ ] **Step 4: 커밋** — `fix(store): autosave 최근 20개 보존(무한누적·D1 과금 방지)`

---

# 프런트 트랙 (F)

## F0: vitest 안전망

**Files:** `frontend/package.json`·`frontend/vitest.config.ts`(신규)·`frontend/src/test/setup.ts`(신규)

- [ ] **Step 1: 설치** — `cd frontend && npm i -D vitest @testing-library/react @testing-library/jest-dom jsdom @vitest/coverage-v8`
- [ ] **Step 2: 설정** — `vitest.config.ts`(environment jsdom, setupFiles) + `package.json` scripts에 `"test":"vitest run"`,`"test:watch":"vitest"`.
- [ ] **Step 3: 스모크 테스트** — `src/lib/aspect.test.ts`로 기존 순수함수(`aspect.ts`) 1개 검증.
- [ ] **Step 4: 통과** — `npm run test` → 1 passed. `npm run build` 여전히 그린.
- [ ] **Step 5: 커밋** — `test(frontend): vitest 안전망 도입`

## F1: 순수 파이프라인 로직 추출 + 테스트

**Files:** `frontend/src/lib/genActions.ts`(신규)·`genActions.test.ts`(신규)·`app/WriterShell.tsx`(이용)

- [ ] **Step 1: 실패 테스트** — `genActions.test.ts`: `genActions("DRAFT", true)` → `[{mode:"draft",...}]`; `genActions("POLISH", true)` → 다듬기/완성본 2개 active=POLISH; `hasText=false` → enabled=false.
- [ ] **Step 2: 구현** — `WriterShell.tsx:269-274`의 genActions 로직을 순수 함수 `genActions(cur:string, hasText:boolean)`로 추출.
- [ ] **Step 3: WriterShell 치환** — import해서 사용(행동 불변).
- [ ] **Step 4: 통과** — `npm run test`(genActions 통과) + `npm run build` 그린.
- [ ] **Step 5: 커밋** — `refactor(frontend): genActions 순수함수 추출 + 테스트`

## F2: api.ts 추출 (순수 fetch) + useCreator 축소

**Files:** `frontend/src/lib/api.ts`(신규)·`useCreator.ts`(축소) · Test: `api` 시그니처 회귀는 build로

- [ ] **Step 1: api.ts 생성** — `j/post/put/del` + 30개 엔드포인트 함수를 **순수 함수**로 이전
  (예: `export const listSeasons=(pid:number)=>j<Season[]>(...)`). 타입(`Project`…`EntityFull`)도 여기로.
- [ ] **Step 2: useCreator 축소** — `projects`·`states` 상태 + `reloadProjects`만 남기고 나머지는
  `...api`로 재노출(반환 객체 **모양 100% 유지** → 소비자 무수정).
- [ ] **Step 3: 검증** — `npm run build`(tsc) 그린. (소비처 변경 0이어야 함)
- [ ] **Step 4: 커밋** — `refactor(frontend): api.ts 순수 fetch 분리, useCreator 축소`

## F3: CreatorContext (prop drilling 제거)

**Files:** `app/CreatorProvider.tsx`(신규)·`EntityEditor.tsx`·`LaneCanvas.tsx`·`PartialEditBar.tsx`·`WriterShell.tsx`

- [ ] **Step 1: Provider** — `CreatorProvider` + `useCreatorCtx()`가 `{api, currentProj}` 제공.
- [ ] **Step 2: 소비처 전환** — 3개 자식이 `api`/`projectId` prop 대신 `useCreatorCtx()` 사용.
- [ ] **Step 3: WriterShell 래핑** — 최상단을 `<CreatorProvider>`로 감싸고 prop 전달 제거.
- [ ] **Step 4: 검증** — `npm run build` 그린 + 앱 스모크(엔티티/캔버스 탭 렌더).
- [ ] **Step 5: 커밋** — `refactor(frontend): CreatorContext로 api prop drilling 제거`

## F4: WriterShell 분해 — Explorer

**Files:** `app/explorer/ExplorerTree.tsx`(신규)·`app/explorer/useProjectTree.ts`(신규)·`WriterShell.tsx`(축소)

- [ ] **Step 1: useProjectTree 추출** — 트리 상태(expProj/expSeason/seasonsByProj/chBySeason/currentProj)
  + 액션(toggle·load·add·rename·del·move = `WriterShell.tsx:53-148`)을 훅으로.
- [ ] **Step 2: ExplorerTree 추출** — `left` JSX(`WriterShell.tsx:296-377`) + RowMenu를 컴포넌트로.
- [ ] **Step 3: WriterShell 치환** — `<ExplorerTree/>`로 대체. `openChapter` 콜백만 주입.
- [ ] **Step 4: 검증** — `npm run build` + 트리 스모크(펼침·생성·이름변경·이동·삭제 동작).
- [ ] **Step 5: 커밋** — `refactor(frontend): Explorer(트리+CRUD) 분리`

## F5: WriterShell 분해 — Editor + Analysis (+ 본문모델 정리)

**Files:** `app/editor/ChapterEditor.tsx`·`useChapterDraft.ts`·`AnalysisPanel.tsx`(신규)·`WriterShell.tsx`(축소)

- [ ] **Step 1: useChapterDraft 추출** — text/textRef/saved/sel + doSave/onText/onSelectText/replaceSelection/insertAfterSelection/autosave effect(`WriterShell.tsx:150-186`).
- [ ] **Step 2: ChapterEditor + AnalysisPanel 추출** — `editor` JSX(379-429) 분리.
- [ ] **Step 3: 본문모델 정리(코드리뷰 #6)** — `openChapter`가 보여줄 본문을 "최신 manuscript(final>expand>polish>draft)"로 통일해 canon 추출 대상과 일치. (행동 변화 있는 유일 항목 → 별도 커밋·사용자 확인)
- [ ] **Step 4: 검증** — `npm run build` + 집필/자동저장/드래그 부분수정/분석·인과추가 스모크.
- [ ] **Step 5: 커밋** — `refactor(frontend): ChapterEditor·AnalysisPanel 분리` + (별도) `fix(frontend): 에디터가 최신 원고를 표시(추출 대상 일치)`

## F6: WriterShell 분해 — Pipeline (오케스트레이션 + 패널 + 레일)

**Files:** `app/pipeline/usePipeline.ts`·`PipelineRail.tsx`·`ResultDiff.tsx`·`CharPanel.tsx`·`CanonPanel.tsx`(신규)·`WriterShell.tsx`(최종 ~120줄)

- [ ] **Step 1: usePipeline 추출** — gen/accept/detect/assist/register/canonDiff/promote + busy/result/cands/cards/canon/analysis 상태(`WriterShell.tsx:189-262`).
- [ ] **Step 2: 패널 3종 추출** — `ResultDiff`(430-444)·`CharPanel`(445-469)·`CanonPanel`(470-486).
- [ ] **Step 3: PipelineRail 추출** — `right` 스테퍼+구조화 버튼(507-535).
- [ ] **Step 4: WriterShell 정리** — 레이아웃 조립만 남김(`left/center/right` 와이어 + AspectLayout). **WriterShell ≤ 200줄 확인.**
- [ ] **Step 5: 검증** — `npm run build` + 생성/채택/감지/정사추출/승격 전체 스모크.
- [ ] **Step 6: 커밋** — `refactor(frontend): Pipeline 오케스트레이션·패널·레일 분리, WriterShell 셸화`

## F7: FSM 엔드포인트 소비 (B2 의존)

**Files:** `lib/genActions.ts`·`lib/pipeline.ts`·`app/pipeline/usePipeline.ts`·`PipelineRail.tsx` · Test: `genActions.test.ts`

- [ ] **Step 1: 테스트 갱신** — genActions가 서버 `tools/canAdvanceTo`를 입력으로 받아 버튼을 산출하도록 시그니처 변경 + 테스트.
- [ ] **Step 2: 소비 전환** — `/run/{id}` 응답을 사용해 버튼/구조화 활성·스테퍼 렌더. `pipeline.ts`의 하드코딩 TRANSITIONS 제거(표시 헬퍼만 잔존).
- [ ] **Step 3: 검증** — `npm run test` + `npm run build` + 상태별 버튼 활성 스모크(서버 일치).
- [ ] **Step 4: 커밋** — `refactor(frontend): 파이프라인 버튼을 서버 FSM 응답 기반으로(이중화 제거)`

---

# 에이전트 운용 (Agent Operation)

> 규칙(CLAUDE.md): 5+파일·교차레이어 → **팀 모드(Architect+Builder+QA)**. 독립 레이어 → **항상 병렬**.
> superpowers:subagent-driven-development = **태스크당 새 서브에이전트 + 2단계 리뷰(스펙→품질)**.

### 0) Scout — 생략
코드리뷰가 이미 정찰 역할 완료(파일·줄수·경계·SQL 감사). 추가 정찰 불필요.

### 1) Architect — 1회 선행 (capable 모델)
- **산출물**: 인터페이스 계약서 1장(메모리/플랜 옆) — `api.ts` export 목록, `CreatorContext` 모양,
  훅 시그니처(`useProjectTree`/`useChapterDraft`/`usePipeline` 반환 타입), `/run/{id}` 응답 스키마.
- **이유**: 백엔드·프런트 빌더가 **계약을 보고 병렬 작업** → 드리프트 방지(특히 F7↔B2).
- 계약 확정 전 빌더 디스패치 금지.

### 2) Builder — 2트랙 병렬
| 트랙 | 태스크 | 모델 | 비고 |
|------|--------|------|------|
| **백엔드 빌더** | B1→B2→B3 | B1·B3=cheap(기계적 이동), B2=standard | 프런트와 동시. pytest 게이트 |
| **프런트 빌더** | F0→F1→…→F6 | F0·F1=cheap, F2~F6=standard(통합) | 같은 파일 점진분해라 트랙 내부 직렬 |
| (동기점) | **F7** | standard | **B2 완료 후** 디스패치 |
- 한 번에 **트랙당 1 서브에이전트만**(같은 파일 충돌 방지). 트랙끼리는 파일이 겹치지 않아 병렬 안전.
- 각 빌더는 TDD: 실패테스트 → 구현 → 그린 → 커밋(태스크 본문대로).

### 3) QA — 태스크마다 2단계 + 최종 1회
- **태스크별**: ① 스펙 준수 리뷰(계획대로·초과구현 없는지) → 통과 후 ② 코드품질 리뷰(레이어침범·명명·CANNOT·중복).
  - 자동 게이트: 백엔드=`pytest tests -q`, 프런트=`npm run test && npm run build`.
- **최종 QA 스윕**: 전체 `pytest`(11+신규) + `npm run test` + `npm run build` + 브라우저 스모크
  (집필→다듬기→확정→원고→정사추출→승격→타임라인 현재배지) + WriterShell ≤200줄·모든 파일 규칙 준수 확인.

### 4) 컨트롤러(메인=나)
- 계약 배포 → 트랙별 서브에이전트 디스패치 → 태스크 사이 리뷰 → 충돌 조정. 내 컨텍스트는 조율용으로 보존.
- 막히면(BLOCKED) 컨텍스트 보강/모델 상향/태스크 분할. 추측 금지.

### 5) 마무리
- 전 태스크·최종 QA 통과 후 **superpowers:finishing-a-development-branch** → 사용자에게 머지/PR/보류 선택 제시.
- 브랜치 `refactor/frontend-decompose` (editor 분기). 푸시는 사용자 승인 시.

---

## Self-Review
- **스펙 커버리지(코드리뷰 8findings)**: #1 WriterShell=F4~F6 · #2 useCreator=F2~F3 · #3 테스트=F0·F1·F7 · #4 FSM이중화=B2·F7 · #5 repo/entity=B1 · #6 본문모델=F5 · #7 autosave=B3 · #8 alert/prompt=범위외(별도 잡, YAGNI). 누락 없음.
- **행동 불변 보증**: F2/F3/F4/F6는 추출+와이어(검증=build+스모크). 행동 변화는 F5-Step3(본문모델)·F7(서버기반 버튼)·B3(autosave) 3곳뿐 → 각 별도 커밋·테스트.
- **병렬 안전**: 백엔드(store/api/domain) ∩ 프런트(frontend/) = ∅. 교차는 F7↔B2 계약 한 곳.
- **타입 일관성**: `api.ts` export·Context 모양·훅 반환 타입·`/run` 스키마는 Architect 계약서가 단일 출처.
