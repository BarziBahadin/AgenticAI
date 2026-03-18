# Qiyas — AI Audit Platform

AI-powered QA scoring system for telecom contact center conversations. Analyzes agent-customer chat transcripts, scores agent performance, detects SLA breaches, and generates coaching recommendations.

---

## Project Structure

```
audit/
├── backend/     FastAPI — QA scoring API (Python)
└── frontend/    Next.js — Audit runner & API (TypeScript)
```

Both services connect to the same MySQL database.

---

## Backend

**FastAPI** service exposing a REST API for conversation retrieval, QA scoring, and alerts.

### Stack
- Python 3.14 / FastAPI
- SQLAlchemy (async) + aiomysql
- Ollama (local LLM via Cloudflare tunnel)

### Setup

```bash
cd backend

# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
venv/bin/pip install -r requirements.txt

# Configure environment
cp .env.example .env   # then fill in values
```

### Environment Variables (backend `.env`)

| Variable | Default | Description |
|---|---|---|
| `DB_HOST` | `localhost` | MySQL host |
| `DB_PORT` | `3306` | MySQL port |
| `DB_NAME` | `qiyas` | Database name |
| `DB_USER` | `root` | Database user |
| `DB_PASSWORD` | — | Database password |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama URL (update when tunnel rotates) |
| `OLLAMA_MODEL` | `llama3.1:8b` | Model name |
| `QA_SCORE_THRESHOLD` | `70.0` | Minimum passing QA score |
| `DEBUG` | `false` | Enable debug logging |

### Run

```bash
cd backend
venv/bin/uvicorn app.main:app --reload --port 8000
```

API docs available at: `http://localhost:8000/docs`

### API Endpoints

| Route | Method | Description |
|---|---|---|
| `/api/v1/health` | GET | Health check |
| `/api/v1/conversations` | GET | List conversations |
| `/api/v1/qa` | POST/GET | QA scoring |
| `/api/v1/alerts` | GET | Alerts |

---

## Frontend

**Next.js 15** service that runs batch AI audits against conversations from the database and exports results to Excel.

### Stack
- Next.js 15 / React 19 / TypeScript
- Tailwind CSS
- MySQL (mysql2)
- LLM providers: Ollama, Google Gemini, Together AI

### Setup

```bash
cd frontend
npm install

# Configure environment
cp .env.example .env.local   # then fill in values
```

### Environment Variables (frontend `.env.local`)

| Variable | Required | Description |
|---|---|---|
| `DB_HOST` | Yes | MySQL host |
| `DB_PORT` | Yes | MySQL port (non-standard: `3324`) |
| `DB_USER` | Yes | Database user |
| `DB_PASSWORD` | Yes | Database password |
| `DB_NAME` | Yes | Database name |
| `AUDIT_PROVIDER` | Yes | `ollama` \| `gemini` \| `together` |
| `OLLAMA_URL` | Ollama only | Ollama base URL |
| `OLLAMA_MODEL` | Ollama only | Model name |
| `OLLAMA_MAX_CONCURRENT` | No | Max parallel requests (default: `1`) |
| `OLLAMA_TIMEOUT_MS` | No | Request timeout ms (default: `120000`) |
| `TOGETHER_API_KEY` | Together only | Together AI API key |
| `TOGETHER_MODEL` | No | Model name (default: `meta-llama/Llama-3.1-8B-Instruct-Turbo`) |
| `TOGETHER_MAX_CONCURRENT` | No | Max parallel requests (default: `2`) |
| `GEMINI_API_KEY` | Gemini only | Google Gemini API key |
| `AUDIT_MAX_CHATS` | No | Max chats per job (default: `5`) |
| `AUDIT_MAX_CONCURRENT_JOBS` | No | Max parallel jobs (default: `1`) |
| `CHAT_AGENT_ID_COLUMN` | No | Custom agent column in `base_chats` |
| `AUTH_MODE` | No | `none` (default) or `api_key` |
| `ADMIN_API_KEY` | api_key mode | Admin API key |

### Run

```bash
cd frontend
npm run dev      # Development (http://localhost:3000)
npm run build    # Production build
npm start        # Production server
```

### Audit API Endpoints

| Route | Method | Description |
|---|---|---|
| `/api/audit/run` | POST | Start a new audit job → returns `job_id` |
| `/api/audit/status?job_id=` | GET | Poll job progress and recent results |
| `/api/audit/stop` | POST | Stop a running job |
| `/api/audit/download?job_id=` | GET | Download results as Excel file |
| `/api/audit/health` | GET | Check active provider health |
| `/api/audit/debug` | GET | Diagnostic info (env vars, provider config) |

### Audit Output (per chat)

```json
{
  "summary": "string",
  "scores": { "total": 0-100, "compliance": 0, "quality": 0, "resolution": 0, "sla": 0 },
  "risk_level": "low | medium | high",
  "sentiment": "positive | neutral | negative",
  "category": "string",
  "checks": [{ "id": "string", "status": "pass | fail | warning", "severity": "low | medium | high", "evidence": { "message_index": 1, "reason": "string" } }],
  "coaching": [{ "type": "behavior | process | language", "text": "string" }]
}
```

---

## Database

MySQL — shared between both services.

| Table | Description |
|---|---|
| `base_requests` | Request metadata (status, timestamps, category, language) |
| `base_chats` | Message transcripts (request_id, message, sent_at, account_type) |
| `base_operators` | Agent info (id, username) |

> **Note:** The database port is non-standard: `3324`

---

## Ollama (Local LLM)

The backend and frontend both support Ollama as an LLM provider via a Cloudflare tunnel.

- The tunnel URL rotates — update `OLLAMA_HOST` / `OLLAMA_URL` in `.env` when it changes
- All requests require the header `Origin: http://localhost`
- Recommended model: `qwen3.5:35b`
