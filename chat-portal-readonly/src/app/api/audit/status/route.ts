import { readNdjsonTail, readState } from "@/lib/auditStorage";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const job_id = url.searchParams.get("job_id");
  if (!job_id) return new Response("Missing job_id", { status: 400 });

  const state = await readState(job_id);
  if (!state) return new Response("Job not found", { status: 404 });

  const tail = await readNdjsonTail(job_id, 30);
  return Response.json({ state, tail });
}
