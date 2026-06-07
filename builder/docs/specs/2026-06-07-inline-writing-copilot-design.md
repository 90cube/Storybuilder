# 작문용 인라인 Copilot — 설계 (Phase 1 + 반자동 엔티티)

> 작성 2026-06-07 · 상태: 승인됨 · 범위: Creator(builder/) 기능 추가

## 0. 목표

VS Code Copilot의 "한 줄씩 제안·수락" 경험을 작문에 적용한다. 작가가 초안에서
텍스트를 **드래그 선택 → 우클릭(직접 만든 메뉴) → "AI로 작문"** 하면, 선택 영역을
**전체 문맥 + 엔티티 + 세계관 + 다음 전개 + 프로젝트 문체 + 캐릭터 말투/성격/습관**과 함께
수정·이어쓰기 제안으로 받고, 후보를 골라 **선택 영역을 교체**한다. 새 설정이 감지되면
반자동으로 엔티티 DB에 등록/갱신하고, 기존 설정과 충돌하면 경고한다.

기존 Creator 기능(집필·엔티티·인과 캔버스·파이프라인·draft_auto 스테이징)은 그대로 유지한다.

## 1. 범위 (이번 빌드)

포함:
- 직접 만든 우클릭 컨텍스트 메뉴: 복사 / 붙여넣기 / 인터넷 검색(새 탭) / 번역(인앱 LLM) / AI로 작문
- AI 작문 플로팅 팝오버: 수정안 N + 이어쓰기 N 후보, 수락=선택영역 교체(이어쓰기는 끝에 삽입)
- 문체 3출처 옵션(작품 문체 필드 / 최근 화 자동 샘플 / 기본 system) — 작품 문체 필드 신설
- 본문 등장 캐릭터 카드(말투·성격·습관) 자동 주입
- 반자동 엔티티: 선택에서 신규/기존(변경) 감지 → 카드로 표시 → 등록(draft_auto)/무시, 충돌 플래그

제외 (후속 Phase):
- 타이핑 중 인라인 고스트텍스트(Copilot식 Tab 수락) — 리치 에디터(CodeMirror) 필요
- 완전 자동 엔티티 등록 / 정밀 모순 추론
- 멀티턴 대화형 세션(현재는 1회 요청-응답)

## 2. 아키텍처

textarea를 유지한다. 선택은 `textarea.selectionStart/selectionEnd` + 선택 문자열로 캡처.
우클릭/팝오버는 **포털(fixed) + 커서 좌표 앵커**(뷰포트 클램프)로 textarea 위에 띄운다.
정확한 캐럿 rect 측정(미러 div)은 후순위 정밀화로 둔다.

```
textarea(onContextMenu preventDefault)
  → EditorContextMenu (포털, 커서 위치)
      ├ 복사       navigator.clipboard.writeText(sel)
      ├ 붙여넣기   navigator.clipboard.readText() → splice at caret
      ├ 인터넷 검색 window.open(검색URL + sel, "_blank")
      ├ 번역       → AssistPopover(translate)
      └ AI로 작문  → AssistPopover(rewrite)
  → AssistPopover (포털, 커서 앵커, read-only 잠금 동안)
      ├ 문체 출처 선택 [문체 필드 | 자동 샘플 | 기본]
      ├ 수정안 카드 N      적용=replaceSelection(card)
      ├ 이어쓰기 카드 N    적용=insertAfter(selEnd, card)
      ├ 번역 결과          복사/치환
      └ 엔티티/충돌 카드   등록(draft_auto)/무시 · 충돌 경고
```

## 3. 프론트엔드 컴포넌트 (1파일1역할)

- `app/EditorContextMenu.tsx` — 커서 위치 포털 메뉴(복사/붙여넣기/검색/번역/AI). 외부클릭·Esc 닫힘.
- `app/AssistPopover.tsx` — 플로팅 팝오버. props: `{ chapterId, projectId, selection:{start,end,text}, anchor:{x,y}, kind:"rewrite"|"translate", onApply, onClose }`. 내부: 문체 출처 state, 후보 로딩/표시, 엔티티·충돌 카드.
- `app/WriterShell.tsx` — textarea에 `onContextMenu` 추가, 선택 캡처, 메뉴/팝오버 상태, `replaceSelection`/`insertAfter`(textRef + setText + 자동저장), 팝오버 동안 textarea `readOnly`.
- `lib/useCreator.ts` — `assistRewrite`, `assistTranslate`, `getStyle`, `setStyle` 훅. 엔티티는 기존 `analyze`/`stageToCausal`/`registerEntity` 재사용.
- `lib/const.ts` — `ASSIST_REWRITE_N`, `ASSIST_CONTINUE_N`, 검색 URL 템플릿.

## 4. 백엔드 (1파일1역할)

