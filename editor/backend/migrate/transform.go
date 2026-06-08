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

// EntityFromIDMap은 id_map 항목을 Entity로 바꾼다. summaries[graph_id]가 있으면 data와 tags로 병합한다.
func EntityFromIDMap(e IDMapEntry, summaries map[string]MergedNode) entity.Entity {
	data := map[string]any{
		"aliases":  e.Aliases,
		"dfu_id":   e.DfuID,
		"graph_id": e.GraphID,
	}
	var tags []string
	if e.GraphID != nil {
		if node, ok := summaries[*e.GraphID]; ok {
			if node.Summary != "" {
				data["summary"] = node.Summary
			}
			if len(node.PersonalityTraits) > 0 {
				data["personality_traits"] = node.PersonalityTraits
			}
			if node.SpeechStyle != "" {
				data["speech_style"] = node.SpeechStyle
			}
			if node.MBTI != "" {
				data["mbti"] = node.MBTI
			}
			if len(node.MergedIDs) > 0 {
				data["merged_ids"] = node.MergedIDs
			}
			if len(node.Tags) > 0 {
				tags = append(tags, node.Tags...)
			}
		}
	}
	return entity.Entity{
		ID:         e.CanonicalID,
		Name:       e.Name,
		Type:       strings.ToLower(e.Type),
		Tags:       tags,
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
