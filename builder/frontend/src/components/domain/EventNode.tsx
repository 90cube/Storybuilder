import { Handle, Position, type NodeProps } from "@xyflow/react";
import s from "./domain.module.css";

/** React Flow 커스텀 노드: 사건 1개 (era + 제목, 앵커 강조, draft_auto=임시 흐림). */
export function EventNode({ data }: NodeProps) {
  const d = data as { title: string; era: string; anchor?: boolean; draft?: boolean };
  return (
    <div className={`${s.evNode} ${d.anchor ? s.evAnchor : ""} ${d.draft ? s.evDraft : ""}`}>
      <Handle type="target" position={Position.Left} />
      <div className={s.evEra}>{d.era}{d.draft ? " · 임시" : ""}</div>
      <div className={s.evTitle}>{d.title}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
