package migrate

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"time"

	"storybuilder-editor/backend/entity"
	"storybuilder-editor/backend/schemadef"
)

// newID는 이관용 짧은 고유 id(16진수 8바이트).
func newID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// Paths는 원천 파일 경로 묶음.
type Paths struct {
	IDMap    string
	Edges    string
	Merged   string
	Timeline string
	Secrets  string
}

// Report는 이관 결과 집계.
type Report struct {
	Entities     int
	ReviewNeeded int
	Relations    int
	Timeline     int
	Secrets      int
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func jsonStr(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

// Run은 원천 파일들을 읽어 DB에 적재하고 집계를 돌려준다.
func Run(db *sql.DB, reg *schemadef.Registry, p Paths) (Report, error) {
	var rep Report
	now := time.Now().UTC().Format(time.RFC3339)

	summaries := map[string]string{}
	if p.Merged != "" {
		if m, err := LoadMergedSummaries(p.Merged); err == nil {
			summaries = m
		} else {
			return rep, err
		}
	}

	// entities + slug→canonical 맵
	ids, err := LoadIDMap(p.IDMap)
	if err != nil {
		return rep, err
	}
	slugToCanon := map[string]string{}
	for _, im := range ids {
		e := EntityFromIDMap(im, summaries)
		review := boolToInt(len(entity.RequiredMissing(reg, e)) > 0)
		if _, err := db.Exec(`INSERT INTO entities
		  (id,name,type,tags,data,provenance,review_needed,version,updated_at,updated_by)
		  VALUES (?,?,?,?,?,?,?,?,?,?)`,
			e.ID, e.Name, e.Type, jsonStr(e.Tags), jsonStr(e.Data),
			e.Provenance, review, 1, now, "import"); err != nil {
			return rep, err
		}
		rep.Entities++
		rep.ReviewNeeded += review
		if im.GraphID != nil {
			slugToCanon[*im.GraphID] = im.CanonicalID
		}
	}

	// relations (단방향, slug→canonical)
	if p.Edges != "" {
		edges, err := LoadEdges(p.Edges)
		if err != nil {
			return rep, err
		}
		for _, ed := range edges {
			r := RelationFromEdge(ed, slugToCanon)
			if _, err := db.Exec(`INSERT INTO relations
			  (id,from_id,rel,to_id,pair_id,version,updated_at,updated_by)
			  VALUES (?,?,?,?,?,?,?,?)`,
				newID(), r.FromID, r.Rel, r.ToID,
				"", 1, now, "import"); err != nil {
				return rep, err
			}
			rep.Relations++
		}
	}

	// timeline (entity.AddTimelineEntry 재사용)
	if p.Timeline != "" {
		tf, err := LoadTimelineFile(p.Timeline)
		if err != nil {
			return rep, err
		}
		for eid, ent := range tf.Entities {
			for _, s := range ent.States {
				order := 0
				if s.Order != nil {
					order = *s.Order
				}
				if err := entity.AddTimelineEntry(db, entity.TimelineEntry{
					EntityID: eid, OrderKey: order, Era: s.Era, EventRef: s.EventRef,
					Phase: s.Phase, State: s.State, Traits: s.Traits, Source: s.Source,
				}); err != nil {
					return rep, err
				}
				rep.Timeline++
			}
		}
	}

	// secrets (entity.AddSecret 재사용)
	if p.Secrets != "" {
		sf, err := LoadSecretsFile(p.Secrets)
		if err != nil {
			return rep, err
		}
		for _, f := range sf.Facts {
			if err := entity.AddSecret(db, entity.Secret{
				FactID: f.FactID, Summary: f.Summary, RevealAt: f.Reveal,
				KnownBy: f.KnownBy, HiddenFrom: f.HiddenFrom, RelatedEvents: f.Related,
			}); err != nil {
				return rep, err
			}
			rep.Secrets++
		}
	}

	return rep, nil
}
