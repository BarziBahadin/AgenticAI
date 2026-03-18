from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.qa_service import qa_service
from app.services.score_store import load_score, list_flagged, get_stats

router = APIRouter()

@router.post("/{request_id}/score")
async def score_conversation(
    request_id: int,
    force: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await qa_service.score_conversation(request_id, db, force_rescore=force)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=f"LLM unavailable: {e}")

@router.get("/flagged")
async def get_flagged():
    return list_flagged()

@router.get("/stats/summary")
async def score_stats():
    return get_stats()

@router.get("/{request_id}/score")
async def get_score(request_id: int):
    score = load_score(request_id)
    if not score:
        raise HTTPException(status_code=404, detail="Not scored yet. Use POST to score.")
    return score

@router.post("/{request_id}/dispute")
async def dispute_score(request_id: int, body: dict):
    from app.services.score_store import save_score
    score = load_score(request_id)
    if not score:
        raise HTTPException(status_code=404, detail="Score not found")
    if score.get("is_disputed"):
        raise HTTPException(status_code=409, detail="Already disputed")
    score["is_disputed"] = True
    score["dispute_reason"] = body.get("reason", "")
    save_score(request_id, score)
    return {"message": "Dispute submitted", "request_id": request_id}
