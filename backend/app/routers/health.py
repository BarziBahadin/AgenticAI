from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.database import get_db
from app.services.ollama_service import ollama_service

router = APIRouter()


@router.get("/health")
async def health(db: AsyncSession = Depends(get_db)):
    db_ok = False
    try:
        await db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        pass

    ollama_ok = await ollama_service.health_check()

    return {
        "status": "ok" if (db_ok and ollama_ok) else "degraded",
        "db": "ok" if db_ok else "error",
        "ollama": "ok" if ollama_ok else "error",
    }
