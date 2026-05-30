package export

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// ExportAll은 내용 테이블별로 {table}.json/.csv를 outDir에 쓰고,
// Snowflake 적재용 snowflake_load.sql도 만든다. 테이블별 행 수를 돌려준다.
func ExportAll(db *sql.DB, outDir string) (map[string]int, error) {
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return nil, err
	}
	counts := map[string]int{}
	var loadSQL strings.Builder
	loadSQL.WriteString("-- Snowflake 적재: 각 CSV를 stage에 올린 뒤 실행\n")

	for _, table := range ContentTables {
		cols, rows, err := DumpTable(db, table)
		if err != nil {
			return nil, err
		}
		jsonStr, err := ToJSON(cols, rows)
		if err != nil {
			return nil, err
		}
		csvStr, err := ToCSV(cols, rows)
		if err != nil {
			return nil, err
		}
		if err := os.WriteFile(filepath.Join(outDir, table+".json"), []byte(jsonStr), 0o644); err != nil {
			return nil, err
		}
		if err := os.WriteFile(filepath.Join(outDir, table+".csv"), []byte(csvStr), 0o644); err != nil {
			return nil, err
		}
		counts[table] = len(rows)
		loadSQL.WriteString(fmt.Sprintf(
			"COPY INTO %s FROM @my_stage/%s.csv FILE_FORMAT=(TYPE=CSV SKIP_HEADER=1 FIELD_OPTIONALLY_ENCLOSED_BY='\"');\n",
			table, table))
	}

	if err := os.WriteFile(filepath.Join(outDir, "snowflake_load.sql"), []byte(loadSQL.String()), 0o644); err != nil {
		return nil, err
	}
	return counts, nil
}
