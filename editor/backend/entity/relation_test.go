package entity

import (
	"testing"

	"storybuilder-editor/backend/schemadef"
)

// relTestRegistry는 testRegistry에 관계 역방향을 더한다.
func relTestRegistry() *schemadef.Registry {
	r := testRegistry()
	r.Relations = map[string]string{"제자": "스승", "스승": "제자", "동맹": "동맹"}
	return r
}

func TestAddRelationBidirectional(t *testing.T) {
	reg := relTestRegistry()
	db := newTestDB(t, reg)

	if err := AddRelation(db, reg, "kalix", "제자", "hilder", "u"); err != nil {
		t.Fatalf("add: %v", err)
	}

	// 힐더 쪽에 역방향(스승->kalix)이 주입돼야 함
	hRels, err := ListRelations(db, "hilder")
	if err != nil {
		t.Fatal(err)
	}
	if len(hRels) != 1 || hRels[0].Rel != "스승" || hRels[0].ToID != "kalix" {
		t.Fatalf("hilder should have 스승->kalix, got %+v", hRels)
	}

	// 칼릭스 쪽 정방향
	kRels, err := ListRelations(db, "kalix")
	if err != nil {
		t.Fatal(err)
	}
	if len(kRels) != 1 || kRels[0].Rel != "제자" || kRels[0].ToID != "hilder" {
		t.Fatalf("kalix should have 제자->hilder, got %+v", kRels)
	}

	// 같은 pair_id로 묶여야 함
	if kRels[0].PairID != hRels[0].PairID {
		t.Fatalf("pair_id mismatch: %s vs %s", kRels[0].PairID, hRels[0].PairID)
	}

	// 편집로그 1줄(create, relations)
	var n int
	db.QueryRow(`SELECT count(*) FROM sys_edit_log WHERE action='create' AND target_table='relations'`).Scan(&n)
	if n != 1 {
		t.Fatalf("want 1 relation log, got %d", n)
	}
}

func TestAddRelationUnknownRel(t *testing.T) {
	reg := relTestRegistry()
	db := newTestDB(t, reg)
	if err := AddRelation(db, reg, "a", "냠냠", "b", "u"); err == nil {
		t.Fatal("unknown rel should error")
	}
}

func TestDeleteRelationRemovesPair(t *testing.T) {
	reg := relTestRegistry()
	db := newTestDB(t, reg)
	if err := AddRelation(db, reg, "kalix", "제자", "hilder", "u"); err != nil {
		t.Fatal(err)
	}
	kRels, _ := ListRelations(db, "kalix")
	pair := kRels[0].PairID

	if err := DeleteRelation(db, pair, "u"); err != nil {
		t.Fatalf("delete: %v", err)
	}
	// 양쪽 다 사라져야 함
	k, _ := ListRelations(db, "kalix")
	h, _ := ListRelations(db, "hilder")
	if len(k) != 0 || len(h) != 0 {
		t.Fatalf("both sides should be gone, got k=%d h=%d", len(k), len(h))
	}
	// 없는 pair 삭제 → ErrNotFound
	if err := DeleteRelation(db, "nope", "u"); err == nil {
		t.Fatal("deleting missing pair should error")
	}
}
