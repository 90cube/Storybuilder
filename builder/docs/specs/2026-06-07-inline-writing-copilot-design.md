# 작문용 인라인 Copilot — 설계 v2 (선택 기반 하단 부분수정)

> 작성 2026-06-07 · 상태: 재설계(v2) · 범위: Creator(builder/) 기능 추가
> v1(우클릭 메뉴 + 플로팅 팝오버) 폐기 → **드래그 선택 시 하단 생성바가 부분수정 컴포넌트로 교체**되는 방식으로 변경.

## 0. 목표

작가가 초안에서 텍스트를 **드래그 선택**하면, 하단의 **생성 버튼 영역이 "부분수정 컴포넌트"로 교체**된다.
선택 영역을 **전체 문맥 + 세계관 + 문체 + 등장 캐릭터 말투/성격/습관**과 함께 다듬거나 보강하고,
후보를 골라 **선택 영역을 교체**한다. 동작은 파이프라인 단계에 따라 달라진다:

- **초안(미확정, DRAFT)**: 그냥 쓰는 단계 → 부분수정 = 단순 다듬기/이어쓰기(초안↔초안, DB 불변).
- **초안 확정 후(POLISH 이상)**: 부분수정 = **완성본 방향 보강** + **엔티티 검출·확정**(반자동 등록/충돌).

기존 Creator 기능(집필·엔티티·인과 캔버스·파이프라인·draft_auto 스테이징)은 유지.

## 1. v1 대비 변경점 (요약)

- ❌ 우클릭 커스텀 메뉴 / 플로팅 팝오버 / 인터넷 검색 — **폐기**. 복사·붙여넣기는 브라우저 기본.
- ✅ **선택 기반 하단 교체**: 선택 없으면 일반 생성바, 선택 있으면 부분수정 컴포넌트.
- ✅ **명시 "초안 확정" 버튼**으로 DRAFT→POLISH 전이 → 이후 부분수정이 보강+엔티티 모드로.
- ✅ 우측 레일의 "부분 다듬기" 제거(의도와 달리 거기 있었음) → 부분 편집은 선택 기반 하단으로 일원화.
- ✅ 번역은 부분수정 컴포넌트의 부가 버튼(인앱 LLM)으로 유지.

## 2. 하단 바 상태 머신 (핵심 UX)

```
하단 영역(=기존 genBar 자리)
├─ 선택 없음
│   ├─ DRAFT      : [초안 재생성]  [초안 확정 →]
│   └─ POLISH 이상 : [다듬기]      [완성본]            # 전체 생성(기존 gen)
└─ 선택 있음(드래그) → 부분수정 컴포넌트로 교체
    ├─ 선택 스니펫(축약) + [AI 부분수정] [번역] [닫기]
    ├─ 결과: 수정안 카드 N        → 적용 = 선택영역 교체
    │        이어쓰기 카드 M(옵션) → 적용 = 선택 끝에 삽입
    ├─ DRAFT      : 다듬기/이어쓰기만 (엔티티 DB 불변)
    └─ POLISH 이상 : 보강(완성본 방향) + 엔티티 카드(신규=등록 draft_auto / 변경=기존연결 / 충돌=경고)
```

선택 해제(클릭/타이핑) → 일반 생성바로 복귀.

## 3. 아키텍처

textarea 유지. 선택은 `selectionStart/End` + 선택 문자열로 캡처(`onSelect`/`onMouseUp`).
선택이 비어있지 않으면 하단을 부분수정 컴포넌트로 스왑. 부분수정 패널이 떠 있는 동안
textarea는 `readOnly`로 잠가 인덱스 어긋남 방지. 적용은 저장된 `selStart/End`로 스플라이스.
"초안 확정" 버튼은 기존 `POST /api/run/{id}/advance`(→POLISH) 재사용.

## 4. 프론트엔드 컴포넌트 (1파일1역할)

- `app/PartialEditBar.tsx`(신규) — 선택 시 하단 부분수정 컴포넌트.
  props: `{ chapterId, projectId, state, selection:{start,end,text}, onApply(text, mode), onClose }`.
  내부: 문체 출처 선택(문체필드/자동/기본) · [AI 부분수정]·[번역] · 결과 카드 · (POLISH+) 엔티티/충돌 카드.
- `app/WriterShell.tsx` — textarea `onSelect`로 선택 캡처(`sel` 상태), 하단 분기 렌더(genBar ↔ PartialEditBar),
  `replaceSelection`/`insertAfter`(textRef+setText+자동저장), 팝업 동안 textarea readOnly,
  genBar 재구성(DRAFT=[재생성][초안 확정], POLISH+=[다듬기][완성본]), "초안 확정"=advance(POLISH).
- `app/writer.module.css` — 부분수정 바 스타일.
- `lib/useCreator.ts` — `assistEdit`, `assistTranslate`, `getStyle`, `setStyle` 훅. 엔티티는 기존 `stageToCausal`/`registerEntity` 재사용.
- `lib/const.ts` — `ASSIST_REWRITE_N`, `ASSIST_CONTINUE_N`.

