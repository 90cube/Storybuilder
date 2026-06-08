"""생성 라우터: gen·extract·chars/assist·analyze·assist edit/translate·lane 생성. 라우팅만(로직은 gen/extract/canon)."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from builder.store import repo, graph
from builder.domain import pipeline
from builder.gen import modes
from builder.extract import service as extract_svc
from builder.chars import assist as chars_svc
from builder.canon import diff as canon
from builder import service as gen_svc
from builder.gen import assist as assist_svc
from builder.domain.insertion import NewCharacter

router = APIRouter()


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
    chapter_id: int | None = None


class LaneCharIn(BaseModel):
    name: str
    concept: str = ""
    motive: str = ""


class AssistEditIn(BaseModel):
    chapter_id: int
    selected: str
    before: str = ""
    after: str = ""
    style_source: str = "field"  # field | auto | base


class AssistTransIn(BaseModel):
    chapter_id: int
    text: str


class StageIn(BaseModel):
    events: list[dict] = []
    entities: list[dict] = []
    relations: list[dict] = []


class LaneGenIn(BaseModel):
    project_id: int
    before_id: str
    after_id: str
    new_characters: list[LaneCharIn] = []
    plot_key: str = "five"
    context_ids: list[str] = []
    system: str | None = None


def _style_for(pid: int, source: str) -> str:
    if source == "field":
        return repo.get_style(pid)
    if source == "auto":
        return repo.latest_prose(pid)
    return ""


@router.post("/gen")
def gen(body: GenIn):
    ch = repo.get_chapter(body.chapter_id)
    if not ch:
        raise HTTPException(404, "chapter not found")
    src = ch["texts"].get("draft", {}).get("text", "")
    try:
        kind, out = modes.generate(body.mode, src, world=repo.world_of(body.chapter_id), system=body.system)
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
    world = repo.world_of(body.chapter_id) if body.chapter_id else ""
    try:
        return chars_svc.assist(body.name, body.context, world=world)
    except Exception as e:
        raise HTTPException(500, f"{type(e).__name__}: {e}")


@router.post("/analyze/{chapter_id}")
def analyze(chapter_id: int, mode: str = "raw"):
    """현재 초안에서 전체 구조(events·entities·relations)를 추출 — 비확정(분석용, FSM/DB 변경 없음)."""
    ch = repo.get_chapter(chapter_id)
    if not ch:
        raise HTTPException(404, "chapter not found")
    text = ch["texts"].get("draft", {}).get("text", "")
    try:
        d = extract_svc.extract_from_text(text, mode=mode, world=repo.world_of(chapter_id))
    except Exception as e:
        raise HTTPException(500, f"{type(e).__name__}: {e}")
    return {"events": d.get("events", []), "entities": d.get("entities", []),
            "relations": d.get("relations", [])}


@router.post("/analyze/{chapter_id}/commit")
def analyze_commit(chapter_id: int, body: StageIn):
    """분석 결과를 작품 인과 그래프에 'draft_auto' 임시 티어로 추가(정사 보호, FSM 미관여)."""
    pid = repo.project_of(chapter_id)
    if pid is None:
        raise HTTPException(404, "chapter not found")
    return canon.stage_draft(
        {"events": body.events, "entities": body.entities, "relations": body.relations}, pid)


@router.post("/assist/edit")
def assist_edit(body: AssistEditIn):
    """선택 영역 부분수정. 상태로 mode 결정(DRAFT=다듬기 / 그외=완성본 보강+엔티티)."""
    pid = repo.project_of(body.chapter_id)
    if pid is None:
        raise HTTPException(404, "chapter not found")
    world = repo.world_of(body.chapter_id)
    mode = "draft" if repo.get_state(body.chapter_id) == "DRAFT" else "enrich"
    style = _style_for(pid, body.style_source)
    cards = graph.entities_in_text(pid, f"{body.selected} {body.before} {body.after}")
    try:
        out = assist_svc.edit(body.selected, body.before, body.after, world=world,
                              style=style, char_cards=cards, mode=mode)
    except Exception as e:
        raise HTTPException(500, f"{type(e).__name__}: {e}")
    ents = {"added": [], "changed": []}
    if mode == "enrich":
        try:
            d = canon.diff_against_graph(extract_svc.extract_from_text(body.selected, world=world), pid)
            ents["added"] = [e for e in d["entities"] if e.get("change") == "추가"]
            ents["changed"] = [e for e in d["entities"] if e.get("change") == "변경"]
        except Exception:
            pass
    return {**out, "mode": mode, "entities": ents}


@router.post("/assist/translate")
def assist_translate(body: AssistTransIn):
    try:
        return {"text": assist_svc.translate(body.text, world=repo.world_of(body.chapter_id))}
    except Exception as e:
        raise HTTPException(500, f"{type(e).__name__}: {e}")


@router.post("/lane/generate")
def lane_generate(body: LaneGenIn):
    """작품 사건 사이에 신캐를 끼워 원본·삽입 2개 생성. corpus 대신 작품 events 사용."""
    by_id = graph.events_by_id(body.project_id)
    if body.before_id not in by_id or body.after_id not in by_id:
        raise HTTPException(400, "앵커 사건이 이 작품에 없습니다")
    try:
        return gen_svc.generate_pair(
            body.before_id, body.after_id,
            [NewCharacter(**c.model_dump()) for c in body.new_characters],
            body.plot_key, context_ids=body.context_ids, system=body.system,
            save=False, events_by_id=by_id)
    except Exception as e:
        raise HTTPException(500, f"{type(e).__name__}: {e}")
