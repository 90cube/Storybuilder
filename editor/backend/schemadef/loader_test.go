package schemadef

import (
	"os"
	"path/filepath"
	"testing"
)

func writeFile(t *testing.T, dir, name, body string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, name), []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestLoadRegistry(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "_base.json", `{"base_fields":[{"key":"name","datatype":"string","required":true}]}`)
	writeFile(t, dir, "_relations.json", `{"relations":[{"rel":"제자","inverse":"스승"}]}`)
	writeFile(t, dir, "character.json", `{"type":"character","label":"인물","fields":[{"key":"summary","datatype":"text","required":true}]}`)

	reg, err := LoadRegistry(dir)
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if len(reg.Base.BaseFields) != 1 || reg.Base.BaseFields[0].Key != "name" {
		t.Fatalf("base wrong: %+v", reg.Base)
	}
	if _, ok := reg.Types["character"]; !ok {
		t.Fatalf("type character missing: %+v", reg.Types)
	}
	if inv, ok := reg.Inverse("제자"); !ok || inv != "스승" {
		t.Fatalf("inverse wrong: %q %v", inv, ok)
	}
}
