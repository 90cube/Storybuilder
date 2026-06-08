/** 탐색기 트리 상태 + 액션(펼침·로드·생성·이름변경·삭제·이동). active(열린 화) 결합은 opts로 주입. */
import { useCallback, useEffect, useState } from "react";
import { type Season, type Chapter, type ChapterDetail } from "../../lib/useCreator";
import { useCreatorCtx } from "../CreatorProvider";

type Opts = {
  onOpenChapter: (id: number) => void;
  active: ChapterDetail | null;
  setActive: (a: ChapterDetail | null) => void;
};

export function useProjectTree(opts: Opts) {
  const api = useCreatorCtx();
  const { currentProj, setCurrentProj } = api;
  const { onOpenChapter, active, setActive } = opts;
  const [expProj, setExpProj] = useState<Set<number>>(new Set());
  const [expSeason, setExpSeason] = useState<Set<number>>(new Set());
  const [seasonsByProj, setSeasonsByProj] = useState<Record<number, Season[]>>({});
  const [chBySeason, setChBySeason] = useState<Record<number, Chapter[]>>({});
  const [newProj, setNewProj] = useState("");

  const loadSeasons = useCallback(async (pid: number) => {
    const ss = await api.listSeasons(pid);
    setSeasonsByProj((m) => ({ ...m, [pid]: ss }));
  }, [api.listSeasons]);
  const loadChapters = useCallback(async (sid: number) => {
    const cs = await api.listChapters(sid);
    setChBySeason((m) => ({ ...m, [sid]: cs }));
  }, [api.listChapters]);
  const toggleProject = (pid: number) => {
    setCurrentProj(pid);  // 작품 클릭 = 현재 작품 (엔티티/DB 스코프)
    setExpProj((s) => {
      const n = new Set(s);
      if (n.has(pid)) n.delete(pid); else { n.add(pid); loadSeasons(pid); }
      return n;
    });
  };
  const toggleSeason = (sid: number) => setExpSeason((s) => {
    const n = new Set(s);
    if (n.has(sid)) n.delete(sid); else { n.add(sid); loadChapters(sid); }
    return n;
  });
  // 첫 프로젝트 자동 펼침
  useEffect(() => {
    if (api.projects.length && expProj.size === 0) {
      const pid = api.projects[0].id;
      setExpProj(new Set([pid])); loadSeasons(pid); setCurrentProj(currentProj ?? pid);
    }
  }, [api.projects, expProj.size, loadSeasons]);

  const createProject = async () => {
    if (newProj.trim()) { await api.createProject(newProj.trim()); setNewProj(""); }
  };
  const addSeason = async (pid: number) => {
    await api.createSeason(pid);
    setExpProj((s) => new Set(s).add(pid));
    await loadSeasons(pid);
  };
  const addChapter = async (sid: number) => {
    const r = await api.createChapter(sid, "새 화") as { id: number };
    setExpSeason((s) => new Set(s).add(sid));
    await loadChapters(sid);
    onOpenChapter(r.id);
  };
  // ── 이름변경 / 삭제 (full CRUD) ──
  const onRenameProject = async (p: { id: number; title: string }) => {
    const t = window.prompt("작품 이름", p.title); if (!t?.trim()) return;
    await api.renameProject(p.id, t.trim()); api.reloadProjects();
  };
  const onDelProject = async (p: { id: number; title: string }) => {
    if (!window.confirm(`'${p.title}' 작품과 하위 시즌·화 전부 삭제할까요?`)) return;
    await api.deleteProject(p.id);
    if (active && active.chapter.project_id === p.id) setActive(null);
    setExpProj((s) => { const n = new Set(s); n.delete(p.id); return n; });
    api.reloadProjects();
  };
  const onRenameSeason = async (s: Season) => {
    const t = window.prompt("시즌 이름", s.title); if (!t?.trim()) return;
    await api.renameSeason(s.id, t.trim()); loadSeasons(s.project_id);
  };
  const onDelSeason = async (s: Season) => {
    if (!window.confirm(`'${s.title}' 시즌과 하위 화를 삭제할까요?`)) return;
    await api.deleteSeason(s.id);
    if (active && active.chapter.season_id === s.id) setActive(null);
    loadSeasons(s.project_id);
  };
  const onDelChapter = async (c: Chapter) => {
    if (!window.confirm(`'${c.title || c.id}' 화를 삭제할까요?`)) return;
    await api.deleteChapter(c.id);
    if (active?.chapter.id === c.id) setActive(null);
    loadChapters(c.season_id);
  };
  const onRenameChapter = async (c: Chapter) => {
    const t = window.prompt("화 제목", c.title); if (t == null || !t.trim()) return;
    await api.renameChapter(c.id, t.trim());
    loadChapters(c.season_id);
    if (active?.chapter.id === c.id) setActive({ ...active, chapter: { ...active.chapter, title: t.trim() } });
  };
  const onMoveSeason = async (s: Season, projectId: number) => {
    await api.moveSeason(s.id, projectId);
    loadSeasons(s.project_id); loadSeasons(projectId);
    setExpProj((x) => new Set(x).add(projectId));
  };
  const onMoveChapter = async (c: Chapter, seasonId: number) => {
    await api.moveChapter(c.id, seasonId);
    loadChapters(c.season_id); loadChapters(seasonId);
    setExpSeason((x) => new Set(x).add(seasonId));
    if (active?.chapter.id === c.id) setActive({ ...active, chapter: { ...active.chapter, season_id: seasonId } });
  };

  return {
    expProj, expSeason, seasonsByProj, chBySeason, newProj, setNewProj,
    loadChapters, toggleProject, toggleSeason, createProject, addSeason, addChapter,
    onRenameProject, onDelProject, onRenameSeason, onDelSeason,
    onRenameChapter, onDelChapter, onMoveSeason, onMoveChapter,
  };
}
