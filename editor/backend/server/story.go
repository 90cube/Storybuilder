package server

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// storyChar는 사건 등장인물(이름 + DB 엔티티 id 해소 + 사건 후 상태).
type storyChar struct {
	Name  string `json:"name"`
	ID    string `json:"id"`
	State string `json:"state"`
}

// storyEvent는 이야기 줄기의 사건 한 개.
type storyEvent struct {
	ID         string      `json:"id"`
	Title      string      `json:"title"`
	Era        string      `json:"era"`
	Sequence   int         `json:"sequence"`
	CausalOut  []string    `json:"causal_out"`
	Characters []storyChar `json:"characters"`
}

func findFile(cands ...string) string {
	for _, c := range cands {
		if _, err := os.Stat(c); err == nil {
			return c
		}
	}
	return ""
}

// loadStoryEvents는 event_chain.json을 읽어 사건들을 DB 엔티티에 해소해 돌려준다.
func (a *api) loadStoryEvents() ([]storyEvent, error) {
	ecPath := findFile("../corpus/event_chain.json", "corpus/event_chain.json", "../../corpus/event_chain.json")
	if ecPath == "" {
		return nil, os.ErrNotExist
	}
	raw, err := os.ReadFile(ecPath)
	if err != nil {
		return nil, err
	}
	var ec struct {
		Events []struct {
			EventID    string   `json:"event_id"`
			Title      string   `json:"title"`
			Era        string   `json:"era"`
			Sequence   int      `json:"sequence"`
			CausalOut  []string `json:"causal_out"`
			Characters []struct {
				Name       string `json:"name"`
				StateAfter string `json:"state_after"`
			} `json:"characters_involved"`
		} `json:"events"`
	}
	if err := json.Unmarshal(raw, &ec); err != nil {
		return nil, err
	}

	alias := map[string]string{}
	if ap := findFile("../corpus/id_alias_index.json", "corpus/id_alias_index.json", "../../corpus/id_alias_index.json"); ap != "" {
		if ar, err := os.ReadFile(ap); err == nil {
			_ = json.Unmarshal(ar, &alias)
		}
	}

	dbName := map[string]string{}
	dbIDs := map[string]bool{}
	rows, err := a.db.Query(`SELECT id, name FROM entities`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var id, n string
		_ = rows.Scan(&id, &n)
		dbName[n] = id
		dbIDs[id] = true
	}
	rows.Close()

	resolve := func(name string) string {
		cid := alias[name]
		if cid == "" {
			cid = dbName[name]
		}
		if cid != "" && dbIDs[cid] {
			return cid
		}
		return ""
	}

	out := make([]storyEvent, 0, len(ec.Events))
	for _, e := range ec.Events {
		se := storyEvent{ID: e.EventID, Title: e.Title, Era: e.Era, Sequence: e.Sequence, CausalOut: e.CausalOut}
		for _, c := range e.Characters {
			se.Characters = append(se.Characters, storyChar{Name: c.Name, ID: resolve(c.Name), State: c.StateAfter})
		}
		out = append(out, se)
	}
	return out, nil
}

// GET /api/story — event_chain 기반 이야기 줄기.
func (a *api) story(w http.ResponseWriter, _ *http.Request) {
	out, err := a.loadStoryEvents()
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"events": out})
}

// atomClass는 핵을 이루는 직업 노드.
type atomClass struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Tier  string `json:"tier"`  // jin(진) | second(2차) | base(전직)
	Group string `json:"group"` // 소속 직업군 id
}

// atomGroup은 직업군(귀검사·마법사 …) 노드.
type atomGroup struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

var baseJobRe = regexp.MustCompile(`^(귀검사|격투가|거너|마법사|프리스트)\((남|여)\)$`)

