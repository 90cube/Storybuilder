# 버전 히스토리(분기·롤백) + 본문 head 모델 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development 또는 executing-plans. 단계는 체크박스(`- [ ]`).

**Goal:** 화 본문을 **버전 트리**로 관리한다 — 생성/부분수정 등 "버튼 누를 때마다" 버전 노드가 쌓이고, 언제든 이전 노드로 **되돌리기(비파괴)** 하거나 거기서 **분기**할 수 있다. 에디터는 항상 **현재 head(최신본)** 를 표시한다(보류했던 본문모델 #6 / FG-4 근본 해결).

**Architecture:** 신규 `versions` 테이블(`parent_id`로 트리) + `pipeline_runs.head_version_id` 포인터. `store/version.py`가 노드 생성·조회·head 이동. `get_chapter`는 head 본문을 반환, 생성/부분수정/채택이 새 노드를 만든다. 프런트에 **버전 타임라인 패널**(MVP 선형 리스트 + 되돌리기/여기서 다시).

**Tech Stack:** FastAPI·SQLite·React+TS·pytest(LLM monkeypatch)·pnpm.

**Spec:** `builder/docs/specs/2026-06-09-pipeline-redesign-design.md` (§3 버전 히스토리, §7 결정).

**작업 환경:** 경로 `builder/` 기준. git `git -C D:/DNF_storybuilder`, 전용 브랜치 `feat/version-history`(main 분기). 백엔드 `.venv/Scripts/python.exe -m pytest`, 프런트 `pnpm build`(npm 금지).

---

## 🔴 검토 결정 (착수 전 사용자 확인)
1. **head 이동 시점**: 생성(다듬기/완성본) 결과를 (A) **즉시 새 head로** 만들고 결과패널은 비교용·맘에 안 들면 "되돌리기" / (B) 기존처럼 결과패널에서 **채택해야 head**. → 본 계획 기본값 **(A)**(분기·롤백 모델에 자연스러움). (B) 원하면 T2 조정.
2. **manuscripts/autosaves 관계**: versions가 본문 단일 출처. (A) **manuscripts(kind)·autosaves를 versions로 흡수**(레거시 정리) / (B) versions 신설하고 manuscripts는 정사 추출 입력용으로 잔존. → 기본값 **(B) 점진**(리스크↓): versions가 에디터 본문 권위, manuscripts는 당분간 호환 유지, autosave는 head in-place 갱신.
3. **자동저장 입력 정책**: 타이핑 자동저장은 노드 폭증 막기 위해 **head가 draft/manual kind일 때 in-place 갱신**(노드 생성 X). 생성/부분수정/명시저장만 새 노드. → 기본값 채택.
4. **UX**: MVP **선형 리스트 + 되돌리기/여기서다시**(트리 시각화는 2차). → 기본값 채택.

---

## File Structure
신규: `src/builder/store/version.py`, `src/builder/api/version_routes.py`, `tests/test_version.py`,
`frontend/src/app/version/VersionTimeline.tsx`, `frontend/src/app/version/useVersions.ts`.
수정: `store/schema.sql`·`store/db.py`(versions 테이블+head 컬럼 마이그레이션), `store/repo.py`(create_chapter 초기버전·get_chapter head·save_draft head 갱신), `api/gen_routes.py`(gen/accept/partial→버전 노드), `api/structure_routes.py`(chapter detail에 versions·head 포함), `frontend/src/lib/api.ts`·`useCreator.ts`(타입·fetch), `frontend/src/app/editor/*`(head 표시), `frontend/src/app/pipeline/usePipeline.ts`(생성/채택이 버전 반영).

---

## Task 1: versions 테이블 + store/version.py
**Files:** `store/schema.sql`·`store/db.py`·`store/version.py`(신규) · Test `tests/test_version.py`

- [ ] **Step 1: 실패 테스트** `tests/test_version.py`:
```python
import sys, tempfile
from pathlib import Path
sys.path.insert(0, "src")
import builder.store.db as db


def _fresh():
    db.CREATOR_DB = Path(tempfile.mktemp(suffix=".db")); db.init_db()


def test_version_create_head_revert_branch():
    _fresh()
    from builder.store import repo, version
    pid = repo.create_project("작")
    sid = repo.list_seasons(pid)[0]["id"]
    cid = repo.create_chapter(sid, "1화")
    v1 = version.create(cid, "초안", kind="draft")          # head=v1
    v2 = version.create(cid, "다듬기본", kind="polish")      # parent=v1, head=v2
    assert version.head_text(cid) == "다듬기본"
    version.set_head(cid, v1)                                # 되돌리기(비파괴)
    assert version.head_text(cid) == "초안"
    v3 = version.create(cid, "분기본", kind="polish")        # parent=v1(현 head) → 분기
    rows = version.list(cid)
    assert len(rows) == 3
    assert {r["id"]: r["parent_id"] for r in rows}[v3] == v1
```
- [ ] **Step 2: 실패 확인** `pytest tests/test_version.py -q` → FAIL(모듈 없음).
- [ ] **Step 3: schema.sql** — versions 테이블 추가:
```sql
CREATE TABLE IF NOT EXISTS versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, chapter_id INTEGER NOT NULL, parent_id INTEGER,
  kind TEXT, text TEXT NOT NULL, label TEXT, created_at TEXT, created_by TEXT
);
```
- [ ] **Step 4: db._migrate** — `pipeline_runs`에 head 컬럼(ALTER 먼저, 인덱스는 그 다음):
```python
    rcols = [r["name"] for r in conn.execute("PRAGMA table_info(pipeline_runs)")]
    if "head_version_id" not in rcols:
        conn.execute("ALTER TABLE pipeline_runs ADD COLUMN head_version_id INTEGER")
    conn.execute("CREATE INDEX IF NOT EXISTS ix_versions_chapter ON versions(chapter_id, id)")
```
- [ ] **Step 5: store/version.py** 신규:
```python
"""화 본문 버전 트리: 생성(분기)·조회·head 이동(되돌리기). 비파괴."""
from builder.store.db import get_conn
from builder.store.graph import _now


def head_id(chapter_id: int) -> int | None:
    with get_conn() as c:
        r = c.execute("SELECT head_version_id FROM pipeline_runs WHERE chapter_id=?", (chapter_id,)).fetchone()
        return r["head_version_id"] if r and r["head_version_id"] is not None else None


def create(chapter_id: int, text: str, kind: str = "manual", parent_id: int | None = None,
           label: str = "", who: str = "creator") -> int:
    """새 버전 노드 생성 후 head로 지정. parent 미지정 시 현재 head에서 분기."""
    if parent_id is None:
        parent_id = head_id(chapter_id)
    with get_conn() as c:
        vid = c.execute("""INSERT INTO versions(chapter_id,parent_id,kind,text,label,created_at,created_by)
                           VALUES(?,?,?,?,?,?,?)""",
                        (chapter_id, parent_id, kind, text, label, _now(), who)).lastrowid
        c.execute("UPDATE pipeline_runs SET head_version_id=? WHERE chapter_id=?", (vid, chapter_id))
        return vid


def set_head(chapter_id: int, version_id: int) -> None:
    """되돌리기/분기 선택 — head만 이동(노드 삭제 없음)."""
    with get_conn() as c:
        c.execute("UPDATE pipeline_runs SET head_version_id=? WHERE chapter_id=?", (version_id, chapter_id))


def update_head_text(chapter_id: int, text: str) -> None:
    """자동저장: head가 draft/manual이면 노드 폭증 막게 in-place 갱신, 아니면 manual 새 노드."""
    hid = head_id(chapter_id)
    with get_conn() as c:
        row = c.execute("SELECT kind FROM versions WHERE id=?", (hid,)).fetchone() if hid else None
        if row and row["kind"] in ("draft", "manual"):
            c.execute("UPDATE versions SET text=?, created_at=? WHERE id=?", (text, _now(), hid))
            return
    create(chapter_id, text, kind="manual")


def get(version_id: int) -> dict | None:
    with get_conn() as c:
        r = c.execute("SELECT * FROM versions WHERE id=?", (version_id,)).fetchone()
        return dict(r) if r else None


def head_text(chapter_id: int) -> str:
    v = get(head_id(chapter_id)) if head_id(chapter_id) else None
    return v["text"] if v else ""


def list(chapter_id: int) -> list[dict]:
    with get_conn() as c:
        return [dict(r) for r in c.execute(
            "SELECT id,parent_id,kind,label,created_at FROM versions WHERE chapter_id=? ORDER BY id", (chapter_id,))]
```
- [ ] **Step 6: 통과 확인** `pytest tests/test_version.py -q` → PASS.
- [ ] **Step 7: 커밋** `feat(version): versions 테이블 + store(create·set_head·head_text 비파괴 트리)`

## Task 2: create_chapter 초기 버전 + get_chapter head 본문 + 자동저장 head 갱신
**Files:** `store/repo.py` · Test `tests/test_version.py`(추가)

- [ ] **Step 1: 실패 테스트** — `repo.create_chapter` 후 `version.head_text` == "" (초기 빈 draft 버전 존재), `repo.save_draft_text(cid,"새본문")` 후 `version.head_text(cid)=="새본문"`(in-place), `repo.get_chapter(cid)["texts"]["current"]["text"]=="새본문"`.
- [ ] **Step 2: 구현** — `create_chapter`에서 초기 빈 draft 버전 생성(`version.create(cid,"",kind="draft")`). `save_draft_text`는 `version.update_head_text(cid,text)` 호출(+기존 autosave 스냅샷 유지 가능). `get_chapter`의 texts에 `"current": {"text": version.head_text(cid)}` 추가(에디터가 읽을 본문). *주의: 순환 import 방지 — repo에서 version 지연 import.*
- [ ] **Step 3: 통과 + 회귀** `pytest tests -q` 전부 PASS.
- [ ] **Step 4: 커밋** `feat(version): 화 생성 시 초기 버전 + 자동저장 head 갱신 + get_chapter current 본문`

## Task 3: gen/부분수정/채택이 버전 노드 생성 + API
**Files:** `api/gen_routes.py`·`api/version_routes.py`(신규)·`api/creator.py`(라우터 등록) · Test `tests/test_version.py`

- [ ] **Step 1: 실패 테스트(API)** — gen 호출 시 새 버전(kind=mode) 생성·head 이동; `GET /api/chapter/{id}/versions` 길이 증가; `POST /api/version/revert {chapter_id, version_id}` 후 head 본문이 그 버전으로.
- [ ] **Step 2: gen_routes** — `gen`의 입력 `src=_latest_text` 대신 `version.head_text(cid)`; 결과를 `version.create(cid, out, kind=body.mode)`(결정1=A: 즉시 head). `accept`(usePipeline)는 결정1=A면 불필요(이미 head) — 결정 B면 accept가 set_head. 부분수정(assist_edit) 적용도 `version.create(cid, 새본문, kind="partial")`.
- [ ] **Step 3: version_routes** 신규:
```python
@router.get("/chapter/{chapter_id}/versions")
def versions(chapter_id: int): return version.list(chapter_id)

@router.post("/version/revert")
def revert(body: RevertIn):  # {chapter_id, version_id}
    version.set_head(body.chapter_id, body.version_id)
    return {"head": version.head_id(body.chapter_id), "text": version.head_text(body.chapter_id)}
```
- [ ] **Step 4: 통과 + 회귀** `pytest tests -q` 전부 PASS.
- [ ] **Step 5: 커밋** `feat(version): gen·부분수정이 버전 노드 생성 + /versions·/version/revert 라우트`

## Task 4: 프런트 — 버전 타임라인 패널 + 에디터 head 표시
**Files:** `frontend/src/lib/api.ts`·`useCreator.ts`(타입·fetch), `app/version/VersionTimeline.tsx`·`useVersions.ts`(신규), `app/editor/useChapterDraft.ts`(initialText=current), `app/pipeline/usePipeline.ts`(생성 후 버전 새로고침)

- [ ] **Step 1: 타입/fetch** — `VersionRow = {id; parent_id:number|null; kind:string; label:string; created_at:string}`; `listVersions(cid)`, `revertVersion(cid, vid)`.
- [ ] **Step 2: useVersions 훅** — `{versions, head, reload, revert, branchFrom}`.
- [ ] **Step 3: VersionTimeline.tsx** — 최근순 선형 리스트(아이콘=kind, 라벨·시각), 항목 클릭 "되돌리기"(revert→에디터 본문 갱신), "여기서 다시"(branchFrom). 같은 parent 형제는 들여쓰기/색으로 분기 표시.
- [ ] **Step 4: 에디터 head 표시** — `useChapterDraft` initialText를 `active.texts.current.text`(head)로. 생성/되돌리기 후 본문·버전목록 새로고침.
- [ ] **Step 5: 검증** `pnpm build` 그린 + 브라우저: 생성→버전 추가→되돌리기→본문 복귀.
- [ ] **Step 6: 커밋** `feat(version): 버전 타임라인 패널 + 에디터 head 표시(본문모델 통일)`

## Task 5: 통합 검증 + 마무리
- [ ] pytest 전체 + pnpm build 그린.
- [ ] 브라우저 E2E: 초안→다듬기(버전+)→완성본(버전+)→되돌리기→분기→정사추출(head 대상)→승격. 콘솔 0.
- [ ] superpowers:finishing-a-development-branch.

---

## Self-Review
- **스펙 커버리지**: §3 데이터모델=T1, head 본문=T2, 노드생성/revert=T3, UX 패널=T4, 통합=T5. FG-4/#6(에디터 head)=T2·T4.
- **행동 변화**: 생성이 채택 없이 즉시 head(결정1=A) — 결정 확정 필요. autosave in-place(결정3)로 노드 폭증 방지.
- **타입 일관성**: `version.create/set_head/head_text/list` 시그니처가 T1 정의·T2/T3 호출 일치. `texts.current`가 get_chapter·useChapterDraft·VersionTimeline에서 일치.
- **리스크**: manuscripts/versions 이원화(결정2=B) — 정사 추출은 head_text 사용하도록 canon_diff도 확인(현재 _final_text → head_text로 정렬 필요, T3에 포함). 순환 import(repo↔version)는 지연 import.
