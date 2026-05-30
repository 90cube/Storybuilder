package entity

import (
	"database/sql"
	"fmt"
	"time"

	"storybuilder-editor/backend/schemadef"
)

// Relation은 관계 한 줄(정방향 또는 역방향). 정/역은 같은 PairID로 묶인다.
type Relation struct {
	ID        string
	FromID    string
	Rel       string
	ToID      string
	PairID    string
	Version   int
	UpdatedBy string
}

// AddRelation은 from-rel-to 와 역방향 to-inverse-from 을 한 트랜잭션으로 넣는다.
// 관계어가 레지스트리에 없으면 에러. = "관계된 캐릭터에도 주입".
func AddRelation(db *sql.DB, reg *schemadef.Registry, fromID, rel, toID, who string) error {
	inv, ok := reg.Inverse(rel)
	if !ok {
		return fmt.Errorf("알 수 없는 관계어: %s (레지스트리에 없음)", rel)
	}
	pairID := newLogID()
	now := time.Now().UTC().Format(time.RFC3339)

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	ins := func(f, r, t string) error {
		_, e := tx.Exec(`INSERT INTO relations (id,from_id,rel,to_id,pair_id,version,updated_at,updated_by)
		  VALUES (?,?,?,?,?,?,?,?)`, newLogID(), f, r, t, pairID, 1, now, who)
		return e
	}
	if err := ins(fromID, rel, toID); err != nil {
		return fmt.Errorf("forward: %w", err)
	}
	if err := ins(toID, inv, fromID); err != nil {
		return fmt.Errorf("reverse: %w", err)
	}
	if err := writeLog(tx, who, "create", "relations", pairID, map[string]any{
		"forward": []string{fromID, rel, toID},
		"reverse": []string{toID, inv, fromID},
	}, 1); err != nil {
		return err
	}
	return tx.Commit()
}

// DeleteRelation은 pairID로 묶인 정/역 두 줄을 함께 삭제한다.
func DeleteRelation(db *sql.DB, pairID, who string) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	res, err := tx.Exec(`DELETE FROM relations WHERE pair_id=?`, pairID)
	if err != nil {
		return fmt.Errorf("delete: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	if err := writeLog(tx, who, "delete", "relations", pairID,
		map[string]any{"deleted_pair": pairID}, 0); err != nil {
		return err
	}
	return tx.Commit()
}

// ListRelations은 entityID에서 나가는 관계 목록(정방향 시점)을 돌려준다.
// 양방향 저장이라 주입된 역방향도 해당 엔티티 기준으로 여기에 포함된다.
func ListRelations(db *sql.DB, entityID string) ([]Relation, error) {
	rows, err := db.Query(`SELECT id,from_id,rel,to_id,pair_id,version,updated_by
	  FROM relations WHERE from_id=? ORDER BY rel`, entityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Relation
	for rows.Next() {
		var r Relation
		if err := rows.Scan(&r.ID, &r.FromID, &r.Rel, &r.ToID, &r.PairID, &r.Version, &r.UpdatedBy); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
