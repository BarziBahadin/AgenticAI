import { query } from "@/lib/db";
import { getChatMessagesColumns, pickAgentColumn } from "@/lib/schemaDetect";

/**
 * Tables:
 * - base_chats: transcript
 * - base_requests: request meta (id == request_id)
 * - base_operators: agent names
 *
 * Metrics:
 * - FRT = base_requests.created_at -> first agent message sent_at after created_at
 * - Resolution = created_at -> resolved_at (else closed_at)
 *
 * Handled By:
 * - If base_chats has agentId column: distinct agent ids found in base_chats for that request
 * - Else fallback to attached_agent_id from base_requests
 */

export type ChatKpis = {
  total_requests: number;
  avg_frt_seconds: number | null;
  frt_breached: number;
  frt_missing: number;
  avg_resolution_seconds: number | null;
  resolution_breached: number;
  resolution_missing: number;
};

export async function getChatMessages(request_id: string) {
  const ridNum = BigInt(request_id);

  // Detect columns once
  const cols = await getChatMessagesColumns();
  const agentCol = pickAgentColumn(cols);
  const hasAccountType = cols.has("account_type");

  // Fetch base_requests with all needed fields
  const brRows = await query<any>(
    `SELECT 
      id, requester_name, requester_name_ar, created_at, resolved_at, closed_at,
      status, issue_category_name, issue_name, attached_agent_id, language, app_name, company_name
    FROM base_requests WHERE id = ? LIMIT 1`,
    [ridNum]
  );
  const br = brRows[0] ?? null;

  // Fetch chat messages with all needed columns
  const selectCols = [
    "id",
    "request_id",
    hasAccountType ? "account_type" : "NULL AS account_type",
    "message",
    "sent_at",
    agentCol ? `${agentCol} AS agent_ref` : "NULL AS agent_ref"
  ].join(", ");

  const rows = await query<any>(
    `SELECT ${selectCols} FROM base_chats WHERE request_id = ? ORDER BY sent_at ASC, id ASC`,
    [ridNum]
  );

  // Compute FRT and resolution metrics
  const FRT_SLA = envNum("REQUEST_FRT_SLA_SECONDS", 120);
  const RES_SLA = envNum("REQUEST_RESOLUTION_SLA_SECONDS", 86400);

  let frt_seconds: number | null = null;
  let resolution_seconds: number | null = null;

  if (br?.created_at) {
    const createdAt = new Date(br.created_at);
    
    // Find first agent message for FRT
    const agentTypes = getAgentAccountTypes();
    for (const row of rows) {
      const isAgent = agentCol
        ? row.agent_ref != null
        : hasAccountType && agentTypes.includes(String(row.account_type ?? "").toLowerCase());
      
      if (isAgent) {
        const sentAt = new Date(row.sent_at);
        if (sentAt >= createdAt) {
          frt_seconds = diffSeconds(createdAt, sentAt);
          break;
        }
      }
    }

    // Resolution time
    const resolvedAt = br.resolved_at ? new Date(br.resolved_at) : null;
    const closedAt = br.closed_at ? new Date(br.closed_at) : null;
    const endAt = resolvedAt ?? closedAt;
    if (endAt) {
      resolution_seconds = diffSeconds(createdAt, endAt);
    }
  }

  // Get operator usernames for messages
  const agentIds = rows
    .map((r: any) => r.agent_ref)
    .filter((x: any) => x != null)
    .map((x: any) => String(x));
  
  let opMap = new Map<string, string>();
  if (agentIds.length) {
    const uniq = Array.from(new Set(agentIds));
    const ph = uniq.map(() => "?").join(",");
    const ops = await query<{ id: any; username: any }>(
      `SELECT id, username FROM base_operators WHERE id IN (${ph})`,
      uniq
    );
    opMap = new Map(ops.map((o) => [String(o.id), String(o.username)]));
  }

  // Get assigned agent username
  let assigned_agent_username: string | null = null;
  if (br?.attached_agent_id) {
    const assignedOps = await query<{ id: any; username: any }>(
      `SELECT id, username FROM base_operators WHERE id = ? LIMIT 1`,
      [br.attached_agent_id]
    );
    assigned_agent_username = assignedOps[0] ? String(assignedOps[0].username) : null;
  }

  // Get handled by agents
  const handledIds = agentCol
    ? Array.from(new Set(rows.map((r: any) => r.agent_ref).filter((x: any) => x != null).map((x: any) => String(x))))
    : [];
  const handledNames = handledIds.map((id) => opMap.get(id) ?? id);
  const handled_by_display = handledNames.length ? handledNames.join(", ") : null;

  // Format messages
  const messages = rows.map((r: any) => ({
    id: String(r.id),
    request_id: String(r.request_id),
    account_type: r.account_type != null ? String(r.account_type) : null,
    message: String(r.message),
    sent_at: new Date(r.sent_at).toISOString(),
    agent_id: r.agent_ref != null ? String(r.agent_ref) : null,
    agent_username: r.agent_ref != null ? (opMap.get(String(r.agent_ref)) ?? null) : null
  }));

  const customer_name = br
    ? String(br.requester_name_ar ?? br.requester_name ?? "").trim() || null
    : null;

  return {
    request_id,
    request: br ? {
      ...br,
      customer_name,
      assigned_agent_id: br.attached_agent_id != null ? String(br.attached_agent_id) : null,
      assigned_agent_username,
      handled_by_display
    } : null,
    metrics: {
      frt_seconds,
      resolution_seconds,
      breach_frt: frt_seconds != null ? frt_seconds > FRT_SLA : null,
      breach_resolution: resolution_seconds != null ? resolution_seconds > RES_SLA : null,
      frt_sla_seconds: FRT_SLA,
      resolution_sla_seconds: RES_SLA
    },
    messages
  };
}



