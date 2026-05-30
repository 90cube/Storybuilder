// schema-init은 editor/schema 정의를 읽어 대상 DB에 스키마를 세운다.
// 사용: schema-init -dialect sqlite -dsn ./garasa.db -schema ./schema
package main

import (
	"flag"
	"log"

	"storybuilder-editor/backend/schemadef"
	"storybuilder-editor/backend/store"
)

func main() {
	dialect := flag.String("dialect", "sqlite", "sqlite | mysql")
	dsn := flag.String("dsn", "./garasa.db", "데이터 소스 이름")
	schemaDir := flag.String("schema", "./schema", "스키마 정의 폴더")
	flag.Parse()

	reg, err := schemadef.LoadRegistry(*schemaDir)
	if err != nil {
		log.Fatalf("스키마 로드 실패: %v", err)
	}
	db, err := store.Open(*dialect, *dsn)
	if err != nil {
		log.Fatalf("DB 열기 실패: %v", err)
	}
	defer db.Close()
	if err := store.InitSchema(db, *dialect, reg); err != nil {
		log.Fatalf("스키마 초기화 실패: %v", err)
	}
	log.Printf("완료: %s 에 스키마 생성 (타입 %d개)", *dsn, len(reg.Types))
}
