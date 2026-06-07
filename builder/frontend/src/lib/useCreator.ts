/** Creator 백엔드(/api) 훅 — 프로젝트·화·원고·자동저장·파이프라인 전이. */
import { useCallback, useEffect, useState } from "react";

export type Project = { id: number; title: string };
export type Season = { id: number; project_id: number; idx: number; title: string };
export type Chapter = { id: number; project_id: number; season_id: number; idx: number; title: string; state: string };
export type CanonItem = { name?: string; category?: string; from?: string; rel?: string; to?: string; title?: string; description?: string; change?: string };
export type GraphEntity = { id: string; name: string; category: string; source: string; status: string };
// ── 에디터 흡수: 스키마주도 타입 폼 ──
export type SchemaField = { key: string; label: string; datatype: string; required?: boolean; values?: string[]; default?: unknown; system?: boolean };
export type SchemaType = { type: string; label: string; fields: SchemaField[]; required: string[]; mixins: string[] };
export type RelationDef = { rel: string; inverse: string };
export type SchemaInfo = { types: SchemaType[]; relations: RelationDef[] };
export type EntityRow = { id: string; name: string; category: string; description: string; source: string; status: string; version: number; updated_at: string };
export type RelationRow = { id: string; from_id: string; rel: string; to_id: string; pair_id: string };
export type TimelineRow = { id: number; entity_id: string; seq: number; era: string; state: string; note: string };
export type SecretRow = { id: number; entity_id: string; fact: string; known_by_json: string; reveal_at: string };
export type EntityFull = { id: string; name: string; category: string; description: string; version: number; data: Record<string, unknown>; relations: RelationRow[]; timeline: TimelineRow[]; secrets: SecretRow[] };
export type ChapterDetail = {
  chapter: { id: number; project_id: number; season_id: number; title: string };
  state: string;
  texts: Record<string, { text: string; version: number }>;
};

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