## 5. 백엔드 (1파일1역할)

- `gen/assist.py`(신규)
  - `edit(selected, before, after, world, style, char_cards, mode, n_rewrite, n_continue)`
    - `mode="draft"`: 다듬기/이어쓰기(문체·말투 유지)만 → `{rewrites[], continuations[]}`
    - `mode="enrich"`: 완성본 방향 보강(세부·묘사 확장, 설정 일관) → `{rewrites[], continuations[], conflicts[]}`
    - LLM raw JSON + 견고 파서(코드펜스 제거 + 첫 `{...}`), 실패 시 예외.
  - `translate(text, world)` → 번역 문자열(자동 감지 → 반대 언어, 한↔영 기본).
- `store/repo.py` — `get_style(pid)`, `set_style(pid, text)`.
- `store/db.py` — `_migrate`: `projects.style_guide TEXT` ALTER.
- `store/graph.py` — `entities_in_text(project_id, text)`: 본문에 이름 등장하는 캐릭터 엔티티 + `data_json`(speech_style/personality/mbti) 반환.
- `api/creator.py`
  - `POST /api/assist/edit {chapter_id, selected, before, after, style_source}` →
    상태로 mode 결정(DRAFT→"draft" / 그 외→"enrich") → 세계관+문체+캐릭터 카드 조립 → `assist.edit`.
    enrich일 때만 엔티티 감지(`extract`→`canon.diff_against_graph(pid)`) 병합 → `{rewrites, continuations, conflicts, entities:{added,changed}}`.
  - `POST /api/assist/translate {chapter_id, text}` → `{text}`.
  - `GET/PUT /api/projects/{pid}/style`.
- 문체 출처: `field`→projects.style_guide / `auto`→최근 화 산문 일부 / `base`→기본 system.

## 6. 프롬프트 조립 (assist.edit)

```
system: 〈world〉 작품 집필 보조자. 문체·캐릭터 말투·세계관·인과 일관성 유지. 주어진 자료만 근거.
        출력 JSON {rewrites, continuations[, conflicts]}.
user:
  [문체] {style}
  [캐릭터 카드] {name}: 말투/성격/습관 …          # 본문 등장분
  [앞 문맥] {before(말미 N자)}
  [선택] {selected}
  [뒤 문맥] {after(서두 N자)}
  지시(draft): 선택을 문체·말투에 맞게 다듬은 수정안 N개 + 이어쓰기 M개.
  지시(enrich): 선택을 완성본 수준으로 보강(묘사·세부 확장, 설정 일관) N개 + 이어쓰기 M개.
               기존 설정과 모순되면 conflicts에 적어라.
```

## 7. 엔티티/충돌 (POLISH 이상에서만, 반자동)

- 감지: `extract_svc.extract_from_text(selected+인접문맥)` → `canon.diff_against_graph(pid)` → 신규(추가)/기존(변경).
- 표시: 부분수정 컴포넌트 하단 카드. 신규=등록(→ draft_auto), 변경=기존연결 표시, 충돌=assist `conflicts[]` 경고.
- 등록은 사용자 클릭(반자동). 정사(canon)는 보호(기존 protect 가드).

## 8. 적용 (선택 영역 교체)

- 수정안: `text.slice(0,start) + card + text.slice(end)`.
- 이어쓰기: `text.slice(0,end) + "\n" + card + text.slice(end)`.
- `textRef` 갱신 + `setText` + 기존 자동저장. 패널 동안 textarea readOnly.

## 9. 에러·안전

- LLM 미기동/파싱 실패 → 컴포넌트에 에러, 본문 불변.
- 선택 없음 → 일반 생성바(부분수정 비표시).
- 자동 반영 없음(항상 사용자 클릭). 엔티티 등록도 확인 필요.
- "초안 확정"은 되돌릴 수 있게(상태 전이는 기존 FSM; REVISE/POLISH 루프 존재).

## 10. 검증

- TestClient: `/assist/edit`(draft/enrich JSON 파싱·캐릭터 카드 주입·enrich에서 엔티티 병합), `/assist/translate`, style GET/PUT.
- 브라우저(Playwright): 드래그 → 하단이 부분수정 컴포넌트로 교체 → 수정안 적용으로 선택영역 교체 →
  선택 해제 시 생성바 복귀 → "초안 확정" 후 부분수정에 엔티티 카드 등장 → 콘솔 0.

## 11. 파일 영향 요약

신규: `gen/assist.py`, `app/PartialEditBar.tsx`.
수정: `api/creator.py`(+4 라우트), `store/repo.py`(style), `store/graph.py`(entities_in_text), `store/db.py`(migrate),
`lib/useCreator.ts`(+훅), `lib/const.ts`, `app/WriterShell.tsx`(선택 캡처·하단 분기·초안 확정·적용·readOnly),
`app/writer.module.css`. 우측 레일에서 "부분 다듬기" 제거.
