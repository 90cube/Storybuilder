"""정사 라우터: 신캐 감지·부분 다듬기·canon diff·승격. 라우팅만(로직은 extract/postproc/canon)."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from builder.store import repo, graph, entity
from builder.domain import pipeline
from builder.extract import service as extract_svc
from builder.postproc import service as post_svc
from builder.canon import diff as canon

router = APIRouter()


class PromoteIn(BaseModel):
    chapter_id: int
    entities: list[dict] = []
    relations: list[dict] = []
    events: list[dict] = []


def _final_text(ch: dict) -> str:
    t = ch["texts"]
    for k in ("final", "expand", "polish", "draft"):
        if t.get(k):
            return t[k]["text"]
    return ""


@router.post("/detect/{chapter_id}")
def detect(chapter_id: int):
    """현재 원고에서 신규 캐릭터 후보 감지 (CHAR_DETECT). 최신 polish>draft 텍스트 사용."""
    ch = repo.get_chapter(chapter_id)
    if not ch:
        raise HTTPException(404, "chapter not found")
    t = ch["texts"]
    text = (t.get("polish") or t.get("draft") or {}).get("text", "")
    pid = repo.project_of(chapter_id)
    try:
        cands = extract_svc.detect_new_characters(text, graph.known_names(pid), world=repo.world_of(chapter_id))
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
    """(강제 초기화) 완성본에서 노드/엣지 + 등장 인물 '이 화 시점 상태' 추출 → 3색 diff. →EXTRACT."""
    ch = repo.get_chapter(chapter_id)
    if not ch:
        raise HTTPException(404, "chapter not found")
    pid = repo.project_of(chapter_id)
    world = repo.world_of(chapter_id)
    text = _final_text(ch)
    # 추출 1회 원칙: 엔티티+관계+사건+'이 화 시점 상태'를 단일 호출로. DB 인물 카드(말투·성격·직전상태) 주입.
    cards = graph.entities_in_text(pid, text)
    for c in cards:
        c["prev_state"] = entity.latest_state(graph._eid(pid, c["name"]))
    try:
        ext = extract_svc.extract_with_states(text, cards, world=world)
    except Exception as e:
        raise HTTPException(500, f"{type(e).__name__}: {e}")
    d = canon.diff_against_graph(ext, pid)  # ext 엔티티가 state/statechange를 인라인으로 보유
    repo.set_state(chapter_id, "EXTRACT")
    return {**d, "state": repo.get_state(chapter_id)}


@router.post("/canon/promote")
def canon_promote(body: PromoteIn):
    """승인 항목을 canon 승격 + DB 반영(작품 한정) + 타임라인 기록. DB_SYNC2→CHAPTER_SAVE."""
    res = canon.promote(body.entities, body.relations, repo.project_of(body.chapter_id),
                        body.events, chapter_id=body.chapter_id)
    repo.set_state(body.chapter_id, "CHAPTER_SAVE")
    return {**res, "state": repo.get_state(body.chapter_id)}
