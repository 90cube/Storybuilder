import type { ReactNode } from "react";
import s from "./primitives.module.css";

type Tone = "ember" | "arcane" | "jade" | "blood";
const cls: Record<Tone, string> = {
  ember: s.badgeEmber, arcane: s.badgeArcane, jade: s.badgeJade, blood: s.badgeBlood,
};

/** 작은 상태 배지 (canon/confidence/temporal 점수, era 등). */
export function Badge({ tone = "ember", children }:
  { tone?: Tone; children: ReactNode }) {
  return <span className={`${s.badge} ${cls[tone]}`}>{children}</span>;
}
