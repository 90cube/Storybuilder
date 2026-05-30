package entity

import "storybuilder-editor/backend/schemadef"

// RequiredMissing은 필수이면서 비어있는 필드 key 목록을 돌려준다.
// 시스템 필드(id·type·provenance 등)는 자동 설정이므로 검사하지 않는다.
func RequiredMissing(reg *schemadef.Registry, e Entity) []string {
	var missing []string
	check := func(f schemadef.Field) {
		if !f.Required || f.System {
			return
		}
		switch f.Key {
		case "name":
			if e.Name == "" {
				missing = append(missing, "name")
			}
		case "type":
			if e.Type == "" {
				missing = append(missing, "type")
			}
		default:
			if isEmpty(e.Data[f.Key]) {
				missing = append(missing, f.Key)
			}
		}
	}
	for _, f := range reg.Base.BaseFields {
		check(f)
	}
	if td, ok := reg.Types[e.Type]; ok {
		for _, f := range td.Fields {
			check(f)
		}
	}
	return missing
}

func isEmpty(v any) bool {
	if v == nil {
		return true
	}
	if s, ok := v.(string); ok {
		return s == ""
	}
	return false
}
