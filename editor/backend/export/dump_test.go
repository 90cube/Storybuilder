package export

import (
	"database/sql"
	"path/filepath"
	"testing"

	"storybuilder-editor/backend/schemadef"
	"storybuilder-editor/backend/store"
)

func expDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := store.Open("sqlite", filepath.Join(t.TempDir(), "e.db"))
	if err != nil {
		t.Fatal(err)
	}
	reg := &schemadef.Registry{Types: map[string]schemadef.TypeDef{}, Relations: map[string]string{}}
	if err := store.InitSchema(db, "sqlite", reg); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func TestDumpTable(t *testing.T) {
	db := expDB(t)
	_, err := db.Exec(`INSERT INTO entities (id,name,type,version) VALUES ('h','힐더','character',1)`)
	if err != nil {
		t.Fatal(err)
	}
	cols, rows, err := DumpTable(db, "entities")
	if err != nil {
		t.Fatal(err)
	}
	if len(cols) == 0 || len(rows) != 1 {
		t.Fatalf("want 1 row, got cols=%v rows=%d", cols, len(rows))
	}
	// id 컬럼 값이 문자열 'h'
	idx := -1
	for i, c := range cols {
		if c == "id" {
			idx = i
		}
	}
	if idx < 0 || rows[0][idx] != "h" {
		t.Fatalf("id not found or wrong: %v", rows[0])
	}
}

func TestDumpTableRejectsUnknown(t *testing.T) {
	db := expDB(t)
	if _, _, err := DumpTable(db, "evil; DROP TABLE entities"); err == nil {
		t.Fatal("non-whitelisted table should error")
	}
}
