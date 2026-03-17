"""
app/services/conversation_formatter.py
Fetches a conversation from MySQL and formats it into a
clean structure the QA scoring engine can consume.

The formatter is separate from the scorer so we can:
- Test formatting independently
- Reuse formatted conversations in the AI Chat Agent (Phase 2)
- Cache formatted conversations in the future
"""
from dataclasses import dataclass
from datetime import datetime
from typing import Optional
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.request import Request
from app.models.chat import Chat


# ─────────────────────────────────────────────────────────────
# Data classes — plain Python, no ORM dependencies
# ─────────────────────────────────────────────────────────────

@dataclass
class FormattedMessage:
    sender_role: str        # "agent" | "customer" | "technical-support" | "noc"
    message: str
    sent_at: Optional[datetime]
    tier: str               # "tier1" | "tier2" | "tier3"


@dataclass
class FormattedConversation:
    request_id: int
    status: str
    language: Optional[str]
    agent_id: Optional[int]
    agent_name: Optional[str]
    customer_id: int
    issue_id: Optional[int]
    created_at: Optional[datetime]
    resolved_at: Optional[datetime]
    messages: list[FormattedMessage]
    tier: str               # dominant tier of this conversation
    message_count: int

    def to_prompt_text(self) -> str:
        """
        Converts the conversation to a clean text block
        ready to be inserted into the QA scoring prompt.
        Format is designed to be unambiguous for the LLM.
        """
        lines = [
            f"Conversation ID: {self.request_id}",
            f"Status: {self.status}",
            f"Language: {self.language or 'unknown'}",
            f"Tier: {self.tier}",
            f"Total messages: {self.message_count}",
            "---",
        ]

        for i, msg in enumerate(self.messages, 1):
            role_label = {
                "agent":              "AGENT",
                "customer":           "CUSTOMER",
                "technical-support":  "TECH SUPPORT",
                "noc":                "NOC",
            }.get(msg.sender_role, msg.sender_role.upper())

            time_str = msg.sent_at.strftime("%H:%M") if msg.sent_at else "?"
            lines.append(f"[{i}] {role_label} ({time_str}): {msg.message}")

        return "\n".join(lines)


# ─────────────────────────────────────────────────────────────
# Tier detection
# ─────────────────────────────────────────────────────────────

def detect_tier(account_type: Optional[str]) -> str:
    """
    Maps account_type values from base_chats to tier labels.
    Tier 1: customer ↔ call center
    Tier 2: call center ↔ technical support
    Tier 3: technical support ↔ NOC
    """
    if not account_type:
        return "tier1"
    a = account_type.lower()
    if "technical-support-noc" in a or "noc" in a:
        return "tier3"
    if "call-center-technical" in a or "technical" in a:
        return "tier2"
    return "tier1"


def detect_sender_role(msg_type: Optional[str], account_type: Optional[str]) -> str:
    """Determine the human-readable role of the message sender."""
    if not msg_type:
        return "unknown"
    t = msg_type.lower()
    if t in ("customer",):
        return "customer"
    if t in ("agent", "call-center"):
        return "agent"
    if t in ("technical-support",):
        return "technical-support"
    if t in ("noc",):
        return "noc"
    return t


# ─────────────────────────────────────────────────────────────
# Main formatter
# ─────────────────────────────────────────────────────────────

class ConversationFormatter:

    async def format(
        self,
        request_id: int,
        db: AsyncSession,
    ) -> Optional[FormattedConversation]:
        """
        Load a single conversation from DB and format it.
        Returns None if request_id doesn't exist.
        """
        # Fetch request + chats + related users in one query
        result = await db.execute(
            select(Request)
            .where(Request.id == request_id)
            .options(
                selectinload(Request.chats),
                selectinload(Request.requester),
                selectinload(Request.agent),
            )
        )
        req = result.scalar_one_or_none()
        if req is None:
            return None

        return self._build(req)

    async def format_batch(
        self,
        request_ids: list[int],
        db: AsyncSession,
    ) -> list[FormattedConversation]:
        """Format multiple conversations at once."""
        result = await db.execute(
            select(Request)
            .where(Request.id.in_(request_ids))
            .options(
                selectinload(Request.chats),
                selectinload(Request.requester),
                selectinload(Request.agent),
            )
        )
        requests = result.scalars().all()
        return [self._build(r) for r in requests]

    def _build(self, req: Request) -> FormattedConversation:
        messages = []
        tiers = []

        for chat in req.chats:
            if not chat.message or not chat.message.strip():
                continue  # skip empty messages

            role = detect_sender_role(chat.type, chat.account_type)
            tier = detect_tier(chat.account_type)
            tiers.append(tier)

            messages.append(FormattedMessage(
                sender_role=role,
                message=chat.message.strip(),
                sent_at=chat.sent_at,
                tier=tier,
            ))

        # Dominant tier = most common tier in messages
        dominant_tier = "tier1"
        if tiers:
            dominant_tier = max(set(tiers), key=tiers.count)

        agent_name = req.agent.username if req.agent else None

        return FormattedConversation(
            request_id=req.id,
            status=req.status.value if req.status else "unknown",
            language=req.language,
            agent_id=req.attached_agent_id,
            agent_name=agent_name,
            customer_id=req.requester_id,
            issue_id=req.issue_id,
            created_at=req.created_at,
            resolved_at=req.resolved_at,
            messages=messages,
            tier=dominant_tier,
            message_count=len(messages),
        )

    async def count_customer_contacts(
        self,
        customer_id: int,
        db: AsyncSession,
    ) -> int:
        """Count how many times this customer has opened a request."""
        result = await db.execute(
            select(func.count(Request.id))
            .where(Request.requester_id == customer_id)
        )
        return result.scalar_one() or 0


# Singleton
conversation_formatter = ConversationFormatter()
