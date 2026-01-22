import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

export type AuditJobStatus = "queued" | "running" | "stopped" | "completed" | "failed";

export type AuditJobState = {
  job_id: string;
  status: AuditJobStatus;

  created_at: string;
  started_at?: string;
  finished_at?: string;
  stop_requested?: boolean;


  model: string;
  max_chats: number;

  processed: number;
  success: number;
  failed: number;

  total_estimate?: number;
  cursor_last_id?: string;

  last_error?: string;
  recent_errors: Array<{ at: string; request_id?: string; message: string }>;

  files: {
    ndjson: string;
    xlsx?: string;
  };
};

function runsRoot(): string {
  return path.join(process.cwd(), ".audit_runs");
}

export async function ensureRunsRoot() {
  await fsp.mkdir(runsRoot(), { recursive: true });
}

export function jobDir(jobId: string) {
  return path.join(runsRoot(), jobId);
}

export function statePath(jobId: string) {
  return path.join(jobDir(jobId), "state.json");
}

export function ndjsonPath(jobId: string) {
  return path.join(jobDir(jobId), "results.ndjson");
}

export function xlsxPath(jobId: string) {
  return path.join(jobDir(jobId), "audit.xlsx");
}

export async function initJobFiles(jobId: string) {
  await ensureRunsRoot();
  await fsp.mkdir(jobDir(jobId), { recursive: true });
  // Ensure ndjson exists
  const p = ndjsonPath(jobId);
  if (!fs.existsSync(p)) await fsp.writeFile(p, "", "utf8");
}

export async function writeState(jobId: string, state: AuditJobState) {
  // Ensure the job directory exists before writing
  await ensureRunsRoot();
  await fsp.mkdir(jobDir(jobId), { recursive: true });
  
  const p = statePath(jobId);
  const tmp = `${p}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
  await fsp.rename(tmp, p);
}

export async function readState(jobId: string): Promise<AuditJobState | null> {
  try {
    const txt = await fsp.readFile(statePath(jobId), "utf8");
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

export async function appendNdjson(jobId: string, obj: any) {
  await fsp.appendFile(ndjsonPath(jobId), JSON.stringify(obj) + "\n", "utf8");
}

export async function readNdjsonTail(jobId: string, maxLines: number) {
  // simple tail: read whole file if small, else read last ~200KB
  const p = ndjsonPath(jobId);
  const stat = await fsp.stat(p);
  const chunkSize = 200_000;
  const start = Math.max(0, stat.size - chunkSize);
  const fd = await fsp.open(p, "r");
  try {
    const buf = Buffer.alloc(stat.size - start);
    await fd.read(buf, 0, buf.length, start);
    const text = buf.toString("utf8");
    const lines = text.trim().split("\n").filter(Boolean);
    const tail = lines.slice(-maxLines);
    return tail.map((l) => {
      try { return JSON.parse(l); } catch { return { raw: l, parse_error: true }; }
    });
  } finally {
    await fd.close();
  }
}
