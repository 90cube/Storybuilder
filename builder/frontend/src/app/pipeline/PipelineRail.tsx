/** 우측 레일 렌더 — 파이프라인 스테퍼(실제 화 상태 반영) + 구조화(캐릭터감지·정사추출) 버튼. */
import { Button, Spinner } from "../../components/primitives";
import { type ChapterDetail } from "../../lib/useCreator";
import { useCreatorCtx } from "../CreatorProvider";
import w from "../writer.module.css";

type Props = {
  active: ChapterDetail | null;
  text: string;
  busy: string;
  onDetect: () => void;
  onCanonDiff: () => void;
};

export function PipelineRail({ active, text, busy, onDetect, onCanonDiff }: Props) {
  const api = useCreatorCtx();
  const cur = active?.state ?? "";
  // 스테퍼 순서는 서버가 준 단계 목록(api.states, =domain/pipeline.STATES)을 단일 출처로 사용.
  const ci = api.states.indexOf(cur);
  // 구조화 disabled 규칙: 화 없음·DRAFT·본문 없음·생성 중이면 비활성.
  const toolsOff = !active || cur === "DRAFT" || !text || !!busy;
  return (
    <div className={w.rail}>
      <div className={w.railTitle}>파이프라인 {active && <span className={w.railCur}>· {cur}</span>}</div>
      <div className={w.stepper}>
        {api.states.map((s, si) => {
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
        <Button variant={cur === "CHAR_DETECT" ? "primary" : "default"} disabled={toolsOff} onClick={onDetect}>
          {busy === "detect" ? <><Spinner /> 감지 중…</> : "캐릭터 감지"}
        </Button>
        <Button variant={cur === "EXTRACT" ? "primary" : "default"} disabled={toolsOff} onClick={onCanonDiff}>
          {busy === "canon" ? <><Spinner /> 추출 중…</> : "정사 추출·diff"}
        </Button>
      </div>
    </div>
  );
}
