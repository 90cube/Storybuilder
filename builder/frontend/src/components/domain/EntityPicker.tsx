import { useEffect, useRef, useState } from "react";
import { Input } from "../primitives";
import { CharacterCard, type Character } from "./CharacterCard";
import s from "./domain.module.css";

type Entity = { id: string; name: string; category: string; summary: string; relations: string[] };

const CATS = [
  { key: "person", label: "인물" }, { key: "monster", label: "몬스터" },
  { key: "organization", label: "조직" }, { key: "world", label: "세계" },
  { key: "all", label: "전체" },
];

/**
 * 실데이터 엔티티 피커. 카테고리 탭 + 검색.
 * 카드 클릭 → 인물 선택 + 관련 인물(노란색) 상단 정렬.
 */
export function EntityPicker({ onPick }: { onPick?: (c: Character) => void }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("person");
  const [items, setItems] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(false);
  const [rel, setRel] = useState<{ name: string; list: string[] } | null>(null);
  const t = useRef<number>(0);

  useEffect(() => {
    setLoading(true); setRel(null);
    window.clearTimeout(t.current);
    t.current = window.setTimeout(async () => {
      try {
        const r = await fetch(`/api/entities?q=${encodeURIComponent(q)}&category=${cat}&limit=3000`);
        setItems(await r.json());
      } catch { setItems([]); }
      finally { setLoading(false); }
    }, 220);
    return () => window.clearTimeout(t.current);
  }, [q, cat]);

  // 관계 매칭: 이름 부분일치(양방향, 2자↑) — relations 필드가 약식 표기라 휴리스틱.
  const related = (e: Entity) =>
    !!rel && rel.list.some((r) => {
      const a = r.trim();
      return a.length >= 2 && (e.name.includes(a) || a.includes(e.name));
    });
  const score = (e: Entity) => (e.name === rel?.name ? 2 : related(e) ? 1 : 0);
  const view = rel ? [...items].sort((a, b) => score(b) - score(a)) : items;
  const relCount = rel ? items.filter(related).length : 0;

  const pick = (e: Entity) => {
    onPick?.({ id: e.id, name: e.name, role: e.summary });
    setRel({ name: e.name, list: e.relations ?? [] });
  };

  return (
    <div className={s.picker}>
      <div className={s.tabs2}>
        {CATS.map((c) => (
          <button key={c.key} className={s.tab2} data-on={cat === c.key}
            onClick={() => setCat(c.key)}>{c.label}</button>
        ))}
      </div>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="검색 (예: 바칼, 힐더)" />
      {rel
        ? <div className={s.relBanner}>「{rel.name}」 관련 {relCount}명 상단
            <button onClick={() => setRel(null)}>해제</button></div>
        : <div className={s.pickerCount}>{loading ? "검색 중…" : `${items.length}명`}</div>}
      <div className={s.pickerList}>
        {view.map((e) => (
          <div key={e.id} onClick={() => pick(e)}>
            <CharacterCard character={{ id: e.id, name: e.name, role: e.summary }}
              highlight={!!rel && (e.name === rel.name || related(e))} />
          </div>
        ))}
        {!loading && items.length === 0 && <div className={s.pickerEmpty}>결과 없음</div>}
      </div>
    </div>
  );
}
