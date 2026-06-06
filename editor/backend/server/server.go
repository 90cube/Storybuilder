package server

import (
	"database/sql"
	"embed"
	"io/fs"
	"net/http"
	"os"

	"storybuilder-editor/backend/schemadef"
)

//go:embed static
var staticFS embed.FS

// NewServer는 API + 정적 GUI를 묶은 라우터를 만든다.
func NewServer(db *sql.DB, reg *schemadef.Registry) *http.ServeMux {
	a := &api{db: db, reg: reg, sessions: make(map[string]string), locks: make(map[string]string)}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/schema", a.schema)
	mux.HandleFunc("GET /api/entities", a.list)
	mux.HandleFunc("GET /api/entity/{id}", a.get)
	mux.HandleFunc("POST /api/entity", a.create)
	mux.HandleFunc("PUT /api/entity/{id}", a.update)
	mux.HandleFunc("DELETE /api/entity/{id}", a.del)
	mux.HandleFunc("PATCH /api/entity/{id}/inline", a.updateInline)
	mux.HandleFunc("POST /api/lock/{id}", a.lockEntity)
	mux.HandleFunc("DELETE /api/lock/{id}", a.unlockEntity)

	// New endpoints
	mux.HandleFunc("POST /api/register", a.register)
	mux.HandleFunc("POST /api/login", a.login)
	mux.HandleFunc("POST /api/change-pin", a.changePin)
	mux.HandleFunc("POST /api/logout", a.logout)
	mux.HandleFunc("GET /api/me", a.me)
	mux.HandleFunc("GET /api/relations", a.relations)
	mux.HandleFunc("POST /api/relation", a.createRelation)
	mux.HandleFunc("DELETE /api/relation/{pairId}", a.deleteRelation)
	mux.HandleFunc("GET /api/timeline/{entityId}", a.getTimeline)
	mux.HandleFunc("GET /api/secret/{factId}", a.getSecret)
	mux.HandleFunc("GET /api/story", a.story)
	mux.HandleFunc("GET /api/atom", a.atom)

	// 로컬 이미지 서빙 (img/ 미리보기용). 프로젝트 루트의 img 폴더를 자동 탐지.
	for _, c := range []string{"../img", "img", "../../img"} {
		if fi, err := os.Stat(c); err == nil && fi.IsDir() {
			mux.Handle("GET /img/", http.StripPrefix("/img/", http.FileServer(http.Dir(c))))
			break
		}
	}

	sub, _ := fs.Sub(staticFS, "static")
	mux.Handle("/", http.FileServer(http.FS(sub)))
	return mux
}
