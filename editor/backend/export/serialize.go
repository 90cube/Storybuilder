package export

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"strings"
)

// ToJSON은 cols+rows를 [{col:val}] JSON 문자열로 만든다(들여쓰기).
func ToJSON(cols []string, rows [][]any) (string, error) {
	out := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		m := make(map[string]any, len(cols))
		for i, c := range cols {
			m[c] = r[i]
		}
		out = append(out, m)
	}
	b, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// ToCSV는 cols 헤더 + 행들을 CSV 문자열로 만든다(nil은 빈칸).
func ToCSV(cols []string, rows [][]any) (string, error) {
	var sb strings.Builder
	w := csv.NewWriter(&sb)
	if err := w.Write(cols); err != nil {
		return "", err
	}
	for _, r := range rows {
		rec := make([]string, len(r))
		for i, v := range r {
			if v == nil {
				rec[i] = ""
			} else {
				rec[i] = fmt.Sprintf("%v", v)
			}
		}
		if err := w.Write(rec); err != nil {
			return "", err
		}
	}
	w.Flush()
	return sb.String(), w.Error()
}
