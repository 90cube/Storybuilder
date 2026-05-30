# 스토리빌더 DB CRUD 에디터 — 설계 문서

> 작성일: 2026-05-30
> 상태: 검토 대기 (브레인스토밍 산출물)

용어는 **쉬운 말 + (정식용어)** 로 적습니다. 맨 아래 §13 용어표 참고.

---

## 1. 목적 (무엇을 / 왜)

스토리빌더의 **기초 에디터** 중 하나로, 캐릭터·장소·아이템·사건 등을 **폼으로 입력하면 즉시 DB에 저장**되는 도구. 타입마다 **필수칸이 안 차면 저장이 안 되고**, 채우면 저장되며, **관계를 넣으면 상대 엔티티에도 자동 주입**된다. 기존 데이터도 같은 구조로 **CRUD** 가능하다.

**핵심 요구 (사용자 합의):**
1. 스키마(타입·필드·필수규칙)를 **자동으로 읽어** 폼을 그린다 → 타입 추가는 코드 수정 없이 정의 파일만 늘림.
2. 타입별 **필수칸(NOT NULL)** 미충족 시 저장 잠금.
3. 저장 시 **현재 스키마 구조와 어긋나지 않게** DB에 기록.
4. **관계 양방향 주입** — X에 "Y의 제자"를 넣으면 Y에도 "X의 스승"이 들어감.
5. 스키마는 **OO처럼 조립** — 타입마다 독립이되 합쳐 한 엔티티를 구성.
6. **다중 사용자 동시편집**이 가능해야 함 (최우선).
7. **편집 로그**(누가·언제·뭘 고쳤나) 자동 기록.
8. **PIN 인증** (ID = 회사코드+6자리 사번, PIN 최초 000000 강제변경).
9. 데이터는 들고 다닐 수 있고(엑셀 모델), 회사에선 **Snowflake**로 올리며, **GitLab**으로 버전관리, 엔진은 **MySQL** 기본.
10. **EXE로 가볍게** — 도구(코드)와 데이터(DB)는 분리.

---

## 2. 전체 구조 (아키텍처)

```
 ┌──────────────────────────────────────────────┐
 │  편집기 EXE (Go + Wails)  —  여러 명이 각자 실행   │
 │  · 스키마 읽어 폼 자동 생성                        │
 │  · 필수칸 안 차면 저장 잠금                         │
 │  · 관계 입력 시 상대에도 자동 주입                   │
 │  · 저장 시 버전 충돌 체크 + 편집 로그 기록            │
 └───────────────┬──────────────────────────────┘
                 │  database/sql (드라이버 교체로 엔진 독립)
        ┌────────┴─────────┐
        ▼                  ▼
   ┌──────────┐      ┌──────────┐
   │  MySQL   │      │  SQLite  │   (같은 코드, 선택지)
   │ 팀 기본  │      │ 혼자 휴대 │
   │ 동시편집 │      └──────────┘
   └────┬─────┘
        │  내보내기 / 올리기 (별도 작업)
        ├──→ Snowflake  (회사 공유·분석, iShare)
        └──→ GitLab     (JSON/CSV/SQL 텍스트로 버전관리)
```

**설계 원칙 3가지**
1. **스키마 주도(schema-driven)** — 타입·필드·필수를 *데이터(메타데이터)*로 정의. 폼·검증·DDL·이관이 모두 이 한 곳을 본다.
2. **엔진 독립(표준 SQL)** — MySQL·SQLite·Snowflake 공통으로 들어가게 특수 기능 회피. 타입별 칸은 JSON 컬럼에 담아 DDL 불변.
3. **무결성은 DB/엔진이 강제** — 필수칸·관계 양방향·버전 충돌·로그를 앱 신뢰가 아니라 구조로 보장.

**동시편집 책임 분리:** 동시편집은 **MySQL**(트랜잭션·행 잠금)이 책임진다. Snowflake는 분석·공유 창고라 동시 쓰기에 부적합하므로 **올리기(publish) 전용**으로만 쓴다.

