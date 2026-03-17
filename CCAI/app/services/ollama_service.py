"""
app/services/ollama_service.py
Wrapper around the local Ollama instance.
All LLM calls go through this service — never call Ollama directly from routers.
"""
import json
import logging
from typing import Optional
import httpx
from app.config import settings

logger = logging.getLogger(__name__)


class OllamaService:
    """
    Thin async client for the local Ollama REST API.
    Uses httpx directly (more control than the ollama SDK for retries/timeout).
    """

    def __init__(self):
        self.base_url = settings.ollama_host
        self.model    = settings.ollama_model
        self.timeout  = settings.ollama_timeout
        self.max_retries = settings.ollama_max_retries

    async def generate(
        self,
        prompt: str,
        system: Optional[str] = None,
        temperature: float = 0.1,   # low = consistent scoring
        json_mode: bool = False,
    ) -> str:
        """
        Send a prompt to Ollama using streaming to keep the Cloudflare
        tunnel alive. Accumulates all chunks and returns the full response.
        """
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": True,
            "options": {
                "temperature": temperature,
                "num_predict": 2048,
            },
        }
        if system:
            payload["system"] = system
        if json_mode:
            payload["format"] = "json"

        last_error = None
        for attempt in range(1, self.max_retries + 1):
            try:
                chunks = []
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    async with client.stream(
                        "POST",
                        f"{self.base_url}/api/generate",
                        json=payload,
                        headers={"Origin": "http://localhost"},
                    ) as resp:
                        resp.raise_for_status()
                        async for line in resp.aiter_lines():
                            if not line:
                                continue
                            data = json.loads(line)
                            chunks.append(data.get("response", ""))
                            if data.get("done"):
                                break
                return "".join(chunks).strip()

            except httpx.TimeoutException as e:
                last_error = e
                logger.warning(f"Ollama timeout (attempt {attempt}/{self.max_retries})")
            except httpx.HTTPStatusError as e:
                last_error = e
                logger.error(f"Ollama HTTP error {e.response.status_code}: {e}")
                break
            except Exception as e:
                last_error = e
                logger.error(f"Ollama unexpected error: {e}")
                break

        raise RuntimeError(
            f"Ollama failed after {self.max_retries} attempts: {last_error}"
        )

    async def generate_json(
        self,
        prompt: str,
        system: Optional[str] = None,
    ) -> dict:
        """
        Like generate() but expects and parses a JSON response.
        Uses json_mode=True to enforce JSON output from the model.
        Falls back to regex extraction if the model adds surrounding prose.
        """
        raw = await self.generate(prompt, system=system, json_mode=True)

        import re
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            match = re.search(r'\{.*\}', raw, re.DOTALL)
            if match:
                return json.loads(match.group())
            raise ValueError(f"Could not parse JSON from LLM response:\n{raw[:500]}")

    async def health_check(self) -> bool:
        """Returns True if Ollama is reachable and the model is loaded."""
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(
                    f"{self.base_url}/api/tags",
                    headers={"Origin": "http://localhost"},
                )
                resp.raise_for_status()
                models = [m["name"] for m in resp.json().get("models", [])]
                return any(self.model in m for m in models)
        except Exception:
            return False


# Singleton — import this instance everywhere
ollama_service = OllamaService()
