"""진입점(서버 와이어링): FastAPI 앱을 uvicorn으로 띄운다. 로직 없음."""

import uvicorn

from builder.const import APP_HOST, APP_PORT
from builder.api.app import create_app

app = create_app()

if __name__ == "__main__":
    uvicorn.run(app, host=APP_HOST, port=APP_PORT)
