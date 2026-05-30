package entity

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"reflect"
	"time"

	"storybuilder-editor/backend/schemadef"
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

// Create는 새 엔티티를 만든다. 필수칸 누락이면 ValidationError.
func Create(db *sql.DB, reg *schemadef.Registry, e Entity, who string) error {
	if miss := RequiredMissing(reg, e); len(miss) > 0 {
		return &ValidationError{Missing: miss}
	}
	if e.Provenance == "" {
		e.Provenance = "authored"
	}
	e.Version = 1
	e.UpdatedAt = time.Now().UTC()
	e.UpdatedBy = who

	tags, err := marshalJSON(e.Tags)
	if err != nil {
		return err
	}
	data, err := marshalJSON(e.Data)
	if err != nil {
		return err
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	_, err = tx.Exec(`INSERT INTO entities
	  (id,name,type,tags,data,provenance,review_needed,version,updated_at,updated_by)
	  VALUES (?,?,?,?,?,?,?,?,?,?)`,
		e.ID, e.Name, e.Type, tags, data, e.Provenance, b2i(e.ReviewNeeded),
		e.Version, e.UpdatedAt.Format(time.RFC3339), e.UpdatedBy)
	if err != nil {
		return fmt.Errorf("insert: %w", err)
	}
	if err := writeLog(tx, who, "create", "entities", e.ID,
		map[string]any{"name": e.Name, "type": e.Type, "data": e.Data}, 1); err != nil {
		return err
	}
	return tx.Commit()
}

// Update는 expectedVersion이 현재 버전과 같을 때만 수정한다(낙관적 잠금).
// 다르면 ErrVersionConflict. 변경분을 update 로그로 남긴다.
func Update(db *sql.DB, reg *schemadef.Registry, e Entity, expectedVersion int, who string) error {
	if miss := RequiredMissing(reg, e); len(miss) > 0 {
		return &ValidationError{Missing: miss}
	}
	old, err := Get(db, e.ID)
	if err != nil {
		return err
	}
	if e.Provenance == "" {
		e.Provenance = old.Provenance
	}
	newVersion := expectedVersion + 1
	e.UpdatedAt = time.Now().UTC()
	e.UpdatedBy = who

	tags, err := marshalJSON(e.Tags)
	if err != nil {
		return err
	}
	data, err := marshalJSON(e.Data)
	if err != nil {
		return err
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	res, err := tx.Exec(`UPDATE entities
	  SET name=?,type=?,tags=?,data=?,provenance=?,review_needed=?,version=?,updated_at=?,updated_by=?
	  WHERE id=? AND version=?`,
		e.Name, e.Type, tags, data, e.Provenance, b2i(e.ReviewNeeded),
		newVersion, e.UpdatedAt.Format(time.RFC3339), who, e.ID, expectedVersion)
	if err != nil {
		return fmt.Errorf("update: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrVersionConflict
	}
	if err := writeLog(tx, who, "update", "entities", e.ID, diffEntities(old, e), newVersion); err != nil {
		return err
	}
	return tx.Commit()
}

// diffEntities는 바뀐 필드만 {필드:[전,후]}로 돌려준다.
func diffEntities(old, neu Entity) map[string]any {
	ch := map[string]any{}
	if old.Name != neu.Name {
		ch["name"] = []any{old.Name, neu.Name}
	}
	for k, nv := range neu.Data {
		if ov, ok := old.Data[k]; !ok || !reflect.DeepEqual(ov, nv) {
			ch["data."+k] = []any{old.Data[k], nv}
		}
	}
	for k, ov := range old.Data {
		if _, ok := neu.Data[k]; !ok {
			ch["data."+k] = []any{ov, nil}
		}
	}
	return ch
}

// Delete는 expectedVersion이 맞을 때만 삭제한다. 다르거나 없으면 ErrVersionConflict.
func Delete(db *sql.DB, id string, expectedVersion int, who string) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	res, err := tx.Exec(`DELETE FROM entities WHERE id=? AND version=?`, id, expectedVersion)
	if err != nil {
		return fmt.Errorf("delete: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrVersionConflict
	}
	if err := writeLog(tx, who, "delete", "entities", id,
		map[string]any{"deleted": true}, expectedVersion); err != nil {
		return err
	}
	return tx.Commit()
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
