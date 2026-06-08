/** 탐색기(left 패널) 렌더 — 프로젝트/시즌/화 트리 + 행 메뉴 + 하단 DB·엔티티 목록. */
import { Button, Input, Panel } from "../../components/primitives";
import { type ChapterDetail, type GraphEntity } from "../../lib/useCreator";
import { useCreatorCtx } from "../CreatorProvider";
import { RowMenu } from "../RowMenu";
import { useProjectTree } from "./useProjectTree";
import w from "../writer.module.css";

type Props = {
  tree: ReturnType<typeof useProjectTree>;
  active: ChapterDetail | null;
  onOpenChapter: (id: number) => void;
  dbEnts: GraphEntity[];
};

export function ExplorerTree({ tree, active, onOpenChapter, dbEnts }: Props) {
  const api = useCreatorCtx();
  const {
    expProj, expSeason, seasonsByProj, chBySeason, newProj, setNewProj,
    toggleProject, toggleSeason, createProject, addSeason, addChapter,
    onRenameProject, onDelProject, onRenameSeason, onDelSeason,
    onRenameChapter, onDelChapter, onMoveSeason, onMoveChapter,
  } = tree;

  return (
    <Panel title="탐색기" className={w.fill}>
      <div className={w.newRow}>
        <Input value={newProj} onChange={(e) => setNewProj(e.target.value)} placeholder="새 프로젝트" />
        <Button onClick={createProject}>+</Button>
      </div>
      <div className={w.tree}>
        {api.projects.map((p) => {
          const pOpen = expProj.has(p.id);
          const seasons = seasonsByProj[p.id] ?? [];
          return (
            <div key={p.id}>
              <div className={w.row} onClick={() => toggleProject(p.id)}>
                <span className={w.chev}>{pOpen ? "▾" : "▸"}</span>
                <span className={w.ic}>📁</span>
                <span className={w.name} title="더블클릭=이름변경"
                  onDoubleClick={(e) => { e.stopPropagation(); onRenameProject(p); }}>{p.title}</span>
                <RowMenu items={[
                  { label: "＋ 새 시즌", onClick: () => addSeason(p.id) },
                  { label: "이름 변경", onClick: () => onRenameProject(p) },
                  { label: "", sep: true },
                  { label: "작품 삭제", danger: true, onClick: () => onDelProject(p) },
                ]} />
              </div>
              {pOpen && seasons.map((s) => {
                const sOpen = expSeason.has(s.id);
                const chs = chBySeason[s.id] ?? [];
                return (
                  <div key={s.id}>
                    <div className={w.row} style={{ paddingLeft: 24 }} onClick={() => toggleSeason(s.id)}>
                      <span className={w.chev}>{sOpen ? "▾" : "▸"}</span>
                      <span className={w.ic}>📂</span>
                      <span className={w.name} title="더블클릭=이름변경"
                        onDoubleClick={(e) => { e.stopPropagation(); onRenameSeason(s); }}>{s.title}</span>
                      <RowMenu items={[
                        { label: "＋ 새 화", onClick: () => addChapter(s.id) },
                        { label: "이름 변경", onClick: () => onRenameSeason(s) },
                        { label: "다른 작품으로 이동",
                          submenu: api.projects.filter((pp) => pp.id !== s.project_id)
                            .map((pp) => ({ label: pp.title, onClick: () => onMoveSeason(s, pp.id) })) },
                        { label: "", sep: true },
                        { label: "시즌 삭제", danger: true, onClick: () => onDelSeason(s) },
                      ]} />
                    </div>
                    {sOpen && chs.map((c) => (
                      <div key={c.id} className={w.row} data-on={active?.chapter.id === c.id}
                        style={{ paddingLeft: 48 }} onClick={() => onOpenChapter(c.id)}>
                        <span className={w.ic}>📄</span>
                        <span className={w.name}>{c.title || `(${c.id})`}</span>
                        <span className={w.badge}>{c.state}</span>
                        <RowMenu items={[
                          { label: "이름 변경", onClick: () => onRenameChapter(c) },
                          { label: "다른 시즌으로 이동",
                            submenu: (seasonsByProj[c.project_id] ?? []).filter((ss) => ss.id !== c.season_id)
                              .map((ss) => ({ label: ss.title, onClick: () => onMoveChapter(c, ss.id) })) },
                          { label: "", sep: true },
                          { label: "화 삭제", danger: true, onClick: () => onDelChapter(c) },
                        ]} />
                      </div>
                    ))}
                    {sOpen && !chs.length && <div className={w.empty} style={{ paddingLeft: 48 }}>화 없음 — ＋</div>}
                  </div>
                );
              })}
              {pOpen && !seasons.length && <div className={w.empty}>시즌 없음 — ＋</div>}
            </div>
          );
        })}
      </div>
      <div className={w.projHead}>DB · 엔티티 ({dbEnts.length})</div>
      <div className={w.tree}>
        {dbEnts.slice(0, 60).map((e) => (
          <div key={e.id} className={w.row}>
            <span className={w.ic}>◆</span>
            <span className={w.name}>{e.name}</span>
            <span className={w.badge} style={{ color: e.source === "canon" ? "var(--jade)" : "var(--text-mut)" }}>{e.source}</span>
          </div>
        ))}
        {!dbEnts.length && <div className={w.empty}>아직 등록된 엔티티 없음</div>}
      </div>
    </Panel>
  );
}
