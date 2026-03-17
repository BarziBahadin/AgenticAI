import { startAuditJob } from "@/lib/auditRunner";

export const runtime = "nodejs";

export async function POST() {
  try {
    const job = await startAuditJob();
    return Response.json(job);
  } catch (error: any) {
    console.error("Failed to start audit job:", error);
    const errorMessage = error?.message ?? "Failed to start audit job";
    const errorStack = process.env.NODE_ENV === "development" ? error?.stack : undefined;
    
    return Response.json(
      { 
        error: errorMessage,
        stack: errorStack,
        details: error?.cause ? String(error.cause) : undefined
      },
      { status: 500 }
    );
  }
}