export function useCreator() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [states, setStates] = useState<string[]>([]);

  const loadProjects = useCallback(async () => {
    setProjects(await j<Project[]>("/api/projects"));
  }, []);
  useEffect(() => { loadProjects().catch(() => {}); }, [loadProjects]);

  const createProject = useCallback(async (title: string) => {
    await post("/api/projects", { title }); await loadProjects();
  }, [loadProjects]);

  const listSeasons = useCallback((projectId: number) =>
    j<Season[]>(`/api/seasons?project=${projectId}`), []);
  const createSeason = useCallback((projectId: number, title = "") =>
    post("/api/seasons", { project_id: projectId, title }), []);
  const listChapters = useCallback((seasonId: number) =>
    j<Chapter[]>(`/api/chapters?season=${seasonId}`), []);
  const createChapter = useCallback((seasonId: number, title: string) =>
    post("/api/chapters", { season_id: seasonId, title }), []);
  const getChapter = useCallback(async (id: number) => {
    const d = await j<ChapterDetail>(`/api/chapter/${id}`);
    const r = await j<{ states: string[] }>(`/api/chapter/${id}/run`);
    setStates(r.states);
    return d;
  }, []);
  const saveText = useCallback((id: number, text: string) =>
    j(`/api/chapter/${id}/text`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) }), []);
  const advance = useCallback((id: number, to_state: string) =>
    post(`/api/run/${id}/advance`, { to_state }), []);
  const gen = useCallback((chapter_id: number, mode: string, system?: string) =>
    post("/api/gen", { chapter_id, mode, system }) as Promise<{ kind: string; text: string; state: string }>, []);
  const detect = useCallback((chapter_id: number) =>
    post(`/api/detect/${chapter_id}`, {}) as Promise<{ candidates: { name: string; description?: string }[]; state: string }>, []);
  const assist = useCallback((name: string, context: string, chapter_id?: number) =>
    post("/api/chars/assist", { name, context, chapter_id }) as Promise<{ name: string; category: string; description: string; speech_style: string; relations: string[] }>, []);
  const registerEntity = useCallback((entity: Record<string, unknown>, chapter_id: number) =>
    post(`/api/graph/entity?chapter_id=${chapter_id}`, entity) as Promise<{ id: string }>, []);
  const ppPolish = useCallback((chapter_id: number) =>
    post(`/api/postprocess/polish/${chapter_id}`, {}) as Promise<{ text: string; state: string }>, []);
  const canonDiff = useCallback((chapter_id: number) =>
    post(`/api/canon/diff/${chapter_id}`, {}) as Promise<{ entities: CanonItem[]; relations: CanonItem[]; events: CanonItem[]; state: string }>, []);
  const canonPromote = useCallback((chapter_id: number, entities: CanonItem[], relations: CanonItem[], events: CanonItem[] = []) =>
    post("/api/canon/promote", { chapter_id, entities, relations, events }) as Promise<{ entities: number; relations: number; events: number; state: string }>, []);
  const graphEntities = useCallback((project: number) => j<GraphEntity[]>(`/api/graph/entities?project=${project}`), []);
  const analyze = useCallback((chapter_id: number) =>
    post(`/api/analyze/${chapter_id}`, {}) as Promise<{ events: CanonItem[]; entities: CanonItem[]; relations: CanonItem[] }>, []);
  const stageToCausal = useCallback((chapter_id: number, a: { events: CanonItem[]; entities: CanonItem[]; relations: CanonItem[] }) =>
    post(`/api/analyze/${chapter_id}/commit`, a) as Promise<{ events: number; entities: number; relations: number }>, []);
  // ── 에디터 흡수: 스키마·엔티티·관계·타임라인·비밀·내보내기 ──
  const getSchema = useCallback(() => j<SchemaInfo>("/api/schema"), []);
  const listEntitiesByType = useCallback((type: string, project: number) =>
    j<EntityRow[]>(`/api/typed-entities?type=${encodeURIComponent(type)}&project=${project}`), []);
  const getEntityDetail = useCallback((eid: string) => j<EntityFull>(`/api/entity/${encodeURIComponent(eid)}`), []);
  const saveEntity = useCallback((type: string, data: Record<string, unknown>, project: number, expected_version?: number) =>
    post("/api/entity", { type, data, project_id: project, expected_version }) as Promise<{ id: string; version: number }>, []);
  const deleteEntity = useCallback((eid: string) => del(`/api/entity/${encodeURIComponent(eid)}`), []);
  const addRelationTyped = useCallback((from: string, rel: string, to: string, project: number) =>
    post("/api/relation", { from, rel, to, project_id: project }), []);
  const deleteRelation = useCallback((pairId: string) => del(`/api/relation/${encodeURIComponent(pairId)}`), []);
  const addTimeline = useCallback((eid: string, body: { era: string; state: string; note?: string; seq?: number }) =>
    post(`/api/entity/${encodeURIComponent(eid)}/timeline`, body), []);
  const addSecret = useCallback((eid: string, body: { fact: string; known_by?: string[]; reveal_at?: string }) =>
    post(`/api/entity/${encodeURIComponent(eid)}/secret`, body), []);
  const renameProject = useCallback((id: number, title: string) => put(`/api/projects/${id}`, { title }), []);
  const deleteProject = useCallback((id: number) => del(`/api/projects/${id}`), []);
  const renameSeason = useCallback((id: number, title: string) => put(`/api/seasons/${id}`, { title }), []);
  const deleteSeason = useCallback((id: number) => del(`/api/seasons/${id}`), []);
  const renameChapter = useCallback((id: number, title: string) => put(`/api/chapters/${id}`, { title }), []);
  const deleteChapter = useCallback((id: number) => del(`/api/chapters/${id}`), []);
  const moveSeason = useCallback((id: number, projectId: number) => put(`/api/seasons/${id}/move?project_id=${projectId}`, {}), []);
  const moveChapter = useCallback((id: number, seasonId: number) => put(`/api/chapters/${id}/move?season_id=${seasonId}`, {}), []);

  return { projects, states, reloadProjects: loadProjects, createProject, listSeasons, createSeason, listChapters, createChapter, getChapter, saveText, advance, gen, detect, assist, registerEntity, ppPolish, canonDiff, canonPromote, graphEntities, analyze, renameProject, deleteProject, renameSeason, deleteSeason, renameChapter, deleteChapter,
    getSchema, listEntitiesByType, getEntityDetail, saveEntity, deleteEntity, addRelationTyped, deleteRelation, addTimeline, addSecret,
    moveSeason, moveChapter, stageToCausal };
}
