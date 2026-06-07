-- Creator 통합 스키마. 그래프(entities/relations/events) + 원고 + 파이프라인 한 곳.
PRAGMA journal_mode = WAL;

-- ── 지식 그래프 (project_id로 작품 격리; source/confidence/status 부착) ──
-- id = "{project_id}:{slug}" 프리픽스로 작품 간 충돌·누수 차단.
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY, project_id INTEGER, name TEXT NOT NULL, category TEXT,
  description TEXT, persona_json TEXT, relations_json TEXT, locations_json TEXT,
  data_json TEXT,  -- 스키마(타입)별 필드 값 blob (editor/schema/*.json 키 기준)
  source TEXT DEFAULT 'fan', confidence REAL DEFAULT 0.5, status TEXT DEFAULT 'pending',
  version INTEGER DEFAULT 1, updated_at TEXT, updated_by TEXT
);
CREATE TABLE IF NOT EXISTS relations (
  id TEXT PRIMARY KEY, project_id INTEGER, from_id TEXT, rel TEXT, to_id TEXT, pair_id TEXT,
  source TEXT DEFAULT 'fan', version INTEGER DEFAULT 1, updated_at TEXT, updated_by TEXT
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY, project_id INTEGER, title TEXT, era TEXT, what TEXT, sequence INTEGER,
  causal_in_json TEXT, causal_out_json TEXT, chars_json TEXT,
  source TEXT DEFAULT 'fan', confidence REAL DEFAULT 0.5, status TEXT DEFAULT 'pending',
  version INTEGER DEFAULT 1, updated_at TEXT, updated_by TEXT
);
CREATE TABLE IF NOT EXISTS aliases ( project_id INTEGER, alias TEXT, entity_id TEXT, PRIMARY KEY (project_id, alias) );

-- ── 엔티티 부품(에디터 믹스인: timeline·secrets) + 편집 로그 ──
-- 시계열 누적: 엔티티별 상태 스냅샷(시간축 정렬)
CREATE TABLE IF NOT EXISTS timeline (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER, entity_id TEXT NOT NULL,
  seq INTEGER DEFAULT 0, era TEXT, state TEXT, note TEXT,
  created_at TEXT, created_by TEXT
);
-- 비밀/인지상태: 누가·언제부터 아는가 + 독자 공개 시점
CREATE TABLE IF NOT EXISTS secrets (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER, entity_id TEXT,
  fact TEXT NOT NULL, known_by_json TEXT, reveal_at TEXT,
  created_at TEXT, created_by TEXT
);
-- 편집 로그: 누가·언제·무엇을·전→후 (자동 기록)
CREATE TABLE IF NOT EXISTS edit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER, ts TEXT, who TEXT,
  op TEXT, target_kind TEXT, target_id TEXT, before_json TEXT, after_json TEXT
);

-- ── 원고 / 파이프라인 ──
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL,
  style_guide TEXT,
  created_at TEXT, updated_at TEXT
);
-- 시즌(부) — 작품과 화 사이 계층
CREATE TABLE IF NOT EXISTS seasons (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
  idx INTEGER DEFAULT 0, title TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
CREATE TABLE IF NOT EXISTS chapters (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
  season_id INTEGER, idx INTEGER DEFAULT 0, title TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (season_id) REFERENCES seasons(id)
);
-- kind: draft | polish | expand | final
CREATE TABLE IF NOT EXISTS manuscripts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, chapter_id INTEGER NOT NULL,
  kind TEXT, text TEXT, version INTEGER DEFAULT 1, created_at TEXT,
  FOREIGN KEY (chapter_id) REFERENCES chapters(id)
);
-- FSM: 화 1개의 일생 (§3 기획서 13단계)
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, chapter_id INTEGER NOT NULL UNIQUE,
  state TEXT DEFAULT 'DRAFT', payload_json TEXT, updated_at TEXT,
  FOREIGN KEY (chapter_id) REFERENCES chapters(id)
);
CREATE TABLE IF NOT EXISTS autosaves (
  id INTEGER PRIMARY KEY AUTOINCREMENT, chapter_id INTEGER NOT NULL,
  text TEXT, state TEXT, ts TEXT
);
CREATE TABLE IF NOT EXISTS gen_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, chapter_id INTEGER, mode TEXT,
  status TEXT DEFAULT 'pending', result_id INTEGER
);

CREATE INDEX IF NOT EXISTS ix_seasons_project ON seasons(project_id);
CREATE INDEX IF NOT EXISTS ix_chapters_project ON chapters(project_id);
-- ix_chapters_season은 season_id 컬럼 마이그레이션 후 _migrate에서 생성
CREATE INDEX IF NOT EXISTS ix_manuscripts_chapter ON manuscripts(chapter_id);
CREATE INDEX IF NOT EXISTS ix_autosaves_chapter ON autosaves(chapter_id);
CREATE INDEX IF NOT EXISTS ix_timeline_entity ON timeline(entity_id);
CREATE INDEX IF NOT EXISTS ix_secrets_entity ON secrets(entity_id);
CREATE INDEX IF NOT EXISTS ix_relations_from ON relations(from_id);
CREATE INDEX IF NOT EXISTS ix_relations_to ON relations(to_id);
-- project_id 인덱스(ix_*_project)는 컬럼 마이그레이션 후 db._migrate_project_scope에서 생성
