# 타임라인 자동 진행 구현 계획 (검증·반영 단계 통합)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "정사 추출·diff"가 등장 인물별 이 화 시점 상태를 함께 뽑고, "전체 승격"이 엔티티 반영과 함께 타임라인 스냅샷을 화 순서로 기록(최신=현재)한다. 별도 버튼 없음.

**Architecture:** `timeline`에 `chapter_id` 추가, `(entity_id, chapter_id)` 멱등 upsert. `gen/statecap.py`가 화 본문+인물카드(직전 상태 포함)로 상태를 LLM 추출 → canon_diff가 diff 엔티티에 첨부 → canon.promote가 승격 시 timeline 기록. seq=`season.idx*1000000+chapter.id`, 현재=seq 최대.

**Tech Stack:** FastAPI · SQLite · React+TS · 로컬 LLM. 백엔드=pytest+TestClient(LLM monkeypatch). 프론트=`npm run build`(tsc)+브라우저.

**Spec:** `builder/docs/specs/2026-06-07-timeline-auto-advance-design.md`

**작업 디렉터리:** 경로는 `builder/` 기준. 명령은 `builder/`에서. git은 repo 루트(`git -C D:/DNF_storybuilder`)에서, 브랜치 `editor`, 푸시 금지. LF/CRLF 경고 무시. pytest는 `.venv/Scripts/python.exe -m pytest`.

---

## File Structure
신규: `src/builder/gen/statecap.py`, `tests/test_timeline.py`.
수정: `src/builder/store/schema.sql`(timeline.chapter_id), `src/builder/store/db.py`(migrate), `src/builder/store/entity.py`(upsert_timeline·latest_state), `src/builder/store/repo.py`(story_seq·chapter_label), `src/builder/canon/diff.py`(diff states·promote 타임라인), `src/builder/api/canon_routes.py`(diff 상태캡처·promote chapter_id), `frontend/src/lib/useCreator.ts`(타입), `frontend/src/app/WriterShell.tsx`(canon 패널 상태), `frontend/src/app/EntityEditor.tsx`(현재 배지), `frontend/src/app/writer.module.css`(배지).

---

## Task 1: timeline.chapter_id + entity.upsert_timeline·latest_state

**Files:** Modify `src/builder/store/schema.sql`, `src/builder/store/db.py`, `src/builder/store/entity.py` · Test `tests/test_timeline.py`

- [ ] **Step 1: 실패 테스트 작성** — `tests/test_timeline.py` 신규

```python
import sys, tempfile
from pathlib import Path
sys.path.insert(0, "src")
import builder.store.db as db


def _fresh():
    db.CREATOR_DB = Path(tempfile.mktemp(suffix=".db"))
    db.init_db()


def test_upsert_timeline_idempotent_and_latest():
    _fresh()
    from builder.store import repo, entity
    pid = repo.create_project("작품")
    sid = repo.list_seasons(pid)[0]["id"]
    cid = repo.create_chapter(sid, "1화")
    eid = f"{pid}:karin"
    # 같은 (eid, chapter) 두 번 → 1행, 갱신
    entity.upsert_timeline(eid, cid, 1001, "1화", "평온함", "")
    entity.upsert_timeline(eid, cid, 1001, "1화", "각성, 분노", "라이터를 주움")
    tl = entity.list_timeline(eid)
    assert len(tl) == 1
    assert tl[0]["state"] == "각성, 분노" and tl[0]["chapter_id"] == cid
    assert entity.latest_state(eid) == "각성, 분노"
```

- [ ] **Step 2: 실패 확인**

Run: `.venv/Scripts/python.exe -m pytest tests/test_timeline.py::test_upsert_timeline_idempotent_and_latest -q`
Expected: FAIL (`AttributeError ... upsert_timeline`)

- [ ] **Step 3: schema.sql timeline 에 chapter_id 추가**

`src/builder/store/schema.sql` 의 timeline 테이블을 아래로 교체:

```sql
CREATE TABLE IF NOT EXISTS timeline (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER, chapter_id INTEGER, entity_id TEXT NOT NULL,
  seq INTEGER DEFAULT 0, era TEXT, state TEXT, note TEXT,
  created_at TEXT, created_by TEXT
);
```

