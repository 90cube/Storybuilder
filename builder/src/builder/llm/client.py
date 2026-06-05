"""OpenAI 호환 chat 클라이언트. stdlib만 — 서빙 구현(llama-server/vLLM)에 불의존."""

import json
import urllib.request

from builder.const import LLM_BASE_URL, MODEL_NAME, LLM_TIMEOUT


def chat(system: str, user: str, temperature: float = 0.7,
         max_tokens: int = 1400) -> str:
    """system+user 메시지로 한 번 생성하고 본문 텍스트를 돌려준다."""
    body = json.dumps({
        "model": MODEL_NAME,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": False,
    }).encode("utf-8")
    req = urllib.request.Request(
        f"{LLM_BASE_URL}/v1/chat/completions", data=body,
        headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=LLM_TIMEOUT) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data["choices"][0]["message"]["content"].strip()
