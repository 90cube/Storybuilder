package schemadef

import (
	"encoding/json"
	"testing"
)

func TestTypeDefUnmarshal(t *testing.T) {
	src := `{"type":"character","label":"인물","fields":[{"key":"summary","datatype":"text","required":true}],"mixins":["relations"]}`
	var td TypeDef
	if err := json.Unmarshal([]byte(src), &td); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if td.Type != "character" || td.Label != "인물" {
		t.Fatalf("got %+v", td)
	}
	if len(td.Fields) != 1 || td.Fields[0].Key != "summary" || !td.Fields[0].Required {
		t.Fatalf("fields wrong: %+v", td.Fields)
	}
	if len(td.Mixins) != 1 || td.Mixins[0] != "relations" {
		t.Fatalf("mixins wrong: %+v", td.Mixins)
	}
}
