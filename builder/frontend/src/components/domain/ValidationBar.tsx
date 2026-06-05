import { Badge } from "../primitives";
import s from "./domain.module.css";

export type Validation = { is_valid: boolean; errors: string[]; warnings: string[] };

/** tbg 검증 결과 바 (순환·모순·era). */
export function ValidationBar({ v }: { v?: Validation }) {
  return (
    <div className={s.valbar}>
      <span className={s.valLabel}>tbg 검증</span>
      {!v && <span style={{ color: "var(--text-mut)", fontSize: "var(--fs-xs)" }}>대기 중</span>}
      {v && <Badge tone={v.is_valid ? "jade" : "blood"}>{v.is_valid ? "통과 ✓" : "위반 ✗"}</Badge>}
      {v?.errors.map((e, i) => <Badge key={`e${i}`} tone="blood">{e}</Badge>)}
      {v?.warnings.map((w, i) => <Badge key={`w${i}`} tone="ember">{w}</Badge>)}
      {v && v.errors.length === 0 && v.warnings.length === 0 &&
        <span style={{ color: "var(--text-mut)", fontSize: "var(--fs-xs)" }}>순환·모순·era 이상 없음</span>}
    </div>
  );
}
