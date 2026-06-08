/** 생성 결과 diff 렌더 — 원안/결과 2-pane + 채택(초안 반영)·닫기. 상태·로직은 usePipeline 소유. */
import { Button } from "../../components/primitives";
import w from "../writer.module.css";

type Props = {
  result: { kind: string; text: string };
  text: string;
  onAccept: () => void;
  onClose: () => void;
};

export function ResultDiff({ result, text, onAccept, onClose }: Props) {
  return (
    <div className={w.editorWrap}>
      <div className={w.diffHead}>
        <span>생성 결과 · {result.kind} ({result.text.length}자)</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <Button variant="primary" onClick={onAccept}>채택 (초안에 반영)</Button>
          <Button variant="ghost" onClick={onClose}>닫기</Button>
        </span>
      </div>
      <div className={w.diffGrid}>
        <div className={w.diffPane}><div className={w.paneLbl}>원안</div><pre className={w.prose}>{text || "(빈 초안)"}</pre></div>
        <div className={w.diffPane}><div className={w.paneLbl}>결과</div><pre className={w.prose}>{result.text}</pre></div>
      </div>
    </div>
  );
}
