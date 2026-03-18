import { query } from "@/lib/db";
import { getChatMessagesColumns, pickAgentColumn } from "@/lib/schemaDetect";
import ExcelJS from "exceljs";
import { randomUUID } from "node:crypto";

// Support multiple providers: ollama, gemini, together (replicate/openrouter placeholders)
const AUDIT_PROVIDER = (process.env.AUDIT_PROVIDER || "ollama").toLowerCase();

// Lazy load the appropriate client
async function getGenerateChatAudit() {
  switch (AUDIT_PROVIDER) {
    case "ollama": {
      const { generateChatAudit } = await import("@/lib/ollamaClient");
      return generateChatAudit;
    }
    case "together": {
      const { generateChatAudit } = await import("@/lib/togetherClient");
      return generateChatAudit;
    }
    default: {
      const { generateChatAudit } = await import("@/lib/geminiClient");
      return generateChatAudit;
    }
  }
}
import {
  AuditJobState,
  appendNdjson,
  initJobFiles,
  ndjsonPath,
  readState,
  writeState,
  xlsxPath,
} from "@/lib/auditStorage";
import fs from "node:fs";
import readline from "node:readline";

const running = new Map<string, Promise<void>>();

function envNum(name: string, fallback: number) {
  const v = (process.env[name] ?? "").trim();
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function truncate(s: string, maxChars: number) {
  const t = String(s ?? "");
  if (t.length <= maxChars) return t;
  return t.slice(0, maxChars) + "…";
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function nowIso() {
  return new Date().toISOString();
}

function resolveModelSetting(): string {
  if (AUDIT_PROVIDER === "ollama") {
    return process.env.OLLAMA_MODEL?.trim() || "llama3.2:3b";
  }
  if (AUDIT_PROVIDER === "together") {
    return process.env.TOGETHER_MODEL?.trim() || "meta-llama/Llama-3.1-8B-Instruct-Turbo";
  }
  return (process.env.GEMINI_MODEL ?? "auto").trim() || "auto";
}

/**
 * Audit newest requests (by base_requests.created_at).
 * Only requests that have chats in base_chats.
 */
async function fetchLatestRequestIds(limit: number): Promise<bigint[]> {
  const rows = await query<{ request_id: any }>(
    `
    SELECT br.id AS request_id
    FROM base_requests br
    WHERE EXISTS (SELECT 1 FROM base_chats bc WHERE bc.request_id = br.id)
    ORDER BY br.created_at DESC, br.id DESC
    LIMIT ?
    `,
    [limit],
  );
  return rows.map((r) => BigInt(r.request_id));
}

async function isStopRequested(jobId: string): Promise<boolean> {
  const st = await readState(jobId);
  return Boolean(st?.stop_requested || st?.status === "stopped");
}

// Cache column detection for audit runner (separate from schemaDetect cache)
let cachedAuditColumns: { cols: Set<string>; agentCol: string | null; hasAccountType: boolean } | null = null;
let cachedAuditTimestamp = 0;
const AUDIT_COL_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function getAuditColumns() {
  const now = Date.now();
  if (cachedAuditColumns && (now - cachedAuditTimestamp) < AUDIT_COL_CACHE_TTL) {
    return cachedAuditColumns;
  }

  const cols = await getChatMessagesColumns();
  const agentCol = pickAgentColumn(cols);
  const hasAccountType = cols.has("account_type");
  
  cachedAuditColumns = { cols, agentCol, hasAccountType };
  cachedAuditTimestamp = now;
  return cachedAuditColumns;
}

async function fetchTranscript(
  requestId: bigint,
  maxMessages: number,
  maxCharsPerMsg: number,
) {
  const { cols, agentCol, hasAccountType } = await getAuditColumns();

  const selectCols = [
    "id",
    "request_id",
    hasAccountType ? "account_type" : "NULL AS account_type",
    "message",
    "sent_at",
    agentCol ? `${agentCol} AS agent_ref` : "NULL AS agent_ref",
  ].join(", ");

  const rows = await query<any>(
    `SELECT ${selectCols}
     FROM base_chats
     WHERE request_id = ?
     ORDER BY sent_at DESC, id DESC
     LIMIT ?`,
    [requestId, maxMessages],
  );

  // reverse to restore chronological order
  rows.reverse();

  const agentTypes = (
    process.env.AGENT_ACCOUNT_TYPES ?? "agent,operator,support,admin"
  )
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const transcript = rows.map((r: any, i: number) => {
    const accountType = String(r.account_type ?? "").toLowerCase();
    const isAgent = agentCol
      ? r.agent_ref != null
      : agentTypes.includes(accountType);

    return {
      index: i + 1,
      role: isAgent ? "agent" : "customer",
      text: truncate(String(r.message ?? ""), maxCharsPerMsg),
      ts: new Date(r.sent_at).toISOString(),
    };
  });

  return { transcript };
}

async function callAuditModel(params: {
  model: string;
  request_id: string;
  transcript: any[];
  temperature: number;
  maxOutputTokens: number;
}) {
  const generateChatAudit = await getGenerateChatAudit();
  const audit = await generateChatAudit(
    {
      chat_id: params.request_id,
      language: "ar",
      sla_thresholds: {
        frt_seconds: 120,
        wait_gap_seconds: 600,
      },
      transcript: params.transcript,
    },
    {
      model: params.model === "auto" ? undefined : params.model,
      temperature: params.temperature,
      maxOutputTokens: params.maxOutputTokens,
      // Only for Gemini
      ...(AUDIT_PROVIDER === "gemini" && { tryModelDiscovery: params.model === "auto" }),
    },
  );

  return audit;
}

export async function startAuditJob() {
  try {
    // Prevent multiple concurrent jobs (optional - remove if you want parallel jobs)
    const maxConcurrentJobs = envNum("AUDIT_MAX_CONCURRENT_JOBS", 1);
    console.log(`AUDIT_MAX_CONCURRENT_JOBS env var: "${process.env.AUDIT_MAX_CONCURRENT_JOBS}", parsed as: ${maxConcurrentJobs}, running jobs: ${running.size}`);

    if (maxConcurrentJobs <= 0) {
      throw new Error(`AUDIT_MAX_CONCURRENT_JOBS is set to ${maxConcurrentJobs}, which prevents any jobs from running. Set it to 1 or higher to allow jobs.`);
    }

    if (running.size >= maxConcurrentJobs) {
      throw new Error(`Maximum concurrent jobs (${maxConcurrentJobs}) reached. Stop existing jobs first.`);
    }

    // Verify the provider is configured
    if (AUDIT_PROVIDER === "ollama") {
      const { checkOllamaHealth } = await import("@/lib/ollamaClient");
      const health = await checkOllamaHealth();
      if (!health.available) {
        throw new Error(
          `Ollama is not available: ${health.error}. ` +
          `Make sure Ollama is running (ollama serve) and the model is installed (ollama pull ${health.model || "llama3.2:3b"}).`
        );
      }
    } else if (AUDIT_PROVIDER === "together") {
      const key = process.env.TOGETHER_API_KEY;
      if (!key) {
        throw new Error(
          "Together AI API key is missing. Set TOGETHER_API_KEY in your environment. " +
          "Get your key at: https://together.ai"
        );
      }
    } else if (AUDIT_PROVIDER === "gemini") {
      // Check if Gemini API key is set
      const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      if (!key) {
        throw new Error(
          "Gemini API key is missing. Set GEMINI_API_KEY or GOOGLE_API_KEY in your environment."
        );
      }
    }

    const jobId = randomUUID();
    await initJobFiles(jobId);

    const model = resolveModelSetting();

  const state: AuditJobState = {
    job_id: jobId,
    status: "queued",
    created_at: nowIso(),
    model,
    max_chats: envNum("AUDIT_MAX_CHATS", 5),
    stop_requested: false,
    processed: 0,
    success: 0,
    failed: 0,
    recent_errors: [],
    files: { ndjson: ndjsonPath(jobId) },
  };

  await writeState(jobId, state);

  const p = runJob(jobId)
    .catch(async (e) => {
      const st = await readState(jobId);
      if (st) {
        st.status = "failed";
        st.finished_at = nowIso();
        st.last_error = String(e?.message ?? e);
        st.recent_errors.unshift({ at: nowIso(), message: st.last_error });
        st.recent_errors = st.recent_errors.slice(0, 50);
        await writeState(jobId, st);
      }
    })
    .finally(() => {
      // Clean up running map when job completes
      running.delete(jobId);
    });

    running.set(jobId, p);
    return { job_id: jobId, model };
  } catch (error: any) {
    // Re-throw with more context
    throw new Error(
      `Failed to start audit job: ${error?.message ?? String(error)}. ` +
      `Provider: ${AUDIT_PROVIDER}, Check your configuration.`
    );
  }
}

export async function stopAuditJob(jobId: string) {
  const st = await readState(jobId);
  if (!st) {
    throw new Error(`Job ${jobId} not found`);
  }

  if (st.status === "stopped" || st.status === "completed" || st.status === "failed") {
    return; // Already stopped/completed
  }

  st.stop_requested = true;
  st.status = "stopped";
  st.finished_at = nowIso();
  await writeState(jobId, st);
}

export async function getAuditState(jobId: string) {
  return await readState(jobId);
}

export function getRunningJobIds(): string[] {
  return Array.from(running.keys());
}

async function runJob(jobId: string) {
  let st = await readState(jobId);
  if (!st) throw new Error("Job state not found");

  st.status = "running";
  st.started_at = nowIso();
  await writeState(jobId, st);

  const maxChats = st.max_chats;

  const maxMessages = envNum("AUDIT_MAX_MESSAGES", 80);
  const maxChars = envNum("AUDIT_MAX_CHARS_PER_MSG", 800);
  const temperature = Number((process.env.AUDIT_TEMPERATURE ?? "0.1").trim());
  const maxTokens = envNum("AUDIT_MAX_TOKENS", 900);

  // newest N requests only
  const ids = await fetchLatestRequestIds(maxChats);

  st.total_estimate = ids.length;
  await writeState(jobId, st);

  // Batch state updates - only write every N items or on critical events
  const STATE_WRITE_INTERVAL = 10; // Write state every 10 items
  let lastStateWrite = 0;

  for (const rid of ids) {
    if (await isStopRequested(jobId)) break;

    const request_id = String(rid);

    try {
      // Refresh state before long operations
      st = await readState(jobId) ?? st;
      if (await isStopRequested(jobId)) {
        break;
      }

      const { transcript } = await fetchTranscript(rid, maxMessages, maxChars);

      // Check again after fetching transcript
      if (await isStopRequested(jobId)) {
        break;
      }

      if (transcript.length === 0) {
        // Read fresh state before updating
        st = await readState(jobId) ?? st;
        st.processed += 1;
        st.failed += 1;

        await appendNdjson(jobId, {
          request_id,
          audited_at: nowIso(),
          model: st.model,
          ok: false,
          error: "Empty transcript",
        });

        // Batch state writes
        if (st.processed - lastStateWrite >= STATE_WRITE_INTERVAL) {
          await writeState(jobId, st);
          lastStateWrite = st.processed;
        }
        continue;
      }

      // Check for stop request before the expensive API call
      if (await isStopRequested(jobId)) {
        break;
      }

      const audit = await callAuditModel({
        model: st.model,
        request_id,
        transcript,
        temperature: Number.isFinite(temperature) ? temperature : 0.1,
        maxOutputTokens: maxTokens,
      });

      // Check for stop request after API call (in case it was requested during the call)
      if (await isStopRequested(jobId)) {
        break;
      }

      // Read fresh state before updating to avoid overwriting stop_requested
      st = await readState(jobId) ?? st;
      st.processed += 1;
      st.success += 1;

      await appendNdjson(jobId, {
        request_id,
        audited_at: nowIso(),
        model: st.model,
        ok: true,
        audit,
      });

      // Batch state writes
      if (st.processed - lastStateWrite >= STATE_WRITE_INTERVAL) {
        await writeState(jobId, st);
        lastStateWrite = st.processed;
      }
    } catch (e: any) {
      // Check for stop request even on error
      if (await isStopRequested(jobId)) {
        break;
      }

      // Read fresh state before updating to avoid overwriting stop_requested
      st = await readState(jobId) ?? st;
      st.processed += 1;
      st.failed += 1;

      const msg = String(e?.message ?? e);
      st.last_error = msg;
      st.recent_errors.unshift({ at: nowIso(), request_id, message: msg });
      st.recent_errors = st.recent_errors.slice(0, 50);

      await appendNdjson(jobId, {
        request_id,
        audited_at: nowIso(),
        model: st.model,
        ok: false,
        error: msg,
      });

      // Always write state on errors to capture them immediately
      await writeState(jobId, st);
      lastStateWrite = st.processed;

      // Gemini quota/rate-limit backoff: respect retryDelay if present
      const msgLower = msg.toLowerCase();

      // Try to extract "retryDelay":"26s"
      let waitMs: number | null = null;

      const retryDelayMatch = msg.match(/"retryDelay"\s*:\s*"(\d+)s"/);
      if (retryDelayMatch?.[1]) {
        waitMs = (Number(retryDelayMatch[1]) + 1) * 1000; // +1s buffer
      }

      // Or extract "Please retry in 26.8647s"
      if (waitMs == null) {
        const retryInMatch = msg.match(/Please retry in\s+([\d.]+)s/i);
        if (retryInMatch?.[1]) {
          waitMs = (Math.ceil(Number(retryInMatch[1])) + 1) * 1000; // round up + buffer
        }
      }

      // Fallback: any 429/quota/rate → 30s
      if (waitMs == null && (msg.includes("429") || msgLower.includes("quota") || msgLower.includes("resource_exhausted"))) {
        waitMs = 30_000;
      }

      if (waitMs != null) {
        await sleep(waitMs);
      }
    }
  }

  // Final state write to ensure all updates are persisted
  st = await readState(jobId) ?? st;
  if (st) {
    await writeState(jobId, st);
  }

  // If stopped, don't build excel
  if (await isStopRequested(jobId)) {
    st = (await readState(jobId)) ?? st;
    if (st) {
      st.status = "stopped";
      st.finished_at = nowIso();
      await writeState(jobId, st);
    }
    return;
  }

  // Build Excel
  await buildExcel(jobId);

  st = (await readState(jobId)) ?? st;
  if (st) {
    st.status = "completed";
    st.finished_at = nowIso();
    st.files.xlsx = xlsxPath(jobId);
    await writeState(jobId, st);
  }
}

async function buildExcel(jobId: string) {
  const out = xlsxPath(jobId);

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ 
    filename: out,
    useStyles: false, // Faster without styles
    useSharedStrings: false // Faster without shared strings
  });
  const wsSummary = workbook.addWorksheet("Summary");
  const ws = workbook.addWorksheet("Audits");

  const st = await readState(jobId);

  wsSummary.addRow(["job_id", jobId]).commit();
  if (st) {
    wsSummary.addRow(["model", st.model]).commit();
    wsSummary.addRow(["status", st.status]).commit();
    wsSummary.addRow(["created_at", st.created_at]).commit();
    wsSummary.addRow(["started_at", st.started_at ?? ""]).commit();
    wsSummary.addRow(["finished_at", st.finished_at ?? ""]).commit();
    wsSummary.addRow(["processed", st.processed]).commit();
    wsSummary.addRow(["success", st.success]).commit();
    wsSummary.addRow(["failed", st.failed]).commit();
  }

  ws.addRow([
    "request_id",
    "audited_at",
    "model",
    "ok",
    "score_total",
    "risk_level",
    "sentiment",
    "category",
    "summary",
    "checks_count",
    "error",
  ]).commit();

  const input = ndjsonPath(jobId);
  if (!fs.existsSync(input)) {
    throw new Error(`Missing results.ndjson at ${input}`);
  }

  // Use streaming readline for better memory efficiency
  const fileStream = fs.createReadStream(input, { 
    encoding: "utf8",
    highWaterMark: 64 * 1024 // 64KB chunks for better performance
  });

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let rowCount = 0;
  const BATCH_SIZE = 100; // Commit rows in batches for better performance

  for await (const line of rl) {
    const s = line.trim();
    if (!s) continue;

    let obj: any;
    try {
      obj = JSON.parse(s);
    } catch (e) {
      // Log parse errors but continue
      console.warn(`Failed to parse line in ${jobId}: ${String(e)}`);
      continue;
    }

    const audit = obj.audit ?? null;
    ws.addRow([
      String(obj.request_id ?? ""),
      String(obj.audited_at ?? ""),
      String(obj.model ?? ""),
      obj.ok ? "true" : "false",
      audit?.scores?.total ?? "",
      String(audit?.risk_level ?? ""),
      String(audit?.sentiment ?? ""),
      String(audit?.category ?? ""),
      String(audit?.summary ?? "").slice(0, 500), // Truncate long summaries
      Array.isArray(audit?.checks) ? audit.checks.length : "",
      String(obj.error ?? "").slice(0, 500), // Truncate long errors
    ]).commit();

    rowCount++;
    // Periodic commit for very large files
    if (rowCount % BATCH_SIZE === 0) {
      await new Promise(resolve => setImmediate(resolve)); // Yield to event loop
    }
  }

  wsSummary.commit();
  ws.commit();
  await workbook.commit();
}
