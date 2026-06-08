import type { SelectHTMLAttributes, ReactNode } from "react";
import s from "./primitives.module.css";

/** 드롭다운 선택 (플롯 등). */
export function Select({ children, className = "", ...rest }:
  { children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${s.field} ${className}`} {...rest}>{children}</select>;
}
