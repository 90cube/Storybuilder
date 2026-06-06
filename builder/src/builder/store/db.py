"""SQLite 연결 + 스키마 초기화. 연결 책임만."""

import sqlite3
from pathlib import Path

from builder.const import CREATOR_DB

_SCHEMA = Path(__file__).with_name("schema.sql")


def get_conn() -> sqlite3.Connection:
    """row_factory=Row, FK on 연결을 돌려준다."""
    conn = sqlite3.connect(CREATOR_DB)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    """스키마를 (없으면) 생성한다. 앱 기동 시 1회."""
    CREATOR_DB.parent.mkdir(parents=True, exist_ok=True)
    with get_conn() as conn:
        conn.executescript(_SCHEMA.read_text(encoding="utf-8"))
