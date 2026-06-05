import s from "./primitives.module.css";

/** 구분선. vertical=세로(분할 영역 사이). */
export function Divider({ vertical }: { vertical?: boolean }) {
  return vertical ? <span className={s.dividerV} /> : <hr className={s.divider} />;
}
