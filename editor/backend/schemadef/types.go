// Package schemadef는 editor/schema의 JSON 정의(메타데이터)를 표현·로드한다.
package schemadef

// Field는 컬럼(속성) 하나의 정의.
type Field struct {
	Key      string   `json:"key"`
	Label    string   `json:"label"`
	Datatype string   `json:"datatype"`
	Required bool     `json:"required"`
	System   bool     `json:"system"`
	Values   []string `json:"values,omitempty"`
	Default  string   `json:"default,omitempty"`
}

// BaseDef는 _base.json (모든 타입 공통 필드).
type BaseDef struct {
	BaseFields []Field `json:"base_fields"`
}

// TypeDef는 한 타입(서브타입) 정의 파일.
type TypeDef struct {
	Type   string   `json:"type"`
	Label  string   `json:"label"`
	Fields []Field  `json:"fields"`
	Mixins []string `json:"mixins"`
}

// RelationDef는 관계어 하나와 역방향.
type RelationDef struct {
	Rel     string `json:"rel"`
	Inverse string `json:"inverse"`
}

// RelationFile은 _relations.json.
type RelationFile struct {
	Relations []RelationDef `json:"relations"`
}

// Registry는 로드된 전체 스키마(메타데이터).
type Registry struct {
	Base      BaseDef
	Types     map[string]TypeDef
	Relations map[string]string // rel -> inverse
}

// Inverse는 관계어의 역방향을 돌려준다.
func (r *Registry) Inverse(rel string) (string, bool) {
	inv, ok := r.Relations[rel]
	return inv, ok
}
