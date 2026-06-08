# 작문용 인라인 Copilot 구현 계획 (선택 기반 하단 부분수정)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 초안 에디터에서 텍스트를 드래그 선택하면 하단 생성바가 "부분수정 컴포넌트"로 교체되어, 선택 영역을 문맥·세계관·문체·캐릭터 말투와 함께 다듬거나(초안) 보강+엔티티 검출(확정 후)한 뒤 후보로 교체한다.

**Architecture:** textarea 유지. 선택은 `selectionStart/End`로 캡처해 하단을 분기 렌더. 백엔드 `gen/assist.py`가 세계관+문체+캐릭터 카드+앞뒤문맥을 조립해 LLM raw-JSON으로 수정안/이어쓰기(+enrich 시 충돌)를 만들고, enrich 모드에서만 기존 `extract`+`canon.diff`로 엔티티를 병합한다. "초안 확정"은 기존 FSM advance(→POLISH) 재사용.

**Tech Stack:** FastAPI · SQLite · React19 + Vite + TS · 로컬 LLM(llama-server, OpenAI 호환). 백엔드 테스트 = pytest + fastapi TestClient(LLM은 monkeypatch). 프론트 검증 = `npm run build`(tsc) + Playwright 브라우저 확인(이 저장소엔 FE 유닛 하니스가 없으므로 빌드+브라우저가 검증 수단).

**Spec:** `builder/docs/specs/2026-06-07-inline-writing-copilot-design.md`

**작업 디렉터리:** 모든 경로는 `builder/` 기준. 명령은 `builder/`에서 실행. 백엔드 import는 `PYTHONPATH=src`.

---

## File Structure

신규:
- `src/builder/gen/assist.py` — 부분수정/번역 프롬프트 조립 + LLM 호출 + 파서.
- `frontend/src/app/PartialEditBar.tsx` — 선택 시 하단 부분수정 컴포넌트.
- `tests/test_assist.py` — assist/style/entities_in_text/API pytest.

수정:
- `src/builder/store/schema.sql` — projects.style_guide(신규 DB용).
- `src/builder/store/db.py` — `_migrate`: projects.style_guide ALTER.
- `src/builder/store/repo.py` — `get_style`/`set_style`/`latest_prose`.
- `src/builder/store/graph.py` — `entities_in_text`.
- `src/builder/api/creator.py` — `/assist/edit`, `/assist/translate`, `/projects/{pid}/style`(GET/PUT).
- `frontend/src/lib/useCreator.ts` — `assistEdit`/`assistTranslate`/`getStyle`/`setStyle`.
- `frontend/src/app/WriterShell.tsx` — 선택 캡처·하단 분기·초안 확정 버튼·genBar 재구성·rail 부분다듬기 제거·적용·readOnly.
- `frontend/src/app/writer.module.css` — 부분수정 바 스타일.

---

## Task 0: 개발 도구 셋업 (pytest)

**Files:** 없음(의존성만)

- [ ] **Step 1: pytest 설치**

Run: `.venv/Scripts/python.exe -m pip install -q pytest`
Expected: 설치 완료(이미 있으면 무변화)

- [ ] **Step 2: 빈 수집 확인**

Run: `.venv/Scripts/python.exe -m pytest tests -q`
Expected: "no tests ran" 또는 0 collected (에러 없이 종료)

---

## Task 1: projects.style_guide + repo 문체/최근산문

**Files:**
- Modify: `src/builder/store/schema.sql` (projects 테이블)
- Modify: `src/builder/store/db.py` (`_migrate`)
- Modify: `src/builder/store/repo.py` (함수 3개 추가)
- Test: `tests/test_assist.py`

- [ ] **Step 1: 실패 테스트 작성** — `tests/test_assist.py` 신규

```python
import sys, tempfile
from pathlib import Path
sys.path.insert(0, "src")

import builder.store.db as db


def _fresh_db():
    p = Path(tempfile.mktemp(suffix=".db"))
    db.CREATOR_DB = p
    db.init_db()
    return p


def test_style_roundtrip():
    _fresh_db()
    from builder.store import repo
    pid = repo.create_project("작품A")
    assert repo.get_style(pid) == ""
    repo.set_style(pid, "건조한 단문, 명사 중심")
    assert repo.get_style(pid) == "건조한 단문, 명사 중심"
```

