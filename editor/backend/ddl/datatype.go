// Package ddl은 스키마 정의를 방언별 SQL DDL로 변환한다.
package ddl

// Dialect는 대상 DB 엔진.
type Dialect string

const (
	MySQL  Dialect = "mysql"
	SQLite Dialect = "sqlite"
)

// SQLType은 스키마 datatype을 방언별 SQL 컬럼 타입으로 바꾼다.
func SQLType(datatype string, d Dialect) string {
	switch datatype {
	case "string", "enum":
		if d == MySQL {
			return "VARCHAR(255)"
		}
		return "TEXT"
	case "text":
		return "TEXT"
	case "int":
		if d == MySQL {
			return "INT"
		}
		return "INTEGER"
	case "datetime":
		if d == MySQL {
			return "DATETIME"
		}
		return "TEXT"
	case "list", "object":
		if d == MySQL {
			return "JSON"
		}
		return "TEXT"
	default:
		return "TEXT"
	}
}
