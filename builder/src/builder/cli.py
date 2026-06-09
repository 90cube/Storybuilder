"""진입점(CLI): 데모 시나리오로 이야기 2개 생성 → 콘솔 출력. 로직은 service에 위임."""

from builder.domain.insertion import NewCharacter
from builder.plot.templates import PLOTS
from builder import service

# 데모 시나리오: 두 앵커 사건 사이에 신규 인물을 끼워 이야기 2개 생성(범용 예시).
BEFORE_ID = "EVT_001"
AFTER_ID = "EVT_002"
CONTEXT_IDS = ["EVT_014"]
PLOT_KEY = "kishōtenketsu"

NEW_CHARACTER = NewCharacter(
    name="신규인물",
    concept="두 앵커 사건 사이에 등장하는 조연",
    motive="앞 사건의 여파를 쫓아 뒤 사건의 결말로 자연스럽게 수렴한다",
)


def _hr(title: str) -> str:
    return f"\n{'=' * 70}\n{title}\n{'=' * 70}"


def main() -> None:
    print(_hr(f"생성 중... [{NEW_CHARACTER.name} / {PLOTS[PLOT_KEY][0]}]"))
    draft = service.generate_pair(BEFORE_ID, AFTER_ID, [NEW_CHARACTER],
                                  PLOT_KEY, context_ids=CONTEXT_IDS)
    print(_hr("(A) 원본 이야기"))
    print(draft["original_story"])
    print(_hr("(B) 캐릭터 삽입 이야기"))
    print(draft["inserted_story"])
    print(_hr("tbg 타임라인 검증"))
    v = draft["validation"]
    print(f"통과: {v['is_valid']} | 오류: {v['errors'] or '없음'} | 경고: {v['warnings'] or '없음'}")
    print(_hr(f"드래프트 저장: {draft.get('saved_path')}"))


if __name__ == "__main__":
    main()
