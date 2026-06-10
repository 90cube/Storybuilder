"""버전 라우터: 화 본문 버전 트리 조회 + 단건 전문 + 되돌리기/분기(head 이동). 라우팅만(로직은 store/version)."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from builder.store import version

router = APIRouter()


class RevertIn(BaseModel):
    chapter_id: int
    version_id: int


@router.get("/chapter/{chapter_id}/versions")
def versions(chapter_id: int):
    """버전 목록(전문 제외, 발췌 포함) + 현재 head id."""
    return {"versions": version.list(chapter_id), "head": version.head_id(chapter_id)}


@router.get("/version/{version_id}")
def version_text(version_id: int):
    """버전 단건 전문 — 미리보기(현재본과 diff)용."""
    v = version.get(version_id)
    if not v:
        raise HTTPException(404, "version not found")
    return v


@router.post("/version/revert")
def revert(body: RevertIn):
    """되돌리기/분기 선택 — head만 이동(비파괴). 갱신된 head 본문 반환."""
    version.set_head(body.chapter_id, body.version_id)
    return {"head": version.head_id(body.chapter_id), "text": version.head_text(body.chapter_id)}