- [ ] **Step 2: 실패 확인**

Run: `.venv/Scripts/python.exe -m pytest tests/test_assist.py::test_style_roundtrip -q`
Expected: FAIL (`AttributeError: module 'builder.store.repo' has no attribute 'get_style'`)

- [ ] **Step 3: schema.sql projects 에 컬럼 추가**

`src/builder/store/schema.sql` 의 projects 테이블을 아래로 교체:

```sql
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL,
  style_guide TEXT,
  created_at TEXT, updated_at TEXT
);
```

- [ ] **Step 4: db._migrate 에 ALTER 추가**

`src/builder/store/db.py` 의 `_migrate_project_scope(conn)` 호출 직전(같은 `_migrate` 함수 안, entities.data_json 블록 다음)에 추가:

```python
    pcols = [r["name"] for r in conn.execute("PRAGMA table_info(projects)")]
    if "style_guide" not in pcols:
        conn.execute("ALTER TABLE projects ADD COLUMN style_guide TEXT")
```

- [ ] **Step 5: repo 함수 추가**

`src/builder/store/repo.py` 끝에 추가(파일 상단에 `from builder.store.db import get_conn` 이미 있음, `_now()` 존재):

```python
def get_style(pid: int) -> str:
    """작품 문체 지침(없으면 빈 문자열)."""
    with get_conn() as c:
        r = c.execute("SELECT style_guide FROM projects WHERE id=?", (pid,)).fetchone()
        return (r["style_guide"] or "") if r and r["style_guide"] is not None else ""


def set_style(pid: int, text: str) -> None:
    with get_conn() as c:
        c.execute("UPDATE projects SET style_guide=?, updated_at=? WHERE id=?", (text, _now(), pid))


def latest_prose(pid: int, limit: int = 800) -> str:
    """작품에서 가장 최근 원고 산문 일부(문체 자동 샘플용)."""
    with get_conn() as c:
        r = c.execute("""SELECT m.text FROM manuscripts m JOIN chapters ch ON ch.id=m.chapter_id
                         WHERE ch.project_id=? AND m.text IS NOT NULL AND m.text!=''
                         ORDER BY m.id DESC LIMIT 1""", (pid,)).fetchone()
        return (r["text"][:limit] if r else "")
```

- [ ] **Step 6: 통과 확인**

Run: `.venv/Scripts/python.exe -m pytest tests/test_assist.py::test_style_roundtrip -q`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add builder/src/builder/store/schema.sql builder/src/builder/store/db.py builder/src/builder/store/repo.py builder/tests/test_assist.py
git commit -m "feat(creator): projects.style_guide + repo 문체/최근산문"
```

---

## Task 2: graph.entities_in_text (캐릭터 카드)

**Files:**
- Modify: `src/builder/store/graph.py`
- Test: `tests/test_assist.py`

- [ ] **Step 1: 실패 테스트 추가** — `tests/test_assist.py` 에 함수 추가

```python
def test_entities_in_text():
    _fresh_db()
    from builder.store import repo, entity, graph
    pid = repo.create_project("작품B")
    entity.save_entity("character", {"name": "카잔", "summary": "광폭화의 시초",
                                     "speech_style": "짧게 끊어 말한다"}, pid)
    cards = graph.entities_in_text(pid, "그때 카잔이 낮게 외쳤다.")
    assert cards and cards[0]["name"] == "카잔"
    assert "끊어" in cards[0]["speech_style"]
    assert graph.entities_in_text(pid, "아무도 없었다.") == []
