import { query } from "@/lib/db";

// Cache schema detection to avoid repeated SHOW COLUMNS queries
let cachedColumns: Set<string> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getChatMessagesColumns(): Promise<Set<string>> {
  const now = Date.now();
  if (cachedColumns && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedColumns;
  }

  const rows = await query<{ Field: string }>("SHOW COLUMNS FROM base_chats");
  cachedColumns = new Set(rows.map(r => r.Field));
  cacheTimestamp = now;
  return cachedColumns;
}

export function pickAgentColumn(cols: Set<string>): string | null {
  const envCol = (process.env.CHAT_AGENT_ID_COLUMN ?? "").trim();
  if (envCol && cols.has(envCol)) return envCol;

  const candidates = ["operator_id", "agent_id", "base_operator_id", "operatorId", "agentId"];
  for (const c of candidates) if (cols.has(c)) return c;
  return null;
}

// Clear cache (useful for testing or when schema changes)
export function clearSchemaCache() {
  cachedColumns = null;
  cacheTimestamp = 0;
}
