package entity

import (
	"testing"

	"storybuilder-editor/backend/schemadef"
)

// testRegistry는 검증·CRUD 테스트 공용 레지스트리.
func testRegistry() *schemadef.Registry {
	return &schemadef.Registry{
		Base: schemadef.BaseDef{BaseFields: []schemadef.Field{
			{Key: "name", Datatype: "string", Required: true},
			{Key: "type", Datatype: "string", Required: true, System: true},
		}},
		Types: map[string]schemadef.TypeDef{
			"character": {Type: "character", Fields: []schemadef.Field{
				{Key: "summary", Datatype: "text", Required: true},
				{Key: "personality", Datatype: "string"},
			}},
		},
		Relations: map[string]string{},
	}
}

func TestRequiredMissing(t *testing.T) {
	reg := testRegistry()

	miss := RequiredMissing(reg, Entity{Type: "character"})
	if len(miss) != 2 {
		t.Fatalf("want [name summary], got %v", miss)
	}

	full := Entity{Name: "칼릭스", Type: "character", Data: map[string]any{"summary": "검사"}}
	if m := RequiredMissing(reg, full); len(m) != 0 {
		t.Fatalf("want none, got %v", m)
	}
}
