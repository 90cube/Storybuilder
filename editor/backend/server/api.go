// Package server는 편집기 GUI를 HTTP/JSON으로 노출한다.
package server

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"sync"

	"storybuilder-editor/backend/auth"
	"storybuilder-editor/backend/entity"
	"storybuilder-editor/backend/schemadef"
)

type api struct {
	db       *sql.DB
	reg      *schemadef.Registry
	mu       sync.RWMutex
	sessions map[string]string // token -> userID
	locks    map[string]string // entityID -> token
}

func (a *api) getToken(r *http.Request) string {
	cookie, err := r.Cookie("session_id")
	if err != nil {
		return ""
	}
	return cookie.Value
}

func (a *api) canEdit(id, token string) bool {
	a.mu.RLock()
	defer a.mu.RUnlock()
	ownerToken, ok := a.locks[id]
	if !ok {
		return true
	}
	return ownerToken == token
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func generateToken() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func (a *api) getWho(r *http.Request) string {
	cookie, err := r.Cookie("session_id")
	if err != nil {
		return "guest"
	}
	a.mu.RLock()
	user, ok := a.sessions[cookie.Value]
	a.mu.RUnlock()
	if !ok {
		return "guest"
	}
	return user
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

// GET /api/entities?q=&type=&review= — 목록/검색/필터.
func (a *api) list(w http.ResponseWriter, r *http.Request) {
	q := "%" + r.URL.Query().Get("q") + "%"
	typ := r.URL.Query().Get("type")
	review := r.URL.Query().Get("review") == "1"

	sqlStr := `SELECT id,name,type,review_needed FROM entities WHERE name LIKE ?`
	args := []any{q}
	if typ != "" {
		sqlStr += ` AND type=?`
		args = append(args, typ)
	}
	if review {
		sqlStr += ` AND review_needed=1`
	}
	sqlStr += ` ORDER BY name LIMIT 5000`
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

func (a *api) listSecretsForEntity(entityID string) []entity.Secret {
	all, err := entity.ListSecrets(a.db)
	if err != nil {
		return nil
	}
	var out []entity.Secret
	for _, s := range all {
		involved := false
		for _, kb := range s.KnownBy {
			if eid, ok := kb["entity_id"].(string); ok && eid == entityID {
				involved = true
				break
			}
		}
		if !involved {
			for _, hf := range s.HiddenFrom {
				if hf == entityID {
					involved = true
					break
				}
			}
		}
		if involved {
			out = append(out, s)
		}
	}
	return out
}

// GET /api/entity/{id} — 한 장(엔티티+관계+타임라인+비밀).
func (a *api) get(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	e, err := entity.Get(a.db, id)
	if err != nil {
		code, body := errStatus(err)
		writeJSON(w, code, body)
		return
	}
	rels, _ := entity.ListRelations(a.db, id)
	timeline, _ := entity.ListTimeline(a.db, id)
	secrets := a.listSecretsForEntity(id)
	writeJSON(w, 200, map[string]any{
		"entity":    e,
		"relations": rels,
		"timeline":  timeline,
		"secrets":   secrets,
	})
}

// POST /api/entity — 생성.
func (a *api) create(w http.ResponseWriter, r *http.Request) {
	who := a.getWho(r)
	if who == "guest" {
		writeJSON(w, 401, map[string]string{"error": "unauthorized"})
		return
	}
	var er entityReq
	if err := json.NewDecoder(r.Body).Decode(&er); err != nil {
		writeJSON(w, 400, map[string]string{"error": "bad json"})
		return
	}
	if err := entity.Create(a.db, a.reg, er.toEntity(), who); err != nil {
		code, body := errStatus(err)
		writeJSON(w, code, body)
		return
	}
	writeJSON(w, 200, map[string]string{"id": er.ID})
}

// PUT /api/entity/{id}?version= — 수정.
func (a *api) update(w http.ResponseWriter, r *http.Request) {
	who := a.getWho(r)
	if who == "guest" {
		writeJSON(w, 401, map[string]string{"error": "unauthorized"})
		return
	}
	var er entityReq
	if err := json.NewDecoder(r.Body).Decode(&er); err != nil {
		writeJSON(w, 400, map[string]string{"error": "bad json"})
		return
	}
	er.ID = r.PathValue("id")
	
	if !a.canEdit(er.ID, a.getToken(r)) {
		writeJSON(w, 409, map[string]string{"error": "locked_by_other"})
		return
	}

	if err := entity.Update(a.db, a.reg, er.toEntity(), parseVersion(r), who); err != nil {
		code, body := errStatus(err)
		writeJSON(w, code, body)
		return
	}
	writeJSON(w, 200, map[string]string{"id": er.ID})
}

// DELETE /api/entity/{id}?version= — 삭제.
func (a *api) del(w http.ResponseWriter, r *http.Request) {
	who := a.getWho(r)
	if who == "guest" {
		writeJSON(w, 401, map[string]string{"error": "unauthorized"})
		return
	}
	id := r.PathValue("id")
	if !a.canEdit(id, a.getToken(r)) {
		writeJSON(w, 409, map[string]string{"error": "locked_by_other"})
		return
	}
	if err := entity.Delete(a.db, id, parseVersion(r), who); err != nil {
		code, body := errStatus(err)
		writeJSON(w, code, body)
		return
	}
	writeJSON(w, 200, map[string]string{"ok": "1"})
}

type inlineReq struct {
	Data map[string]any `json:"data"`
}

// PATCH /api/entity/{id}/inline?version=
func (a *api) updateInline(w http.ResponseWriter, r *http.Request) {
	who := a.getWho(r)
	if who == "guest" {
		writeJSON(w, 401, map[string]string{"error": "unauthorized"})
		return
	}
	
	id := r.PathValue("id")
	token := a.getToken(r)
	if !a.canEdit(id, token) {
		writeJSON(w, 409, map[string]string{"error": "locked_by_other"})
		return
	}

	var req inlineReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, 400, map[string]string{"error": "bad json"})
		return
	}
	
	e, err := entity.Get(a.db, id)
	if err != nil {
		code, body := errStatus(err)
		writeJSON(w, code, body)
		return
	}
	
	if e.Data == nil {
		e.Data = make(map[string]any)
	}
	for k, v := range req.Data {
		e.Data[k] = v
	}
	
	if err := entity.Update(a.db, a.reg, e, parseVersion(r), who); err != nil {
		code, body := errStatus(err)
		writeJSON(w, code, body)
		return
	}
	writeJSON(w, 200, map[string]string{"id": e.ID})
}

// POST /api/lock/{id}
func (a *api) lockEntity(w http.ResponseWriter, r *http.Request) {
	who := a.getWho(r)
	if who == "guest" {
		writeJSON(w, 401, map[string]string{"error": "unauthorized"})
		return
	}
	id := r.PathValue("id")
	token := a.getToken(r)
	
	a.mu.Lock()
	defer a.mu.Unlock()
	if owner, ok := a.locks[id]; ok && owner != token {
		writeJSON(w, 409, map[string]string{"error": "locked_by_other"})
		return
	}
	a.locks[id] = token
	writeJSON(w, 200, map[string]string{"ok": "1"})
}

// DELETE /api/lock/{id}
func (a *api) unlockEntity(w http.ResponseWriter, r *http.Request) {
	who := a.getWho(r)
	if who == "guest" {
		writeJSON(w, 401, map[string]string{"error": "unauthorized"})
		return
	}
	id := r.PathValue("id")
	token := a.getToken(r)
	
	a.mu.Lock()
	defer a.mu.Unlock()
	if owner, ok := a.locks[id]; ok && owner == token {
		delete(a.locks, id)
	}
	writeJSON(w, 200, map[string]string{"ok": "1"})
}

// POST /api/register — 신규 유저 생성 (must_change=1)
func (a *api) register(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, 400, map[string]string{"error": "bad json"})
		return
	}
	if err := auth.CreateUser(a.db, req.ID); err != nil {
		writeJSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]string{"ok": "1"})
}

