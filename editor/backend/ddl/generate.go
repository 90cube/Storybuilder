package ddl

import "fmt"

// GenerateDDL은 고정 테이블들의 CREATE TABLE 문 목록을 방언에 맞춰 만든다.
// 타입별 필드는 entities.data(JSON)에 저장하므로 타입 추가 시에도 변하지 않는다.
func GenerateDDL(d Dialect) []string {
	s := func(dt string) string { return SQLType(dt, d) }

	return []string{
		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS entities (
  id %s PRIMARY KEY,
  name %s NOT NULL,
  type %s NOT NULL,
  tags %s,
  data %s,
  provenance %s,
  review_needed %s,
  version %s,
  updated_at %s,
  updated_by %s
)`, s("string"), s("string"), s("string"), s("list"), s("list"),
			s("string"), s("int"), s("int"), s("datetime"), s("string")),

		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS relations (
  id %s PRIMARY KEY,
  from_id %s NOT NULL,
  rel %s NOT NULL,
  to_id %s NOT NULL,
  pair_id %s,
  version %s,
  updated_at %s,
  updated_by %s
)`, s("string"), s("string"), s("string"), s("string"), s("string"),
			s("int"), s("datetime"), s("string")),

		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS timeline (
  id %s PRIMARY KEY,
  entity_id %s NOT NULL,
  order_key %s,
  era %s,
  event_ref %s,
  phase %s,
  state %s,
  traits %s,
  source %s
)`, s("string"), s("string"), s("int"), s("string"), s("string"),
			s("string"), s("text"), s("list"), s("string")),

		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS secrets (
  fact_id %s PRIMARY KEY,
  summary %s,
  reveal_to_reader_at %s,
  known_by %s,
  hidden_from %s,
  related_events %s
)`, s("string"), s("text"), s("string"), s("list"), s("list"), s("list")),

		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS sys_edit_log (
  log_id %s PRIMARY KEY,
  at %s,
  who %s,
  action %s,
  target_table %s,
  target_id %s,
  changes %s,
  version_after %s
)`, s("string"), s("datetime"), s("string"), s("string"), s("string"),
			s("string"), s("object"), s("int")),

		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS sys_users (
  id %s PRIMARY KEY,
  pin_hash %s,
  must_change_pin %s,
  created_at %s,
  last_login %s
)`, s("string"), s("string"), s("int"), s("datetime"), s("datetime")),

		fmt.Sprintf(`CREATE TABLE IF NOT EXISTS sys_schema_meta (
  type %s,
  field_key %s,
  datatype %s,
  required %s,
  is_system %s
)`, s("string"), s("string"), s("string"), s("int"), s("int")),
	}
}
