import type { ReactNode } from "react";
import s from "./shell.module.css";

/** 하단 상태바 (LLM 연결·비율·검증 요약 등). */
export function StatusBar({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return (
    <footer className={s.statusbar}>
      <span className={s.dot} />
      {left}
      <span className={s.right}>{right}</span>
    </footer>
  );
}
