import { useCallback, useMemo, useState } from "react";
import {
  Background, Controls, ReactFlow, ReactFlowProvider, useReactFlow,
  type Edge, type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { EventNode } from "./EventNode";
import type { Character } from "./CharacterCard";
import s from "./domain.module.css";

export type CanvasEvent = {
  id: string; title: string; era: string; anchor?: boolean;
  col?: number; row?: number; // 지정 시 인과 focus 레이아웃(좌=선행/중=초점/우=후행)
};
export type CanvasEdge = { from: string; to: string };
type Props = {
  events: CanvasEvent[];
  edges: CanvasEdge[];
  onDropCharacter?: (character: Character, pos: { x: number; y: number }) => void;
  onNodeClick?: (id: string) => void;
  hint?: string;
};

const nodeTypes = { event: EventNode };

function Inner({ events, edges, onDropCharacter, onNodeClick, hint }: Props) {
  const rf = useReactFlow();
  const [over, setOver] = useState(false);
  // useMemo: 드래그오버 등으로 인한 재렌더에도 노드/엣지 식별자를 안정시켜
  // React Flow가 깜빡(blank)이지 않게 한다.
  const nodes = useMemo<Node[]>(() => events.map((e, i) => ({
    id: e.id, type: "event",
    position: e.col != null
      ? { x: e.col * 250, y: (e.row ?? 0) * 120 }
      : { x: i * 210, y: (i % 2) * 90 },
    data: { title: e.title, era: e.era, anchor: e.anchor },
  })), [events]);
  const rfEdges = useMemo<Edge[]>(() => edges.map((ed) => ({
    id: `${ed.from}-${ed.to}`, source: ed.from, target: ed.to, animated: true,
  })), [edges]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.dataTransfer.dropEffect = "copy";
    setOver((v) => v || true); // 이미 true면 재렌더 없음
  }, []);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setOver(false);
    const json = e.dataTransfer.getData("application/character-json");
    if (!json) return;
    try {
      const c = JSON.parse(json) as Character;
      const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      onDropCharacter?.(c, pos);
    } catch { /* 잘못된 페이로드 무시 */ }
  }, [rf, onDropCharacter]);

  return (
    <div className={s.canvas} data-over={over} onDragOver={onDragOver}
      onDragLeave={() => setOver(false)} onDrop={onDrop}>
      <div className={s.dropHint}>{hint ?? "사건 노드를 클릭해 앵커(처음·끝) 지정 · 인물을 드롭"}</div>
      <ReactFlow nodes={nodes} edges={rfEdges} nodeTypes={nodeTypes}
        fitView nodesDraggable={false} proOptions={{ hideAttribution: true }}
        onNodeClick={(_, n) => onNodeClick?.(n.id)}>
        <Background color="#2c3142" gap={20} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

/** 인과 확대 캔버스 — 사건 노드/엣지 + 인물 드롭존. */
export function CausalCanvas(props: Props) {
  return <ReactFlowProvider><Inner {...props} /></ReactFlowProvider>;
}