```

- [ ] **Step 2: 실패 확인**

Run: `.venv/Scripts/python.exe -m pytest tests/test_assist.py::test_entities_in_text -q`
Expected: FAIL (`AttributeError ... entities_in_text`)

- [ ] **Step 3: 구현** — `src/builder/store/graph.py` 끝에 추가(파일 상단에 `import json` 존재)

```python
def entities_in_text(project_id: int, text: str, limit: int = 12) -> list[dict]:
    """본문에 이름이 등장하는 (작품) 엔티티 + 말투/성격 카드(부분수정 프롬프트 주입용)."""
    out: list[dict] = []
    with get_conn() as c:
        rows = c.execute(
            "SELECT name,category,description,data_json FROM entities WHERE project_id=? ORDER BY name",
            (project_id,)).fetchall()
    for r in rows:
        nm = r["name"]
        if nm and nm in text:
            d = json.loads(r["data_json"] or "{}")
            persona = d.get("personality_traits") or d.get("mbti") or ""
            if isinstance(persona, list):
                persona = ", ".join(persona)
            out.append({"name": nm, "category": r["category"] or "",
                        "speech_style": d.get("speech_style", ""),
                        "personality": persona,
                        "summary": r["description"] or d.get("summary", "")})
            if len(out) >= limit:
                break
    return out
```

- [ ] **Step 4: 통과 확인**

Run: `.venv/Scripts/python.exe -m pytest tests/test_assist.py::test_entities_in_text -q`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add builder/src/builder/store/graph.py builder/tests/test_assist.py
git commit -m "feat(creator): graph.entities_in_text — 본문 등장 캐릭터 카드"
```

---

## Task 3: gen/assist.py — edit() + translate()

**Files:**
- Create: `src/builder/gen/assist.py`
- Test: `tests/test_assist.py`

- [ ] **Step 1: 실패 테스트 추가** — `tests/test_assist.py` 에 추가

```python
def test_assist_edit_draft(monkeypatch):
    from builder.gen import assist
    monkeypatch.setattr(assist.client, "chat",
                        lambda *a, **k: '```json\n{"rewrites":["다듬은 문장"],"continuations":["다음 문장"]}\n```')
    r = assist.edit("원문 문장", before="앞", after="뒤", world="작품", mode="draft")
    assert r["rewrites"] == ["다듬은 문장"]
    assert r["continuations"] == ["다음 문장"]
    assert r["conflicts"] == []


def test_assist_edit_enrich_passes_cards(monkeypatch):
    from builder.gen import assist
    seen = {}
    def fake_chat(system, user, **k):
        seen["user"] = user
        return '{"rewrites":["보강"],"continuations":[],"conflicts":[{"entity":"카잔","issue":"모순","suggestion":"대안"}]}'
    monkeypatch.setattr(assist.client, "chat", fake_chat)
    r = assist.edit("카잔이 웃었다", world="작품", mode="enrich",
                    char_cards=[{"name": "카잔", "speech_style": "짧게", "personality": "냉정"}])
    assert "카잔" in seen["user"] and "짧게" in seen["user"]
    assert r["conflicts"][0]["entity"] == "카잔"
```

- [ ] **Step 2: 실패 확인**

Run: `.venv/Scripts/python.exe -m pytest tests/test_assist.py -k assist_edit -q`
Expected: FAIL (`ModuleNotFoundError: builder.gen.assist`)

- [ ] **Step 3: 구현** — `src/builder/gen/assist.py` 신규

