"""
app/services/qa_service.py
QA Scoring Engine — uses JSON file storage (Option B).
When DB admin creates tables, run migrate_scores.py to move to MySQL.
"""
import logging
from app.config import settings
from app.services.ollama_service import ollama_service
from app.services.score_store import save_score, load_score
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

SCORECARD = {
    "greeting":     {"max": 15, "label": "Greeting & Tone (Empathy)"},
    "discovery":    {"max": 15, "label": "Discovery & Understanding"},
    "verification": {"max": 10, "label": "Identity Verification"},
    "resolution":   {"max": 25, "label": "Resolution Quality"},
    "next_steps":   {"max": 10, "label": "Next Steps & Expectations"},
    "efficiency":   {"max": 10, "label": "Response Efficiency"},
    "escalation":   {"max": 10, "label": "Escalation Judgment"},
    "compliance":   {"max":  5, "label": "Compliance"},
}

QA_SYSTEM_PROMPT = """
You are a QA evaluator for a telecom company's customer care contact center.
Your job is to score agent conversations against a standard scorecard.
You MUST respond ONLY with a valid JSON object — no extra text, no markdown.

Scoring rules:
- Be objective and consistent. Base scores only on what is in the transcript.
- Score 0 for a dimension if the agent clearly failed it.
- Score the maximum if the agent did it well.
- Partial scores are allowed and encouraged.
- The language of the conversation may be Arabic (MSA or Levantine dialect).

Output format (strict JSON):
{
  "greeting":     <number 0-15>,
  "discovery":    <number 0-15>,
  "verification": <number 0-10>,
  "resolution":   <number 0-25>,
  "next_steps":   <number 0-10>,
  "efficiency":   <number 0-10>,
  "escalation":   <number 0-10>,
  "compliance":   <number 0-5>,
  "summary_ar":   "<2-3 sentence Arabic summary>",
  "summary_en":   "<2-3 sentence English summary>",
  "action":       "<recommended action for supervisor, or 'No action required'>"
}
""".strip()


def build_qa_prompt(convo) -> str:
    scorecard_desc = "\n".join(
        f"- {k} (max {v['max']}): {v['label']}"
        for k, v in SCORECARD.items()
    )
    return f"""
Score the following customer care conversation using the scorecard below.

SCORECARD DIMENSIONS:
{scorecard_desc}

CONVERSATION:
{convo.to_prompt_text()}

Remember: respond ONLY with the JSON object. No extra text.
""".strip()


class QAService:

    async def score_conversation(
        self,
        request_id: int,
        db: AsyncSession,
        force_rescore: bool = False,
    ) -> dict:
        from app.services.conversation_formatter import conversation_formatter

        # Return cached score if exists
        existing = load_score(request_id)
        if existing and not force_rescore:
            logger.info(f"REQ-{request_id}: returning cached score")
            return existing

        # Format conversation
        convo = await conversation_formatter.format(request_id, db)
        if convo is None:
            raise ValueError(f"Request {request_id} not found")
        if convo.message_count == 0:
            raise ValueError(f"Request {request_id} has no messages")

        # Count repeat contacts
        contact_count = await conversation_formatter.count_customer_contacts(
            convo.customer_id, db
        )

        # Call LLM
        logger.info(f"REQ-{request_id}: sending to Ollama ({settings.ollama_model})")
        prompt = build_qa_prompt(convo)
        llm_data = await ollama_service.generate_json(
            prompt=prompt,
            system=QA_SYSTEM_PROMPT,
        )

        # Clamp scores
        def clamp(val, max_val):
            try:
                return max(0.0, min(float(val), float(max_val)))
            except Exception:
                return 0.0

        scores = {
            "greeting":     clamp(llm_data.get("greeting",     0), 15),
            "discovery":    clamp(llm_data.get("discovery",    0), 15),
            "verification": clamp(llm_data.get("verification", 0), 10),
            "resolution":   clamp(llm_data.get("resolution",   0), 25),
            "next_steps":   clamp(llm_data.get("next_steps",   0), 10),
            "efficiency":   clamp(llm_data.get("efficiency",   0), 10),
            "escalation":   clamp(llm_data.get("escalation",   0), 10),
            "compliance":   clamp(llm_data.get("compliance",   0),  5),
        }
        total = round(sum(scores.values()), 2)
        is_flagged = total < settings.qa_score_threshold

        result = {
            "request_id": request_id,
            "total_score": total,
            "dimensions": scores,
            "summary_ar": llm_data.get("summary_ar", ""),
            "summary_en": llm_data.get("summary_en", ""),
            "action_required": llm_data.get("action", ""),
            "is_flagged": is_flagged,
            "is_repeat_contact": contact_count >= settings.qa_repeat_contact_threshold,
            "repeat_contact_count": contact_count,
            "is_disputed": False,
            "model_used": settings.ollama_model,
            "scoring_version": "1.0",
        }

        save_score(request_id, result)

        if is_flagged:
            logger.warning(f"REQ-{request_id}: FLAGGED — score {total}/100")
        if contact_count >= settings.qa_repeat_contact_threshold:
            logger.warning(f"REQ-{request_id}: REPEAT CONTACT — {contact_count} times")

        return result


qa_service = QAService()