---

## 3. 데이터 모델

### 3.1 보기 vs 저장 (중요)
- **보기(화면):** 캐릭터 한 명 = **한 장(카드)**. 속성 + 관계 + 경험 + 비밀이 모여 보임.
- **저장(DB):** 캐릭터 = entities 테이블의 **행(Row) 1개**. 경험은 timeline 테이블에 그 캐릭터 id로 쌓인 행들.
- 편집기가 저장된 여러 행을 **합쳐서 한 장으로** 보여준다. (저장은 효율, 보기는 캐릭터 중심)

### 3.2 테이블 구성

```
[내용 — 폼으로 채움]          [시스템 — 자동, sys_ 접두]
 entities   (엔티티 = 행)      sys_edit_log    (편집 로그)
 relations  (관계, 양방향)      sys_users       (로그인 계정)
 timeline   (경험/상태 누적)    sys_schema_meta (스키마 정의 캐시)
 secrets    (누가 뭘 아나)
```

- `sys_` 접두 = 운영 메타데이터. 안 붙은 것 = 스토리 내용. 내보낼 때 분리 가능. MySQL에선 별도 스키마(DB)로 분리 가능.

### 3.3 OO 조립 = 공통 + 타입 + 부품

- **공통(base):** 모든 엔티티 공유 — `id · name · type · tags · provenance · version · updated_at · updated_by`
- **타입(subtype) 블록:** 타입마다 다른 필드 — 인물=`personality·speech·traits`, 아이템=`rarity·item_type·mechanics`, 사건=`era·sequence·causal_in·causal_out`, 장소=`parent_region` 등. **타입별 칸은 entities.data(JSON 컬럼)에 저장.**
- **부품(mixin):** 필요 시 부착 — `relations · timeline · secrets`. 각각 별도 테이블, entity_id로 연결.

### 3.4 entities 테이블 (컬럼)

| 컬럼 | 데이터타입 | 비고 |
|---|---|---|
| id | VARCHAR (PK) | canonical_id (기존 id_map과 동일 체계) |
| name | VARCHAR | NOT NULL |
| type | VARCHAR | NOT NULL (character/item/event/location/organization/concept/group) |
| tags | JSON | 리스트 |
| data | JSON | **타입별 필드 전부 여기** (타입 추가해도 DDL 불변) |
| provenance | VARCHAR | authored / imported |
| review_needed | TINYINT | 1=빈 필수칸 있음(이관 시) |
| version | INT | 동시편집 충돌 체크용, 저장마다 +1 |
| updated_at | DATETIME | |
| updated_by | VARCHAR | sys_users.id |

### 3.5 relations 테이블 (양방향)

| 컬럼 | 비고 |
|---|---|
| id | PK (자동) |
| from_id | entities.id |
| rel | 관계어 (예: 제자) |
| to_id | entities.id |
| pair_id | 정/역 한 쌍을 묶는 키 (같은 값 2줄) |
| version, updated_at, updated_by | |

- 저장 시: `from—rel—to` 와 역방향 `to—inverse(rel)—from` **두 줄을 한 트랜잭션**으로 기록(같은 pair_id). 삭제도 쌍으로.
- `inverse(rel)`는 §4.3 관계 레지스트리에서 조회.

### 3.6 timeline 테이블 (경험 누적)

| 컬럼 | 비고 |
|---|---|
| id | PK |
| entity_id | 누구의 경험인가 |
| order_key | 정렬 키 (사건 sequence 또는 연도) |
| era | 시대 라벨 |
| event_ref | 연결된 사건 id (있으면) |
| phase | before / after / state |
| state | 상태 서술 |
| traits | JSON |
| source | 출처 |

- 기존 `corpus/entity_timeline.json` 구조를 그대로 계승.

### 3.7 secrets 테이블 (누가 뭘 아나)

