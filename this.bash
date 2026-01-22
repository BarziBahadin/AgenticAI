#!/usr/bin/env bash
set -euo pipefail

APP_NAME="chat-portal-readonly"

if [ -d "$APP_NAME" ]; then
  echo "ERROR: '$APP_NAME' already exists. Remove it first." >&2
  exit 1
fi

mkdir -p "$APP_NAME"
cd "$APP_NAME"

cat > package.json <<'JSON'
{
  "name": "chat-portal-readonly",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "mysql2": "^3.11.5",
    "next": "^15.2.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-window": "^1.8.10",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/node": "^20.11.30",
    "@types/react": "^19.0.10",
    "@types/react-dom": "^19.0.4",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.5.1",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.6.3"
  }
}
JSON

mkdir -p src/app src/lib src/components

cat > next.config.mjs <<'JS'
/** @type {import('next').NextConfig} */
const nextConfig = { reactStrictMode: true };
export default nextConfig;
JS

cat > tsconfig.json <<'JSON'
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2022"],
    "strict": true,
    "noEmit": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "preserve",
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules"]
}
JSON

cat > postcss.config.mjs <<'JS'
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
JS

cat > tailwind.config.ts <<'TS'
import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: []
};
export default config;
TS

cat > next-env.d.ts <<'TS'
/// <reference types="next" />
/// <reference types="next/image-types/global" />
TS

cat > src/app/globals.css <<'CSS'
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans Arabic", "Noto Sans", sans-serif;
}
CSS

cat > .env.example <<'ENV'
# --- DB (READ ONLY) ---
DB_HOST="172.16.5.59"
DB_PORT="3324"
DB_USER="barzi"
DB_PASSWORD="PASTE_YOUR_PASSWORD_HERE"
DB_NAME="PASTE_DB_NAME_HERE"

# Auth modes: none | api_key (optional)
AUTH_MODE="none"
ADMIN_API_KEY="change-me"

# Optional: if your chat_messages has a direct operator id column (agent mapping)
# Leave empty if not available. Common names: operator_id, agent_id, base_operator_id
CHAT_AGENT_ID_COLUMN=""
ENV

cat > src/lib/auth.ts <<'TS'
import { headers } from "next/headers";

export function requireAdmin() {
  const mode = process.env.AUTH_MODE ?? "none";
  if (mode === "none") return;

  if (mode === "api_key") {
    const h = headers();
    const key = h.get("x-admin-key");
    if (!key || key !== process.env.ADMIN_API_KEY) throw new Error("UNAUTHORIZED");
    return;
  }

  throw new Error("AUTH_MODE_INVALID");
}
TS

cat > src/lib/db.ts <<'TS'
import mysql from "mysql2/promise";

let pool: mysql.Pool | null = null;

export function getPool() {
  if (pool) return pool;

  const host = process.env.DB_HOST;
  const port = Number(process.env.DB_PORT ?? "3306");
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME;

  if (!host || !user || !password || !database) {
    throw new Error("DB_ENV_MISSING: set DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME in .env");
  }

  pool = mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: 10,
    enableKeepAlive: true,
    dateStrings: false
  });

  return pool;
}

export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const p = getPool();
  const [rows] = await p.query(sql, params);
  return rows as T[];
}
TS

cat > src/lib/schemaDetect.ts <<'TS'
import { query } from "@/lib/db";

export async function getChatMessagesColumns(): Promise<Set<string>> {
  const rows = await query<{ Field: string }>("SHOW COLUMNS FROM chat_messages");
  return new Set(rows.map(r => r.Field));
}

export function pickAgentColumn(cols: Set<string>): string | null {
  const envCol = (process.env.CHAT_AGENT_ID_COLUMN ?? "").trim();
  if (envCol && cols.has(envCol)) return envCol;

  const candidates = ["operator_id", "agent_id", "base_operator_id", "operatorId", "agentId"];
  for (const c of candidates) if (cols.has(c)) return c;
  return null;
}
TS

cat > src/lib/chatRepo.ts <<'TS'
import { query } from "@/lib/db";
import { getChatMessagesColumns, pickAgentColumn } from "@/lib/schemaDetect";

export type ChatListRow = {
  request_id: string;
  message_count: number;
  first_sent_at: string;
  last_sent_at: string;
  last_account_type: string | null;
  last_agent_id: string | null;
  last_agent_username: string | null;
};

export type ChatMsg = {
  id: string;
  request_id: string;
  account_type: string | null;
  message: string;
  sent_at: string;
  agent_id: string | null;
  agent_username: string | null;
};

