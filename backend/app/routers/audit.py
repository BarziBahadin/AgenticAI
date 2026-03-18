"""
app/routers/audit.py
Audit batch job endpoints.

POST   /audit/run       — start a new audit job
GET    /audit/status    — poll job state + recent results
POST   /audit/stop      — signal stop to a running job
GET    /audit/download  — stream the Excel results file
GET    /audit/health    — LLM provider health check
GET    /audit/debug     — diagnostic info (dev)
"""
import os
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse

from app.config import settings
from app.services.audit_runner import (
    get_audit_state,
    get_running_job_ids,
    start_audit_job,
    stop_audit_job,
)
from app.services.audit_storage import read_ndjson_tail, xlsx_path

router = APIRouter(prefix="/audit", tags=["audit"])


@router.post("/run")
async def run(body: dict = {}):
    """Start a new audit batch job. Returns {job_id, model, provider}."""
    try:
        result = await start_audit_job()
        return result
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
async def status(job_id: str = Query(...)):
    """Poll job progress. Returns state + last 50 audit results."""
    st = await get_audit_state(job_id)
    if not st:
        raise HTTPException(status_code=404, detail="Job not found")
    tail = read_ndjson_tail(job_id, max_lines=50)
    return {"state": st, "tail": tail}


@router.post("/stop")
async def stop(body: dict):
    """Signal a running job to stop."""
    job_id = body.get("job_id")
    if not job_id:
        raise HTTPException(status_code=400, detail="Missing job_id")
    try:
        await stop_audit_job(job_id)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/download")
async def download(job_id: str = Query(...)):
    """Download the Excel results file for a completed job."""
    st = await get_audit_state(job_id)
    if not st:
        raise HTTPException(status_code=404, detail="Job not found")

    xls = xlsx_path(job_id)
    if not xls.exists():
        if st.get("status") in ("queued", "running"):
            raise HTTPException(status_code=409, detail="Job still running — Excel not ready yet")
        raise HTTPException(status_code=404, detail="Excel file not found")

    return FileResponse(
        path=str(xls),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=f"audit_{job_id}.xlsx",
    )


@router.get("/health")
async def health():
    """Check whether the configured LLM provider is reachable."""
    provider = settings.audit_provider.lower()

    if provider == "ollama":
        from app.services.ollama_service import ollama_service
        ok = await ollama_service.health_check()
        return {
            "provider": "ollama",
            "model": settings.ollama_model,
            "host": settings.ollama_host,
            "available": ok,
        }

    if provider == "gemini":
        configured = bool(settings.gemini_api_key)
        return {
            "provider": "gemini",
            "model": settings.gemini_model,
            "configured": configured,
        }

    if provider == "together":
        configured = bool(settings.together_api_key)
        return {
            "provider": "together",
            "model": settings.together_model,
            "configured": configured,
        }

    return {"provider": provider, "available": False, "error": "Unknown provider"}


@router.get("/debug")
async def debug():
    """Diagnostic info about audit configuration."""
    provider = settings.audit_provider.lower()
    info: dict = {
        "provider": provider,
        "model": (
            settings.ollama_model if provider == "ollama"
            else settings.gemini_model if provider == "gemini"
            else settings.together_model
        ),
        "running_jobs": get_running_job_ids(),
        "config": {
            "audit_max_chats": settings.audit_max_chats,
            "audit_max_messages": settings.audit_max_messages,
            "audit_max_concurrent_jobs": settings.audit_max_concurrent_jobs,
            "audit_temperature": settings.audit_temperature,
            "ollama_host": settings.ollama_host,
            "gemini_api_key": "set" if settings.gemini_api_key else "not set",
            "together_api_key": "set" if settings.together_api_key else "not set",
        },
    }

    if provider == "ollama":
        from app.services.ollama_service import ollama_service
        info["ollama_available"] = await ollama_service.health_check()

    return info
