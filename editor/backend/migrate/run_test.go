package migrate

import (
	"database/sql"
	"path/filepath"
	"testing"

	"storybuilder-editor/backend/schemadef"
	"storybuilder-editor/backend/store"
)

func migRegistry() *schemadef.Registry {
	return &schemadef.Registry{
		Base: schemadef.BaseDef{BaseFields: []schemadef.Field{
			{Key: "name", Datatype: "string", Required: true},
		}},
		Types: map[string]schemadef.TypeDef{
			"character": {Type: "character", Fields: []schemadef.Field{
				{Key: "summary", Datatype: "text", Required: true},
			}},
		},
		Relations: map[string]string{},
	}
}

func migDB(t *testing.T, reg *schemadef.Registry) *sql.DB {
	t.Helper()
	db, err := store.Open("sqlite", filepath.Join(t.TempDir(), "m.db"))
	if err != nil {
		t.Fatal(err)
	}
	if err := store.InitSchema(db, "sqlite", reg); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func TestRunImportsAndFlags(t *testing.T) {
	dir := t.TempDir()
	write(t, dir, "id_map.json", `[
	  {"canonical_id":"hilder","name":"힐더","type":"Character","graph_id":"hilder","in_graph":true,"in_corpus":true},
	  {"canonical_id":"naked","name":"무요약","type":"character","in_graph":false,"in_corpus":true}
	]`)
	write(t, dir, "edges.jsonl", "{\"from_id\":\"hilder\",\"rel\":\"소속됨\",\"to_id\":\"naked\"}\n")
	write(t, dir, "merged.jsonl", "{\"id\":\"hilder\",\"summary\":\"조율자\"}\n")
	write(t, dir, "timeline.json", `{"entities":{"hilder":{"name":"힐더","states":[{"order":977,"era":"977년","state":"각성"}]}}}`)
	write(t, dir, "secrets.json", `{"facts":[{"fact_id":"F1","summary":"비밀","reveal_to_reader_at_event":"EVT_002","hidden_from":["x"]}]}`)

	reg := migRegistry()
	db := migDB(t, reg)
	rep, err := Run(db, reg, Paths{
		IDMap:    filepath.Join(dir, "id_map.json"),
		Edges:    filepath.Join(dir, "edges.jsonl"),
		Merged:   filepath.Join(dir, "merged.jsonl"),
		Timeline: filepath.Join(dir, "timeline.json"),
		Secrets:  filepath.Join(dir, "secrets.json"),
	})
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if rep.Entities != 2 || rep.Relations != 1 || rep.Timeline != 1 || rep.Secrets != 1 {
		t.Fatalf("counts wrong: %+v", rep)
	}
	// hilder는 summary 붙어 review_needed=0, naked는 summary 없어 1
	if rep.ReviewNeeded != 1 {
		t.Fatalf("want 1 review_needed, got %d", rep.ReviewNeeded)
	}
	var rn int
	db.QueryRow(`SELECT review_needed FROM entities WHERE id='naked'`).Scan(&rn)
	if rn != 1 {
		t.Fatalf("naked should be flagged")
	}
}
