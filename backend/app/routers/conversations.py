from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_db
from app.models.request import Request
from app.services.conversation_formatter import conversation_formatter

router = APIRouter()


@router.get("/")
async def list_conversations(
    page: int = 1,
    page_size: int = 20,
    db: AsyncSession = Depends(get_db),
):
    offset = (page - 1) * page_size
    total_result = await db.execute(select(func.count(Request.id)))
    total = total_result.scalar_one()

    result = await db.execute(
        select(Request).order_by(Request.created_at.desc()).offset(offset).limit(page_size)
    )
    requests = result.scalars().all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {"id": r.id, "status": r.status, "language": r.language, "created_at": r.created_at}
            for r in requests
        ],
    }


@router.get("/{request_id}/formatted")
async def get_formatted(request_id: int, db: AsyncSession = Depends(get_db)):
    convo = await conversation_formatter.format(request_id, db)
    if convo is None:
        raise HTTPException(status_code=404, detail="Request not found")
    return {
        "request_id": convo.request_id,
        "status": convo.status,
        "language": convo.language,
        "tier": convo.tier,
        "message_count": convo.message_count,
        "transcript": convo.to_prompt_text(),
    }
