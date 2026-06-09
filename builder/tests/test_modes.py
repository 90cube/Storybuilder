import sys
sys.path.insert(0, "src")
from builder.gen import modes


def test_build_system_is_mode_specific_and_style_free():
    pol = modes.build_system("헬레보어", "polish")
    exp = modes.build_system("헬레보어", "expand")
    assert "헬레보어" in pol and "헬레보어" in exp   # world 주입
    assert pol != exp                                # 모드별로 다름(expand 과잉제약 해소)
    assert "확장" in exp                             # 완성본=확장 지향
    assert "다듬" in pol                             # 다듬기=문장만
    # 시스템에서 문체 고정("미사여구"류) 제거 → 문체 지침에 위임
    assert "미사여구" not in pol and "미사여구" not in exp
