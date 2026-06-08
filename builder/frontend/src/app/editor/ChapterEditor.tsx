/** 에디터 본체 렌더 — 타이틀 input + 본문 textarea + editBar(글자수·인라인 태그·저장배지). */
import { Badge } from "../../components/primitives";
import { type ChapterDetail, type GraphEntity } from "../../lib/useCreator";
import { DRAFT_TARGET_CHARS } from "../../lib/const";
import w from "../writer.module.css";

type Sel = { start: number; end: number; text: string } | null;

type Props = {
  active: ChapterDetail;
  text: string;
  saved: string;
  sel: Sel;
  dbEnts: GraphEntity[];
  onText: (v: string) => void;
  onSelectText: (e: { currentTarget: HTMLTextAreaElement }) => void;
  doSave: () => void;
  onTitleChange: (title: string) => void;
  saveTitle: () => void;
};

export function ChapterEditor({ active, text, saved, sel, dbEnts, onText, onSelectText, doSave, onTitleChange, saveTitle }: Props) {
  const over = text.length > DRAFT_TARGET_CHARS;
  return (
    <>
      <input className={w.titleInput} value={active.chapter.title} onBlur={saveTitle}
        onChange={(e) => onTitleChange(e.target.value)} />
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
    </>
  );
}
