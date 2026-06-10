/** Creator 백엔드(/api) — 순수 fetch 클라이언트. React 비의존. 상태 훅은 useCreator.ts. */

export type Project = { id: number; title: string };
export type Season = { id: number; project_id: number; idx: number; title: string };
export type Chapter = { id: number; project_id: number; season_id: number; idx: number; title: string; state: string };
export type CanonItem = { name?: string; category?: string; from?: string; rel?: string; to?: string; title?: string; description?: string; change?: string; state?: string; statechange?: string };
export type GraphEntity = { id: string; name: string; category: string; source: string; status: string };
// ── 에디터 흡수: 스키마주도 타입 폼 ──
export type SchemaField = { key: string; label: string; datatype: string; required?: boolean; values?: string[]; default?: unknown; system?: boolean };
export type SchemaType = { type: string; label: string; fields: SchemaField[]; required: string[]; mixins: string[] };
export type RelationDef = { rel: string; inverse: string };
export type SchemaInfo = { types: SchemaType[]; relations: RelationDef[] };
export type EntityRow = { id: string; name: string; category: string; description: string; source: string; status: string; version: number; updated_at: string };
export type RelationRow = { id: string; from_id: string; rel: string; to_id: string; pair_id: string };
export type TimelineRow = { id: number; entity_id: string; chapter_id: number | null; seq: number; era: string; state: string; note: string };
export type SecretRow = { id: number; entity_id: string; fact: string; known_by_json: string; reveal_at: string };
export type EntityFull = { id: string; name: string; category: string; description: string; version: number; data: Record<string, unknown>; relations: RelationRow[]; timeline: TimelineRow[]; secrets: SecretRow[] };
export type ChapterDetail = {
  chapter: { id: number; project_id: number; season_id: number; title: string };
  state: string;
  texts: Record<string, { text: string; version: number }>;  // texts.current = 현재 head 본문
};
export type VersionRow = { id: number; parent_id: number | null; kind: string; label: string; created_at: string; excerpt: string };

