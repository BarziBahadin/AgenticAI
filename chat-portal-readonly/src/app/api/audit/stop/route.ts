import { stopAuditJob } from "@/lib/auditRunner";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const job_id = String(body?.job_id ?? "");
    if (!job_id) {
      return Response.json({ error: "Missing job_id" }, { status: 400 });
    }

    await stopAuditJob(job_id);
    return Response.json({ ok: true });
  } catch (error: any) {
    const status = error?.message?.includes("not found") ? 404 : 500;
    return Response.json(
      { error: error?.message ?? "Failed to stop audit job" },
      { status }
    );
  }
}
