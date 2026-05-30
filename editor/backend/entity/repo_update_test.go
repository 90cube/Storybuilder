package entity

import (
	"errors"
	"testing"
)

func TestUpdateVersionAndLog(t *testing.T) {
	reg := testRegistry()
	db := newTestDB(t, reg)
	if err := Create(db, reg, Entity{ID: "k", Name: "칼릭스", Type: "character",
		Data: map[string]any{"summary": "검사"}}, "u"); err != nil {
		t.Fatal(err)
	}

	upd := Entity{ID: "k", Name: "칼릭스", Type: "character", Data: map[string]any{"summary": "대검사"}}
	if err := Update(db, reg, upd, 1, "u2"); err != nil {
		t.Fatalf("update: %v", err)
	}
	got, _ := Get(db, "k")
	if got.Version != 2 || got.Data["summary"] != "대검사" {
		t.Fatalf("got %+v", got)
	}

	// 오래된 버전(1)으로 다시 시도 → 충돌
	if err := Update(db, reg, upd, 1, "u2"); !errors.Is(err, ErrVersionConflict) {
		t.Fatalf("want conflict, got %v", err)
	}

	var n int
	db.QueryRow(`SELECT count(*) FROM sys_edit_log WHERE action='update' AND target_id='k'`).Scan(&n)
	if n != 1 {
		t.Fatalf("want 1 update log, got %d", n)
	}
}
