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
  new_character: { name: string; concept: string; motive: string };
  plot_key: string; system?: string;
};

export function useBuilder() {
  const [events, setEvents] = useState<EventDto[]>([]);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [systemDefault, setSystemDefault] = useState("");
  const [online, setOnline] = useState(false);

  useEffect(() => {
    fetch("/api/events").then((r) => r.json()).then((d) => { setEvents(d); setOnline(true); }).catch(() => setOnline(false));
    fetch("/api/plots").then((r) => r.json()).then(setPlots).catch(() => {});
    fetch("/api/prompt").then((r) => r.json()).then((d) => setSystemDefault(d.system ?? "")).catch(() => {});
  }, []);

  const generate = useCallback(async (body: GenBody): Promise<GenResult> => {
    const r = await fetch("/api/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { detail?: string }).detail || r.statusText);
    return r.json();
  }, []);

  return { events, plots, systemDefault, online, generate };
}
