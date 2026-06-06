# Creator 실행 가이드 (3-서버)

Creator는 **세 개의 프로세스**가 동시에 떠 있어야 동작한다. 포트가 서로 다르니 충돌하지 않는다.

| # | 프로세스 | 포트 | 역할 |
|---|----------|------|------|
| 1 | `llama-server` (llama.cpp) | **8080** | 로컬 LLM. 초안 생성·다듬기·확장·추출·캐릭터 보조 |
| 2 | FastAPI (`builder.main`) | **8000** | API + 단일 SQLite(`creator.db`) + 파이프라인 FSM |
| 3 | Vite (React) | **5173** | 집필 화면(WriterShell). `/api` → 8000 프록시 |

> 개발 중엔 3을 띄워 `http://localhost:5173` 로 접속한다.
> 프론트를 `npm run build` 하면 정적 산출물이 백엔드(`web/`)로 들어가 8000 단독 서빙도 가능하다.

---

## 0. 사전 준비 (최초 1회)

- **Python ≥ 3.10**, **Node ≥ 20**, **llama.cpp(CUDA 빌드)**, GGUF 모델
- 모델 위치: `E:\models\gemma-4-31B-it-Q4_K_M.unsloth.gguf` (RTX 5090 32GB 기준)

```powershell
# 백엔드 가상환경 + 의존성
cd D:\DNF_storybuilder\builder
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .            # builder 패키지 등록 (src 레이아웃)
pip install fastapi uvicorn # 런타임 의존성

# 프론트엔드 의존성
cd frontend
npm install
```

---

## 1. LLM 서버 (포트 8080)

PowerShell에서 **분리 실행**(창이 닫혀도 살아있게). `&`/`nohup` 으로 띄우면 죽는다.

```powershell
Start-Process -WindowStyle Hidden -FilePath "llama-server.exe" -ArgumentList @(
  "-m", "E:\models\gemma-4-31B-it-Q4_K_M.unsloth.gguf",
  "--host", "127.0.0.1", "--port", "8080",
  "-ngl", "999", "-c", "8192"
)
```

확인:

```powershell
curl http://127.0.0.1:8080/health   # {"status":"ok"}
```

> ⚠️ **추론형(reasoning) 모델 주의** — 이 모델은 `enable_thinking:false` 를 보내지 않으면
> `content` 가 비고 출력이 `reasoning_content` 로 샌다. Creator의 `llm/client.py` 가
> `chat_template_kwargs:{enable_thinking:false}` 를 항상 실어 보내므로 클라이언트는 신경 쓸 게 없다.
> 직접 curl 테스트 시 한글은 git-bash curl이 UTF-8을 깨뜨리므로 Python/브라우저로 검증할 것.

모델·포트·URL 은 `src/builder/const.py`(`LLM_BASE_URL`, `MODEL_NAME`)에서 바꾼다. 하드코딩 금지.

---

## 2. 백엔드 (포트 8000)

```powershell
cd D:\DNF_storybuilder\builder
.\.venv\Scripts\Activate.ps1
python -m builder.main
```

- 첫 기동 시 `creator.db` 가 없으면 `init_db()` 가 스키마 생성 + 마이그레이션(시즌 컬럼 백필)을 수행한다.
- `creator.db` 는 **gitignore** 대상(로컬 데이터). 지우면 빈 DB로 다시 시작된다.
- 코드(파이썬)를 고쳤으면 **백엔드를 재기동**해야 반영된다(모듈은 기동 시 import).

확인: `http://127.0.0.1:8000/api/projects` → `[]` 또는 프로젝트 배열.

---

## 3. 프론트엔드 (포트 5173)

```powershell
cd D:\DNF_storybuilder\builder\frontend
npm run dev
```

브라우저에서 `http://localhost:5173` 접속 → 좌측 트리에서 **작품 ▸ 시즌 ▸ 화** 생성 후 집필 시작.

중앙 영역은 **3모드 전환**(에디터 + 빌더를 Creator로 흡수):

| 모드 | 기능 | 출처 |
|------|------|------|
| ✍ 집필 | 초안 작성·자동저장·생성 토글·실시간 분석 | Creator 본체 |
| ◆ 엔티티 | 스키마주도 타입 폼(7종)·필수검증·버전잠금·양방향 관계·타임라인·비밀·내보내기 | editor(Go) 흡수 |
| ⌥ 인과 캔버스 | 인과 갭에 캐릭터 삽입 → 원본·삽입 이야기 2개 생성(tbg 검증) | builder 기능1 흡수 |

타입 정의는 `editor/schema/*.json` 을 **단일 진실원**으로 읽는다(Go 에디터와 공유). 엔티티는 `creator.db` 에 저장.

배포용 정적 번들:

```powershell
npm run build   # tsc -b && vite build → frontend/dist/ 로 산출
```

> 개발은 Vite(5173) + `/api` 프록시로 충분하다.
> 백엔드 단독 서빙(8000)으로 배포하려면 `frontend/dist/*` 를 `src/builder/web/` 로 복사해야 한다
> (현재 `web/` 에는 구 정적 빌더 페이지가 들어 있음). 단일 서버 배포가 필요해지면 그때 outDir 정리.

---

## 기동 순서 요약

```
1) llama-server (8080)  →  2) python -m builder.main (8000)  →  3) npm run dev (5173)
                                                                    └ http://localhost:5173
```

LLM이 안 떠 있으면 생성·추출·캐릭터 보조 호출이 타임아웃(`LLM_TIMEOUT=600s`)된다.
나머지 집필·저장·트리 CRUD 는 LLM 없이도 동작한다.

---

## 파이프라인 13단계 (FSM)

```
DRAFT → POLISH → CHAR_DETECT → DB_WRITE → DB_SYNC → REVISE → EXPAND
      → CTX_RESET_A → PARTIAL_POLISH → CTX_RESET_B → EXTRACT → DB_SYNC2
      → CHAPTER_SAVE → SHIP
```

각 화(chapter)는 위 상태를 따라 전이한다. 상태 정의는 `domain/pipeline.py`,
전이 규칙은 `store/repo.py`(get/set state) + `api/creator.py`(`/run`, `/advance`).

## 디렉터리 (1파일1역할)

```
builder/
├─ src/builder/
│  ├─ main.py            진입점(와이어링만)
│  ├─ const.py           상수·경로·LLM 설정 (하드코딩 금지)
│  ├─ api/               FastAPI 라우터 (app.py·creator.py)
│  ├─ domain/            순수 도메인 (pipeline FSM·insertion·validate)
│  ├─ store/             단일 SQLite (db·schema·repo·graph)
│  ├─ gen/               생성 모드 (draft/polish/expand)
│  ├─ extract/           GBNF/raw 추출 + grammar
│  ├─ chars/             캐릭터 보조 (GBNF 카드)
│  ├─ canon/             canon diff/merge 승격
│  ├─ postproc/          후공정 부분 다듬기(강제초기화)
│  ├─ llm/               LLM 클라이언트·프롬프트·세계관 주입
│  └─ web/               빌드된 프론트 정적 산출
└─ frontend/             React 19 + Vite + TS (WriterShell)
```
