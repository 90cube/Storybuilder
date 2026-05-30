package entity

import (
	"errors"
	"testing"
)

func TestCreateInsertsAndLogs(t *testing.T) {
	reg := testRegistry()
	db := newTestDB(t, reg)
	e := Entity{ID: "kalix", Name: "칼릭스", Type: "character", Data: map[string]any{"summary": "검사"}}
	if err := Create(db, reg, e, "ACME-000001"); err != nil {
		t.Fatalf("create: %v", err)
	}
	got, err := Get(db, "kalix")
	if err != nil {
		t.Fatal(err)
	}
	if got.Version != 1 || got.Name != "칼릭스" || got.Provenance != "authored" {
		t.Fatalf("got %+v", got)
	}
	var n int
	if err := db.QueryRow(`SELECT count(*) FROM sys_edit_log WHERE action='create' AND target_id='kalix'`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("want 1 create log, got %d", n)
	}
}

func TestCreateValidationBlocks(t *testing.T) {
	reg := testRegistry()
	db := newTestDB(t, reg)
	err := Create(db, reg, Entity{ID: "x", Type: "character"}, "u") // name·summary 없음
	var ve *ValidationError
	if !errors.As(err, &ve) {
		t.Fatalf("want ValidationError, got %v", err)
	}
}