- `gen/assist.py`(신규)
  - `rewrite(selected, before, after, world, style, char_cards, n_rewrite, n_continue)` → LLM(raw JSON) → `{rewrites:[str], continuations:[str], conflicts:[{entity,issue,suggestion}]}`. 견고 파서(코드펜스 제거 + 첫 `{...}`), 실패 시 예외.
  - `translate(text, world)` → 한국어↔원문 번역 문자열.
- `store/repo.py` — `get_style(pid)`, `set_style(pid, text)` (projects.style_guide).
- `store/db.py` — `_migrate`: `projects.style_guide TEXT` ALTER(구 DB).
- `store/graph.py` — `entities_in_text(project_id, text)`: 본문에 이름이 등장하는 캐릭터 엔티티 + `data_json`(speech_style/personality/mbti) 반환(캐릭터 카드).
- `api/creator.py`
  - `POST /api/assist/rewrite {chapter_id, selected, before, after, style_source}` → 조립 후 `assist.rewrite` + 엔티티 감지(`extract`→`canon.diff_against_graph(pid)`) 병합 → `{rewrites, continuations, conflicts, entities:{added,changed}}`.
  - `POST /api/assist/translate {chapter_id, text}` → `{text}`.
  - `GET /api/projects/{pid}/style` · `PUT /api/projects/{pid}/style {text}`.
- 문체 출처 해석: `style_source="field"`→projects.style_guide / `"auto"`→최근 화 산문 일부 / `"base"`→없음(기본 system).

## 5. 프롬프트 조립 (assist.rewrite)

```
system: 〈world〉 작품의 집필 보조자. 문체·캐릭터 말투·세계관·인과 일관성을 지킨다.
        주어진 자료에만 근거. 출력은 JSON {rewrites, continuations, conflicts}.
user:
  [문체 지침] {style}                         # 출처별
  [캐릭터 카드] {name}: 말투={speech_style}, 성격={personality}, 습관=...   # 본문 등장분
  [앞 문맥] {before(말미 N자)}
  [선택(수정 대상)] {selected}
  [뒤 문맥] {after(서두 N자)}
  지시: 선택을 문체·말투에 맞게 자연스럽게 다듬은 수정안 {n_rewrite}개,
        선택 다음으로 이어질 문장/전개 후보 {n_continue}개.
        기존 설정과 모순되면 conflicts에 적어라.
```

## 6. 엔티티/충돌 (반자동)

- 감지: `extract_svc.extract_from_text(selected + 인접문맥, mode, world)` → `canon.diff_against_graph(extracted, pid)` → `추가`(신규)/`변경`(기존 존재).
- 표시: 팝오버 하단 카드. 신규=등록 버튼(→ `stageToCausal`/`registerEntity`, source=draft_auto), 변경=기존과 연결됨 표시.
- 충돌: assist LLM의 `conflicts[]`(모순 + 대안)을 경고 카드로. (정밀 모순 추론은 후속)
- 모든 등록은 사용자 클릭(반자동). 정사(canon) 행은 보호(기존 protect 가드).

## 7. 적용 (선택 영역 교체)

- 캡처한 `selStart/selEnd`로 `text.slice(0,start) + card + text.slice(end)` (수정안) 또는
  `text.slice(0,end) + "\n" + card + text.slice(end)` (이어쓰기).
- `textRef` 갱신 + `setText` + 기존 자동저장 경로.
- 팝오버가 떠 있는 동안 textarea `readOnly` → 인덱스 어긋남 방지.

## 8. 에러·안전

- LLM 미기동/JSON 파싱 실패 → 팝오버 에러 표시, 본문 불변.
- 선택 없음 → "AI로 작문"·"번역" disabled.
- 붙여넣기 권한 거부 → 안내(클립보드 read 실패).
- 자동 반영 없음(항상 사용자 클릭). 엔티티 등록도 확인 필요.

## 9. 검증

- TestClient: `/assist/rewrite`(JSON 파싱·캐릭터 카드 주입), `/assist/translate`, style GET/PUT, 엔티티 diff 병합.
- 브라우저(Playwright): 드래그→우클릭 메뉴 표시→AI 작문 팝오버→수정안 적용으로 선택영역 교체, 번역 결과, 엔티티 카드, 콘솔 0.

## 10. 파일 영향 요약

신규: `gen/assist.py`, `app/EditorContextMenu.tsx`, `app/AssistPopover.tsx`, 각 CSS.
수정: `api/creator.py`(+4 라우트), `store/repo.py`(style+`entities_in_text`는 graph), `store/graph.py`(entities_in_text), `store/db.py`(migrate), `lib/useCreator.ts`(+훅), `lib/const.ts`, `app/WriterShell.tsx`(선택·메뉴·팝오버·적용), `app/writer.module.css`.