export async function listChats(params: {
  from?: string;
  to?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, Number(params.page ?? 1));
  const pageSize = Math.min(200, Math.max(10, Number(params.pageSize ?? 50)));
  const offset = (page - 1) * pageSize;

  // Detect columns to stay compatible with your existing schema
  const cols = await getChatMessagesColumns();
  const agentCol = pickAgentColumn(cols); // optional
  const hasAccountType = cols.has("account_type");
  const hasRequestId = cols.has("request_id");
  const hasMessage = cols.has("message");
  const hasSentAt = cols.has("sent_at");

  if (!hasRequestId || !hasMessage || !hasSentAt) {
    throw new Error("chat_messages schema must include: request_id, message, sent_at");
  }

  const where: string[] = [];
  const args: any[] = [];

  if (params.from) { where.push("sent_at >= ?"); args.push(new Date(params.from)); }
  if (params.to) { where.push("sent_at <= ?"); args.push(new Date(params.to)); }
  if (params.q) { where.push("CAST(request_id AS CHAR) LIKE ?"); args.push(`%${params.q}%`); }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  // Total distinct chats
  const totalRows = await query<{ total: number }>(
    `SELECT COUNT(DISTINCT request_id) AS total FROM chat_messages ${whereSql}`,
    args
  );
  const total = totalRows[0]?.total ?? 0;

  // Aggregate per request_id
  // last_account_type derived by joining last message (by sent_at/id)
  const baseAgg = `
    SELECT
      cm.request_id AS request_id,
      COUNT(*) AS message_count,
      MIN(cm.sent_at) AS first_sent_at,
      MAX(cm.sent_at) AS last_sent_at
    FROM chat_messages cm
    ${whereSql.replaceAll("sent_at", "cm.sent_at").replaceAll("request_id", "cm.request_id")}
    GROUP BY cm.request_id
    ORDER BY last_sent_at DESC
    LIMIT ? OFFSET ?;
  `;

  const agg = await query<any>(baseAgg, [...args, pageSize, offset]);

  // Fetch last message per request_id to get last account_type and optional last agent_id
  const requestIds = agg.map((r: any) => r.request_id);
  if (requestIds.length === 0) return { page, pageSize, total, items: [] as ChatListRow[] };

  const placeholders = requestIds.map(() => "?").join(",");
  const lastMsgSql = `
    SELECT cm1.*
    FROM chat_messages cm1
    JOIN (
      SELECT request_id, MAX(sent_at) AS max_sent_at
      FROM chat_messages
      WHERE request_id IN (${placeholders})
      GROUP BY request_id
    ) t ON t.request_id = cm1.request_id AND t.max_sent_at = cm1.sent_at
    WHERE cm1.request_id IN (${placeholders})
    ORDER BY cm1.sent_at DESC, cm1.id DESC;
  `;

  const lastMsgs = await query<any>(lastMsgSql, [...requestIds, ...requestIds]);

  // Map to most recent row per request_id (sent_at ties -> highest id)
  const lastByReq = new Map<string, any>();
  for (const m of lastMsgs) {
    const rid = String(m.request_id);
    if (!lastByReq.has(rid)) lastByReq.set(rid, m);
  }

  // Collect agent ids if column exists
  const agentIds: string[] = [];
  if (agentCol) {
    for (const rid of requestIds) {
      const lm = lastByReq.get(String(rid));
      const aid = lm?.[agentCol];
      if (aid != null) agentIds.push(String(aid));
    }
  }

  let opMap = new Map<string, string>();
  if (agentIds.length) {
    const uniq = Array.from(new Set(agentIds));
    const ph = uniq.map(() => "?").join(",");
    const ops = await query<{ id: any; username: any }>(
      `SELECT id, username FROM base_operators WHERE id IN (${ph})`,
      uniq
    );
    opMap = new Map(ops.map(o => [String(o.id), String(o.username)]));
  }

  const items: ChatListRow[] = agg.map((r: any) => {
    const rid = String(r.request_id);
    const lm = lastByReq.get(rid);
    const lastAccountType = hasAccountType ? (lm?.account_type ?? null) : null;
    const lastAgentId = agentCol ? (lm?.[agentCol] != null ? String(lm[agentCol]) : null) : null;
    const lastAgentUsername = lastAgentId ? (opMap.get(lastAgentId) ?? null) : null;

    return {
      request_id: rid,
      message_count: Number(r.message_count),
      first_sent_at: new Date(r.first_sent_at).toISOString(),
      last_sent_at: new Date(r.last_sent_at).toISOString(),
      last_account_type: lastAccountType,
      last_agent_id: lastAgentId,
      last_agent_username: lastAgentUsername
    };
  });

  return { page, pageSize, total, items };
}

