"""삽입 모델: 앵커(처음·끝) 고정 + 신캐 + 맥락. 순수 도메인."""

from dataclasses import dataclass, field


@dataclass
class NewCharacter:
    """인과 사이에 끼워넣을 신규 캐릭터."""
    name: str
    concept: str  # 한 줄 콘셉트 (직업·정체성)
    motive: str   # 이 구간에 끼어드는 동기


@dataclass
class InsertionRequest:
    """한 인과 갭에 대한 삽입 요청. anchor_before/after 사건은 절대 불변."""
    anchor_before: dict          # 선행 사건 (고정)
    anchor_after: dict           # 후행 사건 (고정)
    new_characters: list[NewCharacter]  # 끼워넣을 신규 인물 1명 이상
    plot_key: str                # plot 템플릿 키
    context_events: list[dict] = field(default_factory=list)  # 이웃·타라인 맥락
    involved_characters: list[str] = field(default_factory=list)


def _names(event: dict) -> list[str]:
    return [c.get("name", "") for c in event.get("characters_involved", [])]


def build_request(
    by_id: dict[str, dict],
    before_id: str,
    after_id: str,
    new_characters: list[NewCharacter],
    plot_key: str,
    extra_context_ids: list[str] | None = None,
) -> InsertionRequest:
    """앵커 두 사건 + 원래 관여 인물/스토리를 맥락으로 묶어 요청을 만든다."""
    before, after = by_id[before_id], by_id[after_id]
    involved = sorted({n for n in _names(before) + _names(after) if n})
    ctx = [by_id[i] for i in (extra_context_ids or []) if i in by_id]
    return InsertionRequest(
        anchor_before=before,
        anchor_after=after,
        new_characters=new_characters,
        plot_key=plot_key,
        context_events=ctx,
        involved_characters=involved,
    )
