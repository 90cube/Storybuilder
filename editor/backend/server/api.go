// Package server는 편집기 GUI를 HTTP/JSON으로 노출한다.
package server

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"storybuilder-editor/backend/entity"
	"storybuilder-editor/backend/schemadef"
)

type api struct {
	db  *sql.DB
	reg *schemadef.Registry
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

// GET /api/schema — 폼 자동 생성용 타입·필드.
func (a *api) schema(w http.ResponseWriter, _ *http.Request) {
	var base []schemadef.Field
	for _, f := range a.reg.Base.BaseFields {
		if !f.System {
			base = append(base, f)
		}
	}
	type typeOut struct {
		Type   string            `json:"type"`
		Label  string            `json:"label"`
		Fields []schemadef.Field `json:"fields"`
	}
	var types []typeOut
	for _, td := range a.reg.Types {
		types = append(types, typeOut{Type: td.Type, Label: td.Label, Fields: td.Fields})
	}
	writeJSON(w, 200, map[string]any{"base": base, "types": types})
}

// GET /api/entities?q=&type= — 목록/검색/필터.
func (a *api) list(w http.ResponseWriter, r *http.Request) {
	q := "%" + r.URL.Query().Get("q") + "%"
	typ := r.URL.Query().Get("type")
	sqlStr := `SELECT id,name,type,review_needed FROM entities WHERE name LIKE ?`
	args := []any{q}
	if typ != "" {
		sqlStr += ` AND type=?`
		args = append(args, typ)
	}
	sqlStr += ` ORDER BY name LIMIT 200`
	rows, err := a.db.Query(sqlStr, args...)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name, t string
		var rn int
		rows.Scan(&id, &name, &t, &rn)
		out = append(out, map[string]any{"id": id, "name": name, "type": t, "review_needed": rn != 0})
	}
	writeJSON(w, 200, out)
}

// errStatus는 entity 에러를 HTTP 코드로.
func errStatus(err error) (int, any) {
	var ve *entity.ValidationError
	switch {
	case errors.As(err, &ve):
		return 400, map[string]any{"error": "validation", "missing": ve.Missing}
	case errors.Is(err, entity.ErrVersionConflict):
		return 409, map[string]string{"error": "version_conflict"}
	case errors.Is(err, entity.ErrNotFound):
		return 404, map[string]string{"error": "not_found"}
	default:
		return 500, map[string]string{"error": err.Error()}
	}
}

func parseVersion(r *http.Request) int {
	v, _ := strconv.Atoi(r.URL.Query().Get("version"))
	return v
}

type entityReq struct {
	ID   string         `json:"id"`
	Name string         `json:"name"`
	Type string         `json:"type"`
	Tags []string       `json:"tags"`
	Data map[string]any `json:"data"`
}

func (er entityReq) toEntity() entity.Entity {
	return entity.Entity{ID: er.ID, Name: er.Name, Type: er.Type, Tags: er.Tags, Data: er.Data}
}

// GET /api/entity/{id} — 한 장(엔티티+관계).
func (a *api) get(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	e, err := entity.Get(a.db, id)
	if err != nil {
		code, body := errStatus(err)
		writeJSON(w, code, body)
		return
	}
	rels, _ := entity.ListRelations(a.db, id)
	writeJSON(w, 200, map[string]any{"entity": e, "relations": rels})
}

// POST /api/entity — 생성.
func (a *api) create(w http.ResponseWriter, r *http.Request) {
	var er entityReq
	if err := json.NewDecoder(r.Body).Decode(&er); err != nil {
		writeJSON(w, 400, map[string]string{"error": "bad json"})
		return
	}
	if err := entity.Create(a.db, a.reg, er.toEntity(), "web"); err != nil {
		code, body := errStatus(err)
		writeJSON(w, code, body)
		return
	}
	writeJSON(w, 200, map[string]string{"id": er.ID})
}

// PUT /api/entity/{id}?version= — 수정.
func (a *api) update(w http.ResponseWriter, r *http.Request) {
	var er entityReq
	if err := json.NewDecoder(r.Body).Decode(&er); err != nil {
		writeJSON(w, 400, map[string]string{"error": "bad json"})
		return
	}
	er.ID = r.PathValue("id")
	if err := entity.Update(a.db, a.reg, er.toEntity(), parseVersion(r), "web"); err != nil {
		code, body := errStatus(err)
		writeJSON(w, code, body)
		return
	}
	writeJSON(w, 200, map[string]string{"id": er.ID})
}

// DELETE /api/entity/{id}?version= — 삭제.
func (a *api) del(w http.ResponseWriter, r *http.Request) {
	if err := entity.Delete(a.db, r.PathValue("id"), parseVersion(r), "web"); err != nil {
		code, body := errStatus(err)
		writeJSON(w, code, body)
		return
	}
	writeJSON(w, 200, map[string]string{"ok": "1"})
}
