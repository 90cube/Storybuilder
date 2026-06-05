import { useEffect, useRef, useState } from "react";
import { Input } from "../primitives";
import { CharacterCard, type Character } from "./CharacterCard";
import s from "./domain.module.css";

type Entity = { id: string; name: string; category: string; summary: string };

/**
 * 실제 데이터(/api/entities)에서 인물을 검색·선택하는 피커.
 * 이름을 외워 타이핑하지 않고, 리스트에서 골라 드래그한다.
 */
export function EntityPicker({ onPick }: { onPick?: (c: Character) => void }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(false);
  const t = useRef<number>(0);

  useEffect(() => {
    setLoading(true);
    window.clearTimeout(t.current);
    t.current = window.setTimeout(async () => {
      try {
        const r = await fetch(`/api/entities?q=${encodeURIComponent(q)}&limit=3000`);
        setItems(await r.json());
      } catch { setItems([]); }
      finally { setLoading(false); }
    }, 220);
    return () => window.clearTimeout(t.current);
  }, [q]);

  return (
    <div className={s.picker}>
      <Input value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="인물 검색 (예: 바칼, 힐더)" autoFocus />
      <div className={s.pickerCount}>{loading ? "검색 중…" : `${items.length}명`}</div>
      <div className={s.pickerList}>
        {items.map((e) => (
          <div key={e.id} onClick={() => onPick?.({ id: e.id, name: e.name, role: e.summary })}>
            <CharacterCard character={{ id: e.id, name: e.name, role: e.summary }} />
          </div>
        ))}
        {!loading && items.length === 0 && <div className={s.pickerEmpty}>결과 없음</div>}
      </div>
    </div>
  );
}
