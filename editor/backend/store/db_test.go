package store

import "testing"

func TestOpenSQLiteMemoryPings(t *testing.T) {
	db, err := Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer db.Close()
	if err := db.Ping(); err != nil {
		t.Fatalf("ping: %v", err)
	}
}

func TestOpenUnknownDialect(t *testing.T) {
	if _, err := Open("oracle", "x"); err == nil {
		t.Fatal("expected error for unknown dialect")
	}
}