export type ChatListRow = {
  request_id: string;

  // base_requests
  customer_name: string | null;
  request_created_at: string | null;
  request_status: string | null;
  issue_category_name: string | null;
  issue_name: string | null;
  language: string | null;
  app_name: string | null;
  company_name: string | null;

  // assigned agent (base_requests.attached_agent_id -> base_operators)
  assigned_agent_id: string | null;
  assigned_agent_username: string | null;

  // handled by (agents who actually replied)
  handled_by_agent_ids: string[];
  handled_by_agent_usernames: string[];
  handled_by_display: string | null;

  // computed metrics
  frt_seconds: number | null;
  resolution_seconds: number | null;
  breach_frt: boolean | null;
  breach_resolution: boolean | null;

  // chat aggregate
  message_count: number;
  first_sent_at: string;
  last_sent_at: string;
  last_account_type: string | null;

  // last agent (from last message)
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

type BaseRequestRow = {
  id: any;
  requester_name: any;
  requester_name_ar: any;
  created_at: any;
  resolved_at: any;
  closed_at: any;
  status: any;
  issue_category_name: any;
  issue_name: any;
  attached_agent_id: any;
  language: any;
  app_name: any;
  company_name: any;
};

function envNum(name: string, fallback: number) {
  const v = (process.env[name] ?? "").trim();
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function toNumOrNull(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function getAgentAccountTypes(): string[] {
  return (process.env.AGENT_ACCOUNT_TYPES ?? "agent,operator,support,admin")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function diffSeconds(a: Date, b: Date) {
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 1000));
}

function isAgentMessage(opts: { account_type?: string | null; agent_ref?: any | null; agentColExists: boolean }) {
  if (opts.agentColExists) return opts.agent_ref != null;
  const t = String(opts.account_type ?? "").toLowerCase();
  return getAgentAccountTypes().includes(t);
}

export async function listChats(params: {
  from?: string;
  to?: string;
  q?: string;

  // NEW FILTERS (base_requests)
  status?: string;
  category?: string;
  app_name?: string;
  company_name?: string;
  language?: string;
  assigned_agent_id?: string;

  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, Number(params.page ?? 1));
  const pageSize = Math.min(200, Math.max(10, Number(params.pageSize ?? 50)));
  const offset = (page - 1) * pageSize;

  // detect base_chats columns
  const cols = await getChatMessagesColumns();
  const agentCol = pickAgentColumn(cols); // optional: operator_id / agent_id / base_operator_id ...
  const hasAccountType = cols.has("account_type");
  const hasRequestId = cols.has("request_id");
  const hasMessage = cols.has("message");
  const hasSentAt = cols.has("sent_at");

  if (!hasRequestId || !hasMessage || !hasSentAt) {
    throw new Error("base_chats schema must include: request_id, message, sent_at");
  }

  // WHERE (bc + br)
  const where: string[] = [];
  const args: any[] = [];

  // filters on base_chats
  if (params.from) { where.push("bc.sent_at >= ?"); args.push(new Date(params.from)); }
  if (params.to) { where.push("bc.sent_at <= ?"); args.push(new Date(params.to)); }
  if (params.q) { where.push("CAST(bc.request_id AS CHAR) LIKE ?"); args.push(`%${params.q}%`); }

  // filters on base_requests
  if (params.status) { where.push("br.status LIKE ?"); args.push(`%${params.status}%`); }
  if (params.category) { where.push("br.issue_category_name LIKE ?"); args.push(`%${params.category}%`); }
  if (params.app_name) { where.push("br.app_name LIKE ?"); args.push(`%${params.app_name}%`); }
  if (params.company_name) { where.push("br.company_name LIKE ?"); args.push(`%${params.company_name}%`); }
  if (params.language) { where.push("br.language = ?"); args.push(params.language); }
  if (params.assigned_agent_id) { where.push("br.attached_agent_id = ?"); args.push(BigInt(params.assigned_agent_id)); }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  // total distinct request_id (with join so request filters apply)
  const totalRows = await query<{ total: any }>(
    `
    SELECT COUNT(DISTINCT bc.request_id) AS total
    FROM base_chats bc
    JOIN base_requests br ON br.id = bc.request_id
    ${whereSql}
    `,
    args
  );
  const total = Number(totalRows[0]?.total ?? 0);

  // aggregate per request_id
  const agg = await query<any>(
    `
    SELECT
      bc.request_id AS request_id,
      COUNT(*) AS message_count,
      MIN(bc.sent_at) AS first_sent_at,
      MAX(bc.sent_at) AS last_sent_at
    FROM base_chats bc
    JOIN base_requests br ON br.id = bc.request_id
    ${whereSql}
    GROUP BY bc.request_id
    ORDER BY last_sent_at DESC
    LIMIT ? OFFSET ?;
    `,
    [...args, pageSize, offset]
  );

  const requestIds = agg.map((r: any) => r.request_id);
  const placeholders = requestIds.map(() => "?").join(",");

  // KPI CALC (for ALL filtered requests)
  const kpis = await computeKpis({
    whereSql,
    args,
    agentCol,
    hasAccountType
  });

  if (requestIds.length === 0) {
    return { page, pageSize, total, kpis, items: [] as ChatListRow[] };
  }

  // last message per request_id (for last_account_type + last agent)
  const lastMsgs = await query<any>(
    `
    SELECT bc1.*
    FROM base_chats bc1
    JOIN (
      SELECT request_id, MAX(sent_at) AS max_sent_at
      FROM base_chats
      WHERE request_id IN (${placeholders})
      GROUP BY request_id
    ) t ON t.request_id = bc1.request_id AND t.max_sent_at = bc1.sent_at
    WHERE bc1.request_id IN (${placeholders})
    ORDER BY bc1.sent_at DESC, bc1.id DESC;
    `,
    [...requestIds, ...requestIds]
  );

  const lastByReq = new Map<string, any>();
  for (const m of lastMsgs) {
    const rid = String(m.request_id);
    if (!lastByReq.has(rid)) lastByReq.set(rid, m);
  }

  // base_requests meta for these request_ids
  const brRows = await query<BaseRequestRow>(
    `
    SELECT
      id, requester_name, requester_name_ar, created_at, resolved_at, closed_at,
      status, issue_category_name, issue_name, attached_agent_id, language, app_name, company_name
    FROM base_requests
    WHERE id IN (${placeholders})
    `,
    requestIds
  );

  const brMap = new Map<string, BaseRequestRow>();
  for (const r of brRows) brMap.set(String(r.id), r);

  // handled-by map (requires agentCol in base_chats)
  const handledIdMap = new Map<string, string[]>();
  const allHandledIds: string[] = [];

  if (agentCol) {
    const pairs = await query<{ request_id: any; agent_id: any }>(
      `
      SELECT bc.request_id AS request_id, bc.${agentCol} AS agent_id
      FROM base_chats bc
      WHERE bc.request_id IN (${placeholders})
        AND bc.${agentCol} IS NOT NULL
      GROUP BY bc.request_id, bc.${agentCol}
      `,
      requestIds
    );

    for (const p of pairs) {
      const rid = String(p.request_id);
      const aid = String(p.agent_id);
      allHandledIds.push(aid);
      const arr = handledIdMap.get(rid) ?? [];
      arr.push(aid);
      handledIdMap.set(rid, arr);
    }
  }

  // operator map includes: last agent, assigned agent, handled-by
  const operatorIds: string[] = [];

  // last agent id
  if (agentCol) {
    for (const rid of requestIds) {
      const lm = lastByReq.get(String(rid));
      const aid = lm?.[agentCol];
      if (aid != null) operatorIds.push(String(aid));
    }
  }

  // assigned agent id from base_requests
  for (const rid of requestIds) {
    const br = brMap.get(String(rid));
    const attached = br?.attached_agent_id;
    if (attached != null) operatorIds.push(String(attached));
  }

  operatorIds.push(...allHandledIds);

  let opMap = new Map<string, string>();
  if (operatorIds.length) {
    const uniq = Array.from(new Set(operatorIds));
    const ph = uniq.map(() => "?").join(",");
    const ops = await query<{ id: any; username: any }>(
      `SELECT id, username FROM base_operators WHERE id IN (${ph})`,
      uniq
    );
    opMap = new Map(ops.map((o) => [String(o.id), String(o.username)]));
  }

  // FRT bulk map for the page rows
  const FRT_SLA = envNum("REQUEST_FRT_SLA_SECONDS", 120);
  const RES_SLA = envNum("REQUEST_RESOLUTION_SLA_SECONDS", 86400);

  const frtMap = new Map<string, Date>();
  if (agentCol || hasAccountType) {
    const agentTypes = getAgentAccountTypes();
    const agentTypePH = agentTypes.map(() => "?").join(",");

    const agentCondition =
      agentCol ? `bc.${agentCol} IS NOT NULL`
      : hasAccountType ? `LOWER(bc.account_type) IN (${agentTypePH})`
      : "1=0";

    const frtRows = await query<{ request_id: any; first_agent_at: any }>(
      `
      SELECT bc.request_id AS request_id, MIN(bc.sent_at) AS first_agent_at
      FROM base_chats bc
      JOIN base_requests br ON br.id = bc.request_id
      WHERE bc.request_id IN (${placeholders})
        AND bc.sent_at >= br.created_at
        AND ${agentCondition}
      GROUP BY bc.request_id
      `,
      agentCol ? requestIds : [...requestIds, ...agentTypes]
    );

    for (const r of frtRows) {
      if (r.first_agent_at) frtMap.set(String(r.request_id), new Date(r.first_agent_at));
    }
  }

  const items: ChatListRow[] = agg.map((r: any) => {
    const rid = String(r.request_id);
    const lm = lastByReq.get(rid);
    const br = brMap.get(rid);

    const createdAt = br?.created_at ? new Date(br.created_at) : null;

    const customerName = br
      ? String(br.requester_name_ar ?? br.requester_name ?? "").trim() || null
      : null;

    // assigned agent
    const assignedId = br?.attached_agent_id != null ? String(br.attached_agent_id) : null;
    const assignedName = assignedId ? (opMap.get(assignedId) ?? null) : null;

    // last agent
    const lastAgentId = agentCol ? (lm?.[agentCol] != null ? String(lm[agentCol]) : null) : null;
    const lastAgentUsername = lastAgentId ? (opMap.get(lastAgentId) ?? null) : null;

    // handled-by
    const handledIds = agentCol ? (handledIdMap.get(rid) ?? []) : (assignedId ? [assignedId] : []);
    const handledNames = handledIds.map((id) => opMap.get(id) ?? id);
    const handledDisplay = handledNames.length ? handledNames.join("، ") : null;

    // FRT
    const firstAgentAt = frtMap.get(rid) ?? null;
    const frt_seconds = (createdAt && firstAgentAt) ? diffSeconds(createdAt, firstAgentAt) : null;

    // Resolution
    const resolvedAt = br?.resolved_at ? new Date(br.resolved_at) : null;
    const closedAt = br?.closed_at ? new Date(br.closed_at) : null;
    const endAt = resolvedAt ?? closedAt ?? null;
    const resolution_seconds = (createdAt && endAt) ? diffSeconds(createdAt, endAt) : null;

    const breach_frt = frt_seconds == null ? null : frt_seconds > FRT_SLA;
    const breach_resolution = resolution_seconds == null ? null : resolution_seconds > RES_SLA;

    const lastAccountType = hasAccountType ? (lm?.account_type ?? null) : null;

    return {
      request_id: rid,

      customer_name: customerName,
      request_created_at: createdAt ? createdAt.toISOString() : null,
      request_status: br?.status != null ? String(br.status) : null,
      issue_category_name: br?.issue_category_name != null ? String(br.issue_category_name) : null,
      issue_name: br?.issue_name != null ? String(br.issue_name) : null,
      language: br?.language != null ? String(br.language) : null,
      app_name: br?.app_name != null ? String(br.app_name) : null,
      company_name: br?.company_name != null ? String(br.company_name) : null,

      assigned_agent_id: assignedId,
      assigned_agent_username: assignedName,

      handled_by_agent_ids: handledIds,
      handled_by_agent_usernames: handledNames,
      handled_by_display: handledDisplay,

      frt_seconds,
      resolution_seconds,
      breach_frt,
      breach_resolution,

      message_count: Number(r.message_count),
      first_sent_at: new Date(r.first_sent_at).toISOString(),
      last_sent_at: new Date(r.last_sent_at).toISOString(),
      last_account_type: lastAccountType,

      last_agent_id: lastAgentId,
      last_agent_username: lastAgentUsername
    };
  });

  return { page, pageSize, total, kpis, items };
}

async function computeKpis(opts: {
  whereSql: string;
  args: any[];
  agentCol: string | null;
  hasAccountType: boolean;
}): Promise<ChatKpis> {
  const FRT_SLA = envNum("REQUEST_FRT_SLA_SECONDS", 120);
  const RES_SLA = envNum("REQUEST_RESOLUTION_SLA_SECONDS", 86400);

  const agentTypes = getAgentAccountTypes();
  const agentTypePH = agentTypes.map(() => "?").join(",");

  const agentCondition =
    opts.agentCol ? `bc.${opts.agentCol} IS NOT NULL`
    : opts.hasAccountType ? `LOWER(bc.account_type) IN (${agentTypePH})`
    : "1=0";

  // Filtered request ids (apply same filters as list)
  const filteredRequestsSql = `
    SELECT DISTINCT bc.request_id AS request_id
    FROM base_chats bc
    JOIN base_requests br ON br.id = bc.request_id
    ${opts.whereSql}
  `;

  // First agent response per request (no bc.sent_at window; only >= created_at)
  const firstAgentSql = `
    SELECT bc.request_id AS request_id, MIN(bc.sent_at) AS first_agent_at
    FROM base_chats bc
    JOIN base_requests br ON br.id = bc.request_id
    WHERE bc.request_id IN (SELECT request_id FROM (${filteredRequestsSql}) fr2)
      AND bc.sent_at >= br.created_at
      AND ${agentCondition}
    GROUP BY bc.request_id
  `;

  const kpiSql = `
    SELECT
      COUNT(*) AS total_requests,
      AVG(frt_seconds) AS avg_frt_seconds,
      SUM(CASE WHEN frt_seconds IS NOT NULL AND frt_seconds > ? THEN 1 ELSE 0 END) AS frt_breached,
      SUM(CASE WHEN frt_seconds IS NULL THEN 1 ELSE 0 END) AS frt_missing,
      AVG(resolution_seconds) AS avg_resolution_seconds,
      SUM(CASE WHEN resolution_seconds IS NOT NULL AND resolution_seconds > ? THEN 1 ELSE 0 END) AS resolution_breached,
      SUM(CASE WHEN resolution_seconds IS NULL THEN 1 ELSE 0 END) AS resolution_missing
    FROM (
      SELECT
        fr.request_id,
        TIMESTAMPDIFF(SECOND, br.created_at, fa.first_agent_at) AS frt_seconds,
        CASE
          WHEN br.resolved_at IS NOT NULL THEN TIMESTAMPDIFF(SECOND, br.created_at, br.resolved_at)
          WHEN br.closed_at IS NOT NULL THEN TIMESTAMPDIFF(SECOND, br.created_at, br.closed_at)
          ELSE NULL
        END AS resolution_seconds
      FROM (${filteredRequestsSql}) fr
      JOIN base_requests br ON br.id = fr.request_id
      LEFT JOIN (${firstAgentSql}) fa ON fa.request_id = fr.request_id
    ) x
  `;

  // params:
  // - filteredRequestsSql appears twice (fr + fr2) => args twice
  // - agent types (only if account_type mode)
  // - thresholds
  const baseArgs = opts.args;
  const typeArgs = opts.agentCol ? [] : (opts.hasAccountType ? agentTypes : []);
  const params = [
    ...baseArgs,                 // for (${filteredRequestsSql}) fr
    ...baseArgs,                 // for (${filteredRequestsSql}) fr2
    ...typeArgs,                 // for agentCondition (account_type list)
    FRT_SLA,
    RES_SLA
  ];

  const rows = await query<any>(kpiSql, params);
  const r = rows[0] ?? {};

  return {
    total_requests: Number(r.total_requests ?? 0),
    avg_frt_seconds: toNumOrNull(r.avg_frt_seconds),
    frt_breached: Number(r.frt_breached ?? 0),
    frt_missing: Number(r.frt_missing ?? 0),
    avg_resolution_seconds: toNumOrNull(r.avg_resolution_seconds),
    resolution_breached: Number(r.resolution_breached ?? 0),
    resolution_missing: Number(r.resolution_missing ?? 0)
  };
}

/**
 * Detail page function stays as you already have it in your current file.
 * If you already had getChatMessages() implemented, keep it unchanged.
 * (No need for filters/KPIs there.)
 */
