import type { HTMLAttributes, ReactNode } from "react";
import s from "./primitives.module.css";

/** 범용 카드 컨테이너. */
export function Card({ children, className = "", ...rest }:
  { children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return <div className={`${s.card} ${className}`} {...rest}>{children}</div>;
}
