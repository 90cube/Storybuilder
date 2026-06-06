"""Creator API 라우터: 프로젝트·화·원고·자동저장·파이프라인 전이. 라우팅만(로직은 store/domain)."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from builder.store import repo
from builder.domain import pipeline

router = APIRouter(prefix="/api")


class ProjectIn(BaseModel):
    title: str


class ChapterIn(BaseModel):
    project_id: int
    title: str = ""
    idx: int = 0


class TextIn(BaseModel):
    text: str


class AdvanceIn(BaseModel):
    to_state: str


@router.get("/projects")
def projects():
    return repo.list_projects()


@router.post("/projects")
def new_project(body: ProjectIn):
    return {"id": repo.create_project(body.title)}


@router.get("/chapters")
def chapters(project: int):
    return repo.list_chapters(project)


@router.post("/chapters")
def new_chapter(body: ChapterIn):
    return {"id": repo.create_chapter(body.project_id, body.title, body.idx)}


@router.get("/chapter/{chapter_id}")
def chapter(chapter_id: int):
    ch = repo.get_chapter(chapter_id)
    if not ch:
        raise HTTPException(404, "chapter not found")
    return ch


@router.put("/chapter/{chapter_id}/text")
def save_text(chapter_id: int, body: TextIn):
    repo.save_draft_text(chapter_id, body.text)
    return {"ok": True}


@router.get("/chapter/{chapter_id}/run")
def run_state(chapter_id: int):
    return {"state": repo.get_state(chapter_id), "states": pipeline.STATES}


@router.post("/run/{chapter_id}/advance")
def advance(chapter_id: int, body: AdvanceIn):
    cur = repo.get_state(chapter_id)
    if not pipeline.can_advance(cur, body.to_state):
        raise HTTPException(400, f"전이 불가: {cur} → {body.to_state}")
    repo.set_state(chapter_id, body.to_state)
    return {"state": body.to_state}
