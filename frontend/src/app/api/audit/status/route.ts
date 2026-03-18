import { readNdjsonTail, readState } from "@/lib/auditStorage";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const job_id = url.searchParams.get("job_id");
    if (!job_id) {
      return Response.json({ error: "Missing job_id" }, { status: 400 });
    }

    const state = await readState(job_id);
    if (!state) {
      return Response.json({ error: "Job not found" }, { status: 404 });
    }

    const tail = await readNdjsonTail(job_id, 30);
    return Response.json({ state, tail });
  } catch (error: any) {
    return Response.json(
      { error: error?.message ?? "Failed to get job status" },
      { status: 500 }
    );
  }
}
