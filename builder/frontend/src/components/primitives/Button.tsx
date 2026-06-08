import type { ButtonHTMLAttributes, ReactNode } from "react";
import s from "./primitives.module.css";

type Variant = "default" | "primary" | "ghost" | "danger";

/** 기본 버튼. 라벨은 구체 동사+대상 (CLAUDE.md 규칙). */
export function Button({
  variant = "default", children, className = "", ...rest
}: { variant?: Variant; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const v = variant !== "default" ? s[variant] : "";
  return <button className={`${s.btn} ${v} ${className}`} {...rest}>{children}</button>;
}
