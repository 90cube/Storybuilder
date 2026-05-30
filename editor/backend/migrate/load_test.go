package migrate

import (
	"os"
	"path/filepath"
	"testing"
)

func write(t *testing.T, dir, name, body string) string {
	t.Helper()
	p := filepath.Join(dir, name)
	if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestLoadIDMapAndEdges(t *testing.T) {
	dir := t.TempDir()
	idp := write(t, dir, "id_map.json",
		`[{"canonical_id":"hilder","name":"힐더","type":"Character","graph_id":"hilder","aliases":["우는눈"],"in_graph":true,"in_corpus":true}]`)
	ep := write(t, dir, "edges.jsonl",
		"{\"from_id\":\"a\",\"rel\":\"소속됨\",\"to_id\":\"b\"}\n{\"from_id\":\"c\",\"rel\":\"관련됨\",\"to_id\":\"d\"}\n")

	ids, err := LoadIDMap(idp)
	if err != nil {
		t.Fatal(err)
	}
	if len(ids) != 1 || ids[0].CanonicalID != "hilder" || ids[0].Name != "힐더" {
		t.Fatalf("idmap wrong: %+v", ids)
	}

	edges, err := LoadEdges(ep)
	if err != nil {
		t.Fatal(err)
	}
	if len(edges) != 2 || edges[0].Rel != "소속됨" || edges[1].ToID != "d" {
		t.Fatalf("edges wrong: %+v", edges)
	}
}
