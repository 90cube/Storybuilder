import { useEffect, useState } from "react";
import { Badge, Button, Chip, Panel, Select, Spinner, Textarea } from "../components/primitives";
import { AspectLayout, ResizableSplit, StatusBar, Titlebar } from "../components/shell";
import {
  CausalCanvas, ChatPanel, EntityPicker, StoryPane, ValidationBar,
  type CanvasEdge, type CanvasEvent, type Character, type ChatMsg,
} from "../components/domain";
import { useAspect } from "../lib/aspect";
import { useBuilder, type EventDto, type GenResult } from "../lib/useBuilder";
import s from "./app.module.css";

export function AppShell() {
  const aspect = useAspect();
  const { events, plots, systemDefault, online, generate } = useBuilder();
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const addCharacter = (c: Character) =>
    setCharacters((prev) => (prev.some((p) => p.id === c.id) ? prev : [...prev, c]));
  const removeCharacter = (id: string) =>
    setCharacters((prev) => prev.filter((p) => p.id !== id));
  const [plot, setPlot] = useState("kishōtenketsu");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<GenResult | null>(null);
  const [focus, setFocus] = useState<"original" | "inserted" | null>(null);
  const [system, setSystem] = useState("");
  const [showPrompt, setShowPrompt] = useState(false);
  const [overview, setOverview] = useState(false); // 전체 보기 ↔ focus
  useEffect(() => { if (systemDefault && !system) setSystem(systemDefault); }, [systemDefault, system]);
  const [chat, setChat] = useState<ChatMsg[]>([
    { role: "assistant", text: "인물을 고르고, 캔버스에서 사건을 눌러 인과를 따라가며 삽입 지점을 정한 뒤 생성하세요." },
  ]);
  const toggleFocus = (p: "original" | "inserted") => setFocus((f) => (f === p ? null : p));

  const byId = new Map(events.map((e) => [e.id, e]));
  useEffect(() => { if (events.length && !focusedId) setFocusedId(events[0].id); }, [events, focusedId]);

  // 인과 focus 서브그래프: 초점 사건 + 직접 선행/후행만.
  const focused: EventDto | null = focusedId ? byId.get(focusedId) ?? null : null;
  const preds = focused ? events.filter((e) => e.causal_out.includes(focused.id)) : [];
  const succs = focused
    ? (focused.causal_out.map((id) => byId.get(id)).filter(Boolean) as EventDto[])
    : [];
  const before = focusedId;
  const after = succs[0]?.id ?? null; // 갭 = 초점 → 첫 후행

  // 전체 보기: 21개 미니맵(시대순 격자) / focus: 초점+직접 이웃
  const COLS = 6;
  const canvasEvents: CanvasEvent[] = overview
    ? events.map((e, i) => ({
        id: e.id, title: e.title, era: e.era,
        col: i % COLS, row: Math.floor(i / COLS), anchor: e.id === focusedId,
      }))
    : focused ? [
        ...preds.map((e, i) => ({ id: e.id, title: e.title, era: e.era, col: 0, row: i })),
        { id: focused.id, title: focused.title, era: focused.era, col: 1, row: 0, anchor: true },
        ...succs.map((e, i) => ({ id: e.id, title: e.title, era: e.era, col: 2, row: i, anchor: e.id === after })),
      ] : [];
  const edges: CanvasEdge[] = overview
    ? events.flatMap((e) => e.causal_out.filter((t) => byId.has(t)).map((t) => ({ from: e.id, to: t })))
    : focused ? [
        ...preds.map((e) => ({ from: e.id, to: focused.id })),
        ...succs.map((e) => ({ from: focused.id, to: e.id })),
      ] : [];

  const titleOf = (id: string | null) => (id ? byId.get(id)?.title ?? "—" : "—");
  const clickNode = (id: string) => {
    if (overview) { setFocusedId(id); setOverview(false); return; } // 전체에서 사건 클릭=focus 진입
    if (id !== focusedId) setFocusedId(id);
  };
  const ready = !!(before && after && characters.length);
  const charNames = characters.map((c) => c.name).join(" · ");

  const run = async () => {
    if (!ready) return;
    setBusy(true); setErr(""); setResult(null);
    setChat((c) => [...c, { role: "user", text: `${charNames}를 「${titleOf(before)}」와 「${titleOf(after)}」 사이에 끼워줘 (${plot})` }]);
    try {
      const r = await generate({
        before_id: before!, after_id: after!,
        new_characters: characters.map((c) => ({ name: c.name, concept: c.role ?? "", motive: "" })),
        plot_key: plot, system: system || undefined,
      });
      setResult(r);
      setChat((c) => [...c, { role: "assistant", text: r.validation.is_valid ? "생성 완료. tbg 검증 통과 — 검토해 주세요." : "생성했으나 tbg 위반 — 확인 필요." }]);
    } catch (e) { setErr(String((e as Error).message)); }
    finally { setBusy(false); }
  };

  const left = <Panel title="인물 검색" className={s.fill}><EntityPicker onPick={addCharacter} /></Panel>;

  const center = (
    <div className={s.center} data-focus={focus ? "true" : "false"}>
      <div className={s.canvasRegion} onClick={() => focus && setFocus(null)}>
        <button className={s.viewToggle} title="전체 ↔ focus"
          onClick={(e) => { e.stopPropagation(); setOverview((o) => !o); }}>
          {overview ? "◳ focus 보기" : `▦ 전체 보기 (${events.length})`}
        </button>
        <CausalCanvas events={canvasEvents} edges={edges} onNodeClick={clickNode}
          onDropCharacter={addCharacter}
          hint={overview
            ? "전체 사건 — 클릭하면 그 사건으로 focus 진입"
            : (focused ? `삽입 갭 → 처음: ${titleOf(before)} · 끝: ${titleOf(after)} (노드 클릭=인과 이동 · 인물 드롭=선택)` : "사건 로딩 중…")} />
      </div>
      <div className={s.storyRegion}>
        <div className={s.storyGrid} data-focus={focus ?? "none"}>
          <div className={s.paneBox} onClick={() => toggleFocus("original")}>
            <StoryPane markdown={result?.original_story} />
          </div>
          <div className={s.paneBox} onClick={() => toggleFocus("inserted")}>
            <StoryPane markdown={result?.inserted_story} />
          </div>
        </div>
        <ValidationBar v={result?.validation} />
      </div>
    </div>
  );

  const right = (
    <div className={s.right}>
      <div className={s.controls}>
        <div className={s.field}>
          <span className={s.fieldLabel}>선택된 인물 ({characters.length})</span>
          <div className={s.selRow}>
            {characters.length
              ? characters.map((c) => (
                  <Chip key={c.id} on onClick={() => removeCharacter(c.id)}>{c.name} ✕</Chip>
                ))
              : <span className={s.muted}>좌측에서 클릭/드래그 (여러 명 가능)</span>}
          </div>
        </div>
        <div className={s.field}>
          <span className={s.fieldLabel}>삽입 갭 (처음 → 끝)</span>
          <div className={s.selRow}>
            <Chip on={!!before}>{titleOf(before)}</Chip>
            <span className={s.muted}>→</span>
            <Chip on={!!after}>{titleOf(after)}</Chip>
          </div>
        </div>
        <div className={s.field}>
          <span className={s.fieldLabel}>플롯</span>
          <Select value={plot} onChange={(e) => setPlot(e.target.value)}>
            {plots.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
          </Select>
        </div>
        <div className={s.field}>
          <button className={s.promptToggle} onClick={() => setShowPrompt((v) => !v)}>
            <span className={s.fieldLabel}>마스터 프롬프트 편집</span>
            <span className={s.muted}>{showPrompt ? "▾" : "▸"}{system !== systemDefault ? " ·수정됨" : ""}</span>
          </button>
          {showPrompt && (
            <>
              <Textarea mono rows={8} value={system} onChange={(e) => setSystem(e.target.value)} />
              <button className={s.linkBtn} disabled={system === systemDefault}
                onClick={() => setSystem(systemDefault)}>기본값 복원</button>
            </>
          )}
        </div>
        <Button variant="primary" disabled={!ready || busy} onClick={run}>
          {busy ? <><Spinner /> 생성 중…</> : "이야기 2개 생성"}
        </Button>
        {err && <span className={s.err}>실패: {err}</span>}
      </div>
      <div className={s.chatFill}>
        <ChatPanel messages={chat} onSend={(t) => setChat((c) => [...c, { role: "user", text: t }])} />
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <Titlebar sub="기능1 · 인과 갭에 캐릭터 끼워넣기"
        right={<Badge tone={online ? "jade" : "blood"}>{online ? "LLM 연결" : "백엔드 끊김"}</Badge>} />
      <div style={{ flex: 1, minHeight: 0 }}>
        <AspectLayout
          landscape={
            <ResizableSplit id="land" panes={[
              { defaultSize: 22, minSize: 14, content: left },
              { defaultSize: 52, content: center },
              { defaultSize: 26, minSize: 18, content: right },
            ]} />
          }
          square={
            <ResizableSplit id="sq" panes={[
              { defaultSize: 30, minSize: 18, content: left },
              { defaultSize: 70, content: (
                <ResizableSplit orientation="vertical" id="sq-v" panes={[
                  { defaultSize: 62, content: center },
                  { defaultSize: 38, content: right },
                ]} />
              ) },
            ]} />
          }
          portrait={
            <ResizableSplit orientation="vertical" id="port" panes={[
              { defaultSize: 26, minSize: 14, content: left },
              { defaultSize: 46, content: center },
              { defaultSize: 28, minSize: 16, content: right },
            ]} />
          }
        />
      </div>
      <StatusBar left={<>기능1 레인 삽입 · 초점: {titleOf(focusedId)}</>}
        right={<>비율: {aspect} · {result ? (result.validation.is_valid ? "검증 통과" : "검증 위반") : "대기"}</>} />
    </div>
  );
}
