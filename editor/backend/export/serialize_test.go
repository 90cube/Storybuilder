package export

import (
	"strings"
	"testing"
)

func TestToJSON(t *testing.T) {
	cols := []string{"id", "name"}
	rows := [][]any{{"h", "힐더"}, {"k", "칼릭스"}}
	s, err := ToJSON(cols, rows)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(s, `"name": "힐더"`) || !strings.Contains(s, `"id": "k"`) {
		t.Fatalf("json wrong:\n%s", s)
	}
}

func TestToCSV(t *testing.T) {
	cols := []string{"id", "name"}
	rows := [][]any{{"h", "힐더"}, {"k", nil}}
	s, err := ToCSV(cols, rows)
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimSpace(s), "\n")
	if len(lines) != 3 || !strings.HasPrefix(lines[0], "id,name") {
		t.Fatalf("csv header/row wrong:\n%s", s)
	}
	if !strings.Contains(lines[1], "힐더") {
		t.Fatalf("csv missing value:\n%s", s)
	}
}
