"""화 본문 버전 트리: 생성(분기)·조회·head 이동(되돌리기). 비파괴 — 노드는 지우지 않고 head만 옮긴다."""

from builder.store.db import get_conn
from builder.store.graph import _now


def head_id(chapter_id: int) -> int | None:
    with get_conn() as c:
        r = c.execute("SELECT head_version_id FROM pipeline_runs WHERE chapter_id=?", (chapter_id,)).fetchone()
        return r["head_version_id"] if r and r["head_version_id"] is not None else None


def create(chapter_id: int, text: str, kind: str = "manual", parent_id: int | None = None,
           label: str = "", who: str = "creator") -> int:
    """새 버전 노드 생성 후 head로 지정. parent 미지정 시 현재 head에서 분기."""
    if parent_id is None:
        parent_id = head_id(chapter_id)
    with get_conn() as c:
        vid = c.execute("""INSERT INTO versions(chapter_id,parent_id,kind,text,label,created_at,created_by)
                           VALUES(?,?,?,?,?,?,?)""",
                        (chapter_id, parent_id, kind, text, label, _now(), who)).lastrowid
        c.execute("UPDATE pipeline_runs SET head_version_id=? WHERE chapter_id=?", (vid, chapter_id))
        return vid


def set_head(chapter_id: int, version_id: int) -> None:
    """되돌리기/분기 선택 — head만 이동(노드 삭제 없음)."""
    with get_conn() as c:
        c.execute("UPDATE pipeline_runs SET head_version_id=? WHERE chapter_id=?", (version_id, chapter_id))


def update_head_text(chapter_id: int, text: str) -> None:
    """자동저장: head가 draft/manual이면 노드 폭증 막게 in-place 갱신, 아니면 manual 새 노드."""
    hid = head_id(chapter_id)
    if hid is not None:
        with get_conn() as c:
            row = c.execute("SELECT kind, text FROM versions WHERE id=?", (hid,)).fetchone()
            if row:
                if row["text"] == text:
                    return  # 변경 없음 → 노드/갱신 생략(화 열기·무편집 자동저장 잡음 방지)
                if row["kind"] in ("draft", "manual"):
                    c.execute("UPDATE versions SET text=?, created_at=? WHERE id=?", (text, _now(), hid))
                    return
    create(chapter_id, text, kind="manual")


def get(version_id: int | None) -> dict | None:
    if version_id is None:
        return None
    with get_conn() as c:
        r = c.execute("SELECT * FROM versions WHERE id=?", (version_id,)).fetchone()
        return dict(r) if r else None


def head_text(chapter_id: int) -> str:
    v = get(head_id(chapter_id))
    return v["text"] if v else ""


def list(chapter_id: int) -> list[dict]:
    """버전 목록(본문 제외, 표시용). 최신은 id 큰 쪽."""
    with get_conn() as c:
        return [dict(r) for r in c.execute(
            "SELECT id,parent_id,kind,label,created_at FROM versions WHERE chapter_id=? ORDER BY id",
            (chapter_id,))]
