import { startAuditJob } from "@/lib/auditRunner";

export const runtime = "nodejs";

export async function POST() {
  const job = await startAuditJob();
  return Response.json(job);
}
