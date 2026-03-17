# QIYAS Backend — FastAPI

AI-powered QA scoring engine for telecom contact center conversations.

## Quick Start

```bash
# 1. Create virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment
cp .env.example .env
# Edit .env — fill in DB_HOST, DB_USER, DB_PASSWORD, DB_NAME

# 4. Run migration (creates 2 new tables, safe to run on existing DB)
mysql -u your_user -p your_db < migration_v1.sql

# 5. Start Ollama (separate terminal)
ollama serve
ollama pull llama3.1:8b         # or: ollama pull mistral:7b

# 6. Start the API
uvicorn app.main:app --reload --port 8000
```

Open http://localhost:8000/docs for the interactive API docs.

## Project Structure

```
qiyas-backend/
├── app/
│   ├── main.py               # FastAPI app, CORS, router mounting
│   ├── config.py             # All settings, loaded from .env
│   ├── database.py           # Async SQLAlchemy engine + session
│   ├── models/
│   │   ├── request.py        # base_requests (existing table)
│   │   ├── chat.py           # base_chats   (existing table)
│   │   ├── user.py           # base_apps    (existing table)
│   │   ├── qa_score.py       # qiyas_qa_scores (NEW)
│   │   └── alert.py          # qiyas_alerts    (NEW)
│   ├── schemas/              # Pydantic request/response models
│   ├── routers/
│   │   ├── health.py         # GET /health
│   │   ├── conversations.py  # GET /conversations
│   │   ├── qa.py             # POST /qa/{id}/score
│   │   └── alerts.py         # GET /alerts
│   └── services/
│       ├── ollama_service.py       # LLM client
│       ├── conversation_formatter.py  # DB → prompt-ready text
│       └── qa_service.py           # Core scoring engine
├── tests/
│   └── test_qa_service.py    # Sprint 1 unit tests
├── migration_v1.sql          # Run once — creates new tables
├── requirements.txt
├── .env.example
└── README.md
```

## Key API Endpoints (Sprint 1)

| Method | Endpoint                          | Description                        |
|--------|-----------------------------------|------------------------------------|
| GET    | `/health`                         | DB + Ollama health check           |
| GET    | `/api/v1/conversations/`          | List all conversations (paginated) |
| GET    | `/api/v1/conversations/{id}/formatted` | Preview formatted conversation |
| POST   | `/api/v1/qa/{id}/score`           | Score a conversation with LLM      |
| GET    | `/api/v1/qa/{id}/score`           | Get existing score                 |
| GET    | `/api/v1/qa/flagged`              | All flagged conversations          |
| GET    | `/api/v1/qa/stats/summary`        | Dashboard KPIs                     |
| POST   | `/api/v1/qa/{id}/dispute`         | Submit a score dispute             |
| GET    | `/api/v1/alerts/`                 | List alerts (open/reviewed)        |
| PATCH  | `/api/v1/alerts/{id}`             | Mark alert reviewed/dismissed      |

## Running Tests

```bash
pytest tests/ -v
```

## Sprint Roadmap

- **Sprint 1** ✓ — Scaffold, DB connection, formatter, QA scoring engine
- **Sprint 2** — Batch processing all 22,500 historical conversations
- **Sprint 3** — Email alerts, repeat-contact detection, human validation
- **Sprint 4** — Dashboard API endpoints, role-based access
- **Sprint 5** — Agent dispute system, go-live
