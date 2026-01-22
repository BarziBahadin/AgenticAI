import { readState, writeState } from "@/lib/auditStorage";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const job_id = String(body?.job_id ?? "");
  if (!job_id) return new Response("Missing job_id", { status: 400 });

  const st = await readState(job_id);
  if (!st) return new Response("Job not found", { status: 404 });

  // Persistent stop request (works across hot reload / multiple instances)
  st.stop_requested = true;
  st.status = "stopped";
  st.finished_at = new Date().toISOString();

  await writeState(job_id, st);
  return Response.json({ ok: true });
}
