import type { ReactNode } from "react";
import s from "./shell.module.css";

/** 상단 타이틀바. */
export function Titlebar({ sub, right }: { sub?: string; right?: ReactNode }) {
  return (
    <header className={s.titlebar}>
      <span className={s.brand}>◆ DNF <b>StoryBuilder</b></span>
      {sub && <span className={s.titleSub}>{sub}</span>}
      <div className={s.titleRight}>{right}</div>
    </header>
  );
}
