package entity

import (
	"errors"
	"fmt"
	"strings"
)

// ErrVersionConflict는 낙관적 잠금 충돌(다른 사용자가 먼저 수정).
var ErrVersionConflict = errors.New("버전 충돌: 다른 사용자가 먼저 수정했습니다")

// ErrNotFound는 대상 엔티티 없음.
var ErrNotFound = errors.New("엔티티를 찾을 수 없습니다")

// ValidationError는 필수칸 누락.
type ValidationError struct {
	Missing []string
}

func (e *ValidationError) Error() string {
	return fmt.Sprintf("필수 입력 누락: %s", strings.Join(e.Missing, ", "))
}
