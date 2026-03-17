"""
app/services/qa_service.py
Core QA Scoring Engine — Sprint 1 main deliverable.

Flow:
  FormattedConversation
       ↓
  build_prompt()
       ↓
  OllamaService.generate_json()
       ↓
  parse_llm_response()
       ↓
  QAScore (saved to DB)
"""
import logging
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.models.qa_score import QAScore
from app.models.alert import Alert, AlertType, AlertStatus
from app.services.ollama_service import ollama_service
from app.services.conversation_formatter import (
    FormattedConversation,
    conversation_formatter,
)

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────
# Scorecard dimension weights  (must sum to 100)
# Source: Contact Center Handbook v1.0, Section 12
# ─────────────────────────────────────────────────────────────
SCORECARD = {
    "greeting":     {"max": 15, "label": "Greeting & Tone (Empathy)"},
    "discovery":    {"max": 15, "label": "Discovery & Understanding"},
    "verification": {"max": 10, "label": "Identity Verification"},
    "resolution":   {"max": 25, "label": "Resolution Quality"},
    "next_steps":   {"max": 10, "label": "Next Steps & Expectations"},
    "efficiency":   {"max": 10, "label": "Response Efficiency (no repetition)"},
    "escalation":   {"max": 10, "label": "Escalation Judgment"},
    "compliance":   {"max":  5, "label": "Compliance"},
}
assert sum(v["max"] for v in SCORECARD.values()) == 100

# ─────────────────────────────────────────────────────────────
# System prompt — defines the AI's role and output format
# ─────────────────────────────────────────────────────────────
QA_SYSTEM_PROMPT = """
You are a QA evaluator for a telecom company's customer care contact center.
Your job is to score agent conversations against a standard scorecard.

You MUST respond ONLY with a valid JSON object — no extra text, no markdown.

Scoring rules:
- Be objective and consistent. Base scores only on what is in the transcript.
- Score 0 for a dimension if the agent clearly failed it.
- Score the maximum if the agent did it well.
- Partial scores are allowed and encouraged.
- The language of the conversation may be Arabic (MSA or Levantine dialect) — evaluate accordingly.

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
  "summary_ar":   "<2-3 sentence Arabic summary of what went wrong or right>",
  "summary_en":   "<2-3 sentence English summary of what went wrong or right>",
  "action":       "<recommended action for supervisor, or 'No action required'>"
}
""".strip()


def build_qa_prompt(convo: FormattedConversation) -> str:
    """Builds the user-facing prompt with the conversation embedded."""
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


# ─────────────────────────────────────────────────────────────
# Main service class
# ─────────────────────────────────────────────────────────────

class QAService:

    async def score_conversation(
        self,
        request_id: int,
        db: AsyncSession,
        force_rescore: bool = False,
    ) -> QAScore:
        """
        Score a single conversation. Saves result to DB.
        If a score already exists and force_rescore=False, returns existing.
        """
        # Check if already scored
        existing = await db.execute(
            select(QAScore).where(QAScore.request_id == request_id)
        )
        existing_score = existing.scalar_one_or_none()
        if existing_score and not force_rescore:
            logger.info(f"REQ-{request_id}: already scored, returning cached result")
            return existing_score

        # Format the conversation
        convo = await conversation_formatter.format(request_id, db)
        if convo is None:
            raise ValueError(f"Request {request_id} not found")

        if convo.message_count == 0:
            raise ValueError(f"Request {request_id} has no messages to score")

        # Count repeat contacts for this customer
        contact_count = await conversation_formatter.count_customer_contacts(
            convo.customer_id, db
        )
        is_repeat = contact_count >= settings.qa_repeat_contact_threshold

        # Call LLM
        prompt = build_qa_prompt(convo)
        logger.info(f"REQ-{request_id}: sending to Ollama ({settings.ollama_model})")

        raw_response = ""
        llm_data = {}
        try:
            llm_data = await ollama_service.generate_json(
                prompt=prompt,
                system=QA_SYSTEM_PROMPT,
            )
            raw_response = str(llm_data)
        except Exception as e:
            logger.error(f"REQ-{request_id}: LLM call failed — {e}")
            raise

        # Parse and clamp scores
        def clamp(val, max_val):
            try:
                return max(0.0, min(float(val), float(max_val)))
            except (TypeError, ValueError):
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

        # Build or update QAScore record
        if existing_score:
            qa = existing_score
        else:
            qa = QAScore(request_id=request_id)
            db.add(qa)

        qa.score_greeting     = scores["greeting"]
        qa.score_discovery    = scores["discovery"]
        qa.score_verification = scores["verification"]
        qa.score_resolution   = scores["resolution"]
        qa.score_next_steps   = scores["next_steps"]
        qa.score_efficiency   = scores["efficiency"]
        qa.score_escalation   = scores["escalation"]
        qa.score_compliance   = scores["compliance"]
        qa.total_score        = total
        qa.is_flagged         = is_flagged
        qa.is_repeat_contact  = is_repeat
        qa.repeat_contact_count = contact_count
        qa.summary_ar         = llm_data.get("summary_ar", "")
        qa.summary_en         = llm_data.get("summary_en", "")
        qa.action_required    = llm_data.get("action", "")
        qa.raw_llm_response   = raw_response
        qa.scored_at          = datetime.utcnow()
        qa.model_used         = settings.ollama_model
        qa.scoring_version    = "1.0"

        await db.flush()  # get the ID without committing yet

        # Create alert if flagged or repeat contact
        if is_flagged:
            await self._create_alert(
                db=db,
                qa_score_id=qa.id,
                request_id=request_id,
                alert_type=AlertType.low_score,
                score=total,
                message=f"Score {total}/100 is below threshold ({settings.qa_score_threshold}). "
                        f"Conversation REQ-{request_id}.",
            )
            logger.warning(f"REQ-{request_id}: FLAGGED — score {total}/100")

        if is_repeat:
            await self._create_alert(
                db=db,
                qa_score_id=qa.id,
                request_id=request_id,
                alert_type=AlertType.repeat_contact,
                message=f"Customer has contacted {contact_count} times "
                        f"(threshold: {settings.qa_repeat_contact_threshold}).",
            )
            logger.warning(f"REQ-{request_id}: REPEAT CONTACT — {contact_count} times")

        return qa

    async def _create_alert(
        self,
        db: AsyncSession,
        qa_score_id: int,
        request_id: int,
        alert_type: AlertType,
        message: str,
        score: float = None,
    ):
        alert = Alert(
            qa_score_id=qa_score_id,
            request_id=request_id,
            alert_type=alert_type,
            status=AlertStatus.open,
            message=message,
            score=score,
        )
        db.add(alert)


# Singleton
qa_service = QAService()
