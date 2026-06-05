import type { TextareaHTMLAttributes } from "react";
import s from "./primitives.module.css";

/** 여러 줄 입력. mono=마스터 프롬프트 편집용. */
export function Textarea({ mono, className = "", ...rest }:
  { mono?: boolean } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${s.field} ${mono ? s.mono : ""} ${className}`} {...rest} />;
}
