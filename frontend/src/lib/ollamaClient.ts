import "server-only";
import { AuditInput, AuditOutput, validateAuditOutput } from "./geminiClient";

// Re-export types for compatibility
export type { AuditInput, AuditOutput } from "./geminiClient";

export interface GenerateAuditOptions {
  /** Ollama model name (default from env or "llama3.2:3b") */
  model?: string;
  /** Low temperature for deterministic audits */
  temperature?: number; // default 0.1
  /** Output token cap */
  maxOutputTokens?: number; // default 2048
}

const AUDIT_SYSTEM_INSTRUCTION = [
  "You are an AI Audit Engine.",
  "",
  "You MUST:",
  "- Analyze the chat transcript strictly in order.",
  "- Reference messages ONLY by their numeric index.",
  "- NEVER invent messages.",
  "- NEVER include PII.",
  "- Output VALID JSON only.",
  "- Follow the audit_json schema exactly.",
  "",
  "Scoring range: 0–100.",
  "Risk levels: low | medium | high.",
  "Statuses: pass | fail | warning.",
  "",
  "Output ONLY valid JSON, no markdown, no code blocks, no explanations."
].join("\n");

// JSON schema as a prompt (since Ollama doesn't support structured output like Gemini)
const JSON_SCHEMA_PROMPT = `
You must output a JSON object with this exact structure:
{
  "summary": "string",
  "scores": {
    "total": 0-100,
    "compliance": 0-100,
    "quality": 0-100,
    "resolution": 0-100,
    "sla": 0-100
  },
  "risk_level": "low" | "medium" | "high",
  "sentiment": "positive" | "neutral" | "negative",
  "category": "string",
  "checks": [
    {
      "id": "string",
      "status": "pass" | "fail" | "warning",
      "severity": "low" | "medium" | "high",
      "evidence": {
        "message_index": number,
        "reason": "string"
      }
    }
  ],
  "coaching": [
    {
      "type": "behavior" | "process" | "language",
      "text": "string"
    }
  ]
}
`;

function getOllamaUrl(): string {
  return process.env.OLLAMA_URL || "http://localhost:11434";
}

function getOllamaModel(): string {
  return process.env.OLLAMA_MODEL || "llama3.2:3b";
}

const MAX_CONCURRENT_REQUESTS = Number(process.env.OLLAMA_MAX_CONCURRENT ?? "1");
const REQUEST_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? "120000"); // 2 minutes
let activeRequests = 0;

async function withResourceLimit<T>(fn: () => Promise<T>): Promise<T> {
  while (activeRequests >= MAX_CONCURRENT_REQUESTS) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  activeRequests++;
  try {
    return await Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error("Ollama request timeout")), REQUEST_TIMEOUT_MS)
      )
    ]);
  } finally {
    activeRequests--;
  }
}

function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch (e) {
    // Try to extract JSON from the end of the text
    const endMatch = text.match(/\{[\s\S]*\}$/);
    if (endMatch) {
      try {
        return JSON.parse(endMatch[0]);
      } catch {}
    }
    
    // Try to find any JSON object in the text
    const anyMatch = text.match(/\{[\s\S]*\}/);
    if (anyMatch) {
      try {
        return JSON.parse(anyMatch[0]);
      } catch {}
    }
    
    // Try trimming whitespace and markdown code blocks
    const trimmed = text.trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    
    if (trimmed !== text) {
      try {
        return JSON.parse(trimmed);
      } catch {}
    }
    
    // Log a preview of the response for debugging
    const preview = text.length > 500 ? text.slice(0, 500) + "..." : text;
    throw new Error(
      `Failed to parse Ollama response as JSON. Response preview: ${preview}`
    );
  }
}

/**
 * Check if Ollama is available and the model is ready
 */
export async function checkOllamaHealth(): Promise<{ available: boolean; model?: string; error?: string }> {
  try {
    const url = getOllamaUrl();
    const model = getOllamaModel();
    
    // Check if Ollama is running
    const healthRes = await fetch(`${url}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(5000) // 5 second timeout
    });
    
    if (!healthRes.ok) {
      return { available: false, error: `Ollama not responding: ${healthRes.status}` };
    }

    // Check if model exists
    const tags = await healthRes.json();
    const models = tags.models || [];
    const modelExists = models.some((m: any) => m.name === model || m.name.startsWith(model));
    
    if (!modelExists) {
      return { 
        available: false, 
        model,
        error: `Model ${model} not found. Available models: ${models.map((m: any) => m.name).join(", ")}` 
      };
    }

    return { available: true, model };
  } catch (error: any) {
    return { 
      available: false, 
      error: `Ollama health check failed: ${error?.message ?? String(error)}` 
    };
  }
}

/**
 * Generate chat audit using Ollama
 */
export async function generateChatAudit(
  input: AuditInput,
  opts: GenerateAuditOptions = {}
): Promise<AuditOutput> {
  return withResourceLimit(async () => {
    const url = getOllamaUrl();
    const model = opts.model || getOllamaModel();
    const temperature = opts.temperature ?? 0.1;
    const maxTokens = opts.maxOutputTokens ?? 2048;

    const payload = {
      chat_id: String(input.chat_id),
      language: input.language ?? "ar",
      sla_thresholds: input.sla_thresholds,
      transcript: input.transcript
    };

    // Build the prompt
    const prompt = `${AUDIT_SYSTEM_INSTRUCTION}

${JSON_SCHEMA_PROMPT}

Chat Data:
${JSON.stringify(payload, null, 2)}

Analyze this chat transcript and provide the audit JSON response. Output ONLY the JSON object, no other text.`;

    try {
      const response = await fetch(`${url}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          prompt,
          stream: false, // Non-streaming for simplicity
          options: {
            temperature,
            num_predict: maxTokens,
            // M1 MacBook Air optimizations
            num_ctx: 4096, // Context window (reduce if OOM)
            num_gpu: -1, // Use GPU if available (Metal on M1)
            num_thread: 4, // CPU threads (adjust based on your system)
            // Memory management
            low_vram: true, // Helpful for M1 with limited RAM
          },
          format: "json", // Request JSON format (if model supports it)
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(`Ollama API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      
      // Ollama returns response in 'response' field
      const responseText = data.response || data.text || "";
      
      if (!responseText) {
        throw new Error("Ollama returned empty response");
      }

      const out = safeJsonParse(responseText);
      return validateAuditOutput(out, input.transcript);
    } catch (error: any) {
      if (error.name === "AbortError" || error.message.includes("timeout")) {
        throw new Error(`Ollama request timed out after ${REQUEST_TIMEOUT_MS}ms`);
      }
      throw error;
    }
  });
}