// POST /api/login — 로그인 및 세션 쿠키 설정
func (a *api) login(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ID  string `json:"id"`
		PIN string `json:"pin"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, 400, map[string]string{"error": "bad json"})
		return
	}
	mustChange, err := auth.Authenticate(a.db, req.ID, req.PIN)
	if err != nil {
		writeJSON(w, 401, map[string]string{"error": err.Error()})
		return
	}
	token := generateToken()
	a.mu.Lock()
	a.sessions[token] = req.ID
	a.mu.Unlock()

	http.SetCookie(w, &http.Cookie{
		Name:     "session_id",
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
	writeJSON(w, 200, map[string]any{"id": req.ID, "must_change_pin": mustChange})
}

// POST /api/change-pin — PIN 변경 (반드시 로그인 상태여야 함)
func (a *api) changePin(w http.ResponseWriter, r *http.Request) {
	who := a.getWho(r)
	if who == "guest" {
		writeJSON(w, 401, map[string]string{"error": "unauthorized"})
		return
	}
	var req struct {
		OldPIN  string `json:"old_pin"`
		NewPIN  string `json:"new_pin"`
		Confirm string `json:"confirm_pin"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, 400, map[string]string{"error": "bad json"})
		return
	}
	if err := auth.ChangePIN(a.db, who, req.OldPIN, req.NewPIN, req.Confirm); err != nil {
		writeJSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]string{"ok": "1"})
}