async function j<T>(url: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { detail?: string }).detail || r.statusText);
  return r.json();
}
const post = (url: string, body: unknown) =>
  j(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const put = (url: string, body: unknown) =>
  j(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const del = (url: string) => j(url, { method: "DELETE" });

// ── 프로젝트·시즌·화 ──
export const listProjects = () => j<Project[]>("/api/projects");
export const createProject = (title: string) => post("/api/projects", { title });
export const listSeasons = (projectId: number) => j<Season[]>(`/api/seasons?project=${projectId}`);
export const createSeason = (projectId: number, title = "") => post("/api/seasons", { project_id: projectId, title });
export const listChapters = (seasonId: number) => j<Chapter[]>(`/api/chapters?season=${seasonId}`);
export const createChapter = (seasonId: number, title: string) => post("/api/chapters", { season_id: seasonId, title });
export const getChapter = (id: number) => j<ChapterDetail>(`/api/chapter/${id}`);
export const statesList = () => j<string[]>("/api/pipeline/states");  // 정적 단계목록(앱 1회 로드)
export const listVersions = (cid: number) =>
  j<{ versions: VersionRow[]; head: number | null }>(`/api/chapter/${cid}/versions`);
export const revertVersion = (cid: number, versionId: number) =>
  post("/api/version/revert", { chapter_id: cid, version_id: versionId }) as Promise<{ head: number; text: string }>;
export const getVersion = (versionId: number) => j<{ id: number; text: string }>(`/api/version/${versionId}`);
export const saveText = (id: number, text: string) =>
  j(`/api/chapter/${id}/text`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
export const advance = (id: number, to_state: string) => post(`/api/run/${id}/advance`, { to_state });
export const renameProject = (id: number, title: string) => put(`/api/projects/${id}`, { title });
export const deleteProject = (id: number) => del(`/api/projects/${id}`);
export const renameSeason = (id: number, title: string) => put(`/api/seasons/${id}`, { title });
export const deleteSeason = (id: number) => del(`/api/seasons/${id}`);
export const renameChapter = (id: number, title: string) => put(`/api/chapters/${id}`, { title });
export const deleteChapter = (id: number) => del(`/api/chapters/${id}`);
export const moveSeason = (id: number, projectId: number) => put(`/api/seasons/${id}/move?project_id=${projectId}`, {});
export const moveChapter = (id: number, seasonId: number) => put(`/api/chapters/${id}/move?season_id=${seasonId}`, {});

// ── 생성·구조화·정사 ──
export const gen = (chapter_id: number, mode: string, system?: string) =>
  post("/api/gen", { chapter_id, mode, system }) as Promise<{ kind: string; text: string; state: string }>;
export const detect = (chapter_id: number) =>
  post(`/api/detect/${chapter_id}`, {}) as Promise<{ candidates: { name: string; description?: string }[]; state: string }>;
export const assist = (name: string, context: string, chapter_id?: number) =>
  post("/api/chars/assist", { name, context, chapter_id }) as Promise<{ name: string; category: string; description: string; speech_style: string; relations: string[] }>;
export const registerEntity = (entity: Record<string, unknown>, chapter_id: number) =>
  post(`/api/graph/entity?chapter_id=${chapter_id}`, entity) as Promise<{ id: string }>;
export const ppPolish = (chapter_id: number) =>
  post(`/api/postprocess/polish/${chapter_id}`, {}) as Promise<{ text: string; state: string }>;
export const canonDiff = (chapter_id: number) =>
  post(`/api/canon/diff/${chapter_id}`, {}) as Promise<{ entities: CanonItem[]; relations: CanonItem[]; events: CanonItem[]; state: string }>;
export const canonPromote = (chapter_id: number, entities: CanonItem[], relations: CanonItem[], events: CanonItem[] = []) =>
  post("/api/canon/promote", { chapter_id, entities, relations, events }) as Promise<{ entities: number; relations: number; events: number; state: string }>;
export const graphEntities = (project: number) => j<GraphEntity[]>(`/api/graph/entities?project=${project}`);
export const analyze = (chapter_id: number) =>
  post(`/api/analyze/${chapter_id}`, {}) as Promise<{ events: CanonItem[]; entities: CanonItem[]; relations: CanonItem[] }>;
export const stageToCausal = (chapter_id: number, a: { events: CanonItem[]; entities: CanonItem[]; relations: CanonItem[] }) =>
  post(`/api/analyze/${chapter_id}/commit`, a) as Promise<{ events: number; entities: number; relations: number }>;
export const assistEdit = (chapter_id: number, body: { selected: string; before: string; after: string; style_source: string }) =>
  post("/api/assist/edit", { chapter_id, ...body }) as Promise<{
    rewrites: string[]; continuations: string[];
    conflicts: { entity?: string; issue?: string; suggestion?: string }[];
    mode: string; entities: { added: CanonItem[]; changed: CanonItem[] };
  }>;
export const assistTranslate = (chapter_id: number, text: string) =>
  post("/api/assist/translate", { chapter_id, text }) as Promise<{ text: string }>;
export const getStyle = (pid: number) => j<{ text: string }>(`/api/projects/${pid}/style`);
export const setStyle = (pid: number, text: string) => put(`/api/projects/${pid}/style`, { text });

// ── 에디터 흡수: 스키마·엔티티·관계·타임라인·비밀 ──
export const getSchema = () => j<SchemaInfo>("/api/schema");
export const listEntitiesByType = (type: string, project: number) =>
  j<EntityRow[]>(`/api/typed-entities?type=${encodeURIComponent(type)}&project=${project}`);
export const getEntityDetail = (eid: string) => j<EntityFull>(`/api/entity/${encodeURIComponent(eid)}`);
export const saveEntity = (type: string, data: Record<string, unknown>, project: number, expected_version?: number) =>
  post("/api/entity", { type, data, project_id: project, expected_version }) as Promise<{ id: string; version: number }>;
export const deleteEntity = (eid: string) => del(`/api/entity/${encodeURIComponent(eid)}`);
export const addRelationTyped = (from: string, rel: string, to: string, project: number) =>
  post("/api/relation", { from, rel, to, project_id: project });
export const deleteRelation = (pairId: string) => del(`/api/relation/${encodeURIComponent(pairId)}`);
export const addTimeline = (eid: string, body: { era: string; state: string; note?: string; seq?: number }) =>
  post(`/api/entity/${encodeURIComponent(eid)}/timeline`, body);
export const addSecret = (eid: string, body: { fact: string; known_by?: string[]; reveal_at?: string }) =>
  post(`/api/entity/${encodeURIComponent(eid)}/secret`, body);
