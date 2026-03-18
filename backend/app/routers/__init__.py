from fastapi import APIRouter
from app.routers import health, conversations, qa, alerts

router = APIRouter()
router.include_router(health.router,        tags=["health"])
router.include_router(conversations.router, prefix="/conversations", tags=["conversations"])
router.include_router(qa.router,            prefix="/qa",            tags=["qa"])
router.include_router(alerts.router,        prefix="/alerts",        tags=["alerts"])
