"""그래프 내보내기: entities/relations/events/timeline/secrets → JSON·CSV 직렬화. 읽기 전용."""

import csv
import io
import json

from builder.store.db import get_conn

TABLES = ("entities", "relations", "events", "timeline", "secrets")


def _rows(table: str) -> list[dict]:
    with get_conn() as c:
        return [dict(r) for r in c.execute(f"SELECT * FROM {table}")]


def export_json() -> dict:
    """전체 그래프 스냅샷. data_json 은 객체로 풀어서 담는다."""
    out: dict[str, list] = {}
    for t in TABLES:
        rows = _rows(t)
        if t == "entities":
            for r in rows:
                r["data"] = json.loads(r.pop("data_json") or "{}")
        out[t] = rows
    return out


def export_csv(table: str) -> str:
    """한 테이블을 CSV 텍스트로. data_json 은 문자열 그대로 둔다(셀 1개)."""
    if table not in TABLES:
        raise ValueError(f"미지원 테이블: {table}")
    rows = _rows(table)
    if not rows:
        return ""
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
    w.writeheader()
    for r in rows:
        w.writerow({k: ("" if v is None else v) for k, v in r.items()})
    return buf.getvalue()