| 컬럼 | 비고 |
|---|---|
| fact_id | PK |
| summary | 비밀 내용 |
| reveal_to_reader_at | 독자 공개 시점(사건 id, null 가능) |
| known_by | JSON [{entity_id, awareness, since_event}] |
| hidden_from | JSON [entity_id] |
| related_events | JSON |

- 기존 `corpus/knowledge_state.json` 구조 계승.

### 3.8 sys_edit_log (편집 로그)

| 컬럼 | 비고 |
|---|---|
| log_id | PK |
| at | 시각 |
| who | sys_users.id |
| action | create / update / delete |
| target_table | entities / relations / ... |
| target_id | 대상 행 |
| changes | JSON {필드: [전, 후]} |
| version_after | 저장 후 버전 |

- 저장(생성/수정/삭제)마다 **앱이 자동 1줄** 기록. GitLab 내보내기의 변경이력 원천.

### 3.9 sys_users (계정)

| 컬럼 | 비고 |
|---|---|
| id | VARCHAR PK = 회사코드+6자리 사번 (예: ACME-123456) |
| pin_hash | PIN 해시 (원문 저장 안 함) |
| must_change_pin | 1=최초변경 필요 |
| created_at, last_login | |

---

## 4. 스키마 정의 형식 (메타데이터) — 섹션 3

타입을 늘릴 때 **당신이 만지는 파일들**. `editor/schema/`에 JSON으로 둔다(프로젝트 전체가 JSON이라 일관성·Go 기본 지원).

### 4.1 공통 필드 — `editor/schema/_base.json`
```json
{
  "base_fields": [
    { "key": "id",         "label": "ID",     "datatype": "string",  "required": true,  "system": true },
    { "key": "name",       "label": "이름",   "datatype": "string",  "required": true },
    { "key": "type",       "label": "타입",   "datatype": "string",  "required": true,  "system": true },
    { "key": "tags",       "label": "태그",   "datatype": "list" },
    { "key": "provenance", "label": "출처",   "datatype": "enum", "values": ["authored","imported"], "default": "authored", "system": true }
  ]
}
```

### 4.2 타입 정의 (1타입 1파일) — 예 `editor/schema/character.json`
```json
{
  "type": "character",
  "label": "인물",
  "fields": [
    { "key": "summary",     "label": "한줄요약", "datatype": "text",   "required": true },
    { "key": "personality", "label": "성격",     "datatype": "string", "required": false },
    { "key": "speech",      "label": "말투",     "datatype": "string", "required": false },
    { "key": "traits",      "label": "특성",     "datatype": "list",   "required": false }
  ],
  "mixins": ["relations", "timeline", "secrets"]
}
```
- 폼은 `_base.json`의 비-system 필드 + 이 타입의 fields 를 합쳐 그린다.
- `required: true` → 빈 값이면 저장 잠금.
- `mixins` → 이 타입 편집 시 관계/타임라인/비밀 부품을 붙일 수 있음.

### 4.3 관계 레지스트리 — `editor/schema/_relations.json`
```json
{
  "relations": [
    { "rel": "제자",   "inverse": "스승" },
    { "rel": "소속",   "inverse": "구성원" },
    { "rel": "창조함", "inverse": "창조됨" }
  ]
}
```
- `from—제자—to` 저장 시 `inverse`(스승)로 역방향 자동 생성.
- 대칭 관계(예: 동맹)는 `inverse`를 자기 자신으로.

### 4.4 데이터타입 → SQL 매핑 (엔진 독립 부분집합)

| 스키마 datatype | MySQL | SQLite | Snowflake |
|---|---|---|---|
| string | VARCHAR(255) | TEXT | VARCHAR |
| text | TEXT | TEXT | VARCHAR |
| int | INT | INTEGER | NUMBER |
| datetime | DATETIME | TEXT | TIMESTAMP |
| list / object | JSON | TEXT(JSON) | VARIANT |
| enum | VARCHAR | TEXT | VARCHAR |

