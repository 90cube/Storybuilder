-- Creator 통합 스키마. 그래프(entities/relations/events) + 원고 + 파이프라인 한 곳.
PRAGMA journal_mode = WAL;

-- ── 지식 그래프 (source/confidence/status 부착) ──
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT,
  description TEXT, persona_json TEXT, relations_json TEXT, locations_json TEXT,
  source TEXT DEFAULT 'fan', confidence REAL DEFAULT 0.5, status TEXT DEFAULT 'pending',
  version INTEGER DEFAULT 1, updated_at TEXT, updated_by TEXT
);
CREATE TABLE IF NOT EXISTS relations (
  id TEXT PRIMARY KEY, from_id TEXT, rel TEXT, to_id TEXT, pair_id TEXT,
  source TEXT DEFAULT 'fan', version INTEGER DEFAULT 1, updated_at TEXT, updated_by TEXT
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY, title TEXT, era TEXT, what TEXT, sequence INTEGER,
  causal_in_json TEXT, causal_out_json TEXT, chars_json TEXT,
  source TEXT DEFAULT 'fan', confidence REAL DEFAULT 0.5, status TEXT DEFAULT 'pending',
  version INTEGER DEFAULT 1, updated_at TEXT, updated_by TEXT
);
CREATE TABLE IF NOT EXISTS aliases ( alias TEXT PRIMARY KEY, entity_id TEXT );

-- ── 원고 / 파이프라인 ──
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL,
  created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS chapters (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
  idx INTEGER DEFAULT 0, title TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id)
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

CREATE INDEX IF NOT EXISTS ix_chapters_project ON chapters(project_id);
CREATE INDEX IF NOT EXISTS ix_manuscripts_chapter ON manuscripts(chapter_id);
CREATE INDEX IF NOT EXISTS ix_autosaves_chapter ON autosaves(chapter_id);