- [ ] **Step 4: db._migrate 에 ALTER 추가**

`src/builder/store/db.py` 의 `_migrate` 함수에서 `_migrate_project_scope(conn)` 호출 바로 위(projects.style_guide 블록 다음)에 추가:

```python
    tcols = [r["name"] for r in conn.execute("PRAGMA table_info(timeline)")]
    if "chapter_id" not in tcols:
        conn.execute("ALTER TABLE timeline ADD COLUMN chapter_id INTEGER")
```

- [ ] **Step 5: entity.py 에 함수 추가**

`src/builder/store/entity.py` 의 `add_timeline` 함수 정의 바로 다음에 추가(파일 상단에 `get_conn`, `_now`, `pid_of` 이미 import됨):

```python
def upsert_timeline(eid: str, chapter_id: int, seq: int, era: str, state: str,
                    note: str = "", who: str = "creator") -> int:
    """(entity_id, chapter_id) 멱등: 그 화 스냅샷 있으면 갱신, 없으면 삽입(자동 타임라인)."""
    pid = pid_of(eid)
    with get_conn() as c:
        row = c.execute("SELECT id FROM timeline WHERE entity_id=? AND chapter_id=?",
                        (eid, chapter_id)).fetchone()
        if row:
            c.execute("UPDATE timeline SET seq=?,era=?,state=?,note=?,created_at=? WHERE id=?",
                      (seq, era, state, note, _now(), row["id"]))
            return row["id"]
        return c.execute("""INSERT INTO timeline(project_id,chapter_id,entity_id,seq,era,state,note,created_at,created_by)
                            VALUES(?,?,?,?,?,?,?,?,?)""",
                         (pid, chapter_id, eid, seq, era, state, note, _now(), who)).lastrowid


def latest_state(eid: str) -> str:
    """그 엔티티의 최신(자동) 타임라인 상태 — 다음 캡처에 직전 상태로 동봉."""
    with get_conn() as c:
        r = c.execute("SELECT state FROM timeline WHERE entity_id=? AND chapter_id IS NOT NULL "
                      "ORDER BY seq DESC, id DESC LIMIT 1", (eid,)).fetchone()
        return (r["state"] or "") if r else ""
```

- [ ] **Step 6: 통과 확인**

Run: `.venv/Scripts/python.exe -m pytest tests/test_timeline.py::test_upsert_timeline_idempotent_and_latest -q`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git -C D:/DNF_storybuilder add builder/src/builder/store/schema.sql builder/src/builder/store/db.py builder/src/builder/store/entity.py builder/tests/test_timeline.py
git -C D:/DNF_storybuilder commit -m "feat(creator): timeline.chapter_id + upsert_timeline·latest_state(멱등)"
```

---

## Task 2: repo.story_seq + chapter_label

**Files:** Modify `src/builder/store/repo.py` · Test `tests/test_timeline.py`

- [ ] **Step 1: 실패 테스트 추가** — `tests/test_timeline.py` 에 추가

```python
def test_story_seq_and_label():
    _fresh()
    from builder.store import repo
    pid = repo.create_project("작품")
    sid = repo.list_seasons(pid)[0]["id"]
    c1 = repo.create_chapter(sid, "1화")
    c2 = repo.create_chapter(sid, "2화")
    assert repo.story_seq(c2) > repo.story_seq(c1)   # 생성 순서 단조
    assert repo.chapter_label(c1) == "1화"
    assert repo.chapter_label(99999).startswith("화 ")  # 없는 화 폴백
