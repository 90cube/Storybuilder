/** 화 본문 버전 트리 훅 — 목록·head 로드 + 되돌리기(head 이동, 비파괴). chapterId 변화 시 자동 로드. */
import { useCallback, useEffect, useState } from "react";
import type { VersionRow } from "../../lib/useCreator";
import { useCreatorCtx } from "../CreatorProvider";

export function useVersions(chapterId: number | null, onHeadText: (t: string) => void) {
  const api = useCreatorCtx();
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [head, setHead] = useState<number | null>(null);

  const reload = useCallback(async () => {
    if (chapterId == null) { setVersions([]); setHead(null); return; }
    try { const r = await api.listVersions(chapterId); setVersions(r.versions); setHead(r.head); } catch { /* */ }
  }, [api.listVersions, chapterId]);
  useEffect(() => { reload(); }, [reload]);

  const revert = useCallback(async (vid: number) => {
    if (chapterId == null) return;
    const r = await api.revertVersion(chapterId, vid);  // head 이동(되돌리기/분기 시작점)
    onHeadText(r.text);                                  // 에디터 본문을 그 버전으로
    setHead(r.head); reload();
  }, [api.revertVersion, chapterId, onHeadText, reload]);

  return { versions, head, reload, revert };
}
