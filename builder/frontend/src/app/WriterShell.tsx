import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Input, Panel } from "../components/primitives";
import { AspectLayout, ResizableSplit, StatusBar, Titlebar } from "../components/shell";
import { useCreator, type Chapter, type ChapterDetail } from "../lib/useCreator";
import { CHAPTER_AUTOSAVE_MS, DRAFT_TARGET_CHARS } from "../lib/const";
import w from "./writer.module.css";

const TOGGLES: { mode: string; label: string }[] = [
  { mode: "draft", label: "초안→초안" },
  { mode: "polish", label: "→ 다듬기" },
  { mode: "expand", label: "→ 완성본" },
];

export function WriterShell() {
  const api = useCreator();
  const [projectId, setProjectId] = useState<number | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [active, setActive] = useState<ChapterDetail | null>(null);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState<string>("");
  const [newProj, setNewProj] = useState("");
  const [newChap, setNewChap] = useState("");
  const timer = useRef<number>(0);

  const refreshChapters = useCallback(async (pid: number) => {
    setChapters(await api.listChapters(pid));
  }, [api]);

  useEffect(() => {
    if (projectId == null && api.projects.length) setProjectId(api.projects[0].id);
  }, [api.projects, projectId]);
  useEffect(() => { if (projectId != null) refreshChapters(projectId).catch(() => {}); }, [projectId, refreshChapters]);

  const openChapter = async (id: number) => {
    const d = await api.getChapter(id);
    setActive(d); setText(d.texts.draft?.text ?? ""); setSaved("불러옴");
  };

  // 10초 무동작 자동저장
  useEffect(() => {
    if (!active) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      await api.saveText(active.chapter.id, text);
      setSaved(new Date().toLocaleTimeString());
    }, CHAPTER_AUTOSAVE_MS);
    return () => window.clearTimeout(timer.current);
  }, [text, active, api]);

  const onToggle = async (mode: string) => {
    if (!active) return;
    // M3에서 실제 생성 연결. 지금은 FSM 상태만 전이(다듬기/완성본).
    const to = mode === "expand" ? "EXPAND" : "POLISH";
    try { await api.advance(active.chapter.id, to); await openChapter(active.chapter.id); }
    catch { /* 전이 불가 무시 */ }
  };

  const over = text.length > DRAFT_TARGET_CHARS;

  const left = (
    <Panel title="프로젝트 · 화" className={w.fill}>
      <div className={w.newRow}>
        <Input value={newProj} onChange={(e) => setNewProj(e.target.value)} placeholder="새 프로젝트" />
        <Button onClick={async () => { if (newProj.trim()) { await api.createProject(newProj.trim()); setNewProj(""); } }}>+</Button>
      </div>
      <div className={w.tree}>
        {api.projects.map((p) => (
          <div key={p.id} className={w.item} data-on={p.id === projectId} onClick={() => setProjectId(p.id)}>
            <span className={w.name}>{p.title}</span>
          </div>
        ))}
      </div>
      {projectId != null && (
        <>
          <div className={w.projHead}>화 (chapter)</div>
          <div className={w.newRow}>
            <Input value={newChap} onChange={(e) => setNewChap(e.target.value)} placeholder="새 화 제목" />
            <Button onClick={async () => { if (newChap.trim()) { await api.createChapter(projectId, newChap.trim()); setNewChap(""); refreshChapters(projectId); } }}>+</Button>
          </div>
          <div className={w.tree}>
            {chapters.map((c) => (
              <div key={c.id} className={w.item} data-on={active?.chapter.id === c.id} onClick={() => openChapter(c.id)}>
                <span className={w.name}>{c.title || `(${c.id})`}</span>
                <span className={w.badge}>{c.state}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );

  const center = active ? (
    <div className={w.editorWrap}>
      <input className={w.titleInput} value={active.chapter.title}
        onChange={(e) => setActive({ ...active, chapter: { ...active.chapter, title: e.target.value } })} />
      <textarea className={w.editor} value={text} onChange={(e) => setText(e.target.value)}
        placeholder="여기에 ~2000자 초안을 씁니다. 멈추면 자동 저장돼요." />
      <div className={w.editBar}>
        <span className={w.count} data-over={over}>{text.length} / {DRAFT_TARGET_CHARS}자{over ? " — 청킹 권고" : ""}</span>
        <span className={w.savedBadge}><Badge tone="jade">저장: {saved || "—"}</Badge></span>
      </div>
    </div>
  ) : <div className={w.placeholder}>좌측에서 화를 열거나 새로 만드세요.</div>;

  const right = (
    <div className={w.rail}>
      <div className={w.railTitle}>파이프라인</div>
      <div className={w.stepper}>
        {api.states.map((s) => (
          <div key={s} className={w.step} data-on={active?.state === s}
            data-toggle={s === "POLISH" || s === "EXPAND"}>
            <span className={w.dot} />{s}
          </div>
        ))}
      </div>
      <div className={w.toggles}>
        <span className={w.lbl}>생성</span>
        {TOGGLES.map((t) => (
          <Button key={t.mode} variant={t.mode === "polish" ? "primary" : "default"}
            disabled={!active} onClick={() => onToggle(t.mode)}>{t.label}</Button>
        ))}
      </div>
    </div>
  );

  const layout = (a: number, b: number, c: number) =>
    <ResizableSplit panes={[{ defaultSize: a, minSize: 12, content: left },
      { defaultSize: b, content: center }, { defaultSize: c, minSize: 12, content: right }]} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <Titlebar sub="Creator · 집필 → 파이프라인" right={<Badge tone="arcane">{active ? active.state : "—"}</Badge>} />
      <div style={{ flex: 1, minHeight: 0 }}>
        <AspectLayout
          landscape={layout(20, 56, 24)}
          square={layout(26, 50, 24)}
          portrait={<ResizableSplit orientation="vertical" panes={[
            { defaultSize: 24, content: left }, { defaultSize: 52, content: center }, { defaultSize: 24, content: right }]} />}
        />
      </div>
      <StatusBar left={<>Creator</>} right={<>{api.projects.length} 프로젝트 · 자동저장 {CHAPTER_AUTOSAVE_MS / 1000}s</>} />
    </div>
  );
}
