// Package export는 내용 테이블을 텍스트(JSON/CSV)로 내보낸다.
package export

import (
	"database/sql"
	"fmt"
)

// ContentTables는 내보낼 내용 테이블(sys_ 제외).
var ContentTables = []string{"entities", "relations", "timeline", "secrets"}

func allowed(table string) bool {
	for _, t := range ContentTables {
		if t == table {
			return true
		}
	}
	return false
}

// DumpTable은 화이트리스트 테이블의 컬럼명과 행들을 돌려준다.
// []byte 값은 문자열로 정규화한다(JSON/CSV 직렬화 안전).
func DumpTable(db *sql.DB, table string) (cols []string, rows [][]any, err error) {
	if !allowed(table) {
		return nil, nil, fmt.Errorf("허용되지 않은 테이블: %q", table)
	}
	rs, err := db.Query("SELECT * FROM " + table) //nolint:gosec // table은 화이트리스트
	if err != nil {
		return nil, nil, err
	}
	defer rs.Close()
	cols, err = rs.Columns()
	if err != nil {
		return nil, nil, err
	}
	for rs.Next() {
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rs.Scan(ptrs...); err != nil {
			return nil, nil, err
		}
		for i, v := range vals {
			if b, ok := v.([]byte); ok {
				vals[i] = string(b)
			}
		}
		rows = append(rows, vals)
	}
	return cols, rows, rs.Err()
}