export async function getChatMessages(request_id: string) {
  const cols = await getChatMessagesColumns();
  const agentCol = pickAgentColumn(cols);
  const hasAccountType = cols.has("account_type");

  const ridNum = BigInt(request_id); // request_id is numeric per your setup

  // Build SELECT dynamically (only include agent column if exists)
  const selectCols = [
    "id",
    "request_id",
    hasAccountType ? "account_type" : "NULL AS account_type",
    "message",
    "sent_at",
    agentCol ? `${agentCol} AS agent_ref` : "NULL AS agent_ref"
  ].join(", ");

  const rows = await query<any>(
    `SELECT ${selectCols} FROM chat_messages WHERE request_id = ? ORDER BY sent_at ASC, id ASC`,
    [ridNum]
  );

  // Fetch operator usernames if we have agent ids
  const agentIds = rows.map((r: any) => r.agent_ref).filter((x: any) => x != null).map((x: any) => String(x));
  let opMap = new Map<string, string>();
  if (agentIds.length) {
    const uniq = Array.from(new Set(agentIds));
    const ph = uniq.map(() => "?").join(",");
    const ops = await query<{ id: any; username: any }>(
      `SELECT id, username FROM base_operators WHERE id IN (${ph})`,
      uniq
    );
    opMap = new Map(ops.map(o => [String(o.id), String(o.username)]));
  }

  const msgs: ChatMsg[] = rows.map((r: any) => {
    const aid = r.agent_ref != null ? String(r.agent_ref) : null;
    return {
      id: String(r.id),
      request_id: String(r.request_id),
      account_type: r.account_type != null ? String(r.account_type) : null,
      message: String(r.message),
      sent_at: new Date(r.sent_at).toISOString(),
      agent_id: aid,
      agent_username: aid ? (opMap.get(aid) ?? null) : null
    };
  });

  return { request_id, messages: msgs };
}
TS

cat > src/components/Badge.tsx <<'TSX'
export function Badge({ text }: { text: string }) {
  return <span className="px-2 py-1 text-xs rounded bg-gray-100 border">{text}</span>;
}
TSX

cat > src/components/Nav.tsx <<'TSX'
import Link from "next/link";

export function Nav() {
  return (
    <div className="flex gap-3 items-center">
      <Link className="underline" href="/">الرئيسية</Link>
      <Link className="underline" href="/chats">المحادثات</Link>
    </div>
  );
}
TSX

cat > src/components/ChatBubble.tsx <<'TSX'
import { Badge } from "./Badge";

export function ChatBubble(props: {
  accountType: string | null;
  agentUsername: string | null;
  ts: string;
  text: string;
}) {
  const who = props.agentUsername ? `Agent: ${props.agentUsername}` : (props.accountType ?? "unknown");
  return (
    <div className="bg-white rounded border p-3">
      <div className="flex justify-between items-center text-xs text-gray-600">
        <div className="flex gap-2 items-center">
          <Badge text={who} />
        </div>
        <div>{new Date(props.ts).toLocaleString()}</div>
      </div>
      <div className="mt-2 whitespace-pre-wrap text-sm">{props.text}</div>
    </div>
  );
}
TSX

cat > src/app/layout.tsx <<'TSX'
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata = { title: "Chat Portal", description: "Read-only chat portal" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <div className="max-w-6xl mx-auto p-4 space-y-4">
          <div className="bg-white border rounded p-3 flex justify-between items-center">
            <div className="font-bold">Chat Portal (Read Only)</div>
            <Nav />
          </div>
          {children}
        </div>
      </body>
    </html>
  );
}
TSX

cat > src/app/page.tsx <<'TSX'
import Link from "next/link";

export default function Home() {
  return (
    <main className="space-y-3">
      <div className="bg-white rounded border p-4">
        <h1 className="text-2xl font-bold">بوابة عرض المحادثات</h1>
        <p className="text-gray-700 mt-2">
          عرض وقراءة المحادثات من قاعدة البيانات (بدون حفظ أو تعديل).
        </p>
        <Link className="inline-block mt-4 px-4 py-2 rounded bg-black text-white" href="/chats">
          فتح قائمة المحادثات
        </Link>
      </div>
    </main>
  );
}
TSX

mkdir -p src/app/chats
cat > src/app/chats/page.tsx <<'TSX'
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listChats } from "@/lib/chatRepo";

