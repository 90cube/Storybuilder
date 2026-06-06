/** 백엔드(/api) 결선 훅 — 사건·플롯 로드 + 생성 호출. */
import { useCallback, useEffect, useState } from "react";

export type EventDto = {
  id: string; title: string; era: string; sequence: number;
  causal_out: string[]; characters: string[];
};
export type Plot = { key: string; name: string };
export type Validation = { is_valid: boolean; errors: string[]; warnings: string[] };
export type GenResult = {
  original_story: string; inserted_story: string; validation: Validation;
};
export type GenBody = {
  before_id: string; after_id: string;
  new_characters: { name: string; concept: string; motive: string }[];
  plot_key: string; system?: string;
};

// 인과 캔버스는 corpus가 아니라 현재 작품(projectId)의 사건을 읽는다.
export function useBuilder(projectId: number | null) {
  const [events, setEvents] = useState<EventDto[]>([]);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [systemDefault, setSystemDefault] = useState("");
  const [online, setOnline] = useState(false);

  useEffect(() => {
    fetch("/api/plots").then((r) => r.json()).then((d) => { setPlots(d); setOnline(true); }).catch(() => setOnline(false));
    fetch("/api/prompt").then((r) => r.json()).then((d) => setSystemDefault(d.system ?? "")).catch(() => {});
  }, []);

  const reloadEvents = useCallback(() => {
    if (projectId == null) { setEvents([]); return; }
    fetch(`/api/project-events?project=${projectId}`).then((r) => r.json()).then(setEvents).catch(() => setEvents([]));
  }, [projectId]);
  useEffect(() => { reloadEvents(); }, [reloadEvents]);

  const generate = useCallback(async (body: GenBody): Promise<GenResult> => {
    const r = await fetch("/api/lane/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, project_id: projectId }),
    });
    if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { detail?: string }).detail || r.statusText);
    return r.json();
  }, [projectId]);

  return { events, plots, systemDefault, online, generate, reloadEvents };
}