// GET /api/atom — 원자 구조: 핵(모험가+직업군+직업 트리) + 껍질(사건 시대순).
func (a *api) atom(w http.ResponseWriter, _ *http.Request) {
	events, err := a.loadStoryEvents()
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}

	// 엔티티 이름 + dfu_id(직업군 복원 키)
	name := map[string]string{}
	dfu := map[string]int{}
	rows, err := a.db.Query(`SELECT id, name, data FROM entities`)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	for rows.Next() {
		var id, n string
		var data sql.NullString
		_ = rows.Scan(&id, &n, &data)
		name[id] = n
		if data.Valid && data.String != "" {
			var m map[string]any
			if json.Unmarshal([]byte(data.String), &m) == nil {
				if s, ok := m["dfu_id"].(string); ok {
					if v, e := strconv.Atoi(s); e == nil {
						dfu[id] = v
					}
				}
			}
		}
	}
	rows.Close()

	// 각성형태임 그래프 = 전직/眞/2차
	classSet := map[string]bool{}
	adj := map[string]map[string]bool{}
	type link struct {
		From string `json:"from"`
		To   string `json:"to"`
	}
	var links []link
	er, err := a.db.Query(`SELECT from_id, to_id FROM relations WHERE rel='각성형태임'`)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	for er.Next() {
		var f, t string
		_ = er.Scan(&f, &t)
		classSet[f], classSet[t] = true, true
		if adj[f] == nil {
			adj[f] = map[string]bool{}
		}
		if adj[t] == nil {
			adj[t] = map[string]bool{}
		}
		adj[f][t], adj[t][f] = true, true
		links = append(links, link{From: f, To: t})
	}
	er.Close()

	// tier 판정: 眞 = jin / 진의 to(전직) = base / 그 외 = second
	jinTo := map[string]bool{}
	for _, l := range links {
		if strings.HasPrefix(name[l.From], "眞 ") {
			jinTo[l.To] = true
		}
	}
	tierOf := func(id string) string {
		if strings.HasPrefix(name[id], "眞 ") {
			return "jin"
		}
		if jinTo[id] {
			return "base"
		}
		return "second"
	}

	// --- 직업군 복원: dfu 200~396 경계의 직업군 + dfu 구간 매핑 + 각성링크 전파 ---
	type basej struct {
		dfu  int
		id   string
		name string
	}
	singles := map[string]bool{"도적": true, "나이트": true, "마창사": true, "총검사": true, "아처": true}
	var bases []basej
	for id, d := range dfu {
		if d >= 200 && d <= 396 && (baseJobRe.MatchString(name[id]) || singles[name[id]]) {
			bases = append(bases, basej{d, id, name[id]})
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
	groupName := map[string]string{}
	for _, b := range bases {
		groupName[b.id] = b.name
	}
	classGroup := map[string]string{}
	for id := range classSet {
		if d, ok := dfu[id]; ok && d >= 200 && d <= 396 {
			if g := groupOf(d); g != "" {
				classGroup[id] = g
			}
		}
	}
	for changed := true; changed; {
		changed = false
		for id := range classSet {
			if classGroup[id] != "" {
				continue
			}
			for m := range adj[id] {
				if classGroup[m] != "" {
					classGroup[id] = classGroup[m]
					changed = true
					break
				}
			}
		}
	}
	// 외전(미매핑): 각성 컴포넌트의 전직(base tier) 노드를 직업군으로 사용
	for id := range classSet {
		if classGroup[id] != "" {
			continue
		}
		// BFS로 같은 컴포넌트의 base tier 노드를 찾음
		seen := map[string]bool{id: true}
		queue := []string{id}
		rep := ""
		for len(queue) > 0 {
			x := queue[0]
			queue = queue[1:]
			if tierOf(x) == "base" {
				rep = x
				break
			}
			for m := range adj[x] {
				if !seen[m] {
					seen[m] = true
					queue = append(queue, m)
				}
			}
		}
		if rep == "" {
			rep = id
		}
		groupName[rep] = name[rep]
		for x := range seen {
			if classGroup[x] == "" {
				classGroup[x] = rep
			}
		}
	}

	classes := make([]atomClass, 0, len(classSet))
	for id := range classSet {
		classes = append(classes, atomClass{ID: id, Name: name[id], Tier: tierOf(id), Group: classGroup[id]})
	}
	groupSet := map[string]bool{}
	for _, g := range classGroup {
		groupSet[g] = true
	}
	groups := make([]atomGroup, 0, len(groupSet))
	for g := range groupSet {
		groups = append(groups, atomGroup{ID: g, Name: groupName[g]})
	}

	writeJSON(w, 200, map[string]any{
		"hero":    map[string]string{"id": "adventurers", "name": "모험가"},
		"groups":  groups,
		"classes": classes,
		"links":   links,
		"events":  events,
	})
}
