import s from "./primitives.module.css";

/** 로딩 스피너 (생성 대기 등). */
export function Spinner() {
  return <span className={s.spinner} role="status" aria-label="로딩 중" />;
}
