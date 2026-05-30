package entity

import "database/sql"

// TimelineEntry는 한 엔티티의 한 시점 상태 스냅샷.
type TimelineEntry struct {
	ID       string
	EntityID string
	OrderKey int
	Era      string
	EventRef string
	Phase    string
	State    string
	Traits   []string
	Source   string
}

// AddTimelineEntry는 경험 한 줄을 누적한다(append).
func AddTimelineEntry(db *sql.DB, e TimelineEntry) error {
	traits, err := marshalJSON(e.Traits)
	if err != nil {
		return err
	}
	_, err = db.Exec(`INSERT INTO timeline (id,entity_id,order_key,era,event_ref,phase,state,traits,source)
	  VALUES (?,?,?,?,?,?,?,?,?)`,
		newLogID(), e.EntityID, e.OrderKey, e.Era, e.EventRef, e.Phase, e.State, traits, e.Source)
	return err
}

// ListTimeline은 entityID의 경험을 order_key 오름차순으로 돌려준다.
func ListTimeline(db *sql.DB, entityID string) ([]TimelineEntry, error) {
	rows, err := db.Query(`SELECT id,entity_id,order_key,era,event_ref,phase,state,traits,source
	  FROM timeline WHERE entity_id=? ORDER BY order_key`, entityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []TimelineEntry
	for rows.Next() {
		var e TimelineEntry
		var traits string
		if err := rows.Scan(&e.ID, &e.EntityID, &e.OrderKey, &e.Era, &e.EventRef, &e.Phase, &e.State, &traits, &e.Source); err != nil {
			return nil, err
		}
		if err := unmarshalJSON(traits, &e.Traits); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}
