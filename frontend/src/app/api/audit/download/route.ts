import { readState, xlsxPath } from "@/lib/auditStorage";
import fs from "node:fs";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const job_id = url.searchParams.get("job_id");
  if (!job_id) return new Response("Missing job_id", { status: 400 });

  const st = await readState(job_id);
  if (!st?.files?.xlsx) return new Response("Excel not ready", { status: 409 });

  const p = xlsxPath(job_id);
  if (!fs.existsSync(p)) return new Response("File missing", { status: 404 });

  const stream = fs.createReadStream(p);

  return new Response(stream as any, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="audit_${job_id}.xlsx"`,
    },
  });
}
