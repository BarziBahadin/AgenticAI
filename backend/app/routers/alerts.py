from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.alert import Alert, AlertStatus

router = APIRouter()


@router.get("/")
async def list_alerts(
    status: AlertStatus = None,
    db: AsyncSession = Depends(get_db),
):
    q = select(Alert).order_by(Alert.created_at.desc())
    if status:
        q = q.where(Alert.status == status)
    result = await db.execute(q)
    return result.scalars().all()


@router.patch("/{alert_id}")
async def update_alert(
    alert_id: int,
    status: AlertStatus,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.status = status
    await db.commit()
    return {"detail": "Alert updated", "status": status}
