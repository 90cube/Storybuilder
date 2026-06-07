import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Input, Panel, Spinner, Toggle } from "../components/primitives";
import { AspectLayout, ResizableSplit, StatusBar, Titlebar } from "../components/shell";
import { useCreator, type Season, type Chapter, type ChapterDetail, type CanonItem, type GraphEntity } from "../lib/useCreator";
import { CHAPTER_AUTOSAVE_MS, DRAFT_TARGET_CHARS, ANALYZE_DEBOUNCE_MS } from "../lib/const";
import { stateIdx, canAdvance, reached } from "../lib/pipeline";
import { EntityEditor } from "./EntityEditor";
import { LaneCanvas } from "./LaneCanvas";
import { PartialEditBar } from "./PartialEditBar";
import { RowMenu } from "./RowMenu";
import w from "./writer.module.css";

type CenterMode = "write" | "entities" | "canvas";
const CENTER_TABS: { mode: CenterMode; label: string }[] = [
  { mode: "write", label: "✍ 집필" },
  { mode: "entities", label: "◆ 엔티티" },
  { mode: "canvas", label: "⌥ 인과 캔버스" },
];

export function WriterShell() {
  const api = useCreator();
  const [expProj, setExpProj] = useState<Set<number>>(new Set());
  const [expSeason, setExpSeason] = useState<Set<number>>(new Set());
  const [seasonsByProj, setSeasonsByProj] = useState<Record<number, Season[]>>({});
  const [chBySeason, setChBySeason] = useState<Record<number, Chapter[]>>({});
  const [active, setActive] = useState<ChapterDetail | null>(null);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState<string>("");
  const [newProj, setNewProj] = useState("");
  const [busy, setBusy] = useState<string>("");
  const [result, setResult] = useState<{ kind: string; text: string } | null>(null);
  const [cands, setCands] = useState<{ name: string; description?: string }[] | null>(null);
  const [cards, setCards] = useState<Record<string, { description: string; speech_style: string; relations: string[] }>>({});
  const [canon, setCanon] = useState<{ entities: CanonItem[]; relations: CanonItem[]; events: CanonItem[] } | null>(null);
  const [dbEnts, setDbEnts] = useState<GraphEntity[]>([]);
  const [analysis, setAnalysis] = useState<{ events: CanonItem[]; entities: CanonItem[]; relations: CanonItem[] } | null>(null);
  const [stagedNote, setStagedNote] = useState("");
  const [sel, setSel] = useState<{ start: number; end: number; text: string } | null>(null);
  const [autoAnalyze, setAutoAnalyze] = useState(false);
  const [centerMode, setCenterMode] = useState<CenterMode>("write");
  const [currentProj, setCurrentProj] = useState<number | null>(null);
  const timer = useRef<number>(0);
  const aTimer = useRef<number>(0);
  const textRef = useRef<string>("");
  const autoRef = useRef(false);
  autoRef.current = autoAnalyze;
  const refreshDb = useCallback(async () => {
    if (currentProj == null) { setDbEnts([]); return; }
    try { setDbEnts(await api.graphEntities(currentProj)); } catch { /* */ }
  }, [api.graphEntities, currentProj]);
  useEffect(() => { refreshDb(); }, [refreshDb]);

  const loadSeasons = useCallback(async (pid: number) => {
    const ss = await api.listSeasons(pid);
    setSeasonsByProj((m) => ({ ...m, [pid]: ss }));
  }, [api.listSeasons]);
  const loadChapters = useCallback(async (sid: number) => {
    const cs = await api.listChapters(sid);
    setChBySeason((m) => ({ ...m, [sid]: cs }));
  }, [api.listChapters]);
  const toggleProject = (pid: number) => {
    setCurrentProj(pid);  // 작품 클릭 = 현재 작품 (엔티티/DB 스코프)
    setExpProj((s) => {
      const n = new Set(s);
      if (n.has(pid)) n.delete(pid); else { n.add(pid); loadSeasons(pid); }
      return n;
    });
  };
  const toggleSeason = (sid: number) => setExpSeason((s) => {
    const n = new Set(s);
    if (n.has(sid)) n.delete(sid); else { n.add(sid); loadChapters(sid); }
    return n;
  });
  // 첫 프로젝트 자동 펼침
  useEffect(() => {
    if (api.projects.length && expProj.size === 0) {
      const pid = api.projects[0].id;
      setExpProj(new Set([pid])); loadSeasons(pid); setCurrentProj((c) => c ?? pid);
    }
  }, [api.projects, expProj.size, loadSeasons]);

  const openChapter = async (id: number) => {
    const d = await api.getChapter(id);
    const draft = d.texts.draft?.text ?? "";
    setActive(d); setCurrentProj(d.chapter.project_id); setText(draft); textRef.current = draft; setSaved("불러옴");
    setCands(null); setCanon(null); setResult(null); setSel(null); setStagedNote("");
  };
  const addSeason = async (pid: number) => {
    await api.createSeason(pid);
    setExpProj((s) => new Set(s).add(pid));
    await loadSeasons(pid);
  };
  const addChapter = async (sid: number) => {
    const r = await api.createChapter(sid, "새 화") as { id: number };
    setExpSeason((s) => new Set(s).add(sid));
    await loadChapters(sid);
    openChapter(r.id);
  };
  // ── 이름변경 / 삭제 (full CRUD) ──
  const onRenameProject = async (p: { id: number; title: string }) => {
    const t = window.prompt("작품 이름", p.title); if (!t?.trim()) return;
    await api.renameProject(p.id, t.trim()); api.reloadProjects();
  };
  const onDelProject = async (p: { id: number; title: string }) => {
    if (!window.confirm(`'${p.title}' 작품과 하위 시즌·화 전부 삭제할까요?`)) return;
    await api.deleteProject(p.id);
    if (active && active.chapter.project_id === p.id) setActive(null);
    setExpProj((s) => { const n = new Set(s); n.delete(p.id); return n; });
    api.reloadProjects();
  };
  const onRenameSeason = async (s: Season) => {
    const t = window.prompt("시즌 이름", s.title); if (!t?.trim()) return;
    await api.renameSeason(s.id, t.trim()); loadSeasons(s.project_id);
  };
  const onDelSeason = async (s: Season) => {
    if (!window.confirm(`'${s.title}' 시즌과 하위 화를 삭제할까요?`)) return;
    await api.deleteSeason(s.id);
    if (active && active.chapter.season_id === s.id) setActive(null);
    loadSeasons(s.project_id);
  };
  const onDelChapter = async (c: Chapter) => {
    if (!window.confirm(`'${c.title || c.id}' 화를 삭제할까요?`)) return;
    await api.deleteChapter(c.id);
    if (active?.chapter.id === c.id) setActive(null);
    loadChapters(c.season_id);
  };
  const onRenameChapter = async (c: Chapter) => {
    const t = window.prompt("화 제목", c.title); if (t == null || !t.trim()) return;
    await api.renameChapter(c.id, t.trim());
    loadChapters(c.season_id);
    if (active?.chapter.id === c.id) setActive({ ...active, chapter: { ...active.chapter, title: t.trim() } });
  };
  const onMoveSeason = async (s: Season, projectId: number) => {
    await api.moveSeason(s.id, projectId);
    loadSeasons(s.project_id); loadSeasons(projectId);
    setExpProj((x) => new Set(x).add(projectId));
  };
  const onMoveChapter = async (c: Chapter, seasonId: number) => {
    await api.moveChapter(c.id, seasonId);
    loadChapters(c.season_id); loadChapters(seasonId);
    setExpSeason((x) => new Set(x).add(seasonId));
    if (active?.chapter.id === c.id) setActive({ ...active, chapter: { ...active.chapter, season_id: seasonId } });
  };
  const saveTitle = async () => {
    if (!active) return;
    await api.renameChapter(active.chapter.id, active.chapter.title);
    loadChapters(active.chapter.season_id);
  };

  // 저장 1곳: 최신 textRef를 백엔드로. 블러·디바운스·생성전 flush가 공용으로 호출.
  const cid = active?.chapter.id ?? null;
  const doSave = useCallback(async () => {
    if (cid == null) return;
    setSaved("저장 중…");
    try { await api.saveText(cid, textRef.current); setSaved("저장됨 " + new Date().toLocaleTimeString()); }
    catch (e) { setSaved("저장 실패: " + (e as Error).message); }
  }, [cid, api.saveText]);
  const onText = (v: string) => { setText(v); textRef.current = v; setSaved("수정됨 · 대기"); };
  const onSelectText = (e: { currentTarget: HTMLTextAreaElement }) => {
    const t = e.currentTarget;
    if (t.selectionEnd > t.selectionStart) setSel({ start: t.selectionStart, end: t.selectionEnd, text: t.value.slice(t.selectionStart, t.selectionEnd) });
    else setSel(null);
  };
  const replaceSelection = (s: string) => {
    if (!sel) return;
    const nv = text.slice(0, sel.start) + s + text.slice(sel.end);
    setText(nv); textRef.current = nv; setSel(null); doSave();
  };
  const insertAfterSelection = (s: string) => {
    if (!sel) return;
    const nv = text.slice(0, sel.end) + "\n" + s + text.slice(sel.end);
    setText(nv); textRef.current = nv; setSel(null); doSave();
  };
  const onConfirmDraft = async () => {
    if (!active) return;
    try { await api.advance(active.chapter.id, "POLISH"); setActive({ ...active, state: "POLISH" }); }
    catch (e) { alert("초안 확정 실패: " + (e as Error).message); }
  };

  // 무동작 N초 후 자동저장 (블러/생성전 즉시저장과 병행)
  useEffect(() => {
    if (cid == null) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(doSave, CHAPTER_AUTOSAVE_MS);
    return () => window.clearTimeout(timer.current);
  }, [text, cid, doSave]);

  // 초안 실시간 분석 (전체 노드·엣지·사건). 수동 버튼 + 자동(입력 멈춘 뒤).
  const analyzeNow = useCallback(async () => {
    if (cid == null) return;
    setBusy("analyze");
    try { await doSave(); setAnalysis(await api.analyze(cid)); setStagedNote(""); }
    catch { /* 이전 결과 유지 */ }
    finally { setBusy(""); }
  }, [cid, doSave, api.analyze]);
  const onStage = useCallback(async () => {
    if (cid == null || !analysis) return;
    setBusy("stage");
    try {
      const r = await api.stageToCausal(cid, analysis);
      setStagedNote(`인과 추가됨 — 사건 ${r.events} · 노드 ${r.entities} · 엣지 ${r.relations}`);
      refreshDb();
    } catch (e) { alert("인과 추가 실패: " + (e as Error).message); }
    finally { setBusy(""); }
  }, [cid, analysis, api.stageToCausal, refreshDb]);
  useEffect(() => {
    if (cid == null || !autoAnalyze) return;
    window.clearTimeout(aTimer.current);
    aTimer.current = window.setTimeout(() => { if (autoRef.current) analyzeNow(); }, ANALYZE_DEBOUNCE_MS);
    return () => window.clearTimeout(aTimer.current);
  }, [text, cid, autoAnalyze, analyzeNow]);

  const onToggle = async (mode: string) => {
    if (!active || busy) return;
    setBusy(mode); setResult(null);
    try {
      await doSave();  // 생성은 DB의 초안을 읽으므로 먼저 flush
      const r = await api.gen(active.chapter.id, mode);
      setResult({ kind: r.kind, text: r.text });
      setActive({ ...active, state: r.state });
    } catch (e) { alert("생성 실패: " + (e as Error).message); }
    finally { setBusy(""); }
  };
  const accept = async () => {
    if (!active || !result) return;
    setText(result.text); textRef.current = result.text;
    await api.saveText(active.chapter.id, result.text);
    setResult(null); setSaved("저장됨 " + new Date().toLocaleTimeString());
  };
  const onDetect = async () => {
    if (!active || busy) return;
    setBusy("detect");
    try { await doSave(); const r = await api.detect(active.chapter.id); setCands(r.candidates); setActive({ ...active, state: r.state }); }
    catch (e) { alert("감지 실패: " + (e as Error).message); }
    finally { setBusy(""); }
  };
  const onAssist = async (name: string) => {
    setBusy("assist:" + name);
    try { const c = await api.assist(name, "", active?.chapter.id); setCards((p) => ({ ...p, [name]: c })); }
    catch (e) { alert("보조 실패: " + (e as Error).message); }
    finally { setBusy(""); }
  };
  const onRegister = async (name: string) => {
    if (!active) return;
    const c = cards[name];
    await api.registerEntity({ name, category: "character", description: c?.description ?? "", speech_style: c?.speech_style ?? "", relations: c?.relations ?? [] }, active.chapter.id);
    setCands((cs) => cs?.filter((x) => x.name !== name) ?? null);
    setActive((a) => a && { ...a, state: "DB_SYNC" });
    refreshDb();
  };
  const onCanonDiff = async () => {
    if (!active || busy) return;
    setBusy("canon");
    try { await doSave(); const r = await api.canonDiff(active.chapter.id); setCanon({ entities: r.entities, relations: r.relations, events: r.events }); setActive({ ...active, state: r.state }); }
    catch (e) { alert("추출 실패: " + (e as Error).message); }
    finally { setBusy(""); }
  };
  const onPromote = async () => {
    if (!active || !canon) return;
    const r = await api.canonPromote(active.chapter.id, canon.entities, canon.relations, canon.events);
    setCanon(null); setActive((a) => a && { ...a, state: r.state }); refreshDb();
  };

  const over = text.length > DRAFT_TARGET_CHARS;

  // 현재 화 상태 기반 버튼 활성/강조 (실제 작업과 연동). active=강조(이미 그 단계 도달).
  const cur = active?.state ?? "";
  const genActions = cur === "DRAFT"
    ? [{ mode: "draft", label: "초안 재생성", enabled: !!active && !!text, active: false }]
    : [
        { mode: "polish", label: "→ 다듬기", enabled: canAdvance(cur, "POLISH"), active: cur === "POLISH" },
        { mode: "expand", label: "→ 완성본", enabled: canAdvance(cur, "EXPAND"), active: cur === "EXPAND" },
      ];
  const bottomBar = active && centerMode === "write" && !result && !cands && !canon && (
    sel
      ? <PartialEditBar api={api} chapterId={active.chapter.id} projectId={currentProj} sel={sel}
          onReplace={replaceSelection} onInsert={insertAfterSelection} onClose={() => setSel(null)}
          onRegistered={refreshDb} />
      : (
        <div className={w.genBar}>
          <span className={w.genLbl}>생성</span>
          {genActions.map((a) => (
            <Button key={a.mode} variant={a.active ? "primary" : "default"}
              disabled={!a.enabled || !!busy} onClick={() => onToggle(a.mode)}>
              {busy === a.mode ? <><Spinner /> 생성 중…</> : a.label}
            </Button>
          ))}
          {cur === "DRAFT" && (
            <Button variant="primary" disabled={!active || !text || !!busy} onClick={onConfirmDraft}>초안 확정 →</Button>
          )}
        </div>
      )
  );

  const left = (
    <Panel title="탐색기" className={w.fill}>
      <div className={w.newRow}>
        <Input value={newProj} onChange={(e) => setNewProj(e.target.value)} placeholder="새 프로젝트" />
        <Button onClick={async () => { if (newProj.trim()) { await api.createProject(newProj.trim()); setNewProj(""); } }}>+</Button>
      </div>
      <div className={w.tree}>
        {api.projects.map((p) => {
          const pOpen = expProj.has(p.id);
          const seasons = seasonsByProj[p.id] ?? [];
          return (
            <div key={p.id}>
              <div className={w.row} onClick={() => toggleProject(p.id)}>
                <span className={w.chev}>{pOpen ? "▾" : "▸"}</span>
                <span className={w.ic}>📁</span>
                <span className={w.name} title="더블클릭=이름변경"
                  onDoubleClick={(e) => { e.stopPropagation(); onRenameProject(p); }}>{p.title}</span>
                <RowMenu items={[
                  { label: "＋ 새 시즌", onClick: () => addSeason(p.id) },
                  { label: "이름 변경", onClick: () => onRenameProject(p) },
                  { label: "", sep: true },
                  { label: "작품 삭제", danger: true, onClick: () => onDelProject(p) },
                ]} />
              </div>
              {pOpen && seasons.map((s) => {
                const sOpen = expSeason.has(s.id);
                const chs = chBySeason[s.id] ?? [];
                return (
                  <div key={s.id}>
                    <div className={w.row} style={{ paddingLeft: 24 }} onClick={() => toggleSeason(s.id)}>
                      <span className={w.chev}>{sOpen ? "▾" : "▸"}</span>
                      <span className={w.ic}>📂</span>
                      <span className={w.name} title="더블클릭=이름변경"
                        onDoubleClick={(e) => { e.stopPropagation(); onRenameSeason(s); }}>{s.title}</span>
                      <RowMenu items={[
                        { label: "＋ 새 화", onClick: () => addChapter(s.id) },
                        { label: "이름 변경", onClick: () => onRenameSeason(s) },
                        { label: "다른 작품으로 이동",
                          submenu: api.projects.filter((pp) => pp.id !== s.project_id)
                            .map((pp) => ({ label: pp.title, onClick: () => onMoveSeason(s, pp.id) })) },
                        { label: "", sep: true },
                        { label: "시즌 삭제", danger: true, onClick: () => onDelSeason(s) },
                      ]} />
                    </div>
                    {sOpen && chs.map((c) => (
                      <div key={c.id} className={w.row} data-on={active?.chapter.id === c.id}
                        style={{ paddingLeft: 48 }} onClick={() => openChapter(c.id)}>
                        <span className={w.ic}>📄</span>
                        <span className={w.name}>{c.title || `(${c.id})`}</span>
                        <span className={w.badge}>{c.state}</span>
                        <RowMenu items={[
                          { label: "이름 변경", onClick: () => onRenameChapter(c) },
                          { label: "다른 시즌으로 이동",
                            submenu: (seasonsByProj[c.project_id] ?? []).filter((ss) => ss.id !== c.season_id)
                              .map((ss) => ({ label: ss.title, onClick: () => onMoveChapter(c, ss.id) })) },
                          { label: "", sep: true },
                          { label: "화 삭제", danger: true, onClick: () => onDelChapter(c) },
                        ]} />
                      </div>
                    ))}
                    {sOpen && !chs.length && <div className={w.empty} style={{ paddingLeft: 48 }}>화 없음 — ＋</div>}
                  </div>
                );
              })}
              {pOpen && !seasons.length && <div className={w.empty}>시즌 없음 — ＋</div>}
            </div>
          );
        })}
      </div>
      <div className={w.projHead}>DB · 엔티티 ({dbEnts.length})</div>
      <div className={w.tree}>
        {dbEnts.slice(0, 60).map((e) => (
          <div key={e.id} className={w.row}>
            <span className={w.ic}>◆</span>
            <span className={w.name}>{e.name}</span>
            <span className={w.badge} style={{ color: e.source === "canon" ? "var(--jade)" : "var(--text-mut)" }}>{e.source}</span>
          </div>
        ))}
        {!dbEnts.length && <div className={w.empty}>아직 등록된 엔티티 없음</div>}
      </div>
    </Panel>
  );

  const editor = active && (
    <div className={w.editorWrap}>
      <input className={w.titleInput} value={active.chapter.title} onBlur={saveTitle}
        onChange={(e) => setActive({ ...active, chapter: { ...active.chapter, title: e.target.value } })} />
      <textarea className={w.editor} value={text} onBlur={doSave} readOnly={!!sel}
        onSelect={onSelectText} onMouseUp={onSelectText} onKeyUp={onSelectText}
        onChange={(e) => onText(e.target.value)}
        placeholder="여기에 ~2000자 초안을 씁니다. 드래그하면 아래에서 AI 부분수정. 멈추거나(10초) 칸을 벗어나면 자동 저장돼요." />
      <div className={w.editBar}>
        <span className={w.count} data-over={over}>{text.length} / {DRAFT_TARGET_CHARS}자{over ? " — 청킹 권고" : ""}</span>
        {dbEnts.filter((e) => e.name && text.includes(e.name)).slice(0, 8).map((e) => (
          <span key={e.id} className={w.inlineTag}>{e.name}</span>
        ))}
        <span className={w.savedBadge}><Badge tone="jade">저장: {saved || "—"}</Badge></span>
      </div>
      {bottomBar}
      <div className={w.analysisPanel}>
        <div className={w.analysisHead}>
          <span>초안 분석 — 노드·엣지·사건</span>
          {analysis && <span className={w.aCount}>사건 {analysis.events.length} · 노드 {analysis.entities.length} · 엣지 {analysis.relations.length}</span>}
          {stagedNote && <span className={w.aStaged}>✓ {stagedNote}</span>}
          <span className={w.aTools}>
            <span className={w.muted}>자동</span><Toggle on={autoAnalyze} onChange={setAutoAnalyze} />
            <Button disabled={busy === "analyze"} onClick={analyzeNow}>
              {busy === "analyze" ? <><Spinner /> 분석…</> : "분석"}</Button>
            <Button variant="primary" disabled={!analysis || busy === "stage"} onClick={onStage}>
              {busy === "stage" ? <><Spinner /> 추가…</> : "인과로 추가"}</Button>
          </span>
        </div>
        {analysis ? (
          <div className={w.analysisBody}>
            <div className={w.aCol}>
              <div className={w.aColH}>사건 ({analysis.events.length})</div>
              {analysis.events.map((e, i) => <div key={i} className={w.aItem}>📅 {e.title}</div>)}
              {!analysis.events.length && <div className={w.aEmpty}>—</div>}
            </div>
            <div className={w.aCol}>
              <div className={w.aColH}>노드 ({analysis.entities.length})</div>
              {analysis.entities.map((e, i) => <div key={i} className={w.aItem}>◆ {e.name} <span className={w.muted}>{e.category}</span></div>)}
              {!analysis.entities.length && <div className={w.aEmpty}>—</div>}
            </div>
            <div className={w.aCol}>
              <div className={w.aColH}>엣지 ({analysis.relations.length})</div>
              {analysis.relations.map((r, i) => <div key={i} className={w.aItem}>{r.from} <span className={w.muted}>—{r.rel}→</span> {r.to}</div>)}
              {!analysis.relations.length && <div className={w.aEmpty}>—</div>}
            </div>
          </div>
        ) : <div className={w.aEmpty} style={{ padding: 12 }}>「분석」을 누르거나 자동을 켜면 초안의 사건·노드·엣지가 실시간으로 표시됩니다.</div>}
      </div>
    </div>
  );
  const diff = active && result && (
    <div className={w.editorWrap}>
      <div className={w.diffHead}>
        <span>생성 결과 · {result.kind} ({result.text.length}자)</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <Button variant="primary" onClick={accept}>채택 (초안에 반영)</Button>
          <Button variant="ghost" onClick={() => setResult(null)}>닫기</Button>
        </span>
      </div>
      <div className={w.diffGrid}>
        <div className={w.diffPane}><div className={w.paneLbl}>원안</div><pre className={w.prose}>{text || "(빈 초안)"}</pre></div>
        <div className={w.diffPane}><div className={w.paneLbl}>결과</div><pre className={w.prose}>{result.text}</pre></div>
      </div>
    </div>
  );
  const charPanel = active && cands && (
    <div className={w.editorWrap}>
      <div className={w.diffHead}>
        <span>신규 캐릭터 감지 · {cands.length}명 (CHAR_DETECT)</span>
        <span style={{ marginLeft: "auto" }}><Button variant="ghost" onClick={() => setCands(null)}>닫기</Button></span>
      </div>
      <div className={w.charList}>
        {cands.length === 0 && <div className={w.placeholder} style={{ height: "auto", padding: 24 }}>새 캐릭터 없음 — 본문에서 기존 외 인물을 못 찾음</div>}
        {cands.map((c) => (
          <div key={c.name} className={w.charItem}>
            <div className={w.charHead}>
              <b>{c.name}</b>
              <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                <Button disabled={busy === "assist:" + c.name} onClick={() => onAssist(c.name)}>
                  {busy === "assist:" + c.name ? <><Spinner /> …</> : "보조 생성"}</Button>
                <Button variant="primary" onClick={() => onRegister(c.name)}>DB 등록</Button>
              </span>
            </div>
            <div className={w.charDesc}>{cards[c.name]?.description || c.description || "(설명 없음 — 보조 생성으로 세계관 맞춰 채우기)"}</div>
            {cards[c.name]?.speech_style && <div className={w.charMeta}>말투: {cards[c.name].speech_style}</div>}
          </div>
        ))}
      </div>
    </div>
  );
  const canonPanel = active && canon && (
    <div className={w.editorWrap}>
      <div className={w.diffHead}>
        <span>정사 승격 (DB_SYNC2) · 엔티티 {canon.entities.length} · 관계 {canon.relations.length} · 사건 {canon.events.length}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <Button variant="primary" onClick={onPromote}>전체 승격 → canon</Button>
          <Button variant="ghost" onClick={() => setCanon(null)}>닫기</Button>
        </span>
      </div>
      <div className={w.charList}>
        {canon.entities.map((e, i) => <div key={"e" + i} className={w.canonRow} data-change={e.change}><span className={w.cTag}>{e.change}</span><b>{e.name}</b><span className={w.charDesc}> {e.description}</span></div>)}
        {canon.relations.map((r, i) => <div key={"r" + i} className={w.canonRow} data-change={r.change}><span className={w.cTag}>{r.change}</span>{r.from} —{r.rel}→ {r.to}</div>)}
        {canon.events.map((v, i) => <div key={"v" + i} className={w.canonRow} data-change={v.change}><span className={w.cTag}>{v.change}</span>📅 {v.title}</div>)}
        {!canon.entities.length && !canon.relations.length && !canon.events.length && <div className={w.placeholder} style={{ height: "auto", padding: 24 }}>추출된 노드/엣지 없음</div>}
      </div>
    </div>
  );
  const writeCenter = !active
    ? <div className={w.placeholder}>좌측에서 화를 열거나 새로 만드세요.</div>
    : (canon ? canonPanel : (cands ? charPanel : (result ? diff : editor)));
  const centerInner = centerMode === "entities"
    ? <EntityEditor api={api} projectId={currentProj} onChanged={refreshDb} />
    : centerMode === "canvas"
      ? <LaneCanvas api={api} projectId={currentProj} chapterId={active?.chapter.id ?? null} />
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

  // 스테퍼: 지난 단계=done, 현재=cur, 이후=future (실제 상태 반영, 가짜 불 제거)
  const ci = stateIdx(cur);
  const right = (
    <div className={w.rail}>
      <div className={w.railTitle}>파이프라인 {active && <span className={w.railCur}>· {cur}</span>}</div>
      <div className={w.stepper}>
        {api.states.map((s) => {
          const si = stateIdx(s);
          const status = !active ? "off" : si < ci ? "done" : si === ci ? "cur" : "future";
          return (
            <div key={s} className={w.step} data-status={status}>
              <span className={w.dot} />{s}
            </div>
          );
        })}
      </div>
      <div className={w.toggles}>
        <span className={w.lbl}>구조화</span>
        <Button variant={cur === "CHAR_DETECT" ? "primary" : "default"}
          disabled={!canAdvance(cur, "CHAR_DETECT") || !!busy} onClick={onDetect}>
          {busy === "detect" ? <><Spinner /> 감지 중…</> : "캐릭터 감지"}
        </Button>
        <Button variant={cur === "EXTRACT" ? "primary" : "default"}
          disabled={!active || !reached(cur, "CTX_RESET_B") || !!busy} onClick={onCanonDiff}>
          {busy === "canon" ? <><Spinner /> 추출 중…</> : "정사 추출·diff"}
        </Button>
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
