# SP-1: 스키마·DB 기초 (Foundation) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `editor/schema/`의 JSON 타입 정의를 읽어, MySQL/SQLite에 고정 테이블(entities·relations·timeline·secrets·sys_*)을 만들고 `sys_schema_meta`에 타입/필드를 채우는 토대를 만든다.

**Architecture:** Go + `database/sql`(드라이버 교체로 엔진 독립). 스키마 정의(JSON)를 로드 → 데이터타입을 방언별 SQL로 매핑 → 고정 테이블 DDL 생성·적용 → 정의를 `sys_schema_meta`에 기록. 테스트는 순수 Go SQLite(modernc, in-memory)로 서버 없이 수행.

**Tech Stack:** Go 1.22+, `database/sql`, `modernc.org/sqlite`(테스트·로컬), `github.com/go-sql-driver/mysql`(팀), 표준 `encoding/json`·`testing`.

---

## 파일 구조 (이 SP에서 만드는 것)

```
editor/
├─ go.mod                                  모듈 정의
├─ schema/
│  ├─ _base.json                           공통 필드 정의
│  ├─ _relations.json                      관계 역방향 레지스트리
│  └─ character.json                        예시 타입(인물)
├─ backend/
│  ├─ schemadef/
│  │  ├─ types.go                          정의 구조체 (Field/TypeDef/Registry)
│  │  ├─ types_test.go
│  │  ├─ loader.go                         디렉터리에서 정의 로드
│  │  └─ loader_test.go
│  ├─ ddl/
│  │  ├─ datatype.go                       datatype → 방언별 SQL 타입
│  │  ├─ datatype_test.go
│  │  ├─ generate.go                       고정 테이블 CREATE 문 생성
│  │  └─ generate_test.go
│  └─ store/
│     ├─ db.go                             database/sql 열기 (방언별 드라이버)
│     ├─ db_test.go
│     ├─ migrate.go                        DDL 적용 + sys_schema_meta 채움
│     └─ migrate_test.go
└─ cmd/
   └─ schema-init/
      └─ main.go                           엔트리: DB 하나 초기화
```

각 파일은 단일 책임. 정의(schemadef) / DDL 생성(ddl) / 영속·연결(store) / 엔트리(cmd) 분리.

---

## Task 0: 프로젝트 스캐폴드

**Files:**
- Create: `editor/go.mod`
- Create: `editor/schema/_base.json`
- Create: `editor/schema/_relations.json`
- Create: `editor/schema/character.json`

- [ ] **Step 1: go.mod 생성**

Run: `cd editor && go mod init storybuilder-editor`
Expected: `editor/go.mod` 생성됨 (`module storybuilder-editor`).

- [ ] **Step 2: 드라이버 의존성 추가**

Run:
```bash
cd editor && go get modernc.org/sqlite@latest && go get github.com/go-sql-driver/mysql@latest
```
Expected: `go.mod`에 두 의존성, `go.sum` 생성.

- [ ] **Step 3: 스키마 정의 파일 3개 작성**

`editor/schema/_base.json`:
```json
{
  "base_fields": [
    { "key": "id",         "label": "ID",   "datatype": "string", "required": true,  "system": true },
    { "key": "name",       "label": "이름", "datatype": "string", "required": true },
    { "key": "type",       "label": "타입", "datatype": "string", "required": true,  "system": true },
    { "key": "tags",       "label": "태그", "datatype": "list" },
    { "key": "provenance", "label": "출처", "datatype": "enum", "values": ["authored","imported"], "default": "authored", "system": true }
  ]
}
```

`editor/schema/_relations.json`:
```json
{
  "relations": [
    { "rel": "제자",   "inverse": "스승" },
    { "rel": "스승",   "inverse": "제자" },
    { "rel": "소속",   "inverse": "구성원" },
    { "rel": "동맹",   "inverse": "동맹" }
  ]
}
```

