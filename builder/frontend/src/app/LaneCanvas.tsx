/** 빌더 기능1(레인 삽입) — 인과 갭에 캐릭터를 끼워 원본·삽입 이야기 2개 생성. WriterShell 중앙 단일컬럼판. */
import { useEffect, useState } from "react";
import { Button, Chip, Select, Spinner } from "../components/primitives";
import { CausalCanvas, EntityPicker, StoryPane, ValidationBar,
  type CanvasEdge, type CanvasEvent, type Character } from "../components/domain";
import { useBuilder, type EventDto, type GenResult } from "../lib/useBuilder";
import type { useCreator } from "../lib/useCreator";
import w from "./writer.module.css";

type Api = ReturnType<typeof useCreator>;

export function LaneCanvas({ projectId, chapterId }: { api?: Api; projectId: number | null; chapterId: number | null }) {
  const { events, plots, systemDefault, online, generate } = useBuilder(projectId);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [plot, setPlot] = useState("kishōtenketsu");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<GenResult | null>(null);
  const [overview, setOverview] = useState(false);
  const [pick, setPick] = useState(false);

  const addCharacter = (c: Character) => setCharacters((p) => (p.some((x) => x.id === c.id) ? p : [...p, c]));
  const removeCharacter = (id: string) => setCharacters((p) => p.filter((x) => x.id !== id));

  const byId = new Map(events.map((e) => [e.id, e]));
  useEffect(() => { if (events.length && !focusedId) setFocusedId(events[0].id); }, [events, focusedId]);

  const focused: EventDto | null = focusedId ? byId.get(focusedId) ?? null : null;
  const preds = focused ? events.filter((e) => e.causal_out.includes(focused.id)) : [];
  const succs = focused ? (focused.causal_out.map((id) => byId.get(id)).filter(Boolean) as EventDto[]) : [];
  const before = focusedId;
  const after = succs[0]?.id ?? null;

  const COLS = 6;
  const isDraft = (e: EventDto) => e.source === "draft_auto";
  const canvasEvents: CanvasEvent[] = overview
    ? events.map((e, i) => ({ id: e.id, title: e.title, era: e.era, col: i % COLS, row: Math.floor(i / COLS), anchor: e.id === focusedId, draft: isDraft(e) }))
    : focused ? [
        ...preds.map((e, i) => ({ id: e.id, title: e.title, era: e.era, col: 0, row: i, draft: isDraft(e) })),
        { id: focused.id, title: focused.title, era: focused.era, col: 1, row: 0, anchor: true, draft: isDraft(focused) },
        ...succs.map((e, i) => ({ id: e.id, title: e.title, era: e.era, col: 2, row: i, anchor: e.id === after, draft: isDraft(e) })),
      ] : [];
  const edges: CanvasEdge[] = overview
    ? events.flatMap((e) => e.causal_out.filter((t) => byId.has(t)).map((t) => ({ from: e.id, to: t })))
    : focused ? [...preds.map((e) => ({ from: e.id, to: focused.id })), ...succs.map((e) => ({ from: focused.id, to: e.id }))] : [];

  const titleOf = (id: string | null) => (id ? byId.get(id)?.title ?? "—" : "—");
  const clickNode = (id: string) => { if (overview) { setFocusedId(id); setOverview(false); } else if (id !== focusedId) setFocusedId(id); };
  const ready = !!(before && after && characters.length);

  const run = async () => {
    if (!ready) return;
    setBusy(true); setErr(""); setResult(null);
    try {
      setResult(await generate({
        before_id: before!, after_id: after!,
        new_characters: characters.map((c) => ({ name: c.name, concept: c.role ?? "", motive: "" })),
        plot_key: plot, system: systemDefault || undefined,
      }));
    } catch (e) { setErr(String((e as Error).message)); }
    finally { setBusy(false); }
  };

  return (
    <div className={w.laneWrap}>
      {/* 컨트롤 바 */}
      <div className={w.laneBar}>
        <Chip on={online}>{online ? "LLM 연결" : "백엔드 끊김"}</Chip>
        <span className={w.muted}>갭:</span>
        <Chip on={!!before}>{titleOf(before)}</Chip><span className={w.muted}>→</span><Chip on={!!after}>{titleOf(after)}</Chip>
        <Select value={plot} onChange={(e) => setPlot(e.target.value)}>
          {plots.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
        </Select>
        <Button onClick={() => setPick((v) => !v)}>{pick ? "인물 닫기" : `인물 선택 (${characters.length})`}</Button>
        <Button variant="primary" disabled={!ready || busy} onClick={run}>
          {busy ? <><Spinner /> 생성 중…</> : "이야기 2개 생성"}
        </Button>
        {chapterId != null && <span className={w.muted}>· 화 #{chapterId}</span>}
      </div>
      {/* 선택된 인물 칩 */}
      <div className={w.laneChips}>
        {characters.length ? characters.map((c) => <Chip key={c.id} on onClick={() => removeCharacter(c.id)}>{c.name} ✕</Chip>)
          : <span className={w.muted}>인물을 선택하세요 (여러 명 가능)</span>}
        {err && <span className={w.entErr}>실패: {err}</span>}
      </div>
      {/* 인물 피커 (토글) */}
      {pick && <div className={w.lanePicker}><EntityPicker onPick={addCharacter} /></div>}
      {/* 캔버스 */}
      <div className={w.laneCanvas}>
        {events.length === 0 ? (
          <div className={w.laneEmpty}>
            <b>이 작품의 사건이 아직 없습니다.</b>
            <span>초안을 쓰고 <em>「정사 추출·diff → 전체 승격」</em> 하면 사건이 여기(작품 인과망)에 등록됩니다.<br />
              (이 캔버스는 DNF corpus가 아니라 <b>현재 작품의 events</b>만 보여줍니다.)</span>
          </div>
        ) : (
          <>
            <button className={w.laneView} onClick={() => setOverview((o) => !o)}>
              {overview ? "◳ focus 보기" : `▦ 전체 보기 (${events.length})`}
            </button>
            <CausalCanvas events={canvasEvents} edges={edges} onNodeClick={clickNode} onDropCharacter={addCharacter}
              hint={overview ? "전체 사건 — 클릭하면 focus 진입"
                : (focused ? `갭 → 처음: ${titleOf(before)} · 끝: ${titleOf(after)}` : "사건 선택")} />
          </>
        )}
      </div>
      {/* 결과 2개 */}
      <div className={w.laneStories}>
        <div className={w.lanePane}><div className={w.paneLbl}>원본</div><StoryPane markdown={result?.original_story} /></div>
        <div className={w.lanePane}><div className={w.paneLbl}>삽입본</div><StoryPane markdown={result?.inserted_story} /></div>
      </div>
      <ValidationBar v={result?.validation} />
    </div>
  );
}
