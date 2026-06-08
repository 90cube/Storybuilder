# 타임라인 자동 진행 — 설계 v2 (엔티티 검증·반영 단계에 통합)

> 작성 2026-06-07 · 상태: 승인(방향) · 범위: Creator(builder/) 기능 추가
> v1(별도 "타임라인 갱신" 버튼) 폐기 → 파이프라인 6단계(원고 확정 후 엔티티 검증·재추출 → 반영)에 통합.

## 0. 목표 / 파이프라인 위치

작가가 말한 정규 파이프라인:
```
초안 → 다듬기(루프) → 초안 확정 → 원고 생성(완성본) → 원고 확정
  → [정사 추출·diff] 가안 엔티티 검증·재추출 (+ 이 화 시점 상태 캡처)
  → [전체 승격] 엔티티 반영 (+ 타임라인 스냅샷 기록)
```
즉 **별도 버튼 없이**, 이미 있는 "정사 추출·diff"가 엔티티와 함께 **각 인물의 이 화 시점 상태**를 같이 뽑고,
"전체 승격"이 엔티티를 반영하면서 **타임라인 스냅샷까지 기록**한다. 최신 화 스냅샷 = **"현재"**.

## 1. 범위

포함:
- `정사 추출·diff` 시 등장 엔티티별 **상세 상태(state) + 직전 대비 변화(change)** 를 LLM이 함께 추출 → canon 패널에 표시.
- `전체 승격` 시 엔티티 upsert와 함께 **타임라인 스냅샷** `(entity_id, chapter_id)` 멱등 기록.
- 타임라인을 **스토리 순서**(시즌·화)로 정렬, 최신에 **"현재" 배지**. 직전 상태를 프롬프트에 동봉(연속성).

제외 (후속):
- 별도 "타임라인 갱신" 버튼(폐기).
- 작품 전체 인물 일괄 / 사용자 선택 캡처.
- 사건·관계의 시점 변화 추적(인물 상태 타임라인에 한정).

## 2. 데이터 모델

`timeline`에 **`chapter_id INTEGER`** 추가(구 DB _migrate ALTER).
- 자동 항목: `chapter_id` 채움, 키 `(entity_id, chapter_id)` → 재승격 시 그 화 스냅샷만 덮어씀(멱등).
- `seq` = 스토리 순서 = `season.idx * 1000000 + chapter.id`(시즌·생성 순서 단조). 정렬·"현재" 판정.
- `era` = 화 라벨(예: `"3화 - 제목"`), `state` = 그 시점 **상세 상태**(감정·처지·목표·관계 변화), `note` = **이번 화 변화**.
- 수동 항목(기존 add_timeline): `chapter_id` NULL, era 자유, seq 입력순. 공존.
- **"현재"** = 그 엔티티의 자동 항목 중 `seq` 최대.

## 3. 백엔드 (1파일1역할)

- `gen/statecap.py`(신규) — `capture(text, cards, world) -> list[{name,state,change}]`. cards=`[{name,speech_style,personality,prev_state}]`. LLM raw-JSON, 견고 파서(코드펜스 제거 + 첫 `[..]`/`{..}`), 실패 시 예외.
- `store/repo.py` — `story_seq(chapter_id)->int`, `chapter_label(chapter_id)->str`.
- `store/entity.py` — `upsert_timeline(eid, chapter_id, seq, era, state, note)`(entity_id+chapter_id 멱등), `latest_state(eid)->str`(최대 seq의 state). 기존 add_timeline·list_timeline 유지.
- `store/db.py` — `_migrate`: `timeline.chapter_id` 없으면 ALTER ADD.
- `canon/diff.py`
  - `diff_against_graph(extracted, project_id, states=None)`: states(name→{state,change})를 받아 각 엔티티 dict에 `state`/`statechange` 첨부(검증 패널 표시용).
  - `promote(entities, relations, project_id, events, chapter_id=None)`: 엔티티 upsert와 함께, `chapter_id`가 있고 엔티티에 `state`가 있으면 `entity.upsert_timeline(eid, chapter_id, repo.story_seq, repo.chapter_label, state, statechange)` 기록. (반영 = 엔티티 + 타임라인)
- `api/canon_routes.py` (정사 라우트가 여기 있음)
  - `canon_diff`(정사 추출·diff): 완성본 텍스트로 `extract` + `entities_in_text`로 카드 추림(각 `prev_state=latest_state`) → `statecap.capture` → `diff_against_graph(..., states)` 로 상태 첨부해 반환.
  - `canon_promote`(전체 승격): body의 entities(상태 포함)·chapter_id로 `promote(..., chapter_id=...)` → 타임라인 기록.

## 4. 프롬프트 (statecap.capture)

```
system: 〈world〉 작품 분석가. 화 본문과 인물 카드에만 근거. JSON 배열만:
        [{"name":"인물","state":"이 화 시점 상세 상태(감정·처지·목표·관계 변화 구체적으로)","change":"직전 대비 변화"}]
user:
  [인물 카드]
   - {name} (말투={speech_style}, 성격={personality}) | 직전 상태: {prev_state or "없음"}
  [이 화 본문]
  {text}
  지시: 위 인물 각각의 이 화 시점 상세 상태와 직전 대비 변화를 본문 근거로. 본문에 없으면 제외.
```

## 5. 프론트엔드

- `lib/useCreator.ts` — `canonDiff`/`canonPromote` 타입에 엔티티 `state`/`statechange` 추가. promote 시 entities에 state 동봉.
- `app/WriterShell.tsx` canon 패널 — 엔티티 행에 감지 **상태** 표시(`{name} — {state}`). 승격은 기존 "전체 승격" 그대로(이제 타임라인까지 기록).
- `app/EntityEditor.tsx` 타임라인 섹션 — `seq` 정렬, `@{era} — {state}` + (변화: {note}), 최신 자동 항목에 **"현재" 배지**. 수동 추가 유지.
- 관련 CSS에 "현재" 배지.

## 6. 에러·안전

- statecap LLM 실패 → 상태 첨부 생략(diff는 정상 동작), 본문/DB 불변.
- 등장 엔티티 없음 → 상태 0, 타임라인 변화 없음.
- 승격은 사람이 "전체 승격" 클릭 — 자동 반영 없음. 타임라인은 별 테이블이라 정사 보호와 무관.
- 재승격 멱등: 같은 화 재승격 시 그 화 타임라인 스냅샷만 갱신.

## 7. 검증

- pytest: `statecap.capture` 파싱(monkeypatch) / `upsert_timeline` 멱등 / `story_seq` 단조 / `latest_state` 최신 / promote가 chapter_id+state로 타임라인 기록 / diff가 states 첨부.
- 브라우저: 원고 확정 → 정사 추출·diff(엔티티에 상태 표시) → 전체 승격 → 엔티티 편집기 타임라인에 `@화 상세상태+변화`+"현재" → 다음 화 반복 시 "현재" 이동.

## 8. 파일 영향 요약

신규: `gen/statecap.py`.
수정: `store/entity.py`(upsert_timeline·latest_state), `store/repo.py`(story_seq·chapter_label), `store/db.py`(migrate chapter_id), `canon/diff.py`(diff states 첨부·promote 타임라인), `api/canon_routes.py`(diff에 상태 캡처·promote에 chapter_id), `lib/useCreator.ts`(state 타입), `app/WriterShell.tsx`(canon 패널 상태 표시·promote에 state), `app/EntityEditor.tsx`(정렬·현재 배지), 관련 CSS.