```

- [ ] **Step 2: 실패 확인**

Run: `.venv/Scripts/python.exe -m pytest tests/test_timeline.py::test_story_seq_and_label -q`
Expected: FAIL (`AttributeError ... story_seq`)

- [ ] **Step 3: 구현** — `src/builder/store/repo.py` 의 `project_of` 함수 정의 다음에 추가

```python
def story_seq(chapter_id: int) -> int:
    """스토리 순서 정수 = season.idx*1000000 + chapter.id (시즌·생성 순서 단조). 타임라인 정렬/'현재'용."""
    with get_conn() as c:
        r = c.execute("""SELECT COALESCE(s.idx,0) sidx, ch.id cid FROM chapters ch
                         LEFT JOIN seasons s ON s.id=ch.season_id WHERE ch.id=?""", (chapter_id,)).fetchone()
        return (r["sidx"] * 1000000 + r["cid"]) if r else 0


def chapter_label(chapter_id: int) -> str:
    with get_conn() as c:
        r = c.execute("SELECT title FROM chapters WHERE id=?", (chapter_id,)).fetchone()
        return (r["title"] or f"화 {chapter_id}") if r and r["title"] else f"화 {chapter_id}"
```

- [ ] **Step 4: 통과 확인**

Run: `.venv/Scripts/python.exe -m pytest tests/test_timeline.py::test_story_seq_and_label -q`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git -C D:/DNF_storybuilder add builder/src/builder/store/repo.py builder/tests/test_timeline.py
git -C D:/DNF_storybuilder commit -m "feat(creator): repo.story_seq·chapter_label(타임라인 스토리순서)"
```

---

## Task 3: gen/statecap.py — capture()

**Files:** Create `src/builder/gen/statecap.py` · Test `tests/test_timeline.py`

- [ ] **Step 1: 실패 테스트 추가** — `tests/test_timeline.py` 에 추가

```python
def test_statecap_capture(monkeypatch):
    from builder.gen import statecap
    monkeypatch.setattr(statecap.client, "chat",
                        lambda *a, **k: '```json\n[{"name":"카인","state":"각성, 분노","change":"라이터를 주움"}]\n```')
    out = statecap.capture("카인이 라이터를 주웠다.",
                           [{"name": "카인", "speech_style": "짧게", "personality": "냉정", "prev_state": "평온"}],
                           world="작품")
    assert out == [{"name": "카인", "state": "각성, 분노", "change": "라이터를 주움"}]
    assert statecap.capture("x", [], world="작품") == []  # 카드 없으면 호출 없이 []
```

- [ ] **Step 2: 실패 확인**

Run: `.venv/Scripts/python.exe -m pytest tests/test_timeline.py::test_statecap_capture -q`
Expected: FAIL (`ModuleNotFoundError ... statecap`)

- [ ] **Step 3: 구현** — `src/builder/gen/statecap.py` 신규

```python
"""화 시점 인물 상태 캡처: 화 본문+인물카드(직전 상태 포함) → [{name,state,change}]. 타임라인 자동 기록용."""

import json
import re

from builder.llm import client
from builder.llm.world import world_intro


def _parse(raw: str) -> list:
    s = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.M).strip()
    m = re.search(r"\[.*\]", s, re.S) or re.search(r"\{.*\}", s, re.S)
    if not m:
        raise ValueError("statecap: JSON 파싱 실패")
    d = json.loads(m.group(0))
    return d if isinstance(d, list) else [d]


def _cards_block(cards: list[dict]) -> str:
    return "\n".join(
        f"- {c['name']} (말투={c.get('speech_style') or '미정'}, 성격={c.get('personality') or '미정'}) "
        f"| 직전 상태: {c.get('prev_state') or '없음'}" for c in cards)


def capture(text: str, cards: list[dict], world: str = "") -> list[dict]:
    """등장 인물(cards)의 이 화 시점 상세 상태+변화. cards 비면 LLM 호출 없이 []."""
    if not cards:
        return []
    sys = (f"{world_intro(world)}\n너는 이 작품 분석가다. 화 본문과 인물 카드에만 근거하라. "
           '다른 말 없이 JSON 배열만 출력: '
           '[{"name":"인물","state":"이 화 시점 상세 상태(감정·처지·목표·관계 변화 구체적으로)","change":"직전 대비 변화"}]')
    user = (f"[인물 카드]\n{_cards_block(cards)}\n\n[이 화 본문]\n{text}\n\n"
            "지시: 위 인물 각각의 이 화 시점 상세 상태와 직전 대비 변화를 본문 근거로 적어라. 본문에 없으면 제외.")
    raw = client.chat(sys, user, temperature=0.3, max_tokens=2000)
    out = []
    for r in _parse(raw):
        nm = (r.get("name") or "").strip()
        if nm:
            out.append({"name": nm, "state": (r.get("state") or "").strip(),
                        "change": (r.get("change") or "").strip()})
    return out
```

