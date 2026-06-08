import type { ReactNode } from "react";
import s from "./primitives.module.css";

/** 헤더 달린 패널 (사이드·뷰어 영역의 기본 단위). */
export function Panel({ title, actions, children, className = "" }:
  { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`${s.panel} ${className}`}>
      {title && (
        <header className={s.panelHead}>
          <span>{title}</span>
          {actions && <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>{actions}</span>}
        </header>
      )}
      <div className={s.panelBody}>{children}</div>
    </section>
  );
}
