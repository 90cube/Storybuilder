package entity

import (
	"reflect"
	"testing"
)

func TestSecretRoundTrip(t *testing.T) {
	db := newTestDB(t, testRegistry())
	s := Secret{
		FactID:        "FACT_001",
		Summary:       "바칼은 살아있다",
		RevealAt:      "EVT_002",
		KnownBy:       []map[string]any{{"entity_id": "hilder", "awareness": "knows"}},
		HiddenFrom:    []string{"adventurers"},
		RelatedEvents: []string{"EVT_001", "EVT_002"},
	}
	if err := AddSecret(db, s); err != nil {
		t.Fatal(err)
	}
	got, err := GetSecret(db, "FACT_001")
	if err != nil {
		t.Fatal(err)
	}
	if got.Summary != s.Summary || got.RevealAt != "EVT_002" {
		t.Fatalf("scalar mismatch: %+v", got)
	}
	if !reflect.DeepEqual(got.HiddenFrom, []string{"adventurers"}) {
		t.Fatalf("hidden_from mismatch: %+v", got.HiddenFrom)
	}
	if len(got.KnownBy) != 1 || got.KnownBy[0]["entity_id"] != "hilder" {
		t.Fatalf("known_by mismatch: %+v", got.KnownBy)
	}
}
