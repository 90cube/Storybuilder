import type { ReactNode } from "react";
import { useAspect } from "../../lib/aspect";

/**
 * 화면 비율별 여분 레이아웃 교체기.
 * 가로→정사각→세로 순으로 fallback (square/portrait 미지정 시 상위 레이아웃 사용).
 */
export function AspectLayout({ landscape, square, portrait }:
  { landscape: ReactNode; square?: ReactNode; portrait?: ReactNode }) {
  const a = useAspect();
  if (a === "portrait") return <>{portrait ?? square ?? landscape}</>;
  if (a === "square") return <>{square ?? landscape}</>;
  return <>{landscape}</>;
}
