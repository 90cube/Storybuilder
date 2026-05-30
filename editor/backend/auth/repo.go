package auth

import (
	"database/sql"
	"errors"
	"time"
)

// ErrAuthFailed는 ID/PIN 불일치.
var ErrAuthFailed = errors.New("ID 또는 PIN이 올바르지 않습니다")

// ErrPINMismatch는 새 PIN 두 입력 불일치.
var ErrPINMismatch = errors.New("새 PIN 두 입력이 일치하지 않습니다")

// ErrUserExists는 ID 중복.
var ErrUserExists = errors.New("이미 존재하는 ID입니다")

// CreateUser는 기본 PIN(000000)·must_change=1로 계정을 만든다.
func CreateUser(db *sql.DB, id string) error {
	if err := ValidateID(id); err != nil {
		return err
	}
	var existing string
	err := db.QueryRow(`SELECT id FROM sys_users WHERE id=?`, id).Scan(&existing)
	if err == nil {
		return ErrUserExists
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	hash, err := HashPIN(DefaultPIN)
	if err != nil {
		return err
	}
	_, err = db.Exec(`INSERT INTO sys_users (id,pin_hash,must_change_pin,created_at,last_login)
	  VALUES (?,?,?,?,?)`, id, hash, 1, time.Now().UTC().Format(time.RFC3339), "")
	return err
}

// Authenticate는 ID+PIN을 검증한다. 성공 시 PIN 변경 필요 여부를 반환.
func Authenticate(db *sql.DB, id, pin string) (mustChange bool, err error) {
	var hash string
	var mc int
	e := db.QueryRow(`SELECT pin_hash,must_change_pin FROM sys_users WHERE id=?`, id).Scan(&hash, &mc)
	if errors.Is(e, sql.ErrNoRows) {
		return false, ErrAuthFailed
	}
	if e != nil {
		return false, e
	}
	if !VerifyPIN(hash, pin) {
		return false, ErrAuthFailed
	}
	_, _ = db.Exec(`UPDATE sys_users SET last_login=? WHERE id=?`,
		time.Now().UTC().Format(time.RFC3339), id)
	return mc != 0, nil
}

// ChangePIN은 old PIN 검증 + new==confirm 후 PIN을 교체하고 must_change=0으로 만든다.
func ChangePIN(db *sql.DB, id, oldPIN, newPIN, confirm string) error {
	if newPIN != confirm {
		return ErrPINMismatch
	}
	if _, err := Authenticate(db, id, oldPIN); err != nil {
		return err
	}
	hash, err := HashPIN(newPIN)
	if err != nil {
		return err
	}
	_, err = db.Exec(`UPDATE sys_users SET pin_hash=?, must_change_pin=0 WHERE id=?`, hash, id)
	return err
}
