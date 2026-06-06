// serve는 편집기 웹 GUI를 띄우고 브라우저를 자동으로 연다.
// 더블클릭하면: 실행 파일 옆의 schema 폴더를 찾아 DB(data.db)를 준비하고 브라우저를 연다.
// 사용(옵션): serve -dsn ./data.db -schema ./schema -addr 127.0.0.1:8765 [-no-browser]
package main

import (
	"flag"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"

	"storybuilder-editor/backend/schemadef"
	"storybuilder-editor/backend/server"
	"storybuilder-editor/backend/store"
)

func dirExists(p string) bool {
	fi, err := os.Stat(p)
	return err == nil && fi.IsDir()
}

// resolveSchema는 스키마 폴더를 자동 탐지한다(실행 파일 위치 기준).
func resolveSchema(flagVal, exeDir string) string {
	for _, c := range []string{
		flagVal,
		filepath.Join(exeDir, "schema"),
		filepath.Join(exeDir, "..", "schema"),
		"schema",
	} {
		if c != "" && dirExists(c) {
			return c
		}
	}
	return flagVal
}

// openBrowser는 기본 브라우저로 URL을 연다(Windows, 콘솔 창 안 띄움).
func openBrowser(url string) {
	_ = exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
}

func main() {
	dialect := flag.String("dialect", "sqlite", "sqlite | mysql")
	dsn := flag.String("dsn", "", "data source (default: data.db next to the exe)")
	schemaDir := flag.String("schema", "", "schema folder (default: auto-detect)")
	addr := flag.String("addr", "127.0.0.1:8765", "listen address")
	noBrowser := flag.Bool("no-browser", false, "do not auto-open the browser")
	flag.Parse()

	exe, _ := os.Executable()
	exeDir := filepath.Dir(exe)

	sch := resolveSchema(*schemaDir, exeDir)
	d := *dsn
	if d == "" {
		d = filepath.Join(exeDir, "data.db")
	}

	reg, err := schemadef.LoadRegistry(sch)
	if err != nil {
		log.Fatalf("[error] cannot load schema from %q: %v", sch, err)
	}
	db, err := store.Open(*dialect, d)
	if err != nil {
		log.Fatalf("[error] cannot open DB %q: %v", d, err)
	}
	defer db.Close()
	if err := store.InitSchema(db, *dialect, reg); err != nil {
		log.Fatalf("[error] init schema: %v", err)
	}

	url := "http://" + *addr
	log.Printf("Storybuilder editor running at %s", url)
	log.Printf("(DB: %s)", d)
	log.Printf("Close this window to STOP the editor.")
	if !*noBrowser {
		go openBrowser(url)
	}
	if err := http.ListenAndServe(*addr, server.NewServer(db, reg)); err != nil {
		log.Fatal(err)
	}
}