```python
"""부분수정/번역 보조: 선택 텍스트를 문맥·문체·캐릭터 카드와 함께 다듬거나(draft) 보강(enrich)."""

import json
import re

from builder.llm import client
from builder.llm.world import world_name, world_intro


def _parse(raw: str) -> dict:
    s = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.M).strip()
    m = re.search(r"\{.*\}", s, re.S)
    if not m:
        raise ValueError("assist: JSON 파싱 실패")
    return json.loads(m.group(0))


def _char_block(cards: list[dict]) -> str:
    if not cards:
        return ""
    lines = [f"- {c['name']}: 말투={c.get('speech_style') or '미정'}, 성격={c.get('personality') or '미정'}"
             for c in cards]
    return "[등장 캐릭터 카드]\n" + "\n".join(lines) + "\n\n"


def edit(selected: str, before: str = "", after: str = "", world: str = "", style: str = "",
         char_cards: list[dict] | None = None, mode: str = "draft",
         n_rewrite: int = 3, n_continue: int = 2) -> dict:
    """mode='draft'=다듬기/이어쓰기, 'enrich'=완성본 보강+충돌. raw-JSON 파싱 결과 반환."""
    cards = char_cards or []
    w = world_name(world)
    if mode == "enrich":
        instr = (f"선택 부분을 〈{w}〉 완성본 수준으로 보강하라(묘사·세부 확장, 설정·말투 일관). "
                 f"수정안 {n_rewrite}개, 이어쓰기 {n_continue}개. 기존 설정과 모순되면 conflicts에 적어라.")
        keys = '{"rewrites":[문자열...],"continuations":[문자열...],"conflicts":[{"entity":..,"issue":..,"suggestion":..}]}'
    else:
        instr = (f"선택 부분을 문체·말투에 맞게 자연스럽게 다듬어라(사건·설정 불변). "
                 f"수정안 {n_rewrite}개, 이어쓸 문장 {n_continue}개.")
        keys = '{"rewrites":[문자열...],"continuations":[문자열...]}'
    sys = (f"{world_intro(world)}\n너는 이 작품의 집필 보조자다. 문체·캐릭터 말투·세계관·인과 일관성을 지킨다. "
           f"주어진 자료에만 근거하라. 다른 말 없이 JSON만 출력하라: {keys}")
    user = (
        (f"[문체 지침]\n{style}\n\n" if style else "")
        + _char_block(cards)
        + f"[앞 문맥]\n{before[-600:]}\n\n[선택(수정 대상)]\n{selected}\n\n[뒤 문맥]\n{after[:400]}\n\n{instr}"
    )
    raw = client.chat(sys, user, temperature=0.7 if mode == "enrich" else 0.5, max_tokens=1600)
    d = _parse(raw)
    return {"rewrites": d.get("rewrites", []) or [],
            "continuations": d.get("continuations", []) or [],
            "conflicts": d.get("conflicts", []) or []}


def translate(text: str, world: str = "") -> str:
    sys = ("주어진 텍스트의 언어를 감지해 한국어면 영어로, 그 외 언어면 한국어로 자연스럽게 번역하라. "
           "설명 없이 번역문만 출력.")
    return client.chat(sys, text, temperature=0.2, max_tokens=1200).strip()
```

- [ ] **Step 4: 통과 확인**

Run: `.venv/Scripts/python.exe -m pytest tests/test_assist.py -k assist_edit -q`
Expected: PASS (2 passed)

- [ ] **Step 5: 커밋**

```bash
git add builder/src/builder/gen/assist.py builder/tests/test_assist.py
git commit -m "feat(creator): gen.assist — 부분수정(draft/enrich)·번역"
```

---

## Task 4: API — /assist/edit · /assist/translate · /projects/{pid}/style

**Files:**
- Modify: `src/builder/api/creator.py`
- Test: `tests/test_assist.py`

- [ ] **Step 1: 실패 테스트 추가** — `tests/test_assist.py` 에 추가

```python
def _client(monkeypatch):
    _fresh_db()
    from builder.gen import assist
    monkeypatch.setattr(assist.client, "chat",
                        lambda *a, **k: '{"rewrites":["다듬음"],"continuations":["이어"],"conflicts":[]}')
    from builder.api.app import create_app
    from fastapi.testclient import TestClient
    return TestClient(create_app())


def test_api_style_and_edit(monkeypatch):
    c = _client(monkeypatch)
    pid = c.post("/api/projects", json={"title": "작품C"}).json()["id"]
    sid = c.get(f"/api/seasons?project={pid}").json()[0]["id"]
    cid = c.post("/api/chapters", json={"season_id": sid, "title": "1화"}).json()["id"]
    # 문체 저장/조회
    assert c.put(f"/api/projects/{pid}/style", json={"text": "건조체"}).status_code == 200
    assert c.get(f"/api/projects/{pid}/style").json()["text"] == "건조체"
    # 부분수정(DRAFT 상태 → mode=draft)
    r = c.post("/api/assist/edit", json={"chapter_id": cid, "selected": "원문",
                                         "before": "앞", "after": "뒤", "style_source": "field"}).json()
    assert r["mode"] == "draft"
    assert r["rewrites"] == ["다듬음"] and r["continuations"] == ["이어"]
    # 번역
    assert "text" in c.post("/api/assist/translate", json={"chapter_id": cid, "text": "안녕"}).json()
```

