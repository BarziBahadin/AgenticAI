# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm start        # Start production server
```

No lint or test commands are configured. TypeScript type checking: `npx tsc --noEmit`.

## Environment Setup

Copy `.env.example` to `.env.local` and configure:
- **Database**: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- **Audit provider**: `AUDIT_PROVIDER=ollama|gemini|together`
- **Auth**: `AUTH_MODE=none` (default) or `AUTH_MODE=api_key` + `ADMIN_API_KEY`
- **Optional**: `CHAT_AGENT_ID_COLUMN` if the agent ID column in `base_chats` has a non-standard name

## Architecture

**Next.js 15 App Router** app with MySQL backend and multi-provider AI audit engine.

### Data Layer (`src/lib/`)

- **`db.ts`**: MySQL connection pool with query helpers
- **`schemaDetect.ts`**: Detects `base_chats` column names dynamically at runtime (cached 5 min), supports flexible schemas
- **`chatRepo.ts`**: All chat queries and KPI calculations (FRT, resolution time, SLA breaches)
- **`auditStorage.ts`**: Job state management — persists to `.audit_runs/{jobId}/` as `state.json` + NDJSON results
- **`auditRunner.ts`**: Audit job orchestration — batch-processes up to 30k chats, switches LLM provider via `AUDIT_PROVIDER` env var

### LLM Provider Clients (`src/lib/`)

All clients expose a common interface used by `auditRunner.ts`:
- **`geminiClient.ts`**: Google Gemini — main reference implementation with JSON validation
- **`ollamaClient.ts`**: Local Ollama with queue management and concurrency control
- **`togetherClient.ts`**: Together AI cloud provider
- **`replicateClient.ts`**, **`openRouterClient.ts`**: Stubs (not fully implemented)

### API Routes (`src/app/api/audit/`)

| Route | Method | Purpose |
|-------|--------|---------|
| `run/route.ts` | POST | Start audit job (async, returns `job_id`) |
| `status/route.ts` | GET | Poll job progress + recent results |
| `stop/route.ts` | POST | Signal stop to running job |
| `download/route.ts` | GET | Stream Excel results file |
| `health/route.ts` | GET | Health check |
| `debug/route.ts` | GET | Debug info |

### Pages (`src/app/`)

- **`/chats`**: Paginated chat list with filters and KPI dashboard (Server Component, queries MySQL directly)
- **`/chats/[request_id]`**: Chat transcript detail with metrics
- **`/ai-audit`**: Audit UI — `AuditClient.tsx` handles start/stop/polling (Client Component)

### Key Architectural Patterns

1. **Server Components by default**: Pages fetch data directly; only `AuditClient.tsx` is a Client Component (needs polling/state)
2. **Dynamic schema**: `schemaDetect.ts` makes column detection resilient to schema variations in `base_chats`
3. **Streaming audit results**: Results written as NDJSON to allow incremental progress reads
4. **Provider factory**: `auditRunner.ts` selects LLM client based on `AUDIT_PROVIDER` — add new providers by implementing the client interface and adding a case in the factory

### Database Tables

- `base_chats`: Message transcripts (`request_id`, `message`, `sent_at`, `account_type`, optional agent ID column)
- `base_requests`: Request metadata (`id`, `created_at`, `resolved_at`, `closed_at`, `status`)
- `base_operators`: Agent info (`id`, `username`)

### Audit Output Schema (per chat)

```typescript
{
  summary: string
  scores: { total, compliance, quality, resolution, sla }
  risk_level: string
  sentiment: string
  category: string
  checks: Array<{ id, status, severity, evidence: { message_index } }>
  coaching: Array<{ behavior, process, language }>
}
```

Path alias: `@/*` → `src/*`
