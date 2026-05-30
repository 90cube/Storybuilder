package server

import (
	"database/sql"
	"embed"
	"io/fs"
	"net/http"

	"storybuilder-editor/backend/schemadef"
)

//go:embed static
var staticFS embed.FS

// NewServer는 API + 정적 GUI를 묶은 라우터를 만든다.
func NewServer(db *sql.DB, reg *schemadef.Registry) *http.ServeMux {
	a := &api{db: db, reg: reg}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/schema", a.schema)
	mux.HandleFunc("GET /api/entities", a.list)
	mux.HandleFunc("GET /api/entity/{id}", a.get)
	mux.HandleFunc("POST /api/entity", a.create)
	mux.HandleFunc("PUT /api/entity/{id}", a.update)
	mux.HandleFunc("DELETE /api/entity/{id}", a.del)

	sub, _ := fs.Sub(staticFS, "static")
	mux.Handle("/", http.FileServer(http.FS(sub)))
	return mux
}