- [ ] **Step 2: 실패 확인**

Run: `.venv/Scripts/python.exe -m pytest tests/test_assist.py::test_api_style_and_edit -q`
Expected: FAIL (404 on /assist/edit 또는 style)

- [ ] **Step 3: import + 모델 추가** — `src/builder/api/creator.py`

상단 import 블록에서 `from builder import service as gen_svc` 다음 줄에 추가:

```python
from builder.gen import assist as assist_svc
```

`class StageIn(BaseModel):` 정의 위에 모델 추가:

```python
class AssistEditIn(BaseModel):
    chapter_id: int
    selected: str
    before: str = ""
    after: str = ""
    style_source: str = "field"  # field | auto | base


class AssistTransIn(BaseModel):
    chapter_id: int
    text: str


class StyleIn(BaseModel):
    text: str
```

- [ ] **Step 4: 라우트 추가** — `src/builder/api/creator.py` 의 `analyze_commit` 엔드포인트 함수 바로 다음에 추가

```python
def _style_for(pid: int, source: str) -> str:
    if source == "field":
        return repo.get_style(pid)
    if source == "auto":
        return repo.latest_prose(pid)
    return ""


@router.post("/assist/edit")
def assist_edit(body: AssistEditIn):
    """선택 영역 부분수정. 상태로 mode 결정(DRAFT=다듬기 / 그외=완성본 보강+엔티티)."""
    pid = repo.project_of(body.chapter_id)
    if pid is None:
        raise HTTPException(404, "chapter not found")
    world = repo.world_of(body.chapter_id)
    mode = "draft" if repo.get_state(body.chapter_id) == "DRAFT" else "enrich"
    style = _style_for(pid, body.style_source)
    cards = graph.entities_in_text(pid, f"{body.selected} {body.before} {body.after}")
    try:
        out = assist_svc.edit(body.selected, body.before, body.after, world=world,
                              style=style, char_cards=cards, mode=mode)
    except Exception as e:
        raise HTTPException(500, f"{type(e).__name__}: {e}")
    ents = {"added": [], "changed": []}
    if mode == "enrich":
        try:
            d = canon.diff_against_graph(extract_svc.extract_from_text(body.selected, world=world), pid)
            ents["added"] = [e for e in d["entities"] if e.get("change") == "추가"]
            ents["changed"] = [e for e in d["entities"] if e.get("change") == "변경"]
        except Exception:
            pass
    return {**out, "mode": mode, "entities": ents}


@router.post("/assist/translate")
def assist_translate(body: AssistTransIn):
    try:
        return {"text": assist_svc.translate(body.text, world=repo.world_of(body.chapter_id))}
    except Exception as e:
        raise HTTPException(500, f"{type(e).__name__}: {e}")


@router.get("/projects/{pid}/style")
def get_project_style(pid: int):
    return {"text": repo.get_style(pid)}


@router.put("/projects/{pid}/style")
def put_project_style(pid: int, body: StyleIn):
    repo.set_style(pid, body.text)
    return {"ok": True}
```

- [ ] **Step 5: 통과 확인**

Run: `.venv/Scripts/python.exe -m pytest tests/test_assist.py -q`
Expected: PASS (5 passed)

- [ ] **Step 6: 커밋**

```bash
git add builder/src/builder/api/creator.py builder/tests/test_assist.py
git commit -m "feat(creator): API /assist/edit·translate + 작품 문체 GET/PUT"
```

---

## Task 5: 프론트 훅 (useCreator)

**Files:**
- Modify: `frontend/src/lib/useCreator.ts`

- [ ] **Step 1: 타입 + 훅 추가**

`analyze`/`stageToCausal` 훅 정의 다음 줄에 추가:

