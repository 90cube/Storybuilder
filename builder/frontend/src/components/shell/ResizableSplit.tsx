import { Fragment, type ReactNode } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import s from "./shell.module.css";

export type SplitPane = { content: ReactNode; defaultSize?: number; minSize?: number };

/** 리사이즈 가능한 분할 영역 (좌/중/우, 상/하). react-resizable-panels v4. */
export function ResizableSplit({ orientation = "horizontal", panes, id }:
  { orientation?: "horizontal" | "vertical"; panes: SplitPane[]; id?: string }) {
  const handle = orientation === "horizontal" ? s.handleH : s.handleV;
  return (
    <Group orientation={orientation} className={s.group} id={id}>
      {panes.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && <Separator className={handle} />}
          <Panel defaultSize={p.defaultSize} minSize={p.minSize ?? 8}>{p.content}</Panel>
        </Fragment>
      ))}
    </Group>
  );
}