### 4.5 DDL 생성
- 엔진이 시작 시 `_base.json` + 타입 파일들을 읽어 **고정 테이블**(entities/relations/timeline/secrets/sys_*)을 만든다(없으면 생성).
- **타입별 필드는 entities.data(JSON)에 들어가므로 타입을 추가해도 ALTER 불필요.** (스키마 주도 + 호환성)
- 읽은 정의는 `sys_schema_meta`에 캐시(어떤 타입/필드/필수가 있는지 DB 자체가 자기설명).

---

## 5. 편집기 UX 흐름

```
1. 앱 실행 → 로그인(ID + PIN)
   └ 최초 PIN(000000)이면 → 변경 팝업(새PIN [입력][다시입력] 2칸 일치 시 저장)
2. 좌측: 엔티티 목록/검색(초성·태그·타입 필터). "검토 필요" 배지 표시.
3. [새로 만들기] → 타입 선택 → 폼 자동 생성
   └ 필수칸(빨강 *) 비면 [저장] 비활성
4. 관계 추가: [관계] 부품 → 관계어 선택 + 상대 엔티티 검색해 연결
5. [저장] 누르면 → **저장 전 미리보기**(§5.5 4·5) 표시:
   ├ 이 저장으로 같이 바뀔 **연관 레코드 목록**(예: 힐더에 역방향 관계 주입)
   └ **원문 Diff**(전→후)를 VS Code식으로 확인
6. [확정] →
   ├ 필수검증 통과? → INSERT/UPDATE (version+1)
   ├ 관계 있으면 역방향 자동 INSERT (같은 트랜잭션)
   ├ sys_edit_log 1줄 기록
   └ 버전 충돌(남이 먼저 수정)? → "다른 사람이 고쳤습니다. 새로고침/병합" 경고, 덮어쓰기 차단
7. 엔티티 열기 = "한 장" 보기(속성+관계+타임라인+비밀 합쳐 표시)
```

### 5.5 데이터 뷰어 (DB 조회·영향·원문)

DB 에디터용 뷰어 5종. 스토리 시각화(그래프/타임라인 시각화)는 §12 추후.

1. **목록 조회** — entities/relations/timeline/secrets를 행 단위로 나열. 타입·검토필요 배지 표시. 페이지네이션.
2. **일치 단어 검색** — 이름·별칭·태그·본문에서 일치 검색(초성 포함). `sys_` 테이블은 기본 제외.
3. **필터링** — 타입(서브타입)·태그·출처(authored/imported)·검토필요·수정자·기간 등으로 필터. 조합 가능.
4. **영향 미리보기 (impact preview)** — 어떤 수정/삭제가 **같이 바꿀 연관 레코드 목록**을 저장 전에 보여줌.
   - 예: `칼릭스—제자—힐더` 저장 → "힐더 행에 역방향 `스승—칼릭스` 1줄 추가됨" 표시.
   - 산출 근거: 관계 양방향(§3.5) + 삭제 시 쌍 삭제. (앞으로 cascade 규칙이 늘면 여기에 반영)
   - "파일"이 아니라 **레코드(행)** 단위 목록.
5. **원문/Diff 뷰 (VS Code식)** — 실제로 DB에 들어갈 내용을 **원문 그대로** 표시.
   - 신규: 들어갈 행의 JSON 원문.
   - 수정: **전 → 후 Diff**(바뀐 컬럼만 강조). sys_edit_log의 `changes`(전,후)와 동일 형식.
   - 같은 텍스트 표현이 GitLab 내보내기(§9) 산출물과 일치 → "보이는 그대로 버전관리됨".

> 4·5는 §5 저장 흐름의 **"저장 전 미리보기"** 단계에서 함께 뜬다(확정 전 안전 확인). 평소엔 1·2·3으로 DB를 둘러본다.

---

## 6. 검증 & 동시편집

