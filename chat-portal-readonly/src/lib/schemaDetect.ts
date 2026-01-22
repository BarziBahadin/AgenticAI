import { query } from "@/lib/db";

export async function getChatMessagesColumns(): Promise<Set<string>> {
  const rows = await query<{ Field: string }>("SHOW COLUMNS FROM base_chats");
  return new Set(rows.map(r => r.Field));
}

export function pickAgentColumn(cols: Set<string>): string | null {
  const envCol = (process.env.CHAT_AGENT_ID_COLUMN ?? "").trim();
  if (envCol && cols.has(envCol)) return envCol;

  const candidates = ["operator_id", "agent_id", "base_operator_id", "operatorId", "agentId"];
  for (const c of candidates) if (cols.has(c)) return c;
  return null;
}
