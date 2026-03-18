import { checkOllamaHealth } from "@/lib/ollamaClient";
import { checkTogetherHealth } from "@/lib/togetherClient";

export const runtime = "nodejs";

export async function GET() {
  const provider = (process.env.AUDIT_PROVIDER || "ollama").toLowerCase();

  try {
    if (provider === "together") {
      const health = await checkTogetherHealth();
      return Response.json(
        health.available
          ? { status: "ok", provider, model: health.model, message: "Together AI is ready" }
          : { status: "error", provider, error: health.error, message: "Together AI is not available" },
        { status: health.available ? 200 : 503 }
      );
    }

    if (provider === "gemini") {
      const hasKey = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
      return Response.json(
        hasKey
          ? { status: "ok", provider, message: "Gemini API key is set" }
          : { status: "error", provider, error: "API key not set", message: "Gemini is not configured" },
        { status: hasKey ? 200 : 503 }
      );
    }

    // default: ollama
    const health = await checkOllamaHealth();
    return Response.json(
      health.available
        ? { status: "ok", provider, model: health.model, message: "Ollama is ready" }
        : { status: "error", provider, error: health.error, message: "Ollama is not available" },
      { status: health.available ? 200 : 503 }
    );
  } catch (error: any) {
    return Response.json(
      { status: "error", provider, error: error?.message ?? "Unknown error", message: "Health check failed" },
      { status: 500 }
    );
  }
}
