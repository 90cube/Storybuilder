import type { InputHTMLAttributes } from "react";
import s from "./primitives.module.css";

/** 한 줄 입력. mono=프롬프트/코드용 등폭. */
export function Input({ mono, className = "", ...rest }:
  { mono?: boolean } & InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${s.field} ${mono ? s.mono : ""} ${className}`} {...rest} />;
}
