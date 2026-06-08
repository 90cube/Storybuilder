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
        # 디제너레이션·토큰 깨짐 가드(특히 긴 한국어 생성). 서버 기본값 의존 제거.
        "min_p": 0.05,
        "repeat_penalty": 1.1,
        "chat_template_kwargs": {"enable_thinking": False},  # reasoning 끄기 → content 직출력
        "stream": False,
    }).encode("utf-8")
    req = urllib.request.Request(
        f"{LLM_BASE_URL}/v1/chat/completions", data=body,
        headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=LLM_TIMEOUT) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data["choices"][0]["message"]["content"].strip()


def chat_grammar(system: str, user: str, grammar: str,
                 temperature: float = 0.2, max_tokens: int = 4096) -> str:
    """GBNF 문법으로 출력 구조를 강제(llama.cpp 확장 `grammar` 필드). 추출/구조화용."""
    body = json.dumps({
        "model": MODEL_NAME,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
        "grammar": grammar,
        "chat_template_kwargs": {"enable_thinking": False},  # reasoning 끄기
        "stream": False,
    }).encode("utf-8")
    req = urllib.request.Request(
        f"{LLM_BASE_URL}/v1/chat/completions", data=body,
        headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=LLM_TIMEOUT) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data["choices"][0]["message"]["content"].strip()
