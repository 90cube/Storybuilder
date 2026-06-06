import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Input, Panel, Spinner } from "../components/primitives";
import { AspectLayout, ResizableSplit, StatusBar, Titlebar } from "../components/shell";
import { useCreator, type Season, type Chapter, type ChapterDetail, type CanonItem, type GraphEntity } from "../lib/useCreator";
import { CHAPTER_AUTOSAVE_MS, DRAFT_TARGET_CHARS } from "../lib/const";
import w from "./writer.module.css";

const TOGGLES: { mode: string; label: string }[] = [
  { mode: "draft", label: "초안→초안" },
  { mode: "polish", label: "→ 다듬기" },
  { mode: "expand", label: "→ 완성본" },
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
  const timer = useRef<number>(0);
  const textRef = useRef<string>("");
  const refreshDb = useCallback(async () => { try { setDbEnts(await api.graphEntities()); } catch { /* */ } }, [api.graphEntities]);
  useEffect(() => { refreshDb(); }, [refreshDb]);

  const loadSeasons = useCallback(async (pid: number) => {
    const ss = await api.listSeasons(pid);
    setSeasonsByProj((m) => ({ ...m, [pid]: ss }));
  }, [api.listSeasons]);
  const loadChapters = useCallback(async (sid: number) => {
    const cs = await api.listChapters(sid);
    setChBySeason((m) => ({ ...m, [sid]: cs }));
  }, [api.listChapters]);
  const toggleProject = (pid: number) => setExpProj((s) => {
    const n = new Set(s);
    if (n.has(pid)) n.delete(pid); else { n.add(pid); loadSeasons(pid); }
    return n;
  });
  const toggleSeason = (sid: number) => setExpSeason((s) => {
    const n = new Set(s);
    if (n.has(sid)) n.delete(sid); else { n.add(sid); loadChapters(sid); }
    return n;
  });
  // 첫 프로젝트 자동 펼침
  useEffect(() => {
    if (api.projects.length && expProj.size === 0) {
      const pid = api.projects[0].id;
      setExpProj(new Set([pid])); loadSeasons(pid);
    }
  }, [api.projects, expProj.size, loadSeasons]);

  const openChapter = async (id: number) => {
    const d = await api.getChapter(id);
    const draft = d.texts.draft?.text ?? "";
    setActive(d); setText(draft); textRef.current = draft; setSaved("불러옴");
    setCands(null); setCanon(null); setResult(null);
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

  // 무동작 N초 후 자동저장 (블러/생성전 즉시저장과 병행)
  useEffect(() => {
    if (cid == null) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(doSave, CHAPTER_AUTOSAVE_MS);
    return () => window.clearTimeout(timer.current);
  }, [text, cid, doSave]);

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
  const onPartialPolish = async () => {
    if (!active || busy) return;
    setBusy("pp");
    try { await doSave(); const r = await api.ppPolish(active.chapter.id); setResult({ kind: "final", text: r.text }); setActive({ ...active, state: r.state }); }
    catch (e) { alert("다듬기 실패: " + (e as Error).message); }
    finally { setBusy(""); }
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
    const r = await api.canonPromote(active.chapter.id, canon.entities, canon.relations);
    setCanon(null); setActive((a) => a && { ...a, state: r.state }); refreshDb();
  };

  const over = text.length > DRAFT_TARGET_CHARS;

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
                <button className={w.addBtn} title="새 시즌"
                  onClick={(e) => { e.stopPropagation(); addSeason(p.id); }}>＋</button>
                <button className={w.delBtn} title="작품 삭제"
                  onClick={(e) => { e.stopPropagation(); onDelProject(p); }}>🗑</button>
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
                      <button className={w.addBtn} title="새 화"
                        onClick={(e) => { e.stopPropagation(); addChapter(s.id); }}>＋</button>
                      <button className={w.delBtn} title="시즌 삭제"
                        onClick={(e) => { e.stopPropagation(); onDelSeason(s); }}>🗑</button>
                    </div>
                    {sOpen && chs.map((c) => (
                      <div key={c.id} className={w.row} data-on={active?.chapter.id === c.id}
                        style={{ paddingLeft: 48 }} onClick={() => openChapter(c.id)}>
                        <span className={w.ic}>📄</span>
                        <span className={w.name}>{c.title || `(${c.id})`}</span>
                        <span className={w.badge}>{c.state}</span>
                        <button className={w.delBtn} title="화 삭제"
                          onClick={(e) => { e.stopPropagation(); onDelChapter(c); }}>🗑</button>
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
      <textarea className={w.editor} value={text} onBlur={doSave}
        onChange={(e) => onText(e.target.value)}
        placeholder="여기에 ~2000자 초안을 씁니다. 멈추거나(10초) 칸을 벗어나면 자동 저장돼요." />
      <div className={w.editBar}>
        <span className={w.count} data-over={over}>{text.length} / {DRAFT_TARGET_CHARS}자{over ? " — 청킹 권고" : ""}</span>
        {dbEnts.filter((e) => e.name && text.includes(e.name)).slice(0, 8).map((e) => (
          <span key={e.id} className={w.inlineTag}>{e.name}</span>
        ))}
        <span className={w.savedBadge}><Badge tone="jade">저장: {saved || "—"}</Badge></span>
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
  const center = !active
    ? <div className={w.placeholder}>좌측에서 화를 열거나 새로 만드세요.</div>
    : (canon ? canonPanel : (cands ? charPanel : (result ? diff : editor)));

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
            disabled={!active || !!busy} onClick={() => onToggle(t.mode)}>
            {busy === t.mode ? <><Spinner /> 생성 중…</> : t.label}
          </Button>
        ))}
        <span className={w.lbl} style={{ marginTop: 6 }}>구조화</span>
        <Button disabled={!active || !!busy} onClick={onDetect}>
          {busy === "detect" ? <><Spinner /> 감지 중…</> : "캐릭터 감지"}
        </Button>
        <span className={w.lbl} style={{ marginTop: 6 }}>후공정 (강제 초기화)</span>
        <Button disabled={!active || !!busy} onClick={onPartialPolish}>
          {busy === "pp" ? <><Spinner /> 다듬는 중…</> : "부분 다듬기"}
        </Button>
        <Button disabled={!active || !!busy} onClick={onCanonDiff}>
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
