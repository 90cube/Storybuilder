import s from "./primitives.module.css";

/** 스위치 토글 (플롯 전체적용 on/off 등). */
export function Toggle({ on, onChange }:
  { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className={s.toggle} data-on={on} role="switch" aria-checked={on}
      onClick={() => onChange(!on)}>
      <span className={s.toggleKnob} />
    </button>
  );
}