`editor/schema/character.json`:
```json
{
  "type": "character",
  "label": "인물",
  "fields": [
    { "key": "summary",     "label": "한줄요약", "datatype": "text",   "required": true },
    { "key": "personality", "label": "성격",     "datatype": "string", "required": false },
    { "key": "traits",      "label": "특성",     "datatype": "list",   "required": false }
  ],
  "mixins": ["relations", "timeline", "secrets"]
}
```

- [ ] **Step 4: 빌드 확인**

Run: `cd editor && go build ./...`
Expected: 에러 없음(아직 Go 소스 없음 → "no Go files"는 무시, go.mod 유효).

- [ ] **Step 5: Commit**

```bash
git add editor/go.mod editor/go.sum editor/schema/
git commit -m "chore(sp1): scaffold editor module and schema definition files"
```

---

## Task 1: 스키마 정의 구조체

**Files:**
- Create: `editor/backend/schemadef/types.go`
- Test: `editor/backend/schemadef/types_test.go`

- [ ] **Step 1: 실패 테스트 작성**

`editor/backend/schemadef/types_test.go`:
```go
package schemadef

import (
	"encoding/json"
	"testing"
)

func TestTypeDefUnmarshal(t *testing.T) {
	src := `{"type":"character","label":"인물","fields":[{"key":"summary","datatype":"text","required":true}],"mixins":["relations"]}`
	var td TypeDef
	if err := json.Unmarshal([]byte(src), &td); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if td.Type != "character" || td.Label != "인물" {
		t.Fatalf("got %+v", td)
	}
	if len(td.Fields) != 1 || td.Fields[0].Key != "summary" || !td.Fields[0].Required {
		t.Fatalf("fields wrong: %+v", td.Fields)
	}
	if len(td.Mixins) != 1 || td.Mixins[0] != "relations" {
		t.Fatalf("mixins wrong: %+v", td.Mixins)
	}
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd editor && go test ./backend/schemadef/ -run TestTypeDefUnmarshal -v`
Expected: FAIL (`undefined: TypeDef`).

- [ ] **Step 3: 구조체 구현**

`editor/backend/schemadef/types.go`:
```go
// Package schemadef는 editor/schema의 JSON 정의(메타데이터)를 표현·로드한다.
package schemadef

// Field는 컬럼(속성) 하나의 정의.
type Field struct {
	Key      string   `json:"key"`
	Label    string   `json:"label"`
	Datatype string   `json:"datatype"`
	Required bool     `json:"required"`
	System   bool     `json:"system"`
	Values   []string `json:"values,omitempty"`
	Default  string   `json:"default,omitempty"`
}

// BaseDef는 _base.json (모든 타입 공통 필드).
type BaseDef struct {
	BaseFields []Field `json:"base_fields"`
}

// TypeDef는 한 타입(서브타입) 정의 파일.
type TypeDef struct {
	Type   string   `json:"type"`
	Label  string   `json:"label"`
	Fields []Field  `json:"fields"`
	Mixins []string `json:"mixins"`
}

// RelationDef는 관계어 하나와 역방향.
type RelationDef struct {
	Rel     string `json:"rel"`
	Inverse string `json:"inverse"`
}

// RelationFile은 _relations.json.
type RelationFile struct {
	Relations []RelationDef `json:"relations"`
}

// Registry는 로드된 전체 스키마(메타데이터).
type Registry struct {
	Base      BaseDef
	Types     map[string]TypeDef
	Relations map[string]string // rel -> inverse
}

// Inverse는 관계어의 역방향을 돌려준다.
func (r *Registry) Inverse(rel string) (string, bool) {
	inv, ok := r.Relations[rel]
	return inv, ok
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd editor && go test ./backend/schemadef/ -run TestTypeDefUnmarshal -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add editor/backend/schemadef/types.go editor/backend/schemadef/types_test.go
git commit -m "feat(sp1): schema definition structs"
```

---

## Task 2: 정의 로더 (디렉터리 → Registry)

**Files:**
- Create: `editor/backend/schemadef/loader.go`
- Test: `editor/backend/schemadef/loader_test.go`

- [ ] **Step 1: 실패 테스트 작성**

