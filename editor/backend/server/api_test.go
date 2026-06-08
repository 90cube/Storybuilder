package server

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"storybuilder-editor/backend/auth"
	"storybuilder-editor/backend/schemadef"
	"storybuilder-editor/backend/store"
)

func stringsReader(s string) *strings.Reader { return strings.NewReader(s) }

func testReg() *schemadef.Registry {
	return &schemadef.Registry{
		Base: schemadef.BaseDef{BaseFields: []schemadef.Field{
			{Key: "name", Label: "이름", Datatype: "string", Required: true},
			{Key: "type", Label: "타입", Datatype: "string", Required: true, System: true},
		}},
		Types: map[string]schemadef.TypeDef{
			"character": {Type: "character", Label: "인물", Fields: []schemadef.Field{
				{Key: "summary", Label: "한줄요약", Datatype: "text", Required: true},
			}},
		},
		Relations: map[string]string{},
	}
}

func testSrv(t *testing.T) (*http.ServeMux, *sql.DB) {
	t.Helper()
	db, err := store.Open("sqlite", filepath.Join(t.TempDir(), "s.db"))
	if err != nil {
		t.Fatal(err)
	}
	reg := testReg()
	if err := store.InitSchema(db, "sqlite", reg); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return NewServer(db, reg), db
}

func TestSchemaAPI(t *testing.T) {
	mux, _ := testSrv(t)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest("GET", "/api/schema", nil))
	if rec.Code != 200 {
		t.Fatalf("code %d", rec.Code)
	}
	var got struct {
		Types []struct {
			Type   string `json:"type"`
			Fields []struct {
				Key      string `json:"key"`
				Required bool   `json:"required"`
			} `json:"fields"`
		} `json:"types"`
	}
	json.Unmarshal(rec.Body.Bytes(), &got)
	if len(got.Types) != 1 || got.Types[0].Type != "character" {
		t.Fatalf("schema wrong: %+v", got)
	}
}

func TestListAPI(t *testing.T) {
	mux, db := testSrv(t)
	db.Exec(`INSERT INTO entities (id,name,type,version) VALUES ('h','힐더','character',1)`)
	db.Exec(`INSERT INTO entities (id,name,type,version) VALUES ('k','칼릭스','character',1)`)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest("GET", "/api/entities?q=힐더", nil))
	if rec.Code != 200 {
		t.Fatalf("code %d", rec.Code)
	}
	var list []map[string]any
	json.Unmarshal(rec.Body.Bytes(), &list)
	if len(list) != 1 || list[0]["name"] != "힐더" {
		t.Fatalf("list/search wrong: %+v", list)
	}
}

func TestCreateAndGetAPI(t *testing.T) {
	mux, db := testSrv(t)

	// 유저 생성
	if err := auth.CreateUser(db, "ACME-123456"); err != nil {
		t.Fatal(err)
	}

	// 로그인 요청하여 세션 쿠키 받기
	loginReq := `{"id":"ACME-123456","pin":"000000"}`
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest("POST", "/api/login", strings.NewReader(loginReq)))
	if rec.Code != 200 {
		t.Fatalf("login failed: %d body: %s", rec.Code, rec.Body.String())
	}
	cookie := rec.Header().Get("Set-Cookie")
	if cookie == "" {
		t.Fatal("Set-Cookie not found")
	}

	// 필수 누락 → 400 missing
	bad := `{"id":"x","type":"character","data":{}}`
	rec = httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/api/entity", strings.NewReader(bad))
	req.Header.Set("Cookie", cookie)
	mux.ServeHTTP(rec, req)
	if rec.Code != 400 {
		t.Fatalf("missing required should be 400, got %d body=%s", rec.Code, rec.Body.String())
	}

	// 정상 생성 → 200
	ok := `{"id":"kalix","name":"칼릭스","type":"character","data":{"summary":"검사"}}`
	rec = httptest.NewRecorder()
	req2 := httptest.NewRequest("POST", "/api/entity", strings.NewReader(ok))
	req2.Header.Set("Cookie", cookie)
	mux.ServeHTTP(rec, req2)
	if rec.Code != 200 {
		t.Fatalf("create should be 200, got %d body=%s", rec.Code, rec.Body.String())
	}

	// 조회
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest("GET", "/api/entity/kalix", nil))
	if rec.Code != 200 {
		t.Fatalf("get should be 200, got %d", rec.Code)
	}
	var got map[string]any
	json.Unmarshal(rec.Body.Bytes(), &got)
	ent := got["entity"].(map[string]any)
	if ent["Name"] != "칼릭스" {
		t.Fatalf("get wrong: %+v", got)
	}
}
