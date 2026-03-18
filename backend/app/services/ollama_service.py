"""
app/services/ollama_service.py
Wrapper around the local Ollama instance.
All LLM calls go through this service — never call Ollama directly from routers.
"""
import json
import logging
import re
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

        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            match = re.search(r'\{.*\}', raw, re.DOTALL)
            if match:
                return json.loads(match.group())
            raise ValueError(f"Could not parse JSON from LLM response:\n{raw[:500]}")

    async def generate_chat_audit(self, input: dict, opts: dict | None = None) -> dict:
        """
        Run the batch audit schema against a transcript.
        Returns AuditOutput: {summary, scores, risk_level, sentiment, category, checks, coaching}
        """
        opts = opts or {}
        temperature = opts.get("temperature", settings.audit_temperature)
        max_tokens = opts.get("max_tokens", settings.audit_max_tokens)

        system = "\n".join([
            "You are an AI Audit Engine.",
            "",
            "You MUST:",
            "- Analyze the chat transcript strictly in order.",
            "- Reference messages ONLY by their numeric index.",
            "- NEVER invent messages.",
            "- NEVER include PII.",
            "- Output VALID JSON only.",
            "- Follow the audit_json schema exactly.",
            "",
            "Scoring range: 0-100.",
            "Risk levels: low | medium | high.",
            "Statuses: pass | fail | warning.",
            "",
            "Output ONLY valid JSON, no markdown, no code blocks, no explanations.",
        ])

        schema_hint = (
            'Output a JSON object with this exact structure:\n'
            '{"summary":"string","scores":{"total":0-100,"compliance":0-100,'
            '"quality":0-100,"resolution":0-100,"sla":0-100},'
            '"risk_level":"low|medium|high","sentiment":"positive|neutral|negative",'
            '"category":"string","checks":[{"id":"string","status":"pass|fail|warning",'
            '"severity":"low|medium|high","evidence":{"message_index":0,"reason":"string"}}],'
            '"coaching":[{"type":"behavior|process|language","text":"string"}]}'
        )

        prompt = (
            f"{schema_hint}\n\n"
            f"Chat Data:\n{__import__('json').dumps(input, ensure_ascii=False)}\n\n"
            "Analyze this chat transcript and output ONLY the JSON object."
        )

        payload = {
            "model": opts.get("model", self.model),
            "prompt": prompt,
            "stream": True,
            "format": "json",
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
                "num_ctx": 4096,
                "num_thread": 8,
            },
        }
        if system:
            payload["system"] = system

        last_error = None
        for attempt in range(1, self.max_retries + 1):
            try:
                chunks = []
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    async with client.stream(
                        "POST",
                        f"{self.base_url}/api/generate",
                        json=payload,
                    ) as resp:
                        resp.raise_for_status()
                        async for line in resp.aiter_lines():
                            if not line:
                                continue
                            data = json.loads(line)
                            chunks.append(data.get("response", ""))
                            if data.get("done"):
                                break
                raw = "".join(chunks).strip()
                return self._parse_audit_json(raw)

            except httpx.TimeoutException as e:
                last_error = e
                logger.warning(f"Ollama audit timeout (attempt {attempt}/{self.max_retries})")
            except Exception as e:
                last_error = e
                logger.error(f"Ollama audit error: {e}")
                break

        raise RuntimeError(f"Ollama audit failed after {self.max_retries} attempts: {last_error}")

    def _parse_audit_json(self, raw: str) -> dict:
        """Parse JSON from model output, stripping any markdown fencing."""
        text = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            # Try to extract the outermost JSON object
            match = re.search(r'\{.*\}', text, re.DOTALL)
            if match:
                return json.loads(match.group())
            raise ValueError(f"Could not parse audit JSON from model output:\n{raw[:500]}")

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
