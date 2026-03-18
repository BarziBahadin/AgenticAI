"""
app/services/audit_storage.py
Persists audit job state and results to .audit_runs/{job_id}/ directory.
State is stored as JSON, results as NDJSON (one JSON object per line).
"""
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

RUNS_DIR = Path(".audit_runs")


def _job_dir(job_id: str) -> Path:
    return RUNS_DIR / job_id


def state_path(job_id: str) -> Path:
    return _job_dir(job_id) / "state.json"


def ndjson_path(job_id: str) -> Path:
    return _job_dir(job_id) / "results.ndjson"


def xlsx_path(job_id: str) -> Path:
    return _job_dir(job_id) / "audit.xlsx"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def init_job_files(job_id: str) -> None:
    """Create job directory and empty results file."""
    d = _job_dir(job_id)
    d.mkdir(parents=True, exist_ok=True)
    ndjson_path(job_id).touch()


def write_state(job_id: str, state: dict) -> None:
    """Atomic write of state.json via a temp file."""
    p = state_path(job_id)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, default=str), encoding="utf-8")
    os.replace(tmp, p)


def read_state(job_id: str) -> Optional[dict]:
    """Read state.json, returns None if missing or corrupt."""
    p = state_path(job_id)
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None


def append_ndjson(job_id: str, obj: dict) -> None:
    """Append one JSON object as a line to results.ndjson."""
    line = json.dumps(obj, ensure_ascii=False, default=str) + "\n"
    with open(ndjson_path(job_id), "a", encoding="utf-8") as f:
        f.write(line)


def read_ndjson_tail(job_id: str, max_lines: int = 50) -> list:
    """Read the last max_lines results from the NDJSON file."""
    p = ndjson_path(job_id)
    if not p.exists():
        return []

    # Read last ~200KB to avoid loading huge files
    try:
        size = p.stat().st_size
        offset = max(0, size - 200_000)
        with open(p, "rb") as f:
            f.seek(offset)
            raw = f.read().decode("utf-8", errors="replace")

        lines = [l.strip() for l in raw.splitlines() if l.strip()]
        tail = lines[-max_lines:]
        results = []
        for line in tail:
            try:
                results.append(json.loads(line))
            except Exception:
                continue
        return results
    except Exception:
        return []
