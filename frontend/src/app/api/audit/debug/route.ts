import { checkOllamaHealth } from "@/lib/ollamaClient";
import { checkTogetherHealth } from "@/lib/togetherClient";

export const runtime = "nodejs";

export async function GET() {
  const provider = process.env.AUDIT_PROVIDER || "ollama";

  const diagnostics: any = {
    timestamp: new Date().toISOString(),
    provider,
  };

  try {
    // Check environment variables
    diagnostics.env = {
      AUDIT_PROVIDER: provider,
      // Ollama
      OLLAMA_URL: process.env.OLLAMA_URL || "not set (defaults to http://localhost:11434)",
      OLLAMA_MODEL: process.env.OLLAMA_MODEL || "not set (defaults to llama3.2:3b)",
      // Together AI
      TOGETHER_API_KEY: process.env.TOGETHER_API_KEY ? "set" : "not set",
      TOGETHER_MODEL: process.env.TOGETHER_MODEL || "not set (defaults to meta-llama/Llama-3.1-8B-Instruct-Turbo)",
      // Replicate
      REPLICATE_API_TOKEN: process.env.REPLICATE_API_TOKEN ? "set" : "not set",
      // OpenRouter
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ? "set" : "not set",
      // Gemini
      GEMINI_API_KEY: process.env.GEMINI_API_KEY ? "set" : "not set",
      GOOGLE_API_KEY: process.env.GOOGLE_API_KEY ? "set" : "not set",
    };

    // Check provider health
    if (provider === "ollama") {
      try {
        const health = await checkOllamaHealth();
        diagnostics.ollama = health;
      } catch (error: any) {
        diagnostics.ollama = {
          available: false,
          error: error?.message ?? String(error),
        };
      }
    } else if (provider === "together") {
      try {
        const health = await checkTogetherHealth();
        diagnostics.together = health;
      } catch (error: any) {
        diagnostics.together = {
          available: false,
          error: error?.message ?? String(error),
        };
      }
    } else if (provider === "gemini") {
      const hasKey = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
      diagnostics.gemini = {
        configured: hasKey,
        error: hasKey ? undefined : "API key not set",
      };
    }

    return Response.json(diagnostics);
  } catch (error: any) {
    return Response.json(
      {
        ...diagnostics,
        error: error?.message ?? "Unknown error",
        stack: process.env.NODE_ENV === "development" ? error?.stack : undefined,
      },
      { status: 500 }
    );
  }
}
