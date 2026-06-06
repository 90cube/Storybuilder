"""Creator API 라우터: 프로젝트·화·원고·자동저장·파이프라인 전이. 라우팅만(로직은 store/domain)."""

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field

from builder.store import repo, graph, entity, export
from builder.schemadef import loader
from builder.domain import pipeline
from builder.gen import modes
from builder.extract import service as extract_svc
from builder.chars import assist as chars_svc
from builder.postproc import service as post_svc
from builder.canon import diff as canon

router = APIRouter(prefix="/api")


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


class EntityIn(BaseModel):
    name: str
    category: str = "character"
    description: str = ""
    speech_style: str = ""
    relations: list[str] = []


class PromoteIn(BaseModel):
    chapter_id: int
    entities: list[dict] = []
    relations: list[dict] = []


# ── 에디터 흡수: 스키마주도 엔티티 편집 ──
class EntitySaveIn(BaseModel):
    type: str
    data: dict
    expected_version: int | None = None


class RelationIn(BaseModel):
    from_name: str = Field(alias="from")
    rel: str
    to_name: str = Field(alias="to")

    model_config = {"populate_by_name": True}


class TimelineIn(BaseModel):
    era: str = ""
    state: str = ""
    note: str = ""
    seq: int = 0


class SecretIn(BaseModel):
    fact: str
    known_by: list = []
    reveal_at: str = ""


def _final_text(ch: dict) -> str:
    t = ch["texts"]
    for k in ("final", "expand", "polish", "draft"):
        if t.get(k):
            return t[k]["text"]
    return ""


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


@router.delete("/seasons/{sid}")
def del_season(sid: int):
    repo.delete_season(sid); return {"ok": True}


@router.put("/chapters/{cid}")
def edit_chapter(cid: int, body: ProjectIn):
    repo.rename_chapter(cid, body.title); return {"ok": True}


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


@router.post("/detect/{chapter_id}")
def detect(chapter_id: int):
    """현재 원고에서 신규 캐릭터 후보 감지 (CHAR_DETECT). 최신 polish>draft 텍스트 사용."""
    ch = repo.get_chapter(chapter_id)
    if not ch:
        raise HTTPException(404, "chapter not found")
    t = ch["texts"]
    text = (t.get("polish") or t.get("draft") or {}).get("text", "")
    try:
        cands = extract_svc.detect_new_characters(text, graph.known_names(), world=repo.world_of(chapter_id))
    except Exception as e:
        raise HTTPException(500, f"{type(e).__name__}: {e}")
    if pipeline.can_advance(repo.get_state(chapter_id), "CHAR_DETECT"):
        repo.set_state(chapter_id, "CHAR_DETECT")
    return {"candidates": cands, "state": repo.get_state(chapter_id)}


@router.post("/postprocess/polish/{chapter_id}")
def pp_polish(chapter_id: int):
    """완성본 전문 → (강제 초기화) 부분 다듬기. EXPAND→…→CTX_RESET_B."""
    ch = repo.get_chapter(chapter_id)
    if not ch:
        raise HTTPException(404, "chapter not found")
    try:
        out = post_svc.partial_polish(_final_text(ch), world=repo.world_of(chapter_id))
    except Exception as e:
        raise HTTPException(500, f"{type(e).__name__}: {e}")
    repo.add_manuscript(chapter_id, "final", out)
    repo.set_state(chapter_id, "CTX_RESET_B")
    return {"text": out, "state": repo.get_state(chapter_id)}


@router.post("/canon/diff/{chapter_id}")
def canon_diff(chapter_id: int):
    """(강제 초기화) 완성본에서 노드/엣지 추출 + 현 DB와 3색 diff. →EXTRACT."""
    ch = repo.get_chapter(chapter_id)
    if not ch:
        raise HTTPException(404, "chapter not found")
    try:
        ext = extract_svc.extract_from_text(_final_text(ch), world=repo.world_of(chapter_id))
    except Exception as e:
        raise HTTPException(500, f"{type(e).__name__}: {e}")
    d = canon.diff_against_graph(ext)
    repo.set_state(chapter_id, "EXTRACT")
    return {**d, "state": repo.get_state(chapter_id)}


@router.post("/canon/promote")
def canon_promote(body: PromoteIn):
    """승인 항목을 canon 승격 + DB 반영. DB_SYNC2→CHAPTER_SAVE."""
    res = canon.promote(body.entities, body.relations)
    repo.set_state(body.chapter_id, "CHAPTER_SAVE")
    return {**res, "state": repo.get_state(body.chapter_id)}


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


# ── 에디터 흡수: 스키마·타입 폼·관계·타임라인·비밀·내보내기·편집로그 ──
@router.get("/schema")
def schema():
    """타입 정의(폼 필드·필수)와 역관계 레지스트리 — 프론트가 폼을 그릴 단일 진실원."""
    return {
        "types": [
            {"type": t, "label": d["label"],
             "fields": loader.form_fields(t), "required": loader.required_keys(t),
             "mixins": d["mixins"]}
            for t, d in loader.types().items()
        ],
        "relations": loader.relations(),
    }


@router.get("/entities")
def entities_by_type(type: str):
    return entity.list_by_type(type)


@router.get("/entity/{eid}")
def entity_detail(eid: str):
    e = entity.get_entity(eid)
    if not e:
        raise HTTPException(404, "entity not found")
    return {**e, "relations": entity.list_relations(eid),
            "timeline": entity.list_timeline(eid), "secrets": entity.list_secrets(eid)}


@router.post("/entity")
def entity_save(body: EntitySaveIn):
    """타입 폼 저장(생성/수정). 필수검증·버전잠금."""
    try:
        return entity.save_entity(body.type, body.data, expected_version=body.expected_version)
    except entity.ValidationError as e:
        raise HTTPException(422, str(e))
    except entity.VersionConflict as e:
        raise HTTPException(409, str(e))


@router.delete("/entity/{eid}")
def entity_delete(eid: str):
    entity.delete_entity(eid); return {"ok": True}


@router.post("/relation")
def relation_add(body: RelationIn):
    """양방향 관계 주입(역관계 포함)."""
    entity.set_relation(body.from_name, body.rel, body.to_name); return {"ok": True}


@router.delete("/relation/{pair_id}")
def relation_delete(pair_id: str):
    entity.delete_pair(pair_id); return {"ok": True}


@router.post("/entity/{eid}/timeline")
def timeline_add(eid: str, body: TimelineIn):
    return {"id": entity.add_timeline(eid, body.era, body.state, body.note, body.seq)}


@router.post("/entity/{eid}/secret")
def secret_add(eid: str, body: SecretIn):
    return {"id": entity.add_secret(eid, body.fact, body.known_by, body.reveal_at)}


@router.get("/export")
def export_all():
    """전체 그래프 JSON 스냅샷."""
    return export.export_json()


@router.get("/export/csv")
def export_table_csv(table: str = "entities"):
    try:
        body = export.export_csv(table)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return Response(content=body, media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{table}.csv"'})


@router.get("/editlog")
def editlog(limit: int = 100):
    return entity.recent_log(limit)
