/** 생성 버튼 산출(순수) — 현재 화 상태와 본문 유무로 버튼 목록 결정. F1 초기형(클라 규칙). */
export type GenAction = { mode: string; label: string; enabled: boolean; active: boolean };

/**
 * 생성 버튼은 '전이'가 아니라 '반복 가능한 도구' — 확정 후엔 다듬기·완성본을 항상 재실행 가능(무한루프).
 * DRAFT면 초안 재생성 1개, 그 외엔 다듬기/완성본 2개(현재 단계를 active로 강조).
 */
export function genActions(cur: string, hasText: boolean): GenAction[] {
  return cur === "DRAFT"
    ? [{ mode: "draft", label: "초안 재생성", enabled: hasText, active: false }]
    : [
        { mode: "polish", label: "→ 다듬기", enabled: hasText, active: cur === "POLISH" },
        { mode: "expand", label: "→ 완성본", enabled: hasText, active: cur === "EXPAND" },
      ];
}
