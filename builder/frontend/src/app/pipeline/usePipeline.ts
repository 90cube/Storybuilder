/** 파이프라인 오케스트레이션 — 생성·채택·캐릭터감지·정사추출/승격 + 초안분석(흡수). busy 1곳 공유. */
import { useCallback, useEffect, useRef, useState } from "react";
import { type ChapterDetail, type CanonItem } from "../../lib/useCreator";
import { ANALYZE_DEBOUNCE_MS } from "../../lib/const";
import { useCreatorCtx } from "../CreatorProvider";

type Card = { description: string; speech_style: string; relations: string[] };
type Cand = { name: string; description?: string };
type Canon = { entities: CanonItem[]; relations: CanonItem[]; events: CanonItem[] };
type Analysis = { events: CanonItem[]; entities: CanonItem[]; relations: CanonItem[] };

type Opts = {
  active: ChapterDetail | null;
  setActive: React.Dispatch<React.SetStateAction<ChapterDetail | null>>;
  text: string;
  doSave: () => Promise<void>;
  applyText: (s: string) => void;     // draft.setText — accept 시 결과를 본문에 반영
  refreshDb: () => void;
  autoAnalyze: boolean;
  setAutoAnalyze: (on: boolean) => void;
};

export function usePipeline(opts: Opts) {
  const { active, setActive, text, doSave, applyText, refreshDb, autoAnalyze, setAutoAnalyze } = opts;
  const api = useCreatorCtx();
  const [busy, setBusy] = useState<string>("");
  const [result, setResult] = useState<{ kind: string; text: string } | null>(null);
  const [cands, setCands] = useState<Cand[] | null>(null);
  const [cards, setCards] = useState<Record<string, Card>>({});
  const [canon, setCanon] = useState<Canon | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [stagedNote, setStagedNote] = useState("");
  const cid = active?.chapter.id ?? null;
  const aTimer = useRef<number>(0);
  const autoRef = useRef(false);
  autoRef.current = autoAnalyze;

  /** 화 전환 시 파이프라인 결과 초기화 (openChapter가 호출). */
  const resetForChapter = useCallback(() => {
    setCands(null); setCanon(null); setResult(null); setStagedNote(""); setAnalysis(null);
  }, []);

  // ── 초안 실시간 분석 (전체 노드·엣지·사건). 수동 버튼 + 자동(입력 멈춘 뒤). ──
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

  // ── 생성·채택 ──
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
    applyText(result.text);  // textRef 동기화는 draft.setText가 보장 → doSave가 최신 본문 저장
    await doSave();
    setResult(null);
  };

  // ── 캐릭터 감지·보조·등록 ──
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

  // ── 정사 추출·승격 ──
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

  // ── 초안 확정(POLISH 전이) ──
  const onConfirmDraft = async () => {
    if (!active) return;
    try { await api.advance(active.chapter.id, "POLISH"); setActive({ ...active, state: "POLISH" }); }
    catch (e) { alert("초안 확정 실패: " + (e as Error).message); }
  };

  // 패널 개별 닫기 — 원본 setResult/setCands/setCanon(null)과 동일(해당 상태만 비움).
  const closeResult = useCallback(() => setResult(null), []);
  const closeCands = useCallback(() => setCands(null), []);
  const closeCanon = useCallback(() => setCanon(null), []);

  return {
    busy, result, cands, cards, canon, analysis, stagedNote, autoAnalyze, setAutoAnalyze,
    resetForChapter, onToggle, accept, onDetect, onAssist, onRegister,
    onCanonDiff, onPromote, analyzeNow, onStage, onConfirmDraft,
    closeResult, closeCands, closeCanon,
  };
}
