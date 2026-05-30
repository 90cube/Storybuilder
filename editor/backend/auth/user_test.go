package auth

import "testing"

func TestValidateID(t *testing.T) {
	ok := []string{"ACME-123456", "AB-000001", "COMPANY-999999"}
	for _, id := range ok {
		if err := ValidateID(id); err != nil {
			t.Errorf("%q should be valid: %v", id, err)
		}
	}
	bad := []string{"acme-123456", "ACME-12345", "ACME-1234567", "ACME123456", "-123456", "ACME-12a456"}
	for _, id := range bad {
		if err := ValidateID(id); err == nil {
			t.Errorf("%q should be invalid", id)
		}
	}
}
