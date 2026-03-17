import json
from datetime import datetime
from pathlib import Path

SCORES_DIR = Path("./scores")
SCORES_DIR.mkdir(exist_ok=True)

def save_score(request_id: int, data: dict):
    data["saved_at"] = datetime.utcnow().isoformat()
    path = SCORES_DIR / f"{request_id}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def load_score(request_id: int) -> dict | None:
    path = SCORES_DIR / f"{request_id}.json"
    if not path.exists():
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)

def list_scores() -> list[dict]:
    scores = []
    for f in sorted(SCORES_DIR.glob("*.json")):
        with open(f, encoding="utf-8") as fp:
            scores.append(json.load(fp))
    return scores

def list_flagged(threshold: int = 60) -> list[dict]:
    return [s for s in list_scores() if s.get("total_score", 100) < threshold]

def get_stats() -> dict:
    scores = list_scores()
    if not scores:
        return {"total_scored": 0, "avg_score": 0, "flagged_count": 0}
    totals = [s["total_score"] for s in scores]
    return {
        "total_scored": len(scores),
        "avg_score": round(sum(totals) / len(totals), 1),
        "flagged_count": sum(1 for t in totals if t < 60),
        "disputed_count": sum(1 for s in scores if s.get("is_disputed")),
        "repeat_contact_count": sum(1 for s in scores if s.get("is_repeat_contact")),
    }
