package auth

import "testing"

func TestHashAndVerifyPIN(t *testing.T) {
	h, err := HashPIN("123456")
	if err != nil {
		t.Fatal(err)
	}
	if h == "123456" {
		t.Fatal("hash must not equal raw pin")
	}
	if !VerifyPIN(h, "123456") {
		t.Fatal("correct pin should verify")
	}
	if VerifyPIN(h, "000000") {
		t.Fatal("wrong pin should not verify")
	}
}
