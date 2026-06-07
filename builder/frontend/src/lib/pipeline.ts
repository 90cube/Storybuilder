// 파이프라인 FSM 미러(백엔드 domain/pipeline.py와 동일) — 버튼·스테퍼를 실제 화 상태와 연동.
export const STATE_ORDER: string[] = [
  "DRAFT", "POLISH", "CHAR_DETECT", "DB_WRITE", "DB_SYNC", "REVISE",
  "EXPAND", "CTX_RESET_A", "PARTIAL_POLISH", "CTX_RESET_B", "EXTRACT",
  "DB_SYNC2", "CHAPTER_SAVE", "SHIP",
];

const TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["POLISH"],
  POLISH: ["POLISH", "CHAR_DETECT", "REVISE", "EXPAND"],
  CHAR_DETECT: ["DB_WRITE", "REVISE"],
  DB_WRITE: ["DB_SYNC"],
  DB_SYNC: ["REVISE"],
  REVISE: ["REVISE", "POLISH", "CHAR_DETECT", "EXPAND"],
  EXPAND: ["CTX_RESET_A"],
  CTX_RESET_A: ["PARTIAL_POLISH"],
  PARTIAL_POLISH: ["CTX_RESET_B"],
  CTX_RESET_B: ["EXTRACT"],
  EXTRACT: ["DB_SYNC2"],
  DB_SYNC2: ["CHAPTER_SAVE"],
  CHAPTER_SAVE: ["SHIP", "DRAFT"],
  SHIP: [],
};

export const stateIdx = (s: string): number => STATE_ORDER.indexOf(s);
export const canAdvance = (from: string, to: string): boolean => (TRANSITIONS[from] ?? []).includes(to);
/** 현재 상태가 target 단계에 도달했는가(순서상 같거나 이후). */
export const reached = (cur: string, target: string): boolean => stateIdx(cur) >= stateIdx(target) && stateIdx(cur) >= 0;