- [ ] **Step 4: 통과 확인**

Run: `.venv/Scripts/python.exe -m pytest tests/test_timeline.py::test_statecap_capture -q`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git -C D:/DNF_storybuilder add builder/src/builder/gen/statecap.py builder/tests/test_timeline.py
git -C D:/DNF_storybuilder commit -m "feat(creator): gen.statecap — 화 시점 인물 상태 캡처"
```

---

## Task 4: canon.diff states 첨부 + promote 타임라인 기록

**Files:** Modify `src/builder/canon/diff.py` · Test `tests/test_timeline.py`

- [ ] **Step 1: 실패 테스트 추가** — `tests/test_timeline.py` 에 추가

```python
def test_promote_writes_timeline():
    _fresh()
    from builder.store import repo, entity
    from builder.canon import diff as canon
    pid = repo.create_project("작품")
    sid = repo.list_seasons(pid)[0]["id"]
    cid = repo.create_chapter(sid, "1화")
    ents = [{"name": "카인", "category": "인물", "change": "추가",
             "state": "각성, 분노", "statechange": "라이터를 주움"}]
    canon.promote(ents, [], pid, [], chapter_id=cid)
    eid = f"{pid}:{__import__('builder.store.graph', fromlist=['_slug'])._slug('카인')}"
    tl = entity.list_timeline(eid)
    assert len(tl) == 1 and tl[0]["state"] == "각성, 분노" and tl[0]["chapter_id"] == cid


def test_diff_attaches_states():
    _fresh()
    from builder.store import repo
    from builder.canon import diff as canon
    pid = repo.create_project("작품")
    extracted = {"entities": [{"name": "카인"}], "relations": [], "events": []}
    states = [{"name": "카인", "state": "분노", "change": "각성"}]
    d = canon.diff_against_graph(extracted, pid, states=states)
    assert d["entities"][0]["state"] == "분노" and d["entities"][0]["statechange"] == "각성"
```

- [ ] **Step 2: 실패 확인**

Run: `.venv/Scripts/python.exe -m pytest tests/test_timeline.py -k "promote_writes or diff_attaches" -q`
Expected: FAIL (`diff_against_graph() got unexpected keyword 'states'` / promote no chapter_id)

- [ ] **Step 3: 구현** — `src/builder/canon/diff.py` 수정

상단 import 에 추가:

```python
from builder.store import graph
from builder.store import repo, entity
from builder.schemadef import loader
```
(기존 `from builder.store import graph`·`from builder.schemadef import loader` 가 이미 있으면 `from builder.store import repo, entity` 한 줄만 추가.)

`diff_against_graph` 를 아래로 교체:

```python
def diff_against_graph(extracted: dict, project_id: int, states: list[dict] | None = None) -> dict:
    smap = {s.get("name"): s for s in (states or [])}
    known = graph.known_names(project_id)
    ents = []
    for e in extracted.get("entities", []):
        nm = (e.get("name") or "").strip()
        if not nm:
            continue
        st = smap.get(nm, {})
        ents.append({**e, "change": "변경" if nm in known else "추가",
                     "state": st.get("state", ""), "statechange": st.get("change", "")})
    rels = [{**r, "change": "추가"} for r in extracted.get("relations", [])]
    evs = [{**ev, "change": "추가"} for ev in extracted.get("events", [])]
    return {"entities": ents, "relations": rels, "events": evs}
