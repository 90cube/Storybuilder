package entity

import (
	"database/sql"
	"errors"
	"path/filepath"
	"testing"

	"storybuilder-editor/backend/schemadef"
	"storybuilder-editor/backend/store"
)

// newTestDB는 임시 파일 SQLite에 스키마를 세워 돌려준다.
func newTestDB(t *testing.T, reg *schemadef.Registry) *sql.DB {
	t.Helper()
	p := filepath.Join(t.TempDir(), "t.db")
	db, err := store.Open("sqlite", p)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.InitSchema(db, "sqlite", reg); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func TestGetParsesRow(t *testing.T) {
	reg := testRegistry()
	db := newTestDB(t, reg)
	_, err := db.Exec(`INSERT INTO entities
	  (id,name,type,tags,data,provenance,review_needed,version,updated_at,updated_by)
	  VALUES ('h','힐더','character','["사도"]','{"summary":"조율자"}','authored',0,1,'2026-05-30T00:00:00Z','u')`)
	if err != nil {
		t.Fatal(err)
	}
	e, err := Get(db, "h")
	if err != nil {
		t.Fatal(err)
	}
	if e.Name != "힐더" || e.Version != 1 || len(e.Tags) != 1 || e.Data["summary"] != "조율자" {
		t.Fatalf("parsed wrong: %+v", e)
	}
	if _, err := Get(db, "nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("want ErrNotFound, got %v", err)
	}
}