export default async function ChatsPage({ searchParams }: { searchParams: any }) {
  requireAdmin();

  const page = Number(searchParams.page ?? 1);
  const pageSize = Number(searchParams.pageSize ?? 50);
  const from = searchParams.from ? String(searchParams.from) : undefined;
  const to = searchParams.to ? String(searchParams.to) : undefined;
  const q = searchParams.q ? String(searchParams.q) : undefined;

  const data = await listChats({ from, to, q, page, pageSize });

  return (
    <main className="space-y-3">
      <div className="bg-white rounded border p-4 space-y-3">
        <h1 className="text-xl font-bold">المحادثات</h1>

        <form className="grid grid-cols-1 md:grid-cols-5 gap-2">
          <input className="border rounded px-2 py-2" name="q" defaultValue={q ?? ""} placeholder="بحث request_id" />
          <input className="border rounded px-2 py-2" name="from" defaultValue={from ?? ""} placeholder="from ISO (اختياري)" />
          <input className="border rounded px-2 py-2" name="to" defaultValue={to ?? ""} placeholder="to ISO (اختياري)" />
          <input className="border rounded px-2 py-2" name="pageSize" defaultValue={String(pageSize)} placeholder="pageSize" />
          <button className="rounded bg-black text-white px-3 py-2" type="submit">بحث</button>
        </form>

        <div className="text-sm text-gray-600">
          الإجمالي: {data.total} — صفحة {data.page}
        </div>

        <div className="overflow-auto border rounded">
          <table className="min-w-full text-sm bg-white">
            <thead className="bg-gray-50">
              <tr className="text-right">
                <th className="p-2">request_id</th>
                <th className="p-2">عدد الرسائل</th>
                <th className="p-2">أول رسالة</th>
                <th className="p-2">آخر رسالة</th>
                <th className="p-2">آخر نوع</th>
                <th className="p-2">آخر Agent</th>
                <th className="p-2">فتح</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((c) => (
                <tr key={c.request_id} className="border-t">
                  <td className="p-2">{c.request_id}</td>
                  <td className="p-2">{c.message_count}</td>
                  <td className="p-2 whitespace-nowrap">{new Date(c.first_sent_at).toLocaleString()}</td>
                  <td className="p-2 whitespace-nowrap">{new Date(c.last_sent_at).toLocaleString()}</td>
                  <td className="p-2">{c.last_account_type ?? "-"}</td>
                  <td className="p-2">{c.last_agent_username ?? c.last_agent_id ?? "-"}</td>
                  <td className="p-2">
                    <Link className="underline" href={`/chats/${c.request_id}`}>عرض</Link>
                  </td>
                </tr>
              ))}
              {data.items.length === 0 && (
                <tr><td className="p-3 text-gray-600" colSpan={7}>لا توجد نتائج</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-between items-center">
          <Link
            className={`px-3 py-2 rounded border ${data.page <= 1 ? "pointer-events-none opacity-50" : ""}`}
            href={`/chats?${new URLSearchParams({ ...(q?{q}:{}) , ...(from?{from}:{}) , ...(to?{to}:{}) , pageSize: String(pageSize), page: String(Math.max(1, data.page - 1)) }).toString()}`}
          >
            السابق
          </Link>

          <Link
            className={`px-3 py-2 rounded border ${(data.page * data.pageSize) >= data.total ? "pointer-events-none opacity-50" : ""}`}
            href={`/chats?${new URLSearchParams({ ...(q?{q}:{}) , ...(from?{from}:{}) , ...(to?{to}:{}) , pageSize: String(pageSize), page: String(data.page + 1) }).toString()}`}
          >
            التالي
          </Link>
        </div>
      </div>
    </main>
  );
}
TSX

mkdir -p src/app/chats/\[request_id\]
cat > src/app/chats/[request_id]/page.tsx <<'TSX'
import { requireAdmin } from "@/lib/auth";
import { getChatMessages } from "@/lib/chatRepo";
import { ChatBubble } from "@/components/ChatBubble";

export default async function ChatDetail({ params }: { params: { request_id: string } }) {
  requireAdmin();

  const data = await getChatMessages(params.request_id);

  return (
    <main className="space-y-3">
      <div className="bg-white rounded border p-4">
        <h1 className="text-xl font-bold">محادثة: {data.request_id}</h1>
        <div className="text-sm text-gray-600 mt-1">عدد الرسائل: {data.messages.length}</div>
      </div>

      <div className="space-y-2">
        {data.messages.map((m) => (
          <ChatBubble
            key={m.id}
            accountType={m.account_type}
            agentUsername={m.agent_username}
            ts={m.sent_at}
            text={m.message}
          />
        ))}
      </div>
    </main>
  );
}
TSX

cat > README.md <<'MD'
# Chat Portal (Read Only)

## Setup
1) Copy env:
   cp .env.example .env

2) Edit `.env`:
   - DB_PASSWORD (paste locally)
   - DB_NAME (your database name)

3) Run:
   npm install
   npm run dev

Open:
http://localhost:3000

## Optional: show agent names
If your `chat_messages` table contains a column that stores operator id (matching `base_operators.id`),
set in `.env`:
CHAT_AGENT_ID_COLUMN="operator_id"
MD

echo "==> Installing deps..."
npm install >/dev/null

echo ""
echo "✅ Created $APP_NAME"
echo "Next:"
echo "  cd $APP_NAME"
echo "  cp .env.example .env"
echo "  edit .env (DB_PASSWORD + DB_NAME)"
echo "  npm run dev"

