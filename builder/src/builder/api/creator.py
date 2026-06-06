"""Creator API 라우터: 프로젝트·화·원고·자동저장·파이프라인 전이. 라우팅만(로직은 store/domain)."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from builder.store import repo, graph
from builder.domain import pipeline
from builder.gen import modes
from builder.extract import service as extract_svc
from builder.chars import assist as chars_svc

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


class GenIn(BaseModel):
    chapter_id: int
    mode: str  # draft | polish | expand
    system: str | None = None


class ExtractIn(BaseModel):
    text: str | None = None
    chapter_id: int | None = None


class CharAssistIn(BaseModel):
    name: str
    context: str = ""


class EntityIn(BaseModel):
    name: str
    category: str = "character"
    description: str = ""
    speech_style: str = ""
    relations: list[str] = []


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


@router.post("/gen")
def gen(body: GenIn):
    ch = repo.get_chapter(body.chapter_id)
    if not ch:
        raise HTTPException(404, "chapter not found")
    src = ch["texts"].get("draft", {}).get("text", "")
    try:
        kind, out = modes.generate(body.mode, src, body.system)
    except Exception as e:  # LLM 미기동·모드 오류
        raise HTTPException(500, f"{type(e).__name__}: {e}")
    repo.add_manuscript(body.chapter_id, kind, out)
    to = "EXPAND" if body.mode == "expand" else "POLISH"
    if pipeline.can_advance(repo.get_state(body.chapter_id), to):
        repo.set_state(body.chapter_id, to)
    return {"kind": kind, "text": out, "state": repo.get_state(body.chapter_id)}


@router.post("/extract")
def extract(body: ExtractIn):
    text = body.text or ""
    if not text and body.chapter_id:
        ch = repo.get_chapter(body.chapter_id)
        text = ch["texts"].get("draft", {}).get("text", "") if ch else ""
    try:
        return extract_svc.extract_from_text(text)
    except Exception as e:
        raise HTTPException(500, f"{type(e).__name__}: {e}")


@router.post("/chars/assist")
def chars_assist(body: CharAssistIn):
    try:
        return chars_svc.assist(body.name, body.context)
    except Exception as e:
        raise HTTPException(500, f"{type(e).__name__}: {e}")


@router.post("/detect/{chapter_id}")
def detect(chapter_id: int):
    """현재 원고에서 신규 캐릭터 후보 감지 (CHAR_DETECT). 최신 polish>draft 텍스트 사용."""
    ch = repo.get_chapter(chapter_id)
    if not ch:
        raise HTTPException(404, "chapter not found")
    t = ch["texts"]
    text = (t.get("polish") or t.get("draft") or {}).get("text", "")
    try:
        cands = extract_svc.detect_new_characters(text, graph.known_names())
    except Exception as e:
        raise HTTPException(500, f"{type(e).__name__}: {e}")
    if pipeline.can_advance(repo.get_state(chapter_id), "CHAR_DETECT"):
        repo.set_state(chapter_id, "CHAR_DETECT")
    return {"candidates": cands, "state": repo.get_state(chapter_id)}


@router.get("/graph/entities")
def graph_entities():
    return graph.list_entities()


@router.post("/graph/entity")
def graph_entity(body: EntityIn, chapter_id: int | None = None):
    """신캐 등록 (DB_WRITE→DB_SYNC)."""
    eid = graph.upsert_entity(body.model_dump())
    if chapter_id is not None:
        for s in ("DB_WRITE", "DB_SYNC"):
            if pipeline.can_advance(repo.get_state(chapter_id), s):
                repo.set_state(chapter_id, s)
    return {"id": eid}
