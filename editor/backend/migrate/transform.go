package migrate

import (
	"strings"

	"storybuilder-editor/backend/entity"
)

// rawRelation은 이관용 단방향 관계(레지스트리 역방향 주입 없음).
type rawRelation struct {
	FromID string
	Rel    string
	ToID   string
}

// EntityFromIDMap은 id_map 항목을 Entity로 바꾼다. summaries[graph_id]가 있으면 data.summary로 붙인다.
func EntityFromIDMap(e IDMapEntry, summaries map[string]string) entity.Entity {
	data := map[string]any{
		"aliases":  e.Aliases,
		"dfu_id":   e.DfuID,
		"graph_id": e.GraphID,
	}
	if e.GraphID != nil {
		if sum, ok := summaries[*e.GraphID]; ok {
			data["summary"] = sum
		}
	}
	return entity.Entity{
		ID:         e.CanonicalID,
		Name:       e.Name,
		Type:       strings.ToLower(e.Type),
		Data:       data,
		Provenance: "imported",
	}
}

// RelationFromEdge는 edge를 단방향 관계로 바꾸고, slug를 canonical로 매핑한다.
func RelationFromEdge(e Edge, slugToCanon map[string]string) rawRelation {
	from := e.FromID
	if c, ok := slugToCanon[e.FromID]; ok {
		from = c
	}
	to := e.ToID
	if c, ok := slugToCanon[e.ToID]; ok {
		to = c
	}
	return rawRelation{FromID: from, Rel: e.Rel, ToID: to}
}
