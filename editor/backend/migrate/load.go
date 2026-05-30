// Package migrate는 기존 corpus/graph 데이터를 새 DB로 이관한다.
package migrate

import (
	"bufio"
	"encoding/json"
	"os"
)

// IDMapEntry는 corpus/id_map.json 한 항목.
type IDMapEntry struct {
	CanonicalID string   `json:"canonical_id"`
	Name        string   `json:"name"`
	Type        string   `json:"type"`
	DfuID       *string  `json:"dfu_id"`
	GraphID     *string  `json:"graph_id"`
	Aliases     []string `json:"aliases"`
	InGraph     bool     `json:"in_graph"`
	InCorpus    bool     `json:"in_corpus"`
}

// Edge는 graph/edges.jsonl 한 줄.
type Edge struct {
	FromID string `json:"from_id"`
	Rel    string `json:"rel"`
	ToID   string `json:"to_id"`
}

// MergedNode는 graph/nodes_merged.jsonl에서 요약만 뽑는다.
type MergedNode struct {
	ID      string `json:"id"`
	Summary string `json:"summary"`
}

// TimelineFile은 corpus/entity_timeline.json.
type TimelineFile struct {
	Entities map[string]struct {
		Name   string `json:"name"`
		States []struct {
			Order    *int     `json:"order"`
			Era      string   `json:"era"`
			EventRef string   `json:"event_ref"`
			Phase    string   `json:"phase"`
			State    string   `json:"state"`
			Traits   []string `json:"traits"`
			Source   string   `json:"source"`
		} `json:"states"`
	} `json:"entities"`
}

// SecretsFile은 corpus/knowledge_state.json.
type SecretsFile struct {
	Facts []struct {
		FactID     string           `json:"fact_id"`
		Summary    string           `json:"summary"`
		Reveal     string           `json:"reveal_to_reader_at_event"`
		Related    []string         `json:"related_events"`
		KnownBy    []map[string]any `json:"known_by"`
		HiddenFrom []string         `json:"hidden_from"`
	} `json:"facts"`
}

// LoadIDMap은 id_map.json(리스트)을 읽는다.
func LoadIDMap(path string) ([]IDMapEntry, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var out []IDMapEntry
	return out, json.Unmarshal(raw, &out)
}

// LoadEdges는 edges.jsonl(줄당 JSON)을 읽는다.
func LoadEdges(path string) ([]Edge, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	var out []Edge
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 1024*1024), 8*1024*1024)
	for sc.Scan() {
		line := sc.Bytes()
		if len(line) == 0 {
			continue
		}
		var e Edge
		if err := json.Unmarshal(line, &e); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, sc.Err()
}

// LoadMergedSummaries는 nodes_merged.jsonl에서 id→summary 맵을 만든다.
func LoadMergedSummaries(path string) (map[string]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	out := map[string]string{}
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 1024*1024), 8*1024*1024)
	for sc.Scan() {
		line := sc.Bytes()
		if len(line) == 0 {
			continue
		}
		var n MergedNode
		if err := json.Unmarshal(line, &n); err != nil {
			return nil, err
		}
		if n.Summary != "" {
			out[n.ID] = n.Summary
		}
	}
	return out, sc.Err()
}

// LoadTimelineFile / LoadSecretsFile은 각 JSON을 읽는다.
func LoadTimelineFile(path string) (TimelineFile, error) {
	var tf TimelineFile
	raw, err := os.ReadFile(path)
	if err != nil {
		return tf, err
	}
	return tf, json.Unmarshal(raw, &tf)
}

func LoadSecretsFile(path string) (SecretsFile, error) {
	var sf SecretsFile
	raw, err := os.ReadFile(path)
	if err != nil {
		return sf, err
	}
	return sf, json.Unmarshal(raw, &sf)
}
