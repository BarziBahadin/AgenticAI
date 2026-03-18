"""
app/main.py
FastAPI application factory.
Run with: uvicorn app.main:app --reload
"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import app.models  # noqa: F401 — ensures all models are registered with SQLAlchemy
from app.config import settings
from app.routers import router as api_router

# ── Logging setup ────────────────────────────────────────────
logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("qiyas")


# ── Lifespan (startup / shutdown) ────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Runs on startup and shutdown."""
    logger.info(f"Starting {settings.app_name} [{settings.app_env}]")
    logger.info(f"DB: {settings.db_host}:{settings.db_port}/{settings.db_name}")
    logger.info(f"Ollama: {settings.ollama_host} — model: {settings.ollama_model}")
    yield
    logger.info("Shutting down...")


# ── App factory ───────────────────────────────────────────────
app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="AI-powered QA scoring and chat agent for telecom contact centers.",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ── CORS ─────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routes ───────────────────────────────────────────────────
app.include_router(api_router, prefix=settings.api_prefix)


# ── Root ─────────────────────────────────────────────────────
@app.get("/")
async def root():
    return {
        "name": settings.app_name,
        "version": "1.0.0",
        "docs": "/docs",
        "health": f"{settings.api_prefix}/health",
    }