`editor/backend/schemadef/loader_test.go`:
```go
package schemadef

import (
	"os"
	"path/filepath"
	"testing"
)

func writeFile(t *testing.T, dir, name, body string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, name), []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestLoadRegistry(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "_base.json", `{"base_fields":[{"key":"name","datatype":"string","required":true}]}`)
	writeFile(t, dir, "_relations.json", `{"relations":[{"rel":"제자","inverse":"스승"}]}`)
	writeFile(t, dir, "character.json", `{"type":"character","label":"인물","fields":[{"key":"summary","datatype":"text","required":true}]}`)

	reg, err := LoadRegistry(dir)
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if len(reg.Base.BaseFields) != 1 || reg.Base.BaseFields[0].Key != "name" {
		t.Fatalf("base wrong: %+v", reg.Base)
	}
	if _, ok := reg.Types["character"]; !ok {
		t.Fatalf("type character missing: %+v", reg.Types)
	}
	if inv, ok := reg.Inverse("제자"); !ok || inv != "스승" {
		t.Fatalf("inverse wrong: %q %v", inv, ok)
	}
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd editor && go test ./backend/schemadef/ -run TestLoadRegistry -v`
Expected: FAIL (`undefined: LoadRegistry`).

- [ ] **Step 3: 로더 구현**

`editor/backend/schemadef/loader.go`:
```go
package schemadef

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// LoadRegistry는 dir 안의 정의 파일들을 읽어 Registry를 만든다.
// _base.json, _relations.json은 특수 처리, 그 외 *.json은 타입 정의로 본다.
func LoadRegistry(dir string) (*Registry, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("read dir: %w", err)
	}
	reg := &Registry{Types: map[string]TypeDef{}, Relations: map[string]string{}}

	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", e.Name(), err)
		}
		switch e.Name() {
		case "_base.json":
			if err := json.Unmarshal(raw, &reg.Base); err != nil {
				return nil, fmt.Errorf("parse _base.json: %w", err)
			}
		case "_relations.json":
			var rf RelationFile
			if err := json.Unmarshal(raw, &rf); err != nil {
				return nil, fmt.Errorf("parse _relations.json: %w", err)
			}
			for _, rd := range rf.Relations {
				reg.Relations[rd.Rel] = rd.Inverse
			}
		default:
			var td TypeDef
			if err := json.Unmarshal(raw, &td); err != nil {
				return nil, fmt.Errorf("parse %s: %w", e.Name(), err)
			}
			if td.Type == "" {
				return nil, fmt.Errorf("%s: type 비어있음", e.Name())
			}
			reg.Types[td.Type] = td
		}
	}
	return reg, nil
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd editor && go test ./backend/schemadef/ -v`
Expected: PASS (두 테스트 모두).

- [ ] **Step 5: Commit**

```bash
git add editor/backend/schemadef/loader.go editor/backend/schemadef/loader_test.go
git commit -m "feat(sp1): load schema definitions from directory"
```

---

## Task 3: 데이터타입 → 방언별 SQL 매핑

**Files:**
- Create: `editor/backend/ddl/datatype.go`
- Test: `editor/backend/ddl/datatype_test.go`

- [ ] **Step 1: 실패 테스트 작성**

`editor/backend/ddl/datatype_test.go`:
```go
package ddl

import "testing"

func TestSQLType(t *testing.T) {
	cases := []struct {
		datatype string
		dialect  Dialect
		want     string
	}{
		{"string", SQLite, "TEXT"},
		{"string", MySQL, "VARCHAR(255)"},
		{"text", MySQL, "TEXT"},
		{"int", SQLite, "INTEGER"},
		{"int", MySQL, "INT"},
		{"datetime", MySQL, "DATETIME"},
		{"list", MySQL, "JSON"},
		{"list", SQLite, "TEXT"},
		{"enum", MySQL, "VARCHAR(255)"},
	}
	for _, c := range cases {
		if got := SQLType(c.datatype, c.dialect); got != c.want {
			t.Errorf("SQLType(%q,%v)=%q want %q", c.datatype, c.dialect, got, c.want)
		}
	}
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd editor && go test ./backend/ddl/ -run TestSQLType -v`
Expected: FAIL (`undefined: Dialect`).

