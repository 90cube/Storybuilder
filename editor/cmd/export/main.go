// export는 DB 내용 테이블을 JSON/CSV로 내보낸다(GitLab·Snowflake용).
// 사용: export -dialect sqlite -dsn ./garasa.db -out ./_export
package main

import (
	"flag"
	"log"

	"storybuilder-editor/backend/export"
	"storybuilder-editor/backend/store"
)

func main() {
	dialect := flag.String("dialect", "sqlite", "sqlite | mysql")
	dsn := flag.String("dsn", "./garasa.db", "데이터 소스")
	out := flag.String("out", "./_export", "출력 폴더")
	flag.Parse()

	db, err := store.Open(*dialect, *dsn)
	if err != nil {
		log.Fatalf("DB 열기: %v", err)
	}
	defer db.Close()
	counts, err := export.ExportAll(db, *out)
	if err != nil {
		log.Fatalf("내보내기: %v", err)
	}
	log.Printf("내보내기 완료(%s): %v", *out, counts)
}