// POST /api/logout — 로그아웃
func (a *api) logout(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("session_id")
	if err == nil {
		a.mu.Lock()
		delete(a.sessions, cookie.Value)
		a.mu.Unlock()
	}
	http.SetCookie(w, &http.Cookie{
		Name:     "session_id",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})
	writeJSON(w, 200, map[string]string{"ok": "1"})
}

// GET /api/me — 세션 복원 및 본인 정보 조회
func (a *api) me(w http.ResponseWriter, r *http.Request) {
	who := a.getWho(r)
	if who == "guest" {
		writeJSON(w, 401, map[string]string{"error": "unauthorized"})
		return
	}
	var mc int
	_ = a.db.QueryRow(`SELECT must_change_pin FROM sys_users WHERE id=?`, who).Scan(&mc)
	writeJSON(w, 200, map[string]any{"id": who, "must_change_pin": mc != 0})
}

// GET /api/relations — 레지스트리에 등록된 관계 목록 반환
func (a *api) relations(w http.ResponseWriter, _ *http.Request) {
	type relOut struct {
		Rel     string `json:"rel"`
		Inverse string `json:"inverse"`
	}
	var out []relOut
	seen := map[string]bool{}
	for rel, inv := range a.reg.Relations {
		if seen[rel] {
			continue
		}
		out = append(out, relOut{Rel: rel, Inverse: inv})
		seen[rel] = true
		seen[inv] = true
	}
	writeJSON(w, 200, out)
}

// POST /api/relation — 관계 추가 (양방향 자동)
func (a *api) createRelation(w http.ResponseWriter, r *http.Request) {
	who := a.getWho(r)
	if who == "guest" {
		writeJSON(w, 401, map[string]string{"error": "unauthorized"})
		return
	}
	var req struct {
		FromID string `json:"from_id"`
		Rel    string `json:"rel"`
		ToID   string `json:"to_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, 400, map[string]string{"error": "bad json"})
		return
	}
	if err := entity.AddRelation(a.db, a.reg, req.FromID, req.Rel, req.ToID, who); err != nil {
		writeJSON(w, 400, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]string{"ok": "1"})
}

// DELETE /api/relation/{pairId} — 관계 삭제
func (a *api) deleteRelation(w http.ResponseWriter, r *http.Request) {
	who := a.getWho(r)
	if who == "guest" {
		writeJSON(w, 401, map[string]string{"error": "unauthorized"})
		return
	}
	pairID := r.PathValue("pairId")
	if err := entity.DeleteRelation(a.db, pairID, who); err != nil {
		code, body := errStatus(err)
		writeJSON(w, code, body)
		return
	}
	writeJSON(w, 200, map[string]string{"ok": "1"})
}

// GET /api/timeline/{entityId} — 특정 엔티티의 타임라인 조회
func (a *api) getTimeline(w http.ResponseWriter, r *http.Request) {
	entityID := r.PathValue("entityId")
	list, err := entity.ListTimeline(a.db, entityID)
	if err != nil {
		writeJSON(w, 500, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, 200, list)
}

// GET /api/secret/{factId} — 특정 비밀 조회
func (a *api) getSecret(w http.ResponseWriter, r *http.Request) {
	factID := r.PathValue("factId")
	s, err := entity.GetSecret(a.db, factID)
	if err != nil {
		code, body := errStatus(err)
		writeJSON(w, code, body)
		return
	}
	writeJSON(w, 200, s)
}
