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
	FromName  string
	FromType  string
	Rel       string
	ToID      string
	ToName    string
	ToType    string
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

// ListRelations은 entityID에 얽힌 관계를 돌려준다.
// 나가는 관계(from_id=entity)는 그대로, 들어오는 단방향 관계(to_id=entity, 짝 없음)는
// 상대를 ToID로 스왑하고 rel 앞에 "←"를 붙여 보여준다. 작성된 양방향 짝(pair_id 있음)은
// 각 엔티티의 from_id 행으로만 보이므로 중복되지 않는다.
func ListRelations(db *sql.DB, entityID string) ([]Relation, error) {
	rows, err := db.Query(`SELECT r.id, r.from_id, COALESCE(fe.name, r.from_id), COALESCE(fe.type, ''),
	    r.rel, r.to_id, COALESCE(te.name, r.to_id), COALESCE(te.type, ''),
	    r.pair_id, r.version, r.updated_by
	  FROM relations r
	  LEFT JOIN entities fe ON fe.id = r.from_id
	  LEFT JOIN entities te ON te.id = r.to_id
	  WHERE r.from_id=? OR r.to_id=?
	  ORDER BY CASE WHEN r.from_id=? THEN 0 ELSE 1 END, r.rel`, entityID, entityID, entityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	seen := map[string]bool{}
	var out []Relation
	for rows.Next() {
		var r Relation
		if err := rows.Scan(&r.ID, &r.FromID, &r.FromName, &r.FromType,
			&r.Rel, &r.ToID, &r.ToName, &r.ToType,
			&r.PairID, &r.Version, &r.UpdatedBy); err != nil {
			return nil, err
		}
		// 작성된 양방향 짝(같은 pair_id를 공유하는 2행)은 한 번만 보여준다.
		// 이관 관계는 pair_id가 행마다 고유라 중복제거에 안 걸린다.
		if r.PairID != "" {
			if seen[r.PairID] {
				continue
			}
			seen[r.PairID] = true
		}
		if r.ToID == entityID && r.FromID != entityID {
			// 들어오는 관계: 상대(from)를 ToID로 보이게 스왑(이름·타입도 함께)
			r.ToID, r.FromID = r.FromID, entityID
			r.ToName, r.FromName = r.FromName, r.ToName
			r.ToType, r.FromType = r.FromType, r.ToType
			r.Rel = "← " + r.Rel
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
