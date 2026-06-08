/** 트리 노드용 컨텍스트 메뉴(⋯) — 새로만들기·이름변경·이동·삭제. 좁은 패널 클리핑 회피용 포털 렌더. */
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import m from "./rowmenu.module.css";

export type MenuItem = {
  label: string;
  onClick?: () => void;
  submenu?: MenuItem[];   // 펼쳐지는 하위 항목(이동 대상 등)
  danger?: boolean;
  disabled?: boolean;
  sep?: boolean;          // 구분선 (label 무시)
};

const stop = (e: MouseEvent) => { e.stopPropagation(); e.preventDefault(); };

function Row({ it, close }: { it: MenuItem; close: () => void }) {
  const [open, setOpen] = useState(false);
  if (it.sep) return <div className={m.sep} />;
  const cls = `${m.item} ${it.danger ? m.danger : ""} ${it.disabled ? m.disabled : ""}`;
  const onClick = () => {
    if (it.disabled) return;
    if (it.submenu) { setOpen((o) => !o); return; }
    it.onClick?.(); close();
  };
  return (
    <>
      <div className={cls} onClick={onClick}>
        <span className={m.lbl}>{it.label}</span>
        {it.submenu && <span className={m.arrow}>{open ? "▾" : "▸"}</span>}
      </div>
      {it.submenu && open && (
        <div className={m.sub}>
          {it.submenu.length === 0
            ? <div className={`${m.item} ${m.disabled}`}><span className={m.lbl}>대상 없음</span></div>
            : it.submenu.map((s, i) => <Row key={i} it={s} close={close} />)}
        </div>
      )}
    </>
  );
}

export function RowMenu({ items }: { items: MenuItem[] }) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const trigRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pos) return;
    const onDoc = (e: globalThis.MouseEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !trigRef.current?.contains(t)) setPos(null);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setPos(null); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onEsc); };
  }, [pos]);

  const toggle = (e: MouseEvent) => {
    stop(e);
    if (pos) { setPos(null); return; }
    const r = trigRef.current!.getBoundingClientRect();
    setPos({ top: r.bottom + 2, right: Math.max(8, window.innerWidth - r.right) });
  };

  return (
    <>
      <button ref={trigRef} className={m.trigger} title="메뉴" aria-label="메뉴" onClick={toggle}>⋯</button>
      {pos && createPortal(
        <div ref={menuRef} className={m.menu} style={{ top: pos.top, right: pos.right }} onClick={stop}>
          {items.map((it, i) => <Row key={i} it={it} close={() => setPos(null)} />)}
        </div>, document.body)}
    </>
  );
}
