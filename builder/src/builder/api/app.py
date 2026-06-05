"""FastAPI 앱 조립: 사건/플롯/프롬프트 조회 + 생성 + 정적 프론트 서빙."""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from builder.const import WEB_DIR
from builder.io.corpus import load_events
from builder.io.entities import search_entities
from builder.plot.templates import PLOTS
from builder.domain.insertion import NewCharacter
from builder.llm import prompts
from builder import service


class CharIn(BaseModel):
    name: str
    concept: str
    motive: str


class GenIn(BaseModel):
    before_id: str
    after_id: str
    new_character: CharIn
    plot_key: str = "five"
    context_ids: list[str] = []
    system: str | None = None


def create_app() -> FastAPI:
    app = FastAPI(title="DNF StoryBuilder — 기능1")
    # 개발(Vite 5173) + 향후 Electron 대비.
    app.add_middleware(CORSMiddleware, allow_origins=["*"],
                       allow_methods=["*"], allow_headers=["*"])

    @app.get("/api/entities")
    def entities(q: str = "", category: str = "person", limit: int = 50):
        return search_entities(q, category, limit)

    @app.get("/api/events")
    def events():
        _, ordered = load_events()
        return [{
            "id": e["event_id"], "title": e.get("title", ""),
            "era": e.get("era", ""), "sequence": e.get("sequence", 0),
            "causal_out": e.get("causal_out", []),
            "characters": [c.get("name", "") for c in e.get("characters_involved", [])],
        } for e in ordered]

    @app.get("/api/plots")
    def plots():
        return [{"key": k, "name": v[0]} for k, v in PLOTS.items()]

    @app.get("/api/prompt")
    def prompt():
        return {"system": prompts.SYSTEM}

    @app.post("/api/generate")
    def generate(body: GenIn):
        try:
            return service.generate_pair(
                body.before_id, body.after_id,
                NewCharacter(**body.new_character.model_dump()),
                body.plot_key, context_ids=body.context_ids, system=body.system)
        except Exception as e:  # LLM 미기동·corpus 오류 등을 그대로 전달
            raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}")

    @app.get("/")
    def index():
        return FileResponse(WEB_DIR / "index.html")

    app.mount("/", StaticFiles(directory=str(WEB_DIR)), name="static")
    return app
