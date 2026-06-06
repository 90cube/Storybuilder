// migrate는 기존 corpus/graph 데이터를 대상 DB로 이관한다.
// 사용: migrate -dialect sqlite -dsn ./garasa.db -schema ./schema -data ../
package main

import (
	"flag"
	"log"
	"path/filepath"

	"storybuilder-editor/backend/migrate"
	"storybuilder-editor/backend/schemadef"
	"storybuilder-editor/backend/store"
)

func main() {
	dialect := flag.String("dialect", "sqlite", "sqlite | mysql")
	dsn := flag.String("dsn", "./garasa.db", "데이터 소스")
	schemaDir := flag.String("schema", "./schema", "스키마 정의 폴더")
	dataDir := flag.String("data", "..", "corpus/graph 상위 폴더(=프로젝트 루트)")
	flag.Parse()

	reg, err := schemadef.LoadRegistry(*schemaDir)
	if err != nil {
		log.Fatalf("스키마 로드: %v", err)
	}
	db, err := store.Open(*dialect, *dsn)
	if err != nil {
		log.Fatalf("DB 열기: %v", err)
	}
	defer db.Close()
	if err := store.InitSchema(db, *dialect, reg); err != nil {
		log.Fatalf("스키마 초기화: %v", err)
	}

	root := *dataDir
	rep, err := migrate.Run(db, reg, migrate.Paths{
		IDMap:    filepath.Join(root, "corpus", "id_map.json"),
		Edges:    filepath.Join(root, "graph", "edges.jsonl"),
		Merged:   filepath.Join(root, "graph", "nodes_merged.jsonl"),
		Timeline: filepath.Join(root, "corpus", "entity_timeline.json"),
		Secrets:  filepath.Join(root, "corpus", "knowledge_state.json"),
		Images:     filepath.Join(root, "graph", "image_table.jsonl"),
		CharMaster: filepath.Join(root, "corpus", "character_master.json"),
	})
	if err != nil {
		log.Fatalf("이관 실패: %v", err)
	}
	log.Printf("이관 완료: 엔티티 %d(검토필요 %d) / 관계 %d / 타임라인 %d / 비밀 %d",
		rep.Entities, rep.ReviewNeeded, rep.Relations, rep.Timeline, rep.Secrets)
}
