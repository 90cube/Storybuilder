package schemadef

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// LoadRegistry는 dir 안의 정의 파일들을 읽어 Registry를 만든다.
// _base.json, _relations.json은 특수 처리, 그 외 *.json은 타입 정의로 본다.
func LoadRegistry(dir string) (*Registry, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("read dir: %w", err)
	}
	reg := &Registry{Types: map[string]TypeDef{}, Relations: map[string]string{}}

	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", e.Name(), err)
		}
		switch e.Name() {
		case "_base.json":
			if err := json.Unmarshal(raw, &reg.Base); err != nil {
				return nil, fmt.Errorf("parse _base.json: %w", err)
			}
		case "_relations.json":
			var rf RelationFile
			if err := json.Unmarshal(raw, &rf); err != nil {
				return nil, fmt.Errorf("parse _relations.json: %w", err)
			}
			for _, rd := range rf.Relations {
				reg.Relations[rd.Rel] = rd.Inverse
			}
		default:
			var td TypeDef
			if err := json.Unmarshal(raw, &td); err != nil {
				return nil, fmt.Errorf("parse %s: %w", e.Name(), err)
			}
			if td.Type == "" {
				return nil, fmt.Errorf("%s: type 비어있음", e.Name())
			}
			reg.Types[td.Type] = td
		}
	}
	return reg, nil
}
