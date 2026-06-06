package entity

import "database/sql"

// Secret은 비밀 한 건과 인지상태.
type Secret struct {
	FactID        string
	Summary       string
	RevealAt      string
	KnownBy       []map[string]any
	HiddenFrom    []string
	RelatedEvents []string
}

// AddSecret은 비밀 한 건을 저장한다.
func AddSecret(db *sql.DB, s Secret) error {
	kb, err := marshalJSON(s.KnownBy)
	if err != nil {
		return err
	}
	hf, err := marshalJSON(s.HiddenFrom)
	if err != nil {
		return err
	}
	re, err := marshalJSON(s.RelatedEvents)
	if err != nil {
		return err
	}
	_, err = db.Exec(`INSERT INTO secrets (fact_id,summary,reveal_to_reader_at,known_by,hidden_from,related_events)
	  VALUES (?,?,?,?,?,?)`, s.FactID, s.Summary, s.RevealAt, kb, hf, re)
	return err
}

// GetSecret은 factID로 비밀을 읽는다. 없으면 ErrNotFound.
func GetSecret(db *sql.DB, factID string) (Secret, error) {
	var s Secret
	var kb, hf, re string
	row := db.QueryRow(`SELECT fact_id,summary,reveal_to_reader_at,known_by,hidden_from,related_events
	  FROM secrets WHERE fact_id=?`, factID)
	err := row.Scan(&s.FactID, &s.Summary, &s.RevealAt, &kb, &hf, &re)
	if err == sql.ErrNoRows {
		return s, ErrNotFound
	}
	if err != nil {
		return s, err
	}
	if err := unmarshalJSON(kb, &s.KnownBy); err != nil {
		return s, err
	}
	if err := unmarshalJSON(hf, &s.HiddenFrom); err != nil {
		return s, err
	}
	if err := unmarshalJSON(re, &s.RelatedEvents); err != nil {
		return s, err
	}
	return s, nil
}

// ListSecrets는 모든 비밀을 돌려준다.
func ListSecrets(db *sql.DB) ([]Secret, error) {
	rows, err := db.Query(`SELECT fact_id,summary,reveal_to_reader_at,known_by,hidden_from,related_events FROM secrets`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Secret
	for rows.Next() {
		var s Secret
		var kb, hf, re string
		if err := rows.Scan(&s.FactID, &s.Summary, &s.RevealAt, &kb, &hf, &re); err != nil {
			return nil, err
		}
		if err := unmarshalJSON(kb, &s.KnownBy); err != nil {
			return nil, err
		}
		if err := unmarshalJSON(hf, &s.HiddenFrom); err != nil {
			return nil, err
		}
		if err := unmarshalJSON(re, &s.RelatedEvents); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}
