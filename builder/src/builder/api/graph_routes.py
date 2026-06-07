"""그래프 라우터: 엔티티·타입폼·관계·타임라인·비밀·사건·스키마·내보내기·편집로그. 라우팅만(로직은 store/schemadef)."""

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field

from builder.store import repo, graph, entity, export
from builder.schemadef import loader
from builder.domain import pipeline

router = APIRouter()


class EntityIn(BaseModel):
    name: str
    category: str = "character"
    description: str = ""
    speech_style: str = ""
    relations: list[str] = []


# ── 에디터 흡수: 스키마주도 엔티티 편집 ──
class EntitySaveIn(BaseModel):
    type: str
    data: dict
    project_id: int
    expected_version: int | None = None


class RelationIn(BaseModel):
    from_name: str = Field(alias="from")
    rel: str
    to_name: str = Field(alias="to")
    project_id: int

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


@router.get("/graph/entities")
def graph_entities(project: int):
    """현재 작품의 등록 엔티티 목록."""
    return graph.list_entities(project)


@router.post("/graph/entity")
def graph_entity(body: EntityIn, chapter_id: int):
    """신캐 등록 (DB_WRITE→DB_SYNC). 화가 속한 작품에 귀속."""
    pid = repo.project_of(chapter_id)
    eid = graph.upsert_entity(body.model_dump(), pid)
    for s in ("DB_WRITE", "DB_SYNC"):
        if pipeline.can_advance(repo.get_state(chapter_id), s):
            repo.set_state(chapter_id, s)
    return {"id": eid}


# ── 인과 캔버스(빌더 기능1) — 작품 자체 사건 기반 ──
@router.get("/project-events")
def project_events(project: int):
    """현재 작품의 사건 목록(corpus 아님). 인과 캔버스가 읽는다."""
    return graph.list_events(project)


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


@router.get("/typed-entities")
def entities_by_type(type: str, project: int):
    """작품·타입별 엔티티 목록(에디터 폼용). /api/entities(인물 피커, app.py)와 구분."""
    return entity.list_by_type(type, project)


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
        return entity.save_entity(body.type, body.data, body.project_id, expected_version=body.expected_version)
    except entity.ValidationError as e:
        raise HTTPException(422, str(e))
    except entity.VersionConflict as e:
        raise HTTPException(409, str(e))


@router.delete("/entity/{eid}")
def entity_delete(eid: str):
    entity.delete_entity(eid); return {"ok": True}


@router.post("/relation")
def relation_add(body: RelationIn):
    """양방향 관계 주입(역관계 포함, 작품 한정)."""
    entity.set_relation(body.from_name, body.rel, body.to_name, body.project_id); return {"ok": True}


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
def export_all(project: int):
    """작품 한정 그래프 JSON 스냅샷."""
    return export.export_json(project)


@router.get("/export/csv")
def export_table_csv(project: int, table: str = "entities"):
    try:
        body = export.export_csv(table, project)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return Response(content=body, media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{table}_p{project}.csv"'})


@router.get("/editlog")
def editlog(project: int, limit: int = 100):
    return entity.recent_log(project, limit)
