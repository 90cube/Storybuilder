package auth

import "golang.org/x/crypto/bcrypt"

// HashPIN은 PIN을 bcrypt 해시로 만든다.
func HashPIN(pin string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(pin), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// VerifyPIN은 해시와 PIN이 맞으면 true.
func VerifyPIN(hash, pin string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(pin)) == nil
}
