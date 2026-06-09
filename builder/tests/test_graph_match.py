import sys, tempfile
from pathlib import Path
sys.path.insert(0, "src")
import builder.store.db as db


def _fresh():
    db.CREATOR_DB = Path(tempfile.mktemp(suffix=".db"))
    db.init_db()


def test_known_names_includes_aliases():
    _fresh()
    from builder.store import repo, graph
    from builder.store.db import get_conn
    pid = repo.create_project("작품")
    graph.upsert_entity({"name": "카인", "category": "character"}, pid)
    eid = graph._eid(pid, "카인")
    with get_conn() as c:  # 별칭(별명) 직접 등록
        c.execute("INSERT INTO aliases(project_id,alias,entity_id) VALUES(?,?,?)", (pid, "라이터맨", eid))
    names = graph.known_names(pid)
    assert "카인" in names and "라이터맨" in names  # 별명도 '알려진 이름' → 신규 재검출 방지


def test_entities_in_text_avoids_substring_and_1char():
    _fresh()
    from builder.store import repo, graph
    pid = repo.create_project("작품")
    for nm in ("수호", "수호자", "강"):
        graph.upsert_entity({"name": nm, "category": "character"}, pid)
    got = {e["name"] for e in graph.entities_in_text(pid, "수호자가 강을 지킨다")}
    assert "수호자" in got      # 더 긴 이름은 매칭
    assert "수호" not in got     # 부분문자열(수호자가 본문에 존재) → 오탐 제거
    assert "강" not in got       # 1글자 이름 → 제외
