package export

import (
	"os"
	"path/filepath"
	"testing"
)

func TestExportAllWritesFiles(t *testing.T) {
	db := expDB(t)
	db.Exec(`INSERT INTO entities (id,name,type,version) VALUES ('h','힐더','character',1)`)

	out := t.TempDir()
	rep, err := ExportAll(db, out)
	if err != nil {
		t.Fatal(err)
	}
	if rep["entities"] != 1 {
		t.Fatalf("want 1 entity exported, got %d", rep["entities"])
	}
	for _, f := range []string{"entities.json", "entities.csv", "relations.json", "snowflake_load.sql"} {
		if _, err := os.Stat(filepath.Join(out, f)); err != nil {
			t.Fatalf("missing file %s: %v", f, err)
		}
	}
	// sys_ 테이블은 안 나옴
	if _, err := os.Stat(filepath.Join(out, "sys_users.json")); err == nil {
		t.Fatal("sys_ table should not be exported")
	}
}
