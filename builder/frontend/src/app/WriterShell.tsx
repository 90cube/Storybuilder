/** Creator 셸 — 레이아웃 조립만(좌 탐색기·중앙 집필/엔티티/캔버스·우 파이프라인 레일). 로직은 훅으로. */
import { useCallback, useEffect, useState } from "react";
import { Badge } from "../components/primitives";
import { AspectLayout, ResizableSplit, StatusBar, Titlebar } from "../components/shell";
import { type ChapterDetail, type GraphEntity } from "../lib/useCreator";
import { CHAPTER_AUTOSAVE_MS } from "../lib/const";
import { CreatorProvider, useCreatorCtx } from "./CreatorProvider";
import { ExplorerTree } from "./explorer/ExplorerTree";
import { useProjectTree } from "./explorer/useProjectTree";
import { ChapterEditor } from "./editor/ChapterEditor";
import { AnalysisPanel } from "./editor/AnalysisPanel";
import { useChapterDraft } from "./editor/useChapterDraft";
import { usePipeline } from "./pipeline/usePipeline";
import { PipelineRail } from "./pipeline/PipelineRail";
import { CharPanel } from "./pipeline/CharPanel";
import { CanonPanel } from "./pipeline/CanonPanel";
import { BottomBar } from "./pipeline/BottomBar";
import { useVersions } from "./version/useVersions";
import { VersionTimeline } from "./version/VersionTimeline";
import { EntityEditor } from "./EntityEditor";
import { LaneCanvas } from "./LaneCanvas";
import w from "./writer.module.css";

type CenterMode = "write" | "entities" | "canvas";
const CENTER_TABS: { mode: CenterMode; label: string }[] = [
  { mode: "write", label: "✍ 집필" },
  { mode: "entities", label: "◆ 엔티티" },
  { mode: "canvas", label: "⌥ 인과 캔버스" },
];

export function WriterShell() {
  return (
    <CreatorProvider>
      <WriterShellInner />
    </CreatorProvider>
  );
}

function WriterShellInner() {
  const api = useCreatorCtx();
  const { currentProj } = api;
  const [active, setActive] = useState<ChapterDetail | null>(null);
  const [dbEnts, setDbEnts] = useState<GraphEntity[]>([]);
  const [autoAnalyze, setAutoAnalyze] = useState(false);
  const [centerMode, setCenterMode] = useState<CenterMode>("write");

  // 본문 초안: chapterId 변화로 자동 초기화. text·doSave·sel은 파이프라인에서도 사용.
  const cid = active?.chapter.id ?? null;
  const draft = useChapterDraft({ chapterId: cid, initialText: active?.texts.current?.text ?? active?.texts.draft?.text ?? "" });
  const { text, saved, sel, onText, onSelectText, doSave, replaceSelection, insertAfterSelection, setSel } = draft;

  const refreshDb = useCallback(async () => {
    if (currentProj == null) { setDbEnts([]); return; }
    try { setDbEnts(await api.graphEntities(currentProj)); } catch { /* */ }
  }, [api.graphEntities, currentProj]);
  useEffect(() => { refreshDb(); }, [refreshDb]);

  const versions = useVersions(cid, draft.setText);  // 버전 트리(되돌리기 시 에디터 본문 갱신)
  const pipe = usePipeline({ active, setActive, text, doSave, applyText: draft.setText, refreshDb,
    refreshVersions: versions.reload, autoAnalyze, setAutoAnalyze });

  const openChapter = async (id: number) => {
    const d = await api.getChapter(id);
    setActive(d); api.setCurrentProj(d.chapter.project_id);
    pipe.resetForChapter();
  };
  const tree = useProjectTree({ onOpenChapter: openChapter, active, setActive });
  const saveTitle = async () => {
    if (!active) return;
    await api.renameChapter(active.chapter.id, active.chapter.title);
    tree.loadChapters(active.chapter.season_id);
  };

  const cur = active?.state ?? "";
  const left = <ExplorerTree tree={tree} active={active} onOpenChapter={openChapter} dbEnts={dbEnts} />;

  const editor = active && (
    <div className={w.editorWrap}>
      <ChapterEditor active={active} text={text} saved={saved} sel={sel} dbEnts={dbEnts}
        onText={onText} onSelectText={onSelectText} doSave={doSave}
        onTitleChange={(title) => setActive({ ...active, chapter: { ...active.chapter, title } })}
        saveTitle={saveTitle} />
      <BottomBar chapterId={active.chapter.id} cur={cur} text={text} busy={pipe.busy} sel={sel}
        onReplace={replaceSelection} onInsert={insertAfterSelection} onCloseSel={() => setSel(null)}
        onRegistered={refreshDb} onToggle={pipe.onToggle} onConfirmDraft={pipe.onConfirmDraft} />
      <AnalysisPanel analysis={pipe.analysis} stagedNote={pipe.stagedNote} autoAnalyze={autoAnalyze}
        busy={pipe.busy} onAutoAnalyze={setAutoAnalyze} analyzeNow={pipe.analyzeNow} onStage={pipe.onStage} />
    </div>
  );
  const writeCenter = !active
    ? <div className={w.placeholder}>좌측에서 화를 열거나 새로 만드세요.</div>
    : pipe.canon
      ? <CanonPanel canon={pipe.canon} onPromote={pipe.onPromote} onClose={pipe.closeCanon} />
      : pipe.cands
        ? <CharPanel cands={pipe.cands} cards={pipe.cards} busy={pipe.busy}
            onAssist={pipe.onAssist} onRegister={pipe.onRegister} onClose={pipe.closeCands} />
        : editor;
  const centerInner = centerMode === "entities"
    ? <EntityEditor onChanged={refreshDb} />
    : centerMode === "canvas"
      ? <LaneCanvas chapterId={active?.chapter.id ?? null} />
      : writeCenter;
  const center = (
    <div className={w.centerWrap}>
      <div className={w.centerTabs}>
        {CENTER_TABS.map((t) => (
          <button key={t.mode} className={w.centerTab} data-on={centerMode === t.mode}
            onClick={() => setCenterMode(t.mode)}>{t.label}</button>
        ))}
      </div>
      <div className={w.centerInner}>{centerInner}</div>
    </div>
  );
  const right = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, overflow: "auto" }}>
      <PipelineRail active={active} text={text} busy={pipe.busy} onDetect={pipe.onDetect} onCanonDiff={pipe.onCanonDiff} />
      {active && <VersionTimeline versions={versions.versions} head={versions.head} onRevert={versions.revert} />}
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
