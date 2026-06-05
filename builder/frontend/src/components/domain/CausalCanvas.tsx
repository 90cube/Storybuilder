import { useCallback } from "react";
import {
  Background, Controls, ReactFlow, ReactFlowProvider, useReactFlow,
  type Edge, type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { EventNode } from "./EventNode";
import s from "./domain.module.css";

export type CanvasEvent = { id: string; title: string; era: string; anchor?: boolean };
export type CanvasEdge = { from: string; to: string };
type Props = {
  events: CanvasEvent[];
  edges: CanvasEdge[];
  onDropCharacter?: (characterId: string, pos: { x: number; y: number }) => void;
  onNodeClick?: (id: string) => void;
  hint?: string;
};

const nodeTypes = { event: EventNode };

function Inner({ events, edges, onDropCharacter, onNodeClick, hint }: Props) {
  const rf = useReactFlow();
  const nodes: Node[] = events.map((e, i) => ({
    id: e.id, type: "event",
    position: { x: i * 210, y: (i % 2) * 90 },
    data: { title: e.title, era: e.era, anchor: e.anchor },
  }));
  const rfEdges: Edge[] = edges.map((ed) => ({
    id: `${ed.from}-${ed.to}`, source: ed.from, target: ed.to, animated: true,
  }));

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.dataTransfer.dropEffect = "copy";
  }, []);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const cid = e.dataTransfer.getData("application/character");
    if (!cid) return;
    const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    onDropCharacter?.(cid, pos);
  }, [rf, onDropCharacter]);

  return (
    <div className={s.canvas} onDragOver={onDragOver} onDrop={onDrop}>
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
