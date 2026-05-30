package store

import (
	"database/sql"
	"fmt"

	"storybuilder-editor/backend/ddl"
	"storybuilder-editor/backend/schemadef"
)

func b2i(b bool) int {
	if b {
		return 1
	}
	return 0
}

// InitSchema는 고정 테이블을 만들고, 정의(base+types)를 sys_schema_meta에 기록한다.
// 재실행 안전(IF NOT EXISTS + meta 재적재).
func InitSchema(db *sql.DB, dialect string, reg *schemadef.Registry) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	for _, stmt := range ddl.GenerateDDL(ddl.Dialect(dialect)) {
		if _, err := tx.Exec(stmt); err != nil {
			return fmt.Errorf("ddl: %w", err)
		}
	}

	if _, err := tx.Exec(`DELETE FROM sys_schema_meta`); err != nil {
		return fmt.Errorf("clear meta: %w", err)
	}

	insert := func(typ string, f schemadef.Field) error {
		_, err := tx.Exec(
			`INSERT INTO sys_schema_meta (type, field_key, datatype, required, is_system) VALUES (?,?,?,?,?)`,
			typ, f.Key, f.Datatype, b2i(f.Required), b2i(f.System),
		)
		return err
	}

	for _, f := range reg.Base.BaseFields {
		if err := insert("_base", f); err != nil {
			return fmt.Errorf("meta base: %w", err)
		}
	}
	for typ, td := range reg.Types {
		for _, f := range td.Fields {
			if err := insert(typ, f); err != nil {
				return fmt.Errorf("meta %s: %w", typ, err)
			}
		}
	}
	return tx.Commit()
}
