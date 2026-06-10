/** 화 본문 버전 트리 훅 — 목록·head 로드 + 되돌리기(head 이동, 비파괴) + 미리보기(전문 조회). chapterId 변화 시 자동 로드. */
import { useCallback, useEffect, useState } from "react";
import type { VersionRow } from "../../lib/useCreator";
import { useCreatorCtx } from "../CreatorProvider";

export type VersionPreview = { row: VersionRow; text: string };

export function useVersions(chapterId: number | null, onHeadText: (t: string) => void) {
  const api = useCreatorCtx();
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [head, setHead] = useState<number | null>(null);
  const [preview, setPreview] = useState<VersionPreview | null>(null);

  const reload = useCallback(async () => {
    if (chapterId == null) { setVersions([]); setHead(null); return; }
    try { const r = await api.listVersions(chapterId); setVersions(r.versions); setHead(r.head); } catch { /* */ }
  }, [api.listVersions, chapterId]);
  useEffect(() => { reload(); setPreview(null); }, [reload]);  // 화 전환 시 미리보기도 폐기

  const revert = useCallback(async (vid: number) => {
    if (chapterId == null) return;
    const r = await api.revertVersion(chapterId, vid);  // head 이동(되돌리기/분기 시작점)
    onHeadText(r.text);                                  // 에디터 본문을 그 버전으로
    setHead(r.head); setPreview(null); reload();
  }, [api.revertVersion, chapterId, onHeadText, reload]);

  /** 노드 클릭 → 전문을 받아 미리보기 모드(현재본과 diff는 뷰가 계산). */
  const openPreview = useCallback(async (row: VersionRow) => {
    try { const v = await api.getVersion(row.id); setPreview({ row, text: v.text }); }
    catch (e) { alert("버전 불러오기 실패: " + (e as Error).message); }
  }, [api.getVersion]);
  const closePreview = useCallback(() => setPreview(null), []);

  return { versions, head, reload, revert, preview, openPreview, closePreview };
}
