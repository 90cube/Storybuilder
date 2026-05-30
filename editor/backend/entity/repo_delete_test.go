package entity

import (
	"errors"
	"testing"
)

func TestDeleteAndConflict(t *testing.T) {
	reg := testRegistry()
	db := newTestDB(t, reg)
	if err := Create(db, reg, Entity{ID: "d", Name: "X", Type: "character",
		Data: map[string]any{"summary": "s"}}, "u"); err != nil {
		t.Fatal(err)
	}

	if err := Delete(db, "d", 1, "u"); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, err := Get(db, "d"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("should be gone, got %v", err)
	}

	// 이미 삭제됨 → 충돌
	if err := Delete(db, "d", 1, "u"); !errors.Is(err, ErrVersionConflict) {
		t.Fatalf("want conflict, got %v", err)
	}

	var n int
	db.QueryRow(`SELECT count(*) FROM sys_edit_log WHERE action='delete' AND target_id='d'`).Scan(&n)
	if n != 1 {
		t.Fatalf("want 1 delete log, got %d", n)
	}
}