- [ ] **Step 3: 매핑 구현**

`editor/backend/ddl/datatype.go`:
```go
// Package ddl은 스키마 정의를 방언별 SQL DDL로 변환한다.
package ddl

// Dialect는 대상 DB 엔진.
type Dialect string

const (
	MySQL  Dialect = "mysql"
	SQLite Dialect = "sqlite"
)

// SQLType은 스키마 datatype을 방언별 SQL 컬럼 타입으로 바꾼다.
func SQLType(datatype string, d Dialect) string {
	switch datatype {
	case "string", "enum":
		if d == MySQL {
			return "VARCHAR(255)"
		}
		return "TEXT"
	case "text":
		return "TEXT"
	case "int":
		if d == MySQL {
			return "INT"
		}
		return "INTEGER"
	case "datetime":
		if d == MySQL {
			return "DATETIME"
		}
		return "TEXT"
	case "list", "object":
		if d == MySQL {
			return "JSON"
		}
		return "TEXT"
	default:
		return "TEXT"
	}
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd editor && go test ./backend/ddl/ -run TestSQLType -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add editor/backend/ddl/datatype.go editor/backend/ddl/datatype_test.go
git commit -m "feat(sp1): datatype to dialect SQL mapping"
```

---

## Task 4: 고정 테이블 DDL 생성

**Files:**
- Create: `editor/backend/ddl/generate.go`
- Test: `editor/backend/ddl/generate_test.go`

고정 테이블 7개를 생성한다. 타입별 필드는 `entities.data`(JSON 컬럼)에 들어가므로 타입이 늘어도 DDL은 불변.

- [ ] **Step 1: 실패 테스트 작성**

`editor/backend/ddl/generate_test.go`:
```go
package ddl

import (
	"strings"
	"testing"
)

func TestGenerateDDLTables(t *testing.T) {
	stmts := GenerateDDL(SQLite)
	joined := strings.Join(stmts, "\n")
	for _, tbl := range []string{
		"entities", "relations", "timeline", "secrets",
		"sys_edit_log", "sys_users", "sys_schema_meta",
	} {
		if !strings.Contains(joined, "CREATE TABLE IF NOT EXISTS "+tbl) {
			t.Errorf("missing table %q in DDL", tbl)
		}
	}
}

func TestGenerateDDLDialectType(t *testing.T) {
	my := strings.Join(GenerateDDL(MySQL), "\n")
	if !strings.Contains(my, "data JSON") {
		t.Errorf("MySQL entities.data should be JSON, got:\n%s", my)
	}
	lite := strings.Join(GenerateDDL(SQLite), "\n")
	if !strings.Contains(lite, "data TEXT") {
		t.Errorf("SQLite entities.data should be TEXT")
	}
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd editor && go test ./backend/ddl/ -run TestGenerateDDL -v`
Expected: FAIL (`undefined: GenerateDDL`).

- [ ] **Step 3: DDL 생성 구현**

