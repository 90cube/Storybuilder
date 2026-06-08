"""Creator API 조립: 도메인별 서브라우터(structure/gen/graph/canon)를 /api 프리픽스로 묶는다. 와이어링만."""

from fastapi import APIRouter

from builder.api.structure_routes import router as structure_router
from builder.api.gen_routes import router as gen_router
from builder.api.graph_routes import router as graph_router
from builder.api.canon_routes import router as canon_router

router = APIRouter(prefix="/api")
router.include_router(structure_router)
router.include_router(gen_router)
router.include_router(graph_router)
router.include_router(canon_router)
