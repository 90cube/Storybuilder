import { IconButton } from "../primitives";
import s from "./shell.module.css";

export type ActivityItem = { id: string; icon: string; label: string };

/** 좌측(세로) 또는 상단(가로) 액티비티바. */
export function ActivityBar({ items, active, onSelect, horizontal }:
  { items: ActivityItem[]; active: string; onSelect: (id: string) => void; horizontal?: boolean }) {
  return (
    <nav className={s.activity} data-horizontal={!!horizontal}>
      {items.map((it) => (
        <IconButton key={it.id} active={it.id === active}
          aria-label={it.label} title={it.label} onClick={() => onSelect(it.id)}>
          {it.icon}
        </IconButton>
      ))}
    </nav>
  );
}
