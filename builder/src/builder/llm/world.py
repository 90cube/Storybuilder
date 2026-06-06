"""세계관(작품) 명칭 주입. 프로젝트 제목 = 사용자 고유 세계관 이름. 프롬프트 범용화의 단일 출처."""


def world_name(world: str | None) -> str:
    return (world or "").strip() or "이 작품"


def world_intro(world: str | None) -> str:
    """모델에게 '이건 기성 IP가 아니라 사용자 고유 세계관'임을 알린다(외부지식 차단)."""
    w = world_name(world)
    return (f"〈{w}〉은(는) 사용자가 집필 중인 작품(소설·시나리오)의 제목이자 세계관 이름이다. "
            "기성 IP가 아닌 사용자 고유 세계관이므로, 주어진 산문·설정에만 근거하고 외부 지식을 끌어오지 마라.")
