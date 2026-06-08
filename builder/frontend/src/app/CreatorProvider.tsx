/** Creator Context — useCreator() 결과 + currentProj를 트리에 공급해 api prop drilling 제거. */
import { createContext, useContext, useState, type ReactNode } from "react";
import { useCreator } from "../lib/useCreator";

type CreatorCtx = ReturnType<typeof useCreator> & {
  currentProj: number | null;
  setCurrentProj: (n: number | null) => void;
};

const Ctx = createContext<CreatorCtx | null>(null);

export const CreatorProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const api = useCreator();
  const [currentProj, setCurrentProj] = useState<number | null>(null);
  const value: CreatorCtx = { ...api, currentProj, setCurrentProj };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export function useCreatorCtx(): CreatorCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCreatorCtx must be used within <CreatorProvider>");
  return v;
}