```

`promote` 를 아래로 교체:

```python
def promote(entities: list[dict], relations: list[dict], project_id: int,
            events: list[dict] | None = None, chapter_id: int | None = None) -> dict:
    """승인 항목을 canon 승격(작품 한정). chapter_id+엔티티 state가 있으면 타임라인 스냅샷도 기록."""
    n_e = n_r = n_v = 0
    seq = repo.story_seq(chapter_id) if chapter_id else 0
    era = repo.chapter_label(chapter_id) if chapter_id else ""
    for e in entities:
        eid = graph.upsert_entity({**e, "category": loader.normalize_category(e.get("category")),
                                   "source": "canon", "status": "confirmed"}, project_id)
        st = (e.get("state") or "").strip()
        if chapter_id and st:
            entity.upsert_timeline(eid, chapter_id, seq, era, st, e.get("statechange", ""))
        n_e += 1
    for r in relations:
        if r.get("from") and r.get("to"):
            graph.add_relation(r["from"], r.get("rel", "관련"), r["to"], project_id)
            n_r += 1
    for v in (events or []):
        if v.get("title") or v.get("name"):
            graph.upsert_event({**v, "source": "canon", "status": "confirmed"}, project_id)
            n_v += 1
    return {"entities": n_e, "relations": n_r, "events": n_v}
```

- [ ] **Step 4: 통과 확인**

Run: `.venv/Scripts/python.exe -m pytest tests/test_timeline.py -k "promote_writes or diff_attaches" -q`
Expected: PASS (2 passed)

- [ ] **Step 5: 커밋**

```bash
git -C D:/DNF_storybuilder add builder/src/builder/canon/diff.py builder/tests/test_timeline.py
git -C D:/DNF_storybuilder commit -m "feat(creator): canon diff 상태 첨부 + promote 타임라인 기록"
```

---

## Task 5: canon_routes — diff 상태 캡처 + promote chapter_id

**Files:** Modify `src/builder/api/canon_routes.py` · Test `tests/test_timeline.py`

- [ ] **Step 1: 실패 테스트 추가** — `tests/test_timeline.py` 에 추가

```python
def test_api_diff_and_promote_timeline(monkeypatch):
    _fresh()
    from builder.gen import statecap
    monkeypatch.setattr(statecap.client, "chat",
                        lambda *a, **k: '[{"name":"카인","state":"분노","change":"각성"}]')
    from builder.extract import service as ex
    monkeypatch.setattr(ex, "extract_from_text",
                        lambda *a, **k: {"entities": [{"name": "카인", "category": "인물"}], "relations": [], "events": []})
    from builder.store import graph
    from builder.api.app import create_app
    from fastapi.testclient import TestClient
    c = TestClient(create_app())
    pid = c.post("/api/projects", json={"title": "작"}).json()["id"]
    sid = c.get(f"/api/seasons?project={pid}").json()[0]["id"]
    cid = c.post("/api/chapters", json={"season_id": sid, "title": "1화"}).json()["id"]
    c.put(f"/api/chapter/{cid}/text", json={"text": "카인이 라이터를 주웠다."})
    d = c.post(f"/api/canon/diff/{cid}", json={}).json()
    assert d["entities"][0]["state"] == "분노"
    c.post("/api/canon/promote", json={"chapter_id": cid, "entities": d["entities"], "relations": [], "events": []})
    eid = f"{pid}:{graph._slug('카인')}"
    assert c.get(f"/api/entity/{eid}").json()["timeline"][0]["state"] == "분노"
