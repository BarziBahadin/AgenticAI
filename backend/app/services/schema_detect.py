"""
app/services/schema_detect.py
Detects base_chats column names at runtime to support flexible DB schemas.
Cached for 5 minutes to avoid repeated SHOW COLUMNS queries.
"""
import time
import logging
from typing import Optional
import aiomysql
from app.config import settings

logger = logging.getLogger(__name__)

_cached_cols: set[str] = set()
_cache_ts: float = 0.0
_CACHE_TTL = 300  # 5 minutes

# Candidate column names for the agent/operator reference
_AGENT_COL_CANDIDATES = ["operator_id", "agent_id", "base_operator_id", "operatorId", "agentId"]


async def get_chat_columns() -> set[str]:
    """Return the set of column names in base_chats, cached for 5 minutes."""
    global _cached_cols, _cache_ts

    now = time.monotonic()
    if _cached_cols and (now - _cache_ts) < _CACHE_TTL:
        return _cached_cols

    try:
        conn = await aiomysql.connect(
            host=settings.db_host,
            port=settings.db_port,
            user=settings.db_user,
            password=settings.db_password,
            db=settings.db_name,
        )
        async with conn.cursor() as cur:
            await cur.execute("SHOW COLUMNS FROM base_chats")
            rows = await cur.fetchall()
        conn.close()

        cols = {row[0] for row in rows}
        _cached_cols = cols
        _cache_ts = now
        logger.debug(f"schema_detect: base_chats columns: {cols}")
        return cols

    except Exception as e:
        logger.error(f"schema_detect: failed to fetch columns: {e}")
        return _cached_cols  # return stale cache on error rather than crashing


def pick_agent_column(cols: set[str]) -> Optional[str]:
    """
    Return the column name that identifies the agent/operator in base_chats.
    Checks CHAT_AGENT_ID_COLUMN env override first, then tries known candidates.
    """
    override = settings.chat_agent_id_column.strip()
    if override and override in cols:
        return override

    for candidate in _AGENT_COL_CANDIDATES:
        if candidate in cols:
            return candidate

    return None


def clear_cache() -> None:
    global _cached_cols, _cache_ts
    _cached_cols = set()
    _cache_ts = 0.0