- **필수검증:** 폼에서 1차(저장 잠금) + 백엔드에서 2차(앱 신뢰 안 함). 둘 다 같은 메타데이터 기준.
- **낙관적 잠금(optimistic lock):** 행 로드 시 version을 들고 있다가, 저장 시 `WHERE id=? AND version=?`. 0행 갱신이면 = 그새 남이 고침 → 경고. 덮어쓰기 사고 방지.
- **편집 로그:** 모든 생성/수정/삭제가 sys_edit_log에 자동 기록(누가·전후).

---

## 7. 인증 (PIN)

- **ID** = `회사코드 + 6자리 사번` (예: `ACME-123456`).
- **PIN** = 6자리, 최초 `000000`.
- **최초 1회 강제 변경:** `must_change_pin=1`이면 로그인 직후 변경 팝업. 새 PIN을 [입력][다시 입력] 2칸으로 받아 **일치해야 저장**(오타 방지). 저장 시 해시화, `must_change_pin=0`.
- **저장:** PIN은 해시(예: bcrypt)로만 저장. 로그인한 id가 편집 로그의 `who`.
- **한계(명시):** 6자리 PIN은 사내 편의용 가벼운 잠금이지 강한 보안 아님. 추후 회사 SSO 연동 여지를 둠.

---

## 8. 마이그레이션 (ETL, 일회성)

기존 데이터를 새 DB로 **자동 이관**. 수동 입력 금지. `editor/migrate/`.

```
E 뽑기   기존 JSON 읽기
T 바꾸기 옛 필드 → 새 컬럼 매핑, 같은 스키마 규칙으로 검증
L 넣기   MySQL에 일괄 INSERT
```

**원천 매핑 (이미 만들어 둔 산출물 재사용):**
| 새 테이블 | 원천 |
|---|---|
| entities | character_master.json + graph/nodes_merged.jsonl (corpus/id_map.json으로 연결) |
| relations | graph/edges.jsonl (from·rel·to; 레지스트리로 역방향 보강) |
| timeline | corpus/entity_timeline.json |
| secrets | corpus/knowledge_state.json |

**빈 필수칸 정책:** 버리지 않고 다 넣되, 빈 필수칸이 있는 행은 `review_needed=1` 표시 → 편집기 "검토 필요" 목록에서 보완. (데이터 손실 0)

---

## 9. 내보내기 (Snowflake / GitLab)

- **Snowflake(올리기):** 내용 테이블(sys_ 제외)을 CSV/Parquet로 추출해 stage→COPY, 또는 Go gosnowflake 드라이버로 적재. 회사 공유·분석(iShare)용. 단방향 publish.
- **GitLab(버전관리):** 내용 테이블을 **텍스트(JSON/CSV/SQL)** 로 내보내 git에 커밋 → diff·협업. sys_edit_log를 changelog로 함께 둘 수 있음.
- 표준 SQL/JSON만 쓰므로 세 대상 모두 그대로 적재 가능.

---

## 10. 기술 스택 & 빌드

| 역할 | 선택 | 이유 |
|---|---|---|
| 데스크톱 셸 | **Wails v3**(또는 v2) | Go 백엔드+웹 폼, Win11 WebView2 사용 → EXE 8~15MB |
| DB 추상화 | Go **database/sql** | 드라이버 교체로 MySQL↔SQLite 같은 코드 |
| MySQL 드라이버 | go-sql-driver/mysql | 팀 기본 |
| SQLite 드라이버 | **modernc.org/sqlite** | cgo 불필요, 단일 정적 EXE |
| Snowflake | gosnowflake | 올리기 경로 전용 |
| 프론트 폼 | Svelte 또는 바닐라+Alpine | 스키마 읽어 폼 동적 생성 |
| 에셋 번들 | Go embed | 프론트를 EXE에 포함 |

- 산출물: **편집기 EXE 1개** + **데이터(MySQL 서버 / .db 파일)** 분리.
- 기존 Python 툴은 재사용하지 않음. id_map/timeline/chronology 로직은 **SQL 뷰/쿼리/제약으로 흡수**.

