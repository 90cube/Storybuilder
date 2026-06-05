import { useEffect, useState } from "react";
import { Badge, Button, Chip, Panel, Select, Spinner } from "../components/primitives";
import { ResizableSplit, StatusBar, Titlebar } from "../components/shell";
import {
  CausalCanvas, ChatPanel, EntityPicker, StoryPane, ValidationBar,
  type CanvasEdge, type CanvasEvent, type Character, type ChatMsg,
} from "../components/domain";
import { useAspect } from "../lib/aspect";
import { useBuilder, type GenResult } from "../lib/useBuilder";
import s from "./app.module.css";

export function AppShell() {
  const aspect = useAspect();
  const { events, plots, online, generate } = useBuilder();
  const [before, setBefore] = useState<string | null>(null);
  const [after, setAfter] = useState<string | null>(null);
  const [character, setCharacter] = useState<Character | null>(null);
  const [plot, setPlot] = useState("kishōtenketsu");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<GenResult | null>(null);
  const [focus, setFocus] = useState<"original" | "inserted" | null>(null);
  const toggleFocus = (p: "original" | "inserted") => setFocus((f) => (f === p ? null : p));
  const [chat, setChat] = useState<ChatMsg[]>([
    { role: "assistant", text: "좌측에서 인물을 고르고, 캔버스에서 처음·끝 사건을 클릭한 뒤 생성하세요." },
  ]);

  // 사건 로드되면 앵커 기본값 세팅(처음 실행 즉시 사용 가능). 사용자가 노드 클릭으로 변경.
  useEffect(() => {
    if (events.length && !before && !after) {
      setBefore(events[0].id);
      setAfter(events[0].causal_out.find((t) => events.some((e) => e.id === t)) ?? events[1]?.id ?? null);
    }
  }, [events, before, after]);

  const canvasEvents: CanvasEvent[] = events.map((e) => ({
    id: e.id, title: e.title, era: e.era, anchor: e.id === before || e.id === after,
  }));
  const byId = new Set(events.map((e) => e.id));
  const edges: CanvasEdge[] = events.flatMap((e) =>
    e.causal_out.filter((t) => byId.has(t)).map((t) => ({ from: e.id, to: t })));

  const clickNode = (id: string) => {
    if (id === before) setBefore(null);
    else if (id === after) setAfter(null);
    else if (!before) setBefore(id);
    else if (!after) setAfter(id);
    else { setBefore(id); setAfter(null); }
  };

  const titleOf = (id: string | null) => events.find((e) => e.id === id)?.title ?? "—";
  const ready = !!(before && after && character);

  const run = async () => {
    if (!ready) return;
    setBusy(true); setErr(""); setResult(null);
    setChat((c) => [...c, { role: "user", text: `${character!.name}를 「${titleOf(before)}」와 「${titleOf(after)}」 사이에 끼워줘 (${plot})` }]);
    try {
      const r = await generate({
        before_id: before!, after_id: after!,
        new_character: { name: character!.name, concept: character!.role ?? "", motive: "" },
        plot_key: plot,
      });
      setResult(r);
      setChat((c) => [...c, { role: "assistant", text: r.validation.is_valid ? "생성 완료. tbg 검증 통과 — 검토해 주세요." : "생성했으나 tbg 위반 — 확인 필요." }]);
    } catch (e) { setErr(String((e as Error).message)); }
    finally { setBusy(false); }
  };

  const left = (
    <Panel title="인물 검색" className={s.fill}><EntityPicker onPick={setCharacter} /></Panel>
  );
  const center = (
    <div className={s.center} data-focus={focus ? "true" : "false"}>
      <div className={s.canvasRegion} onClick={() => focus && setFocus(null)}>
        <CausalCanvas events={canvasEvents} edges={edges} onNodeClick={clickNode}
          onDropCharacter={() => { }}
          hint={before || after ? `처음: ${titleOf(before)} · 끝: ${titleOf(after)}` : "사건 노드를 클릭해 처음·끝 앵커 지정"} />
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
          <span className={s.fieldLabel}>선택된 인물</span>
          <div className={s.selRow}>
            {character ? <Chip on>{character.name}</Chip> : <span className={s.muted}>좌측 리스트에서 클릭</span>}
          </div>
        </div>
        <div className={s.field}>
          <span className={s.fieldLabel}>앵커 (처음 → 끝)</span>
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
        <Button variant="primary" disabled={!ready || busy} onClick={run}>
          {busy ? <><Spinner /> 생성 중…</> : "이야기 2개 생성"}
        </Button>
        {err && <span className={s.err}>실패: {err}</span>}
      </div>
      <div className={s.chatFill}><ChatPanel messages={chat} onSend={(t) => setChat((c) => [...c, { role: "user", text: t }])} /></div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <Titlebar sub="기능1 · 인과 갭에 캐릭터 끼워넣기"
        right={<Badge tone={online ? "jade" : "blood"}>{online ? "LLM 연결" : "백엔드 끊김"}</Badge>} />
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResizableSplit id="root-h" panes={[
          { defaultSize: 22, minSize: 14, content: left },
          { defaultSize: 52, content: center },
          { defaultSize: 26, minSize: 18, content: right },
        ]} />
      </div>
      <StatusBar left={<>기능1 레인 삽입</>}
        right={<>비율: {aspect} · {result ? (result.validation.is_valid ? "검증 통과" : "검증 위반") : "대기"}</>} />
    </div>
  );
}
