# 타임라인 자동 진행 — 설계 (풀 자동, "타임라인 갱신" 버튼)

> 작성 2026-06-07 · 상태: 승인됨 · 범위: Creator(builder/) 기능 추가

## 0. 목표

이야기(화)가 진행될 때마다 각 인물의 **"이 화 시점 상태"** 를 LLM이 추출해 엔티티별
타임라인에 **스토리 순서로 누적**한다. 최신 화 스냅샷에 **"현재" 배지**. 상태/사건에 따른
변화를 개별 엔티티에 **상세히** 기록한다. 현재 타임라인은 수동 메모(자유 era)뿐이라
이야기 진행과 무관 — 이를 화 기반 자동 진행으로 확장한다.

## 1. 범위

포함:
- 우측 레일 **구조화** 그룹에 **"타임라인 갱신"** 버튼(현재 화 기준, 사람 클릭).
- 현재 화 본문에 **등장한 엔티티만** 대상으로, 직전 상태를 동봉해 LLM이 `[{name, state, change}]` 생성.
- 엔티티별 타임라인에 `(entity_id, chapter_id)` 멱등 upsert. 상세 상태(`state`) + 이번 화 변화(`note`).
- 타임라인을 스토리 순서로 정렬, 최신에 "현재" 배지.

제외 (후속):
- 자동 트리거(확정/추출에 묶기) — 이번엔 전용 버튼만.
- 작품 전체 인물 일괄 캡처 / 사용자 선택 캡처.
- 사건(events)·관계의 시점 변화 추적(인물 상태 타임라인에 한정).

## 2. 데이터 모델

`timeline` 테이블에 **`chapter_id INTEGER`** 추가(구 DB는 _migrate ALTER).
- **자동 항목**: `chapter_id` 채움. 키 `(entity_id, chapter_id)` → 재갱신 시 그 화 스냅샷만 덮어씀(멱등).
- `seq` = **스토리 순서 인덱스** = `season.idx * 1000000 + chapter.id`(생성·시즌 순서 기준 단조 증가). 정렬·"현재" 판정.
- `era` = 화 라벨(예: `"3화 - 제목"` 또는 `(chapter_id)`), `state` = 그 시점 **상세 상태**(감정·처지·목표·관계 변화 등), `note` = **이번 화에서 달라진 점**.
- **수동 항목**(기존): `chapter_id` NULL, era 자유 텍스트, seq = 입력 순서. 그대로 공존.
- **"현재"** = 그 엔티티의 자동 항목 중 `seq` 최대.

## 3. 백엔드 (1파일1역할)

- `gen/statecap.py`(신규)
  - `capture(chapter_text, cards, world) -> list[dict]`: cards = `[{name, speech_style, personality, summary, prev_state}]`.
    LLM raw-JSON `[{"name":.., "state":"상세 상태", "change":"변화"}]`. 견고 파서(코드펜스 제거 + 첫 `[..]`/`{..}`), 실패 시 예외.
- `store/repo.py` — `story_seq(chapter_id) -> int`(season.idx·chapter.id로 산출), `chapter_label(chapter_id) -> str`.
- `store/entity.py` — `upsert_timeline(eid, chapter_id, seq, era, state, note)`: `(entity_id, chapter_id)` 있으면 UPDATE, 없으면 INSERT. `latest_state(eid) -> str`(직전 상태=최대 seq의 state). 기존 `add_timeline`(수동) 유지. `list_timeline`은 seq,id 정렬 유지.
- `store/db.py` — `_migrate`: `timeline.chapter_id` 없으면 ALTER ADD.
- `api/graph_routes.py` (timeline 라우트가 이미 여기 있음) — `POST /api/timeline/refresh/{chapter_id}`:
  1. `pid = repo.project_of(chapter_id)`, `world = repo.world_of`, 화 본문(draft 또는 최신 텍스트).
  2. `cards = graph.entities_in_text(pid, text)` + 각 카드에 `prev_state = entity.latest_state(eid)` 동봉.
  3. `rows = statecap.capture(text, cards, world)`.
  4. 각 row의 name → eid(`graph._eid(pid, name)`), `upsert_timeline(eid, chapter_id, repo.story_seq(chapter_id), repo.chapter_label(chapter_id), row.state, row.change)`.
  5. `{updated: N}` 반환. (등장 엔티티 없거나 결과 없으면 updated=0)

## 4. 프롬프트 (statecap.capture)

```
system: 〈world〉 작품 분석가. 주어진 화 본문과 인물 카드에만 근거(외부지식 금지).
        다른 말 없이 JSON 배열만 출력:
        [{"name":"인물명","state":"이 화 시점의 상세 상태(감정·처지·목표·관계 변화 등 구체적으로)","change":"직전 대비 이번 화에서 달라진 점"}]
user:
  [인물 카드]
   - {name} (말투={speech_style}, 성격={personality}) | 직전 상태: {prev_state or "없음"}
  [이 화 본문]
  {chapter_text}
  지시: 위 인물 각각에 대해 이 화 시점의 상세 상태와 직전 대비 변화를 본문 근거로 적어라.
        본문에 등장/언급되지 않은 인물은 제외.
```

## 5. 프론트엔드

- `lib/useCreator.ts` — `refreshTimeline(chapter_id) -> {updated:number}` (POST /api/timeline/refresh).
- `app/WriterShell.tsx` — 우측 레일 **구조화** 그룹에 **"타임라인 갱신"** 버튼(active 화 필요, busy 가드). 호출 후 카운트를 stagedNote/별도 노트로 표시. (DB·엔티티 목록과 무관하므로 refreshDb 불필요.)
- `app/EntityEditor.tsx` 타임라인 섹션 — 항목을 `seq` 정렬, 표시 `@{era} — {state}` + (변화: {note}), 최신 자동 항목에 **"현재"** 배지. 기존 수동 추가 폼 유지.
- `app/writer.module.css` / `EntityEditor` 관련 스타일에 "현재" 배지 클래스.

## 6. 에러·안전

- LLM 미기동/JSON 파싱 실패 → API 500 → 버튼에 에러 표시, DB 불변.
- 등장 엔티티 없음 → updated 0, 변경 없음.
- 자동 반영 없음(사람이 버튼 클릭). 타임라인은 별 테이블이라 정사/그래프 보호와 무관.
- 재갱신 멱등: 같은 화 다시 누르면 그 화 스냅샷만 갱신(중복 누적 없음).

## 7. 검증

- pytest: `statecap.capture` 파싱(LLM monkeypatch) / `upsert_timeline` 멱등(같은 entity+chapter 재호출=1행 갱신) / `story_seq` 단조 / `latest_state` 최신 반환 / API refresh가 등장 엔티티만 기록.
- 브라우저: 화A에서 타임라인 갱신 → 인물 타임라인에 `@화A 상세상태+변화` + "현재" 배지 → 화B(다음)에서 갱신 → "현재"가 화B로 이동, 화A는 이력으로 남음.

## 8. 파일 영향 요약

신규: `gen/statecap.py`.
수정: `store/entity.py`(upsert_timeline·latest_state), `store/repo.py`(story_seq·chapter_label), `store/db.py`(migrate chapter_id), `api/graph_routes.py`(refresh 라우트), `lib/useCreator.ts`(refreshTimeline), `app/WriterShell.tsx`(버튼), `app/EntityEditor.tsx`(정렬·현재 배지), 관련 CSS.
