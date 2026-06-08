/** Creator 백엔드 훅 — 상태(projects·states)만 보유. 나머지 호출은 api.ts 순수 함수 재노출. */
import { useCallback, useEffect, useState } from "react";
import * as api from "./api";

export * from "./api"; // 타입 + 순수 fetch 함수 재노출 (기존 import 경로 유지)

export function useCreator() {
  const [projects, setProjects] = useState<api.Project[]>([]);
  const [states, setStates] = useState<string[]>([]);

  const reloadProjects = useCallback(async () => {
    setProjects(await api.listProjects());
  }, []);
  useEffect(() => { reloadProjects().catch(() => {}); }, [reloadProjects]);

  // 상태 부수효과가 있는 둘만 훅에서 감싼다(나머지는 순수 api 그대로).
  const createProject = useCallback(async (title: string) => {
    await api.createProject(title); await reloadProjects();
  }, [reloadProjects]);
  const getChapter = useCallback(async (id: number) => {
    const d = await api.getChapter(id);
    const r = await api.getRun(id);
    setStates(r.states);
    return d;
  }, []);

  return { ...api, projects, states, reloadProjects, createProject, getChapter };
}