`editor/backend/ddl/generate.go`:
```go
package ddl

import "fmt"

// GenerateDDL은 고정 테이블들의 CREATE TABLE 문 목록을 방언에 맞춰 만든다.
// 타입별 필드는 entities.data(JSON)에 저장하므로 타입 추가 시에도 변하지 않는다.
func GenerateDDL(d Dialect) []string {
	s := func(dt string) string { return SQLType(dt, d) }

	return []string{
		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS entities (
  id %s PRIMARY KEY,
  name %s NOT NULL,
  type %s NOT NULL,
  tags %s,
  data %s,
  provenance %s,
  review_needed %s,
  version %s,
  updated_at %s,
  updated_by %s
)`, s("string"), s("string"), s("string"), s("list"), s("list"),
			s("string"), s("int"), s("int"), s("datetime"), s("string")),

		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS relations (
  id %s PRIMARY KEY,
  from_id %s NOT NULL,
  rel %s NOT NULL,
  to_id %s NOT NULL,
  pair_id %s,
  version %s,
  updated_at %s,
  updated_by %s
)`, s("string"), s("string"), s("string"), s("string"), s("string"),
			s("int"), s("datetime"), s("string")),

		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS timeline (
  id %s PRIMARY KEY,
  entity_id %s NOT NULL,
  order_key %s,
  era %s,
  event_ref %s,
  phase %s,
  state %s,
  traits %s,
  source %s
)`, s("string"), s("string"), s("int"), s("string"), s("string"),
			s("string"), s("text"), s("list"), s("string")),

		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS secrets (
  fact_id %s PRIMARY KEY,
  summary %s,
  reveal_to_reader_at %s,
  known_by %s,
  hidden_from %s,
  related_events %s
)`, s("string"), s("text"), s("string"), s("list"), s("list"), s("list")),

		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS sys_edit_log (
  log_id %s PRIMARY KEY,
  at %s,
  who %s,
  action %s,
  target_table %s,
  target_id %s,
  changes %s,
  version_after %s
)`, s("string"), s("datetime"), s("string"), s("string"), s("string"),
			s("string"), s("object"), s("int")),

		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS sys_users (
  id %s PRIMARY KEY,
  pin_hash %s,
  must_change_pin %s,
  created_at %s,
  last_login %s
)`, s("string"), s("string"), s("int"), s("datetime"), s("datetime")),

		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS sys_schema_meta (
  type %s,
  field_key %s,
  datatype %s,
  required %s,
  is_system %s
)`, s("string"), s("string"), s("string"), s("int"), s("int")),
	}
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd editor && go test ./backend/ddl/ -v`
Expected: PASS (3개 테스트).

- [ ] **Step 5: Commit**

```bash
git add editor/backend/ddl/generate.go editor/backend/ddl/generate_test.go
git commit -m "feat(sp1): generate fixed-table DDL per dialect"
```

---

## Task 5: DB 연결 (database/sql, 방언별 드라이버)

**Files:**
- Create: `editor/backend/store/db.go`
- Test: `editor/backend/store/db_test.go`

- [ ] **Step 1: 실패 테스트 작성**

`editor/backend/store/db_test.go`:
```go
package store

import "testing"

func TestOpenSQLiteMemoryPings(t *testing.T) {
	db, err := Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer db.Close()
	if err := db.Ping(); err != nil {
		t.Fatalf("ping: %v", err)
	}
}