### 10.1 UI 구조: 도킹 패널 (확장 대비, 처음부터)

향후 그래프뷰·3D뷰 등을 **옆에 기워 넣고**, **화면 분할/플로팅/별도 창 분리**(VS Code·Blender식)가 가능하도록, 프론트를 **독립 패널 + 도킹 레이아웃**으로 설계한다.

- **패널을 독립 단위로:** 각 뷰(목록·편집폼·원문/Diff·영향 미리보기·향후 그래프뷰)는 자기 완결적 패널. 서로 잘 정의된 인터페이스로만 소통. (1파일 1역할 원칙과 일치)
- **도킹 동작:** 분할(split)·탭(tab)·플로팅(float)·**제목줄 드래그로 별도 OS 창 분리(detach)**. 멀티모니터 지원.
- **구현 토대:** 웹 도킹 라이브러리(예: dockview / golden-layout / rc-dock) + **Wails 멀티윈도우**(진짜 OS 창 분리)를 조합. → 이 도킹 요구가 **Wails(웹 UI) 채택을 강화**(Fyne은 도킹·분리창이 어려움).
- **v1 범위:** v1은 패널 2~3개(목록·편집폼·원문Diff)만 띄우되 **도킹 골격 위에서** 만든다. 새 뷰어는 나중에 **패널을 추가**하기만 하면 됨(UI 재작성 없음).

> 대안(Fyne, 의존성 0 단일 바이너리)은 도킹·분리창 지원이 약해 이 확장 방향과 맞지 않음 → **Wails 권장 확정**.

---

## 11. 프로젝트 구조

```
D:\DNF_storybuilder\
├─ corpus\, graph\, tools\ ...      (기존, 안 건드림 — 이관 원천으로만 사용)
└─ editor\                          ★ 새 폴더
   ├─ schema\      메타데이터: _base.json, _relations.json, character.json, item.json ...
   ├─ backend\     Go: DB추상화·DDL생성·CRUD·검증·관계양방향·편집로그·인증
   ├─ frontend\    폼 UI(스키마 읽어 자동 생성)
   ├─ migrate\     기존 corpus/graph → MySQL 일회성 ETL
   ├─ build\       EXE 산출물
   ├─ go.mod
   └─ wails.json
```

---

## 12. 범위 밖 / 추후

- 회사 SSO 연동(지금은 PIN).
- Snowflake 양방향 동기화(지금은 단방향 올리기).
- **스토리 시각화 뷰**(관계 그래프 노드-링크, 타임라인 시각화, 3D 뷰) — 이번엔 DB 에디터 뷰어(§5.5)만. 추후 **도킹 패널(§10.1)에 새 패널로 추가** — UI 재작성 없이 옆에 기워 넣음.
- 남은 동명이인/별칭 충돌 정리(기존 데이터 품질 — 이관과 별개).

---

## 13. 용어표 (쉬운 말 ↔ 정식용어)

| 쉬운 말 | 정식용어 (SQLD) |
|---|---|
| 그릇 | 테이블(Table) |
| 한 줄 = 캐릭터 하나 | 행(Row) |
| 입력칸 | 컬럼(Column) / 속성(Attribute) |
| 타입(인물·아이템) | 서브타입(Subtype) |
| 필수칸 | NOT NULL 제약조건 |
| 규칙서 | 메타데이터(Metadata) |
| 전체 구조 | 스키마(Schema) |
| 부품 조립 | 슈퍼타입–서브타입 + 관계 |

---

## 14. SP-1 범위 (다음 계획 대상)

이 문서 승인 후 **SP-1(스키마·DB 기초)** 부터 상세 계획을 쓴다:
- `editor/schema/` 정의 형식 + 로더
- 정의를 읽어 MySQL/SQLite 고정 테이블 DDL 생성
- database/sql 추상화 + 두 드라이버 연결 + 연결 테스트
- 산출: 빈 DB에 스키마가 서고, sys_schema_meta에 타입/필드가 채워진다(테스트 가능).
