/** 초안 본문 상태 + 저장 1곳(블러·디바운스·flush 공용) + 선택 부분수정. chapterId 변화 시 initialText로 리셋. */
import { useCallback, useEffect, useRef, useState } from "react";
import { CHAPTER_AUTOSAVE_MS } from "../../lib/const";
import { useCreatorCtx } from "../CreatorProvider";

type Sel = { start: number; end: number; text: string } | null;

export function useChapterDraft(opts: { chapterId: number | null; initialText: string }) {
  const { chapterId, initialText } = opts;
  const api = useCreatorCtx();
  const [text, setTextState] = useState("");
  const [saved, setSaved] = useState<string>("");
  const [sel, setSel] = useState<Sel>(null);
  const timer = useRef<number>(0);
  const textRef = useRef<string>("");

  // 화 전환 시 본문을 해당 화 초안으로 초기화 (구 openChapter의 setText(draft) 역할).
  useEffect(() => {
    setTextState(initialText); textRef.current = initialText;
    setSel(null); setSaved(chapterId == null ? "" : "불러옴");
  }, [chapterId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 저장 1곳: 최신 textRef를 백엔드로. 블러·디바운스·생성전 flush가 공용으로 호출.
  const doSave = useCallback(async () => {
    if (chapterId == null) return;
    setSaved("저장 중…");
    try { await api.saveText(chapterId, textRef.current); setSaved("저장됨 " + new Date().toLocaleTimeString()); }
    catch (e) { setSaved("저장 실패: " + (e as Error).message); }
  }, [chapterId, api.saveText]);

  // 외부(파이프라인 accept 등)에서 본문을 통째로 갈아끼울 때. textRef 동기화 보장.
  const setText = useCallback((s: string) => { setTextState(s); textRef.current = s; }, []);
  const onText = (v: string) => { setText(v); setSaved("수정됨 · 대기"); };
  const onSelectText = (e: { currentTarget: HTMLTextAreaElement }) => {
    const t = e.currentTarget;
    if (t.selectionEnd > t.selectionStart) setSel({ start: t.selectionStart, end: t.selectionEnd, text: t.value.slice(t.selectionStart, t.selectionEnd) });
    else setSel(null);
  };
  const replaceSelection = (s: string) => {
    if (!sel) return;
    setText(text.slice(0, sel.start) + s + text.slice(sel.end)); setSel(null); doSave();
  };
  const insertAfterSelection = (s: string) => {
    if (!sel) return;
    setText(text.slice(0, sel.end) + "\n" + s + text.slice(sel.end)); setSel(null); doSave();
  };

  // 무동작 N초 후 자동저장 (블러/생성전 즉시저장과 병행).
  useEffect(() => {
    if (chapterId == null) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(doSave, CHAPTER_AUTOSAVE_MS);
    return () => window.clearTimeout(timer.current);
  }, [text, chapterId, doSave]);

  return { text, saved, sel, onText, onSelectText, doSave, replaceSelection, insertAfterSelection, setSel, setText };
}
