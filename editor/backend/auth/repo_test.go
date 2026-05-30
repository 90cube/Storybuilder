package auth

import (
	"database/sql"
	"errors"
	"path/filepath"
	"testing"

	"storybuilder-editor/backend/schemadef"
	"storybuilder-editor/backend/store"
)

func authTestDB(t *testing.T) *sql.DB {
	t.Helper()
	p := filepath.Join(t.TempDir(), "a.db")
	db, err := store.Open("sqlite", p)
	if err != nil {
		t.Fatal(err)
	}
	reg := &schemadef.Registry{Types: map[string]schemadef.TypeDef{}, Relations: map[string]string{}}
	if err := store.InitSchema(db, "sqlite", reg); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func TestCreateAndAuthenticateDefaultPIN(t *testing.T) {
	db := authTestDB(t)
	if err := CreateUser(db, "ACME-123456"); err != nil {
		t.Fatal(err)
	}
	// 최초 000000 로그인 → mustChange true
	mustChange, err := Authenticate(db, "ACME-123456", "000000")
	if err != nil {
		t.Fatalf("auth: %v", err)
	}
	if !mustChange {
		t.Fatal("first login must require PIN change")
	}
	// 틀린 PIN
	if _, err := Authenticate(db, "ACME-123456", "111111"); !errors.Is(err, ErrAuthFailed) {
		t.Fatalf("want ErrAuthFailed, got %v", err)
	}
	// 중복 생성
	if err := CreateUser(db, "ACME-123456"); !errors.Is(err, ErrUserExists) {
		t.Fatalf("want ErrUserExists, got %v", err)
	}
	// 잘못된 ID
	if err := CreateUser(db, "bad"); !errors.Is(err, ErrBadID) {
		t.Fatalf("want ErrBadID, got %v", err)
	}
}

func TestChangePIN(t *testing.T) {
	db := authTestDB(t)
	CreateUser(db, "ACME-123456")

	// 새 PIN 두 입력 불일치
	if err := ChangePIN(db, "ACME-123456", "000000", "111111", "222222"); !errors.Is(err, ErrPINMismatch) {
		t.Fatalf("want ErrPINMismatch, got %v", err)
	}
	// 정상 변경
	if err := ChangePIN(db, "ACME-123456", "000000", "111111", "111111"); err != nil {
		t.Fatalf("change: %v", err)
	}
	// 새 PIN으로 로그인 → mustChange false
	mc, err := Authenticate(db, "ACME-123456", "111111")
	if err != nil || mc {
		t.Fatalf("after change: mc=%v err=%v", mc, err)
	}
	// 옛 PIN은 실패
	if _, err := Authenticate(db, "ACME-123456", "000000"); !errors.Is(err, ErrAuthFailed) {
		t.Fatalf("old pin should fail, got %v", err)
	}
}
