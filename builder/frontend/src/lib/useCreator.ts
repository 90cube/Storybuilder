/** Creator 백엔드(/api) 훅 — 프로젝트·화·원고·자동저장·파이프라인 전이. */
import { useCallback, useEffect, useState } from "react";

export type Project = { id: number; title: string };
export type Chapter = { id: number; project_id: number; idx: number; title: string; state: string };
export type ChapterDetail = {
  chapter: { id: number; project_id: number; title: string };
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

  const listChapters = useCallback((projectId: number) =>
    j<Chapter[]>(`/api/chapters?project=${projectId}`), []);
  const createChapter = useCallback((projectId: number, title: string) =>
    post("/api/chapters", { project_id: projectId, title }), []);
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
  const assist = useCallback((name: string, context: string) =>
    post("/api/chars/assist", { name, context }) as Promise<{ name: string; category: string; description: string; speech_style: string; relations: string[] }>, []);
  const registerEntity = useCallback((entity: Record<string, unknown>, chapter_id: number) =>
    post(`/api/graph/entity?chapter_id=${chapter_id}`, entity) as Promise<{ id: string }>, []);

  return { projects, states, createProject, listChapters, createChapter, getChapter, saveText, advance, gen, detect, assist, registerEntity };
}
