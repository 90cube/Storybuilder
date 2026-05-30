// Package entity는 entities 테이블의 CRUD·검증·편집로그를 담당한다.
package entity

import (
	"encoding/json"
	"time"
)

// Entity는 한 엔티티(행). 타입별 필드는 Data(JSON 컬럼)에 들어간다.
type Entity struct {
	ID           string
	Name         string
	Type         string
	Tags         []string
	Data         map[string]any
	Provenance   string
	ReviewNeeded bool
	Version      int
	UpdatedAt    time.Time
	UpdatedBy    string
}

// marshalJSON은 값을 JSON 문자열로 만든다(JSON 컬럼 저장용).
func marshalJSON(v any) (string, error) {
	b, err := json.Marshal(v)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// unmarshalJSON은 JSON 문자열을 dst로 푼다. 빈 문자열은 no-op.
func unmarshalJSON(s string, dst any) error {
	if s == "" {
		return nil
	}
	return json.Unmarshal([]byte(s), dst)
}

func b2i(b bool) int {
	if b {
		return 1
	}
	return 0
}
