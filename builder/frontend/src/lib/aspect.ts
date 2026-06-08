/** 화면 가로세로 비율 → 레이아웃 모드. 가로/정사각/세로 여분 디자인 전환의 단일 기준. */
import { useEffect, useState } from "react";

export type Aspect = "landscape" | "square" | "portrait";

const LAND = 1.3; // ratio(w/h) 이상 = 가로
const PORT = 0.8; // 이하 = 세로

export function ratioToAspect(ratio: number): Aspect {
  if (ratio >= LAND) return "landscape";
  if (ratio <= PORT) return "portrait";
  return "square";
}

/** 뷰포트 비율을 구독해 현재 Aspect를 돌려준다. */
export function useAspect(): Aspect {
  const get = () =>
    typeof window === "undefined"
      ? "landscape"
      : ratioToAspect(window.innerWidth / window.innerHeight);
  const [aspect, setAspect] = useState<Aspect>(get);
  useEffect(() => {
    const on = () => setAspect(ratioToAspect(window.innerWidth / window.innerHeight));
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return aspect;
}