```

- [ ] **Step 2: 실패 확인**

Run: `.venv/Scripts/python.exe -m pytest tests/test_timeline.py::test_api_diff_and_promote_timeline -q`
Expected: FAIL (state 미첨부 또는 timeline 빈)

- [ ] **Step 3: import 추가** — `src/builder/api/canon_routes.py` 상단 import 블록에 추가

```python
from builder.store import repo, graph, entity
from builder.gen import statecap
```
(기존 `from builder.store import repo, graph` 줄을 위 한 줄로 교체. `extract_svc`, `canon` import는 그대로 둔다.)

- [ ] **Step 4: canon_diff 를 상태 캡처 포함으로 교체** — `src/builder/api/canon_routes.py`

```python
@router.post("/canon/diff/{chapter_id}")
def canon_diff(chapter_id: int):
    """(강제 초기화) 완성본에서 노드/엣지 + 등장 인물 '이 화 시점 상태' 추출 → 3색 diff. →EXTRACT."""
    ch = repo.get_chapter(chapter_id)
    if not ch:
        raise HTTPException(404, "chapter not found")
    pid = repo.project_of(chapter_id)
    world = repo.world_of(chapter_id)
    text = _final_text(ch)
    try:
        ext = extract_svc.extract_from_text(text, world=world)
    except Exception as e:
        raise HTTPException(500, f"{type(e).__name__}: {e}")
    states = []
    try:  # 상태 캡처 실패해도 diff 자체는 진행
        cards = graph.entities_in_text(pid, text)
        for cd in cards:
            cd["prev_state"] = entity.latest_state(graph._eid(pid, cd["name"]))
        states = statecap.capture(text, cards, world=world)
    except Exception:
        states = []
    d = canon.diff_against_graph(ext, pid, states=states)
    repo.set_state(chapter_id, "EXTRACT")
    return {**d, "state": repo.get_state(chapter_id)}
```

- [ ] **Step 5: canon_promote 에 chapter_id 전달** — 같은 파일

```python
@router.post("/canon/promote")
def canon_promote(body: PromoteIn):
    """승인 항목을 canon 승격 + DB 반영(작품 한정) + 타임라인 기록. DB_SYNC2→CHAPTER_SAVE."""
    res = canon.promote(body.entities, body.relations, repo.project_of(body.chapter_id),
                        body.events, chapter_id=body.chapter_id)
    repo.set_state(body.chapter_id, "CHAPTER_SAVE")
    return {**res, "state": repo.get_state(body.chapter_id)}
```

- [ ] **Step 6: 통과 확인 + 전체 회귀**

Run: `.venv/Scripts/python.exe -m pytest tests/test_timeline.py tests/test_assist.py -q`
Expected: 전부 PASS

- [ ] **Step 7: 커밋**

```bash
git -C D:/DNF_storybuilder add builder/src/builder/api/canon_routes.py builder/tests/test_timeline.py
git -C D:/DNF_storybuilder commit -m "feat(creator): canon_diff 상태 캡처 + promote chapter_id(타임라인)"
```

---

## Task 6: 프론트 — canon 패널 상태 표시 + 타임라인 현재 배지

**Files:** Modify `frontend/src/lib/useCreator.ts`, `frontend/src/app/WriterShell.tsx`, `frontend/src/app/EntityEditor.tsx`, `frontend/src/app/writer.module.css`

- [ ] **Step 1: useCreator 타입 — CanonItem·TimelineRow 확장**

`frontend/src/lib/useCreator.ts` 에서 두 타입을 아래로 교체:

```ts
export type CanonItem = { name?: string; category?: string; from?: string; rel?: string; to?: string; title?: string; description?: string; change?: string; state?: string; statechange?: string };
```
```ts
export type TimelineRow = { id: number; entity_id: string; chapter_id: number | null; seq: number; era: string; state: string; note: string };
```

- [ ] **Step 2: WriterShell canon 패널에 상태 표시**

`frontend/src/app/WriterShell.tsx` 의 canon 패널 엔티티 행(아래 줄)을

```tsx
        {canon.entities.map((e, i) => <div key={"e" + i} className={w.canonRow} data-change={e.change}><span className={w.cTag}>{e.change}</span><b>{e.name}</b><span className={w.charDesc}> {e.description}</span></div>)}
```

다음으로 교체:

```tsx
        {canon.entities.map((e, i) => <div key={"e" + i} className={w.canonRow} data-change={e.change}><span className={w.cTag}>{e.change}</span><b>{e.name}</b><span className={w.charDesc}> {e.description}</span>{e.state ? <span className={w.canonState}> · 상태: {e.state}</span> : null}</div>)}
```

- [ ] **Step 3: EntityEditor 타임라인 — 정렬 + 현재 배지 + 변화**

`frontend/src/app/EntityEditor.tsx` 의 타임라인 표시 줄(아래)을

```tsx
                  {sel.timeline.map((t) => <div key={t.id} className={w.entSubRow}>{t.era} — {t.state}</div>)}
