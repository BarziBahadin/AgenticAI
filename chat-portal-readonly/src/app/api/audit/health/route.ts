import { checkOllamaHealth } from "@/lib/ollamaClient";

export const runtime = "nodejs";

export async function GET() {
  try {
    const health = await checkOllamaHealth();
    if (health.available) {
      return Response.json({
        status: "ok",
        provider: "ollama",
        model: health.model,
        message: "Ollama is ready"
      });
    } else {
      return Response.json({
        status: "error",
        provider: "ollama",
        error: health.error,
        message: "Ollama is not available"
      }, { status: 503 });
    }
  } catch (error: any) {
    return Response.json({
      status: "error",
      provider: "ollama",
      error: error?.message ?? "Unknown error",
      message: "Failed to check Ollama health"
    }, { status: 500 });
  }
}
