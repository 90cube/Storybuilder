// serve는 편집기 웹 GUI를 띄운다. 브라우저로 http://127.0.0.1:8765 접속.
// 사용: serve -dsn ./garasa.db -schema ./schema -addr 127.0.0.1:8765
package main

import (
	"flag"
	"log"
	"net/http"

	"storybuilder-editor/backend/schemadef"
	"storybuilder-editor/backend/server"
	"storybuilder-editor/backend/store"
)

func main() {
	dialect := flag.String("dialect", "sqlite", "sqlite | mysql")
	dsn := flag.String("dsn", "./garasa.db", "데이터 소스")
	schemaDir := flag.String("schema", "./schema", "스키마 정의 폴더")
	addr := flag.String("addr", "127.0.0.1:8765", "수신 주소")
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
	log.Printf("에디터 GUI: http://%s", *addr)
	if err := http.ListenAndServe(*addr, server.NewServer(db, reg)); err != nil {
		log.Fatal(err)
	}
}
