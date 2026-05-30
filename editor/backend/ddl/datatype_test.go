package ddl

import "testing"

func TestSQLType(t *testing.T) {
	cases := []struct {
		datatype string
		dialect  Dialect
		want     string
	}{
		{"string", SQLite, "TEXT"},
		{"string", MySQL, "VARCHAR(255)"},
		{"text", MySQL, "TEXT"},
		{"int", SQLite, "INTEGER"},
		{"int", MySQL, "INT"},
		{"datetime", MySQL, "DATETIME"},
		{"list", MySQL, "JSON"},
		{"list", SQLite, "TEXT"},
		{"enum", MySQL, "VARCHAR(255)"},
	}
	for _, c := range cases {
		if got := SQLType(c.datatype, c.dialect); got != c.want {
			t.Errorf("SQLType(%q,%v)=%q want %q", c.datatype, c.dialect, got, c.want)
		}
	}
}