```ts
  const assistEdit = useCallback((chapter_id: number, body: { selected: string; before: string; after: string; style_source: string }) =>
    post("/api/assist/edit", { chapter_id, ...body }) as Promise<{
      rewrites: string[]; continuations: string[];
      conflicts: { entity?: string; issue?: string; suggestion?: string }[];
      mode: string; entities: { added: CanonItem[]; changed: CanonItem[] };
    }>, []);
  const assistTranslate = useCallback((chapter_id: number, text: string) =>
    post("/api/assist/translate", { chapter_id, text }) as Promise<{ text: string }>, []);
  const getStyle = useCallback((pid: number) => j<{ text: string }>(`/api/projects/${pid}/style`), []);
  const setStyle = useCallback((pid: number, text: string) => put(`/api/projects/${pid}/style`, { text }), []);
```

- [ ] **Step 2: return 에 추가**

`return { ... , stageToCausal };` 의 마지막 항목 뒤에 추가 → `..., stageToCausal, assistEdit, assistTranslate, getStyle, setStyle };`

- [ ] **Step 3: 타입 빌드 확인**

Run: `cd frontend && npx tsc -b`
Expected: 에러 없음(종료코드 0)

- [ ] **Step 4: 커밋**

```bash
git add builder/frontend/src/lib/useCreator.ts
git commit -m "feat(creator): useCreator assistEdit/translate/style 훅"
```

---

## Task 6: PartialEditBar 컴포넌트 + 스타일

**Files:**
- Create: `frontend/src/app/PartialEditBar.tsx`
- Modify: `frontend/src/app/writer.module.css`

- [ ] **Step 1: 컴포넌트 작성** — `frontend/src/app/PartialEditBar.tsx` 신규

```tsx
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
```

- [ ] **Step 2: 스타일 추가** — `frontend/src/app/writer.module.css` 끝에 추가

```css
/* 선택 기반 부분수정 바 */
.peBar { flex: none; border-top: 1px solid var(--line); background: var(--ink-850); max-height: 42%; overflow: auto; }
.peHead { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 8px 20px; }
.peSnip { font-size: var(--fs-sm); color: var(--text-dim); font-style: italic; max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.peSrc { display: flex; align-items: center; gap: 4px; font: 600 var(--fs-xs)/1 var(--font-mono); color: var(--text-mut); }
.peSrcBtn { background: none; border: 1px solid var(--line-2); border-radius: 4px; color: var(--text-mut); cursor: pointer; font-size: var(--fs-xs); padding: 3px 7px; }
.peSrcBtn[data-on="true"] { background: var(--ember-glow); color: var(--ember-b); border-color: var(--ember-d); }
.peTools { margin-left: auto; display: flex; gap: 6px; }
.peErr { color: var(--blood, #e06a6a); font-size: var(--fs-sm); padding: 4px 20px; }
.peBody { display: flex; flex-direction: column; gap: 4px; padding: 4px 20px 12px; }
.peRow { display: flex; align-items: flex-start; gap: 8px; padding: 6px 8px; border-radius: 6px; background: var(--ink-750); }
.peKind { flex: none; font: 700 10px/1.6 var(--font-mono); color: var(--ember-b); }
.peKind[data-cont="true"] { color: var(--arcane); }
.peCand { flex: 1; font: 400 14px/1.6 var(--font-body); color: var(--text); white-space: pre-wrap; }
.peConflict { color: var(--blood, #e06a6a); font-size: var(--fs-sm); padding: 4px 8px; }
.peEnts { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; padding: 4px 8px; }
.peEnt { font-size: var(--fs-sm); color: var(--text); background: var(--ink-700); border-radius: 999px; padding: 2px 8px; }
.peReg { background: none; border: none; color: var(--jade); cursor: pointer; font-size: var(--fs-xs); margin-left: 4px; }
```

- [ ] **Step 3: 빌드 확인**

Run: `cd frontend && npx tsc -b`
Expected: 에러 없음(PartialEditBar 아직 미사용 경고 없음 — export 컴포넌트라 OK)

- [ ] **Step 4: 커밋**

```bash
git add builder/frontend/src/app/PartialEditBar.tsx builder/frontend/src/app/writer.module.css
git commit -m "feat(creator): PartialEditBar — 선택 기반 부분수정 컴포넌트"
```

---

## Task 7: WriterShell 결선 (선택·하단 분기·초안 확정·적용)

