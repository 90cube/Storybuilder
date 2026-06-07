import sys, tempfile
from pathlib import Path
sys.path.insert(0, "src")

import builder.store.db as db


def _fresh_db():
    p = Path(tempfile.mktemp(suffix=".db"))
    db.CREATOR_DB = p
    db.init_db()
    return p


def test_style_roundtrip():
    _fresh_db()
    from builder.store import repo
    pid = repo.create_project("작품A")
    assert repo.get_style(pid) == ""
    repo.set_style(pid, "건조한 단문, 명사 중심")
    assert repo.get_style(pid) == "건조한 단문, 명사 중심"
