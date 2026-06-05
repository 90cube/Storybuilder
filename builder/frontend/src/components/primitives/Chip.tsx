import type { ReactNode } from "react";
import s from "./primitives.module.css";

/** 칩 (태그·역할·필터). on=활성, onClick 있으면 클릭형. */
export function Chip({ children, on, onClick }:
  { children: ReactNode; on?: boolean; onClick?: () => void }) {
  return (
    <span className={s.chip} data-on={!!on} data-clickable={!!onClick} onClick={onClick}>
      {children}
    </span>
  );
}