**Files:**
- Modify: `frontend/src/app/WriterShell.tsx`

- [ ] **Step 1: import 추가**

상단 import에 추가:

```tsx
import { PartialEditBar } from "./PartialEditBar";
```

- [ ] **Step 2: 선택 상태 + 적용 함수**

`const [stagedNote, setStagedNote] = useState("");` 다음 줄에 추가:

```tsx
  const [sel, setSel] = useState<{ start: number; end: number; text: string } | null>(null);
```

`onText` 정의 다음에 추가:

```tsx
  const onSelectText = (e: { currentTarget: HTMLTextAreaElement }) => {
    const t = e.currentTarget;
    if (t.selectionEnd > t.selectionStart) setSel({ start: t.selectionStart, end: t.selectionEnd, text: t.value.slice(t.selectionStart, t.selectionEnd) });
    else setSel(null);
  };
  const replaceSelection = (s: string) => {
    if (!sel) return;
    const nv = text.slice(0, sel.start) + s + text.slice(sel.end);
    setText(nv); textRef.current = nv; setSel(null); doSave();
  };
  const insertAfterSelection = (s: string) => {
    if (!sel) return;
    const nv = text.slice(0, sel.end) + "\n" + s + text.slice(sel.end);
    setText(nv); textRef.current = nv; setSel(null); doSave();
  };
  const onConfirmDraft = async () => {
    if (!active) return;
    try { await api.advance(active.chapter.id, "POLISH"); setActive({ ...active, state: "POLISH" }); }
    catch (e) { alert("초안 확정 실패: " + (e as Error).message); }
  };
```

- [ ] **Step 3: genActions 재구성**

기존 `const genActions = [ ... ];` 블록을 아래로 교체:

```tsx
  const genActions = cur === "DRAFT"
    ? [{ mode: "draft", label: "초안 재생성", enabled: !!active && !!text, active: false }]
    : [
        { mode: "polish", label: "→ 다듬기", enabled: canAdvance(cur, "POLISH"), active: cur === "POLISH" },
        { mode: "expand", label: "→ 완성본", enabled: canAdvance(cur, "EXPAND"), active: cur === "EXPAND" },
      ];
```

- [ ] **Step 4: genBar 에 "초안 확정" + 부분수정 분기**

기존 `const genBar = active && centerMode === "write" && !result && !cands && !canon && ( ... );` 전체를 아래로 교체:

```tsx
  const bottomBar = active && centerMode === "write" && !result && !cands && !canon && (
    sel
      ? <PartialEditBar api={api} chapterId={active.chapter.id} projectId={currentProj} sel={sel}
          onReplace={replaceSelection} onInsert={insertAfterSelection} onClose={() => setSel(null)} />
      : (
        <div className={w.genBar}>
          <span className={w.genLbl}>생성</span>
          {genActions.map((a) => (
            <Button key={a.mode} variant={a.active ? "primary" : "default"}
              disabled={!a.enabled || !!busy} onClick={() => onToggle(a.mode)}>
              {busy === a.mode ? <><Spinner /> 생성 중…</> : a.label}
            </Button>
          ))}
          {cur === "DRAFT" && (
            <Button variant="primary" disabled={!active || !text || !!busy} onClick={onConfirmDraft}>초안 확정 →</Button>
          )}
        </div>
      )
  );
```

- [ ] **Step 5: textarea 에 onSelect/readOnly + 본문에서 genBar→bottomBar 치환**

editor JSX 의 `<textarea ... onChange={(e) => onText(e.target.value)} ... />` 를 아래로 교체:

```tsx
      <textarea className={w.editor} value={text} onBlur={doSave} readOnly={!!sel}
        onSelect={onSelectText}
        onChange={(e) => onText(e.target.value)}
        placeholder="여기에 ~2000자 초안을 씁니다. 드래그하면 아래에서 AI 부분수정. 멈추거나(10초) 칸을 벗어나면 자동 저장돼요." />
```

그리고 editBar 다음의 `{genBar}` 를 `{bottomBar}` 로 교체.

- [ ] **Step 6: 우측 레일 "부분 다듬기" 제거 + 미사용 핸들러 정리**

