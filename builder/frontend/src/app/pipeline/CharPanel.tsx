/** 신규 캐릭터 감지 목록 렌더 — 후보별 보조생성·DB등록 + 닫기. 상태·로직은 usePipeline 소유. */
import { Button, Spinner } from "../../components/primitives";
import w from "../writer.module.css";

type Card = { description: string; speech_style: string; relations: string[] };
type Cand = { name: string; description?: string };

type Props = {
  cands: Cand[];
  cards: Record<string, Card>;
  busy: string;
  onAssist: (name: string) => void;
  onRegister: (name: string) => void;
  onClose: () => void;
};

export function CharPanel({ cands, cards, busy, onAssist, onRegister, onClose }: Props) {
  return (
    <div className={w.editorWrap}>
      <div className={w.diffHead}>
        <span>신규 캐릭터 감지 · {cands.length}명</span>
        <span style={{ marginLeft: "auto" }}><Button variant="ghost" onClick={onClose}>닫기</Button></span>
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
}