func TestOpenUnknownDialect(t *testing.T) {
	if _, err := Open("oracle", "x"); err == nil {
		t.Fatal("expected error for unknown dialect")
	}
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd editor && go test ./backend/store/ -run TestOpen -v`
Expected: FAIL (`undefined: Open`).

- [ ] **Step 3: 연결 구현**

`editor/backend/store/db.go`:
```go
// Package store는 database/sql 기반 DB 연결·영속을 담당한다.
package store

import (
	"database/sql"
	"fmt"

	_ "github.com/go-sql-driver/mysql"
	_ "modernc.org/sqlite"
)

// Open은 방언에 맞는 드라이버로 DB를 연다.
// dialect: "sqlite" | "mysql". dsn은 각 드라이버 형식.
func Open(dialect, dsn string) (*sql.DB, error) {
	var driver string
	switch dialect {
	case "sqlite":
		driver = "sqlite"
	case "mysql":
		driver = "mysql"
	default:
		return nil, fmt.Errorf("unknown dialect: %s", dialect)
	}
	db, err := sql.Open(driver, dsn)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", dialect, err)
	}
	return db, nil
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd editor && go test ./backend/store/ -run TestOpen -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add editor/backend/store/db.go editor/backend/store/db_test.go
git commit -m "feat(sp1): database/sql connection with sqlite and mysql drivers"
```

---

## Task 6: DDL 적용 + sys_schema_meta 채우기

**Files:**
- Create: `editor/backend/store/migrate.go`
- Test: `editor/backend/store/migrate_test.go`

- [ ] **Step 1: 실패 테스트 작성**

`editor/backend/store/migrate_test.go`:
```go
package store

import (
	"os"
	"path/filepath"
	"testing"

	"storybuilder-editor/backend/schemadef"
)

func loadFixtureRegistry(t *testing.T) *schemadef.Registry {
	t.Helper()
	dir := t.TempDir()
	must := func(name, body string) {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	must("_base.json", `{"base_fields":[{"key":"name","datatype":"string","required":true}]}`)
	must("_relations.json", `{"relations":[{"rel":"제자","inverse":"스승"}]}`)
	must("character.json", `{"type":"character","label":"인물","fields":[{"key":"summary","datatype":"text","required":true}]}`)
	reg, err := schemadef.LoadRegistry(dir)
	if err != nil {
		t.Fatal(err)
	}
	return reg
}

func TestInitSchemaCreatesTablesAndMeta(t *testing.T) {
	// 주의: database/sql 풀은 ":memory:"에 연결마다 별도 DB를 만들어
	// 테이블이 안 보인다. 임시 파일 DB를 쓴다.
	dbPath := filepath.Join(t.TempDir(), "init_test.db")
	db, err := Open("sqlite", dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	reg := loadFixtureRegistry(t)

	if err := InitSchema(db, "sqlite", reg); err != nil {
		t.Fatalf("init: %v", err)
	}

	// entities 테이블 존재 확인
	var n int
	if err := db.QueryRow(`SELECT count(*) FROM entities`).Scan(&n); err != nil {
		t.Fatalf("entities not queryable: %v", err)
	}

	// sys_schema_meta에 character.summary(required) 기록 확인
	var req int
	err = db.QueryRow(
		`SELECT required FROM sys_schema_meta WHERE type=? AND field_key=?`,
		"character", "summary",
	).Scan(&req)
	if err != nil {
		t.Fatalf("schema_meta missing summary: %v", err)
	}
	if req != 1 {
		t.Fatalf("summary should be required(1), got %d", req)
	}
}
```

- [ ] **Step 2: 실패 확인**

Run: `cd editor && go test ./backend/store/ -run TestInitSchema -v`
Expected: FAIL (`undefined: InitSchema`).

- [ ] **Step 3: 마이그레이션 구현**

`editor/backend/store/migrate.go`:
```go
package store

import (
	"database/sql"
	"fmt"

	"storybuilder-editor/backend/ddl"
	"storybuilder-editor/backend/schemadef"
)

func b2i(b bool) int {
	if b {
		return 1
	}
	return 0
}

// InitSchema는 고정 테이블을 만들고, 정의(base+types)를 sys_schema_meta에 기록한다.
// 재실행 안전(IF NOT EXISTS + meta 재적재).
func InitSchema(db *sql.DB, dialect string, reg *schemadef.Registry) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	for _, stmt := range ddl.GenerateDDL(ddl.Dialect(dialect)) {
		if _, err := tx.Exec(stmt); err != nil {
			return fmt.Errorf("ddl: %w", err)
		}
	}

	if _, err := tx.Exec(`DELETE FROM sys_schema_meta`); err != nil {
		return fmt.Errorf("clear meta: %w", err)
	}

	insert := func(typ string, f schemadef.Field) error {
		_, err := tx.Exec(
			`INSERT INTO sys_schema_meta (type, field_key, datatype, required, is_system) VALUES (?,?,?,?,?)`,
			typ, f.Key, f.Datatype, b2i(f.Required), b2i(f.System),
		)
		return err
	}

	for _, f := range reg.Base.BaseFields {
		if err := insert("_base", f); err != nil {
			return fmt.Errorf("meta base: %w", err)
		}
	}
	for typ, td := range reg.Types {
		for _, f := range td.Fields {
			if err := insert(typ, f); err != nil {
				return fmt.Errorf("meta %s: %w", typ, err)
			}
		}
	}
	return tx.Commit()
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd editor && go test ./backend/store/ -v`
Expected: PASS (연결·마이그레이션 테스트 모두).

- [ ] **Step 5: Commit**

```bash
git add editor/backend/store/migrate.go editor/backend/store/migrate_test.go
git commit -m "feat(sp1): apply DDL and populate sys_schema_meta"
```

---

## Task 7: 엔트리 — schema-init 명령

**Files:**
- Create: `editor/cmd/schema-init/main.go`

빈 SQLite 파일에 스키마를 세우는 실행 파일. 수동 점검·SP-6 이관의 출발점.

- [ ] **Step 1: 엔트리 구현**

`editor/cmd/schema-init/main.go`:
```go
// schema-init은 editor/schema 정의를 읽어 대상 DB에 스키마를 세운다.
// 사용: schema-init -dialect sqlite -dsn ./garasa.db -schema ./schema
package main

import (
	"flag"
	"log"

	"storybuilder-editor/backend/schemadef"
	"storybuilder-editor/backend/store"
)

func main() {
	dialect := flag.String("dialect", "sqlite", "sqlite | mysql")
	dsn := flag.String("dsn", "./garasa.db", "데이터 소스 이름")
	schemaDir := flag.String("schema", "./schema", "스키마 정의 폴더")
	flag.Parse()

	reg, err := schemadef.LoadRegistry(*schemaDir)
	if err != nil {
		log.Fatalf("스키마 로드 실패: %v", err)
	}
	db, err := store.Open(*dialect, *dsn)
	if err != nil {
		log.Fatalf("DB 열기 실패: %v", err)
	}
	defer db.Close()
	if err := store.InitSchema(db, *dialect, reg); err != nil {
		log.Fatalf("스키마 초기화 실패: %v", err)
	}
	log.Printf("완료: %s 에 스키마 생성 (타입 %d개)", *dsn, len(reg.Types))
}
```

- [ ] **Step 2: 빌드 확인**

Run: `cd editor && go build ./...`
Expected: 에러 없음.

- [ ] **Step 3: 실제 실행 점검 (수동)**

Run: `cd editor && go run ./cmd/schema-init -dialect sqlite -dsn ./test_garasa.db -schema ./schema`
Expected 출력: `완료: ./test_garasa.db 에 스키마 생성 (타입 1개)`. `editor/test_garasa.db` 파일 생성됨.

- [ ] **Step 4: 생성 결과 확인 (수동)**

Run: `cd editor && go run ./cmd/schema-init -dialect sqlite -dsn ./test_garasa.db -schema ./schema` (재실행 — 재실행 안전 확인)
Expected: 동일 출력, 에러 없음(IF NOT EXISTS + meta 재적재).

- [ ] **Step 5: 정리 + Commit**

```bash
cd editor && rm -f test_garasa.db
git add editor/cmd/schema-init/main.go
git commit -m "feat(sp1): schema-init entrypoint to bootstrap a database"
```

---

## Task 8: 전체 테스트 + SP-1 마무리

- [ ] **Step 1: 전체 테스트**

Run: `cd editor && go test ./... -v`
Expected: 모든 패키지 PASS.

- [ ] **Step 2: go vet**

Run: `cd editor && go vet ./...`
Expected: 경고 없음.

- [ ] **Step 3: 빌드 산출 확인**

Run: `cd editor && go build ./...`
Expected: 에러 없음.

- [ ] **Step 4: Commit (있으면)**

```bash
git add -A editor/
git commit -m "chore(sp1): finalize schema-db foundation" || echo "nothing to commit"
```

---

## SP-1 완료 기준 (Definition of Done)

- [ ] `go test ./...` 전부 통과
- [ ] `schema-init`로 빈 SQLite에 7개 고정 테이블 생성됨
- [ ] `sys_schema_meta`에 base + 타입 필드가 required/system 플래그와 함께 기록됨
- [ ] 새 타입 추가 = `editor/schema/`에 JSON 파일 1개 추가 → 재실행만으로 반영(DDL 불변 확인)
- [ ] MySQL 경로는 `Open("mysql", dsn)`로 동일 코드 연결(서버 있을 때 통합 점검; 단위 테스트는 SQLite)

## 다음 SP

SP-2(CRUD 코어 + 편집로그): entities 생성·조회·수정·삭제, 필수검증(sys_schema_meta 기준), version 낙관적 잠금, sys_edit_log 자동 기록.
