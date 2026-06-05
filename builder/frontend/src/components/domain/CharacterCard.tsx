import s from "./domain.module.css";

export type Character = { id: string; name: string; role?: string };

/** 드래그 가능한 인물 카드 (인물뷰 → 인과 캔버스로 끌어다 놓음). */
export function CharacterCard({ character }: { character: Character }) {
  return (
    <div className={s.charCard} draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/character-json", JSON.stringify(character));
        e.dataTransfer.setData("application/character", character.id);
        e.dataTransfer.effectAllowed = "copy";
      }}>
      <span className={s.charAvatar}>{character.name.slice(0, 1)}</span>
      <div className={s.charMeta}>
        <div className={s.charName}>{character.name}</div>
        {character.role && <div className={s.charRole}>{character.role}</div>}
      </div>
    </div>
  );
}
