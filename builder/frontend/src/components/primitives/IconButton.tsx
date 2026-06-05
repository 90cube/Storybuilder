import type { ButtonHTMLAttributes, ReactNode } from "react";
import s from "./primitives.module.css";

/** 아이콘 전용 정사각 버튼 (액티비티바·툴바용). */
export function IconButton({
  active, children, ...rest
}: { active?: boolean; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={s.iconBtn} data-active={!!active} {...rest}>{children}</button>;
}
