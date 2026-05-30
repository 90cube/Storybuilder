package entity

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"time"
)

// Get은 id로 엔티티 한 건을 읽는다. 없으면 ErrNotFound.
func Get(db *sql.DB, id string) (Entity, error) {
	var e Entity
	var tags, data, updatedAt string
	var review int
	row := db.QueryRow(`SELECT id,name,type,tags,data,provenance,review_needed,version,updated_at,updated_by
	  FROM entities WHERE id=?`, id)
	err := row.Scan(&e.ID, &e.Name, &e.Type, &tags, &data, &e.Provenance, &review, &e.Version, &updatedAt, &e.UpdatedBy)
	if errors.Is(err, sql.ErrNoRows) {
		return e, ErrNotFound
	}
	if err != nil {
		return e, err
	}
	e.ReviewNeeded = review != 0
	if updatedAt != "" {
		e.UpdatedAt, _ = time.Parse(time.RFC3339, updatedAt)
	}
	if err := unmarshalJSON(tags, &e.Tags); err != nil {
		return e, err
	}
	if err := unmarshalJSON(data, &e.Data); err != nil {
		return e, err
	}
	return e, nil
}

// newLogID는 편집로그용 짧은 고유 id.
func newLogID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// writeLog는 sys_edit_log에 변경 1줄을 기록한다(같은 트랜잭션 내).
func writeLog(tx *sql.Tx, who, action, table, targetID string, changes map[string]any, versionAfter int) error {
	cj, err := marshalJSON(changes)
	if err != nil {
		return err
	}
	_, err = tx.Exec(`INSERT INTO sys_edit_log
	  (log_id, at, who, action, target_table, target_id, changes, version_after)
	  VALUES (?,?,?,?,?,?,?,?)`,
		newLogID(), time.Now().UTC().Format(time.RFC3339), who, action, table, targetID, cj, versionAfter)
	return err
}
