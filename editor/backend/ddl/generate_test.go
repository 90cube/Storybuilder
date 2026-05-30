package ddl

import (
	"strings"
	"testing"
)

func TestGenerateDDLTables(t *testing.T) {
	stmts := GenerateDDL(SQLite)
	joined := strings.Join(stmts, "\n")
	for _, tbl := range []string{
		"entities", "relations", "timeline", "secrets",
		"sys_edit_log", "sys_users", "sys_schema_meta",
	} {
		if !strings.Contains(joined, "CREATE TABLE IF NOT EXISTS "+tbl) {
			t.Errorf("missing table %q in DDL", tbl)
		}
	}
}

func TestGenerateDDLDialectType(t *testing.T) {
	my := strings.Join(GenerateDDL(MySQL), "\n")
	if !strings.Contains(my, "data JSON") {
		t.Errorf("MySQL entities.data should be JSON, got:\n%s", my)
	}
	lite := strings.Join(GenerateDDL(SQLite), "\n")
	if !strings.Contains(lite, "data TEXT") {
		t.Errorf("SQLite entities.data should be TEXT")
	}
}
