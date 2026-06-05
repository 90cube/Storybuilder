"""진입점(와이어링): corpus 로드 → 갭 선택 → LLM로 이야기 2개 생성 → 검증·저장·출력."""

from builder.io.corpus import load_events, save_draft
from builder.domain.insertion import NewCharacter, build_request
from builder.domain.validate import validate_insertion
from builder.llm import client
from builder.llm import prompts
from builder.plot.templates import PLOTS

# 데모 시나리오: 용의 전쟁(바칼 패주) → 바칼의 천계 지배 사이에 신캐를 끼운다.
BEFORE_ID = "EVT_001"
AFTER_ID = "EVT_002"
CONTEXT_IDS = ["EVT_014"]  # 다른 라인 맥락 (제1차 마계 회합)
PLOT_KEY = "kishōtenketsu"

NEW_CHARACTER = NewCharacter(
    name="카르닉스",
    concept="용의 전쟁에서 패한 영원수 수호 진영의 마지막 추격자, 하급 용족 전사",
    motive="천계로 도주하는 바칼을 끝까지 쫓아 영원수 독점의 대가를 묻는다",
)


def _hr(title: str) -> str:
    return f"\n{'=' * 70}\n{title}\n{'=' * 70}"


def main() -> None:
    by_id, _ = load_events()

    req = build_request(by_id, BEFORE_ID, AFTER_ID, NEW_CHARACTER,
                        PLOT_KEY, extra_context_ids=CONTEXT_IDS)

    print(_hr("(A) 원본 이야기 생성 중..."))
    original = client.chat(prompts.SYSTEM,
                           prompts.original_prompt(req.anchor_before, req.anchor_after),
                           temperature=0.4)
    print(original)

    print(_hr(f"(B) 캐릭터 삽입 이야기 생성 중... [{NEW_CHARACTER.name} / {PLOTS[PLOT_KEY][0]}]"))
    inserted = client.chat(prompts.SYSTEM, prompts.inserted_prompt(req),
                           temperature=0.75, max_tokens=2400)
    print(inserted)

    print(_hr("tbg 타임라인 검증 (가드레일)"))
    v = validate_insertion(by_id, BEFORE_ID, AFTER_ID, "DRAFT_NEW",
                           req.anchor_after.get("era"))
    print(f"통과(is_valid): {v['is_valid']}")
    print(f"오류: {v['errors'] or '없음'}")
    print(f"삽입 관련 경고: {v['warnings'] or '없음'}")

    draft = {
        "anchors": {"before": BEFORE_ID, "after": AFTER_ID},
        "new_character": NEW_CHARACTER.__dict__,
        "plot": PLOT_KEY,
        "original_story": original,
        "inserted_story": inserted,
        "validation": v,
        "status": "pending_review",
    }
    path = save_draft(draft)
    print(_hr(f"드래프트 저장: {path}"))


if __name__ == "__main__":
    main()
