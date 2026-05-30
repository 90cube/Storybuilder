// Package auth는 PIN 기반 로그인(sys_users)을 담당한다.
package auth

import (
	"errors"
	"regexp"
)

// DefaultPIN은 신규 계정의 최초 PIN. 첫 로그인 시 강제 변경된다.
const DefaultPIN = "000000"

// idPattern: 영문 대문자 2~10자 회사코드 - 6자리 사번.
var idPattern = regexp.MustCompile(`^[A-Z]{2,10}-\d{6}$`)

// ErrBadID는 ID 형식 오류.
var ErrBadID = errors.New("ID 형식 오류: 회사코드(영문 대문자 2~10)-6자리 사번 (예: ACME-123456)")

// ValidateID는 ID 형식을 검사한다.
func ValidateID(id string) error {
	if !idPattern.MatchString(id) {
		return ErrBadID
	}
	return nil
}