```

다음으로 교체:

```tsx
                  {(() => {
                    const auto = sel.timeline.filter((t) => t.chapter_id != null);
                    const curId = auto.length ? auto.reduce((a, b) => (b.seq >= a.seq ? b : a)).id : -1;
                    return [...sel.timeline].sort((a, b) => a.seq - b.seq).map((t) => (
                      <div key={t.id} className={w.entSubRow}>
                        <b>{t.era}</b> — {t.state}{t.note ? <span className={w.muted}> (변화: {t.note})</span> : null}
                        {t.id === curId && <span className={w.tlNow}>현재</span>}
                      </div>
                    ));
                  })()}
```

- [ ] **Step 4: CSS — 현재 배지 + canon 상태**

`frontend/src/app/writer.module.css` 끝에 추가:

```css
.tlNow { margin-left: 6px; font: 700 9px/1 var(--font-mono); color: var(--ember-b); background: var(--ember-glow); border: 1px solid var(--ember-d); border-radius: 999px; padding: 2px 6px; }
.canonState { color: var(--arcane); font-size: var(--fs-xs); }
```

- [ ] **Step 5: 빌드 확인**

Run: `cd frontend && npm run build`
Expected: `tsc -b && vite build` 성공(✓ built), 타입 에러 0.

- [ ] **Step 6: 커밋**

```bash
git -C D:/DNF_storybuilder add builder/frontend/src/lib/useCreator.ts builder/frontend/src/app/WriterShell.tsx builder/frontend/src/app/EntityEditor.tsx builder/frontend/src/app/writer.module.css
git -C D:/DNF_storybuilder commit -m "feat(creator): canon 패널 상태 표시 + 타임라인 현재 배지·정렬"
```

---

## Task 7: 통합 검증 + 마무리

**Files:** 없음(검증)

- [ ] **Step 1: 백엔드 재기동**

```bash
# 기존 :8000 종료 후
cd builder && PYTHONPATH=src .venv/Scripts/python.exe -m builder.main
```

- [ ] **Step 2: pytest 전체**

Run: `cd builder && .venv/Scripts/python.exe -m pytest tests -q`
Expected: 전부 PASS

- [ ] **Step 3: 브라우저 시나리오**

1. 화 열기 → 본문 있는 상태에서 우측 **정사 추출·diff** 클릭.
2. canon 패널 엔티티 행에 **· 상태: …** 표시 확인.
3. **전체 승격 → canon** 클릭.
4. ◆ 엔티티 탭 → 해당 인물 열기 → 타임라인에 `@화 — 상태 (변화:…)` + **현재** 배지 확인.
5. (가능하면) 다른 화에서 반복 → 같은 인물 타임라인에 항목 누적, **현재**가 최신 화로 이동.
6. 콘솔 에러 0.

Expected: 위 모두 정상.

---

## Self-Review (작성자 점검)
- **스펙 커버리지:** §2 모델(chapter_id·seq·현재)=T1 · §3 statecap=T3, story_seq/label=T2, upsert_timeline/latest_state=T1, diff/promote=T4, 라우트=T5 · §4 프롬프트=T3 · §5 프론트=T6 · §6 에러(캡처 실패 무시)=T5 try/except · §7 검증=T1~T7. 누락 없음.
- **플레이스홀더:** 없음(모든 코드 단계에 실제 코드).
- **타입 일관성:** `state`/`statechange`가 statecap(out)·diff(첨부)·promote(읽기)·CanonItem(프론트)·canon 패널에서 일치. `chapter_id`가 timeline 스키마·upsert_timeline·TimelineRow·EntityEditor에서 일치. `upsert_timeline(eid,chapter_id,seq,era,state,note)` 시그니처가 T1 정의와 T4 호출 일치. `repo.story_seq/chapter_label` T2 정의·T4 사용 일치.
- **알려진 경계:** statecap는 등장 인물(entities_in_text)만 — 본문에 이름이 안 나오면 누락(설계대로). seq는 생성·시즌 순서 기반(화 idx 0 겹침 회피용 chapter.id 사용).
