package migrate

import "testing"

func TestEntityFromIDMap(t *testing.T) {
	s := "hilder"
	e := EntityFromIDMap(IDMapEntry{
		CanonicalID: "hilder", Name: "힐더", Type: "Character",
		GraphID: &s, Aliases: []string{"우는눈"},
	}, map[string]string{"hilder": "마계의 조율자"})

	if e.ID != "hilder" || e.Name != "힐더" || e.Type != "character" {
		t.Fatalf("scalar wrong: %+v", e)
	}
	if e.Provenance != "imported" {
		t.Fatalf("provenance: %s", e.Provenance)
	}
	if e.Data["summary"] != "마계의 조율자" {
		t.Fatalf("summary not attached: %v", e.Data["summary"])
	}
}

func TestRelationFromEdgeMapsSlug(t *testing.T) {
	canon := map[string]string{"slug_a": "canon_a", "slug_b": "canon_b"}
	r := RelationFromEdge(Edge{FromID: "slug_a", Rel: "소속됨", ToID: "slug_b"}, canon)
	if r.FromID != "canon_a" || r.ToID != "canon_b" || r.Rel != "소속됨" {
		t.Fatalf("edge map wrong: %+v", r)
	}
	// 매핑 없으면 원본 유지
	r2 := RelationFromEdge(Edge{FromID: "x", Rel: "r", ToID: "y"}, canon)
	if r2.FromID != "x" || r2.ToID != "y" {
		t.Fatalf("unmapped should keep original: %+v", r2)
	}
}