right 레일 JSX 에서 아래 블록을 삭제:

```tsx
        <span className={w.lbl} style={{ marginTop: 6 }}>후공정 (강제 초기화)</span>
        <Button variant={cur === "PARTIAL_POLISH" || cur === "CTX_RESET_B" ? "primary" : "default"}
          disabled={!active || !reached(cur, "EXPAND") || reached(cur, "EXTRACT") || !!busy} onClick={onPartialPolish}>
          {busy === "pp" ? <><Spinner /> 다듬는 중…</> : "부분 다듬기"}
        </Button>
```

("정사 추출·diff" 버튼은 유지.) 그리고 미사용이 된 `onPartialPolish` 함수 정의를 삭제(tsc noUnusedLocals 대비). `api.ppPolish` 훅은 그대로 둬도 무방.

- [ ] **Step 7: 빌드 확인**

Run: `cd frontend && npm run build`
Expected: `tsc -b && vite build` 성공(✓ built). 타입 에러 0.

- [ ] **Step 8: 커밋**

```bash
git add builder/frontend/src/app/WriterShell.tsx
git commit -m "feat(creator): WriterShell — 선택 기반 부분수정 하단 분기 + 초안 확정 + rail 부분다듬기 제거"
```

---

## Task 8: 통합 검증 (브라우저) + 마무리

**Files:** 없음(검증)

- [ ] **Step 1: 백엔드 재기동**

```bash
# 기존 :8000 종료 후
cd builder && PYTHONPATH=src .venv/Scripts/python.exe -m builder.main
```

- [ ] **Step 2: pytest 전체 통과**

Run: `cd builder && .venv/Scripts/python.exe -m pytest tests/test_assist.py -q`
Expected: 5 passed

- [ ] **Step 3: 브라우저 시나리오(Playwright 또는 수동)**

1. `http://localhost:5173` → 작품·화 열기(집필 탭).
2. 본문 일부 **드래그 선택** → 하단이 **부분수정 바**로 교체되는지.
3. "AI 부분수정" → 수정안 카드 → "적용(교체)" → 선택 영역이 결과로 바뀌는지.
4. 선택 해제(빈 곳 클릭) → 하단이 **생성바**로 복귀.
5. DRAFT에서 "**초안 확정 →**" → 상태 POLISH, 하단 생성바가 [다듬기][완성본]로.
6. 확정 후 다시 드래그 → "AI 부분수정" 결과에 **새 엔티티/충돌 카드** 노출.
7. 콘솔 에러 0 확인.

Expected: 위 7개 모두 정상.

- [ ] **Step 4: 최종 커밋(있으면)**

```bash
git add -A builder && git commit -m "test(creator): 인라인 Copilot 통합 검증" || echo "nothing to commit"
git push origin editor
```

---

## Self-Review (작성자 점검 결과)

- **스펙 커버리지:** §2 하단 상태머신=Task7 · §4 컴포넌트=Task6/7 · §5 백엔드(assist/style/entities_in_text/migrate)=Task1~4 · §6 프롬프트=Task3 · §7 엔티티/충돌=Task4(enrich)+Task6(카드) · §8 적용=Task7 · §9 에러=각 try/except · §10 검증=Task4·8. 누락 없음.
- **플레이스홀더:** 없음(모든 코드 단계에 실제 코드).
- **타입 일관성:** `assistEdit` 반환(rewrites/continuations/conflicts/mode/entities)이 Task5(훅)·Task6(Result)·Task4(응답)에서 동일. `sel{start,end,text}`가 Task6/7 일치. `entities_in_text` 카드 키(name/speech_style/personality)가 Task2·3 일치.
- **알려진 경계:** (1) before/after 문맥을 현재 프론트는 빈 문자열로 전송(선택 인접 문맥 슬라이스는 후속 개선; 백엔드는 받도록 이미 설계). (2) whole-doc 후공정 polish(FSM CTX_RESET_B)는 UI 트리거 제거됨 — 선택 기반 편집이 대체. (3) 정확한 캐럿 rect 측정(미러 div)은 미포함(하단 바 방식이라 불필요).
