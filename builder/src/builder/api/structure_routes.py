"""구조 라우터: 작품·시즌·화 CRUD·이동·원고 텍스트·FSM 상태·문체. 라우팅만(로직은 store/domain)."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from builder.store import repo
from builder.domain import pipeline

router = APIRouter()


class ProjectIn(BaseModel):
    title: str


class SeasonIn(BaseModel):
    project_id: int
    title: str = ""


class ChapterIn(BaseModel):
    season_id: int
    title: str = ""
    idx: int = 0


class TextIn(BaseModel):
    text: str


class AdvanceIn(BaseModel):
    to_state: str


class StyleIn(BaseModel):
    text: str


@router.get("/projects")
def projects():
    return repo.list_projects()


@router.post("/projects")
def new_project(body: ProjectIn):
    return {"id": repo.create_project(body.title)}


@router.get("/seasons")
def seasons(project: int):
    return repo.list_seasons(project)


@router.post("/seasons")
def new_season(body: SeasonIn):
    return {"id": repo.create_season(body.project_id, body.title)}


@router.get("/chapters")
def chapters(season: int):
    return repo.list_chapters(season)


@router.post("/chapters")
def new_chapter(body: ChapterIn):
    return {"id": repo.create_chapter(body.season_id, body.title, body.idx)}


# ── rename / delete (full CRUD) ──
@router.put("/projects/{pid}")
def edit_project(pid: int, body: ProjectIn):
    repo.rename_project(pid, body.title); return {"ok": True}


@router.delete("/projects/{pid}")
def del_project(pid: int):
    repo.delete_project(pid); return {"ok": True}


@router.put("/seasons/{sid}")
def edit_season(sid: int, body: ProjectIn):
    repo.rename_season(sid, body.title); return {"ok": True}


@router.put("/seasons/{sid}/move")
def move_season(sid: int, project_id: int):
    """시즌을 다른 작품으로 이동(소속 화 포함)."""
    repo.move_season(sid, project_id); return {"ok": True}


@router.delete("/seasons/{sid}")
def del_season(sid: int):
    repo.delete_season(sid); return {"ok": True}


@router.put("/chapters/{cid}")
def edit_chapter(cid: int, body: ProjectIn):
    repo.rename_chapter(cid, body.title); return {"ok": True}


@router.put("/chapters/{cid}/move")
def move_chapter(cid: int, season_id: int):
    """화를 다른 시즌으로 이동(대상 시즌의 작품으로 귀속)."""
    repo.move_chapter(cid, season_id); return {"ok": True}


@router.delete("/chapters/{cid}")
def del_chapter(cid: int):
    repo.delete_chapter(cid); return {"ok": True}


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


@router.get("/pipeline/states")
def pipeline_states():
    """파이프라인 단계 목록(정적). 화마다 재요청할 필요 없이 앱 1회 로드용."""
    return pipeline.STATES


@router.get("/chapter/{chapter_id}/run")
def run_state(chapter_id: int):
    return {"state": repo.get_state(chapter_id), "states": pipeline.STATES}


@router.get("/run/{chapter_id}")
def run_info(chapter_id: int):
    """FSM 단일 진실원: 현재 상태·전체 순서·가용 전이·구조화 도구 활성을 한 번에 반환."""
    if not repo.get_chapter(chapter_id):
        raise HTTPException(404, "chapter not found")
    state = repo.get_state(chapter_id)
    return {
        "state": state,
        "states": pipeline.STATES,
        "canAdvanceTo": pipeline.TRANSITIONS.get(state, []),
        "tools": {"detect": state != "DRAFT", "canon": state != "DRAFT"},
    }


@router.post("/run/{chapter_id}/advance")
def advance(chapter_id: int, body: AdvanceIn):
    cur = repo.get_state(chapter_id)
    if not pipeline.can_advance(cur, body.to_state):
        raise HTTPException(400, f"전이 불가: {cur} → {body.to_state}")
    repo.set_state(chapter_id, body.to_state)
    return {"state": body.to_state}


@router.get("/projects/{pid}/style")
def get_project_style(pid: int):
    return {"text": repo.get_style(pid)}


@router.put("/projects/{pid}/style")
def put_project_style(pid: int, body: StyleIn):
    repo.set_style(pid, body.text)
    return {"ok": True}
