"""
app/services/llm_factory.py
Returns the appropriate LLM service based on AUDIT_PROVIDER env var.
All services expose: async generate_chat_audit(input: dict, opts: dict) -> dict
"""
from app.config import settings


def get_llm_service():
    provider = settings.audit_provider.lower()

    if provider == "gemini":
        from app.services.gemini_service import gemini_service
        return gemini_service

    if provider == "together":
        from app.services.together_service import together_service
        return together_service

    # Default: ollama
    from app.services.ollama_service import ollama_service
    return ollama_service
