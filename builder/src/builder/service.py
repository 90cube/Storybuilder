"""애플리케이션 서비스: 이야기 2개 생성 오케스트레이션. cli·api 공용."""

from builder.io.corpus import load_events, save_draft
from builder.domain.insertion import NewCharacter, build_request
from builder.domain.validate import validate_insertion
from builder.llm import client, prompts


def generate_pair(before_id: str, after_id: str, new_characters: list[NewCharacter],
                  plot_key: str, context_ids: list[str] | None = None,
                  system: str | None = None, save: bool = True,
                  events_by_id: dict | None = None) -> dict:
    """선행→후행 앵커 사이에 신캐(1명 이상)를 끼운 (원본·삽입) 이야기 2개를 생성해 드래프트로 반환.

    events_by_id 가 주어지면(작품 events) 그것을, 없으면 corpus(load_events)를 사건 출처로 쓴다.
    """
    by_id = events_by_id if events_by_id is not None else load_events()[0]
    req = build_request(by_id, before_id, after_id, new_characters,
                        plot_key, extra_context_ids=context_ids)
    sys_prompt = (system or prompts.SYSTEM).strip()

    original = client.chat(sys_prompt,
                           prompts.original_prompt(req.anchor_before, req.anchor_after),
                           temperature=0.4)
    inserted = client.chat(sys_prompt, prompts.inserted_prompt(req),
                           temperature=0.75, max_tokens=2400)
    validation = validate_insertion(by_id, before_id, after_id, "DRAFT_NEW",
                                    req.anchor_after.get("era"))

    draft = {
        "anchors": {"before": before_id, "after": after_id},
        "new_characters": [c.__dict__ for c in new_characters],
        "plot": plot_key,
        "original_story": original,
        "inserted_story": inserted,
        "validation": validation,
        "status": "pending_review",
    }
    if save:
        draft["saved_path"] = save_draft(draft)
    return draft
