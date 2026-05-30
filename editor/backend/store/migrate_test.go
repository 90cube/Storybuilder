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
