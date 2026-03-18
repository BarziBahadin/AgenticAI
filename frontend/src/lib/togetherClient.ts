import "server-only";
import { AuditInput, AuditOutput, validateAuditOutput } from "./geminiClient";

// Re-export types for compatibility
export type { AuditInput, AuditOutput } from "./geminiClient";

export interface GenerateAuditOptions {
  /** Together AI model name (default from env or "meta-llama/Llama-3.1-8B-Instruct-Turbo") */
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

// JSON schema as a prompt (Together AI doesn't support structured output like Gemini)
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

function getTogetherApiKey(): string {
  const key = process.env.TOGETHER_API_KEY;
  if (!key) {
    throw new Error(
      "Missing Together AI API key. Set TOGETHER_API_KEY in your environment. " +
      "Get your key at: https://together.ai"
    );
  }
  return key;
}

function getTogetherModel(): string {
  return process.env.TOGETHER_MODEL || "meta-llama/Llama-3.1-8B-Instruct-Turbo";
}

const MAX_CONCURRENT_REQUESTS = Number(process.env.TOGETHER_MAX_CONCURRENT ?? "2");
const REQUEST_TIMEOUT_MS = Number(process.env.TOGETHER_TIMEOUT_MS ?? "120000"); // 2 minutes
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
        setTimeout(() => reject(new Error("Together AI request timeout")), REQUEST_TIMEOUT_MS)
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
      `Failed to parse Together AI response as JSON. Response preview: ${preview}`
    );
  }
}

/**
 * Check if Together AI is available
 */
export async function checkTogetherHealth(): Promise<{ available: boolean; model?: string; error?: string }> {
  try {
    const apiKey = getTogetherApiKey();
    const model = getTogetherModel();

    // Check if the API key works by making a small test request
    const response = await fetch("https://api.together.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "test" }],
        max_tokens: 1, // Very small test
        stream: false,
      }),
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return {
        available: false,
        model,
        error: `Together AI API error (${response.status}): ${errorText}`
      };
    }

    return { available: true, model };
  } catch (error: any) {
    return {
      available: false,
      error: `Together AI health check failed: ${error?.message ?? String(error)}`
    };
  }
}

/**
 * Generate chat audit using Together AI
 */
export async function generateChatAudit(
  input: AuditInput,
  opts: GenerateAuditOptions = {}
): Promise<AuditOutput> {
  return withResourceLimit(async () => {
    const apiKey = getTogetherApiKey();
    const model = opts.model || getTogetherModel();
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
      const response = await fetch("https://api.together.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: "You are a helpful AI assistant. Always respond with valid JSON when requested."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          max_tokens: maxTokens,
          temperature,
          stream: false,
          // Together AI specific parameters
          top_p: 0.9,
          top_k: 50,
          repetition_penalty: 1.1,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(`Together AI API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();

      // Together AI returns response in choices[0].message.content
      const responseText = data.choices?.[0]?.message?.content || "";

      if (!responseText) {
        throw new Error("Together AI returned empty response");
      }

      const out = safeJsonParse(responseText);
      return validateAuditOutput(out, input.transcript);
    } catch (error: any) {
      if (error.name === "AbortError" || error.message.includes("timeout")) {
        throw new Error(`Together AI request timed out after ${REQUEST_TIMEOUT_MS}ms`);
      }
      throw error;
    }
  });
}
