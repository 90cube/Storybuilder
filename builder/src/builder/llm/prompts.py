"""마스터 프롬프트(world 주입형). 세계관 정합·앵커 불변·플롯 준수. 기성 IP 비의존."""

from builder.domain.insertion import InsertionRequest
from builder.plot.templates import guidance
from builder.llm.world import world_name, world_intro


def system(world: str = "") -> str:
    """레인/원고 생성용 마스터 시스템 프롬프트.

    작품명(world)을 주입하고 외부 IP 지식을 차단한다. 문체는 고정하지 않고 문체 지침에
    위임한다(시스템이 문체를 단순화/장식해 결과를 납작하게 만들지 않게).
    """
    w = world_name(world)
    return (
        f"너는 〈{w}〉의 전속 서사 작가이자 설정 감수자다.\n{world_intro(world)}\n"
        "원칙:\n"
        "1. 세계관 정합성 최우선. 주어진 설정의 시대(era)와 인과를 어기지 않는다.\n"
        "2. 주어진 '앵커 사건'의 처음과 끝 상태는 불변이다. 그 사이만 서술한다.\n"
        "3. 기존 인물의 성격·상태(state_before/after)와 모순되는 전개를 만들지 않는다.\n"
        "4. 우연·억지 전개 대신 인물의 동기와 인과로 장면을 굴린다.\n"
        "5. 한국어로 쓴다. 문체·톤·묘사 밀도는 주어진 문체 지침을 따르고, "
        "없으면 작품 기존 산문의 결을 잇는다.\n"
        "출력은 지정된 형식의 본문만. 메타발언·사족·면책 문구 금지."
    )


# 범용 기본값(작품 미지정) — 마스터프롬프트 패널 초기값 등.
SYSTEM = system()


def _ev_block(e: dict) -> str:
    chars = ", ".join(
        f"{c.get('name','')}({c.get('state_before','')}→{c.get('state_after','')})"
        for c in e.get("characters_involved", []))
    return (f"- [{e.get('era','?')}] {e.get('title','')}: "
            f"{e.get('what', e.get('summary',''))}\n  인물: {chars or '없음'}")


def original_prompt(before: dict, after: dict) -> str:
    """(A) 원본: 두 앵커 구간의 실제 사건을 있는 그대로 서사화."""
    return f"""다음은 이 세계관 정사(正史)의 연속된 두 사건이다.

[선행 사건]
{_ev_block(before)}

[후행 사건]
{_ev_block(after)}

위 두 사건을, 추가 인물이나 창작 없이 **있는 그대로** 하나의 이어지는 서사로 정리하라.
형식:
## 원본 서사
(3~5문단. 선행→후행으로 흐르는 정사 그대로의 이야기.)"""


def inserted_prompt(req: InsertionRequest) -> str:
    """(B) 삽입: 앵커 고정 + 신캐를 인과 사이에 끼운 새 중간 서사."""
    ncs = req.new_characters
    names = " · ".join(c.name for c in ncs) or "신규 인물"
    char_block = "\n".join(f"- {c.name}: {c.concept} (동기: {c.motive})" for c in ncs) or "- (미지정)"
    multi = len(ncs) > 1
    converge = (f"- {names} 의 개입이 서로 얽히되, 후행 앵커의 결말로 함께 수렴하게 하라."
                if multi else
                f"- {names} 의 개입이 후행 앵커의 결말을 거스르지 않고 오히려 그리로 수렴하게 하라.")
    roles = "\n".join(f"- {c.name}의 역할:" for c in ncs)
    ctx = "\n".join(_ev_block(e) for e in req.context_events) or "(없음)"
    return f"""아래 두 '앵커 사건' 사이에, 신규 캐릭터{'들' if multi else ''}을 자연스럽게 끼워넣은 **새 중간 서사**를 써라.

[앵커=처음 (불변)]
{_ev_block(req.anchor_before)}

[앵커=끝 (불변)]
{_ev_block(req.anchor_after)}

[끼워넣을 신규 캐릭터{' (여러 명 — 서로 관계 맺게)' if multi else ''}]
{char_block}

[참고 맥락 (다른 이야기·세계관)]
{ctx}
관여 인물: {', '.join(req.involved_characters) or '없음'}

[지켜야 할 것]
- 처음(선행 앵커)과 끝(후행 앵커)의 상태는 절대 바꾸지 마라. 그 사이만 창작한다.
{converge}
- 기존 인물과 세계관 제약을 존중하라.
{guidance(req.plot_key)}

형식:
## 삽입 서사 — {names}
(4~6문단. 위 플롯 구조를 따르되 단계명을 노출하지 말 것.)

## 신규 사건 카드
- 제목:
- era:
- 한줄요약:
{roles}"""
