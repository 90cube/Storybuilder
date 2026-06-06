package migrate

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"regexp"
	"sort"
	"strconv"
	"strings"
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
	IDMap      string
	Edges      string
	Merged     string
	Timeline   string
	Secrets    string
	Images     string
	CharMaster string
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

	if _, err := db.Exec(`DELETE FROM entities`); err != nil {
		return rep, err
	}
	db.Exec(`DELETE FROM relations`)
	db.Exec(`DELETE FROM timeline`)
	db.Exec(`DELETE FROM secrets`)

	summaries := map[string]MergedNode{}
	if p.Merged != "" {
		if m, err := LoadMergedSummaries(p.Merged); err == nil {
			summaries = m
		} else {
			return rep, err
		}
	}

	// 이미지 테이블 로드
	var images map[int][]string
	if p.Images != "" {
		if imgs, err := LoadImages(p.Images); err == nil {
			images = imgs
		}
	}

	// character_master 설명 로드 (그래프 요약 없을 때 요약 보강용)
	descriptions := map[string]string{}
	if p.CharMaster != "" {
		if d, err := LoadDescriptions(p.CharMaster); err == nil {
			descriptions = d
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

		// 그래프 요약이 없으면 character_master 설명으로 보강
		if s, _ := e.Data["summary"].(string); s == "" && im.DfuID != nil {
			if desc := descriptions[*im.DfuID]; desc != "" {
				e.Data["summary"] = desc
			}
		}

		if im.DfuID != nil {
			if idNum, err := strconv.Atoi(*im.DfuID); err == nil {
				if imgs, ok := images[idNum]; ok {
					e.Data["images"] = imgs
				}
			}
		}

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

	// 별칭(병합된 슬러그 등)도 slug→canonical에 추가. 실제 graph_id가 우선.
	// 예: '사도' 노드가 apostles로 병합돼도, 엣지의 to_id='사도'가 apostles로 연결되게.
	for _, im := range ids {
		for _, a := range im.Aliases {
			if _, exists := slugToCanon[a]; !exists {
				slugToCanon[a] = im.CanonicalID
			}
		}
	}

	// relations (단방향, slug→canonical)
	if p.Edges != "" {
		edges, err := LoadEdges(p.Edges)
		if err != nil {
			return rep, err
		}
		pairIDs := make(map[string]string)
		for _, ed := range edges {
			r := RelationFromEdge(ed, slugToCanon)
			
			inv, hasInv := reg.Inverse(r.Rel)
			key1 := r.FromID + "|" + r.Rel + "|" + r.ToID
			key2 := r.ToID + "|" + inv + "|" + r.FromID
			
			var pairID string
			if pid, ok := pairIDs[key1]; ok {
				pairID = pid
			} else if hasInv {
				if pid, ok := pairIDs[key2]; ok {
					pairID = pid
				}
			}
			if pairID == "" {
				pairID = newID()
				pairIDs[key1] = pairID
				if hasInv {
					pairIDs[key2] = pairID
				}
			}

			if _, err := db.Exec(`INSERT INTO relations
			  (id,from_id,rel,to_id,pair_id,version,updated_at,updated_by)
			  VALUES (?,?,?,?,?,?,?,?)`,
				newID(), r.FromID, r.Rel, r.ToID,
				pairID, 1, now, "import"); err != nil {
				return rep, err
			}
			rep.Relations++
		}
	}

	// nodes_merged.jsonl 내부에 포함된 timeline 병합
	for canonicalID, node := range summaries {
		// canonicalID는 slug일 수도 있으므로 slugToCanon으로 변환
		realID := canonicalID
		if c, ok := slugToCanon[canonicalID]; ok {
			realID = c
		}
		for i, t := range node.Timeline {
			if err := entity.AddTimelineEntry(db, entity.TimelineEntry{
				EntityID: realID, OrderKey: i, Era: t.Era, EventRef: "", // EventRef is string, event_refs is []string in json but schema takes string
				Phase: t.Phase, State: t.Summary, Traits: t.Traits, Source: "merged.timeline",
			}); err != nil {
				return rep, err
			}
			rep.Timeline++
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

	// 진(1차 각성) 3단 계층 보강: 기본직업 → 진 → 2차각성
	if err := enrichAwakening(db, ids, now, &rep); err != nil {
		return rep, err
	}

	// 직업군 계열 보강: 직업군(귀검사 …) → 전직(버서커 …)
	if err := enrichLineage(db, ids, now, &rep); err != nil {
		return rep, err
	}

	return rep, nil
}

// baseJobReMig는 직업군(귀검사(남)·마법사(여) …) 이름 패턴.
var baseJobReMig = regexp.MustCompile(`^(귀검사|격투가|거너|마법사|프리스트)\((남|여)\)$`)

// enrichLineage는 dfu_id(던파 직업 ID) 체계로 "직업군 → 전직" 계열 관계를 복원한다.
// dfu 200~396 구간에서 직업군이 경계(귀검사남 200, 귀검사여 217 …)에 위치하고
// 그 뒤로 (전직·眞·2차) 묶음이 이어진다. 전직(각성형태임의 base tier)을 직업군에 "계열임"으로 연결.
func enrichLineage(db *sql.DB, ids []IDMapEntry, now string, rep *Report) error {
	idName := map[string]string{}
	dfuOf := map[string]int{}
	for _, im := range ids {
		idName[im.CanonicalID] = im.Name
		if im.DfuID != nil {
			if v, e := strconv.Atoi(*im.DfuID); e == nil {
				dfuOf[im.CanonicalID] = v
			}
		}
	}
	singles := map[string]bool{"도적": true, "나이트": true, "마창사": true, "총검사": true, "아처": true}
	type basej struct {
		dfu int
		id  string
	}
	var bases []basej
	for id, d := range dfuOf {
		if d >= 200 && d <= 396 && (baseJobReMig.MatchString(idName[id]) || singles[idName[id]]) {
			bases = append(bases, basej{d, id})
		}
	}
	sort.Slice(bases, func(i, j int) bool { return bases[i].dfu < bases[j].dfu })
	groupOf := func(d int) string {
		gid := ""
		for _, b := range bases {
			if b.dfu <= d && d <= 396 {
				gid = b.id
			} else if b.dfu > d {
				break
			}
		}
		return gid
	}

	// 전직(base tier) = "眞 X"가 가리키는 to (enrichAwakening 이후 완성됨)
	jeonjik := map[string]bool{}
	rows, err := db.Query(`SELECT from_id, to_id FROM relations WHERE rel='각성형태임'`)
	if err != nil {
		return err
	}
	for rows.Next() {
		var f, t string
		if err := rows.Scan(&f, &t); err != nil {
			rows.Close()
			return err
		}
		if strings.HasPrefix(idName[f], "眞 ") {
			jeonjik[t] = true
		}
	}
	rows.Close()

	seen := map[string]bool{}
	for tid := range jeonjik {
		d, ok := dfuOf[tid]
		if !ok || d < 200 || d > 396 {
			continue
		}
		gid := groupOf(d)
		if gid == "" || gid == tid || seen[gid+"|"+tid] {
			continue
		}
		if _, err := db.Exec(`INSERT INTO relations (id,from_id,rel,to_id,pair_id,version,updated_at,updated_by)
		  VALUES (?,?,?,?,?,?,?,?)`, newID(), gid, "계열임", tid, newID(), 1, now, "import"); err != nil {
			return err
		}
		seen[gid+"|"+tid] = true
		rep.Relations++
	}
	return nil
}

// enrichAwakening은 각성 계층을 기본직업 ← 진(1차) ← 2차각성 으로 정리한다.
// 원본 그래프의 각성형태임은 2차각성→기본직업으로 이어져 진을 건너뛴다.
// (1) 모든 "眞 X"에 "眞 X → X(기본직업)" 추가, (2) 2차각성→기본 엣지를 2차→진으로 재연결.
func enrichAwakening(db *sql.DB, ids []IDMapEntry, now string, rep *Report) error {
	byName := map[string]string{}
	byNorm := map[string]string{}
	idName := map[string]string{}
	for _, im := range ids {
		byName[im.Name] = im.CanonicalID
		byNorm[strings.ReplaceAll(im.Name, " ", "")] = im.CanonicalID
		idName[im.CanonicalID] = im.Name
	}
	// 기본직업 id -> 진 id  (진 = "眞 " + 기본직업명)
	jinOfBase := map[string]string{}
	for _, im := range ids {
		if !strings.HasPrefix(im.Name, "眞 ") {
			continue
		}
		base := strings.TrimSpace(strings.TrimPrefix(im.Name, "眞 "))
		bid := byName[base]
		if bid == "" {
			bid = byNorm[strings.ReplaceAll(base, " ", "")]
		}
		if bid != "" {
			jinOfBase[bid] = im.CanonicalID
		}
	}

	existing := map[string]bool{}
	rows, err := db.Query(`SELECT from_id, to_id FROM relations WHERE rel='각성형태임'`)
	if err != nil {
		return err
	}
	for rows.Next() {
		var f, t string
		if err := rows.Scan(&f, &t); err != nil {
			rows.Close()
			return err
		}
		existing[f+"|"+t] = true
	}
	rows.Close()

	// (1) 진 → 기본직업
	for bid, jid := range jinOfBase {
		if jid == bid || existing[jid+"|"+bid] {
			continue
		}
		if _, err := db.Exec(`INSERT INTO relations (id,from_id,rel,to_id,pair_id,version,updated_at,updated_by)
		  VALUES (?,?,?,?,?,?,?,?)`, newID(), jid, "각성형태임", bid, newID(), 1, now, "import"); err != nil {
			return err
		}
		existing[jid+"|"+bid] = true
		rep.Relations++
	}

	// (2) 2차각성 → 기본직업 엣지를 2차 → 진 으로 재연결
	rows2, err := db.Query(`SELECT id, from_id, to_id FROM relations WHERE rel='각성형태임'`)
	if err != nil {
		return err
	}
	type redir struct{ relID, jid string }
	var todo []redir
	for rows2.Next() {
		var rid, f, t string
		if err := rows2.Scan(&rid, &f, &t); err != nil {
			rows2.Close()
			return err
		}
		fn := idName[f]
		if strings.HasPrefix(fn, "眞 ") || strings.HasPrefix(fn, "Neo:") {
			continue // 이미 진→기본은 유지
		}
		if jid, ok := jinOfBase[t]; ok && jid != f {
			todo = append(todo, redir{rid, jid})
		}
	}
	rows2.Close()
	for _, r := range todo {
		if _, err := db.Exec(`UPDATE relations SET to_id=? WHERE id=?`, r.jid, r.relID); err != nil {
			return err
		}
	}
	return nil
}
