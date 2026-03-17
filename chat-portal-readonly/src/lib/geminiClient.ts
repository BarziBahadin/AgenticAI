import "server-only";
import { GoogleGenAI } from "@google/genai";

export type ChatRole = "customer" | "agent";

export type RiskLevel = "low" | "medium" | "high";
export type AuditStatus = "pass" | "fail" | "warning";
export type Sentiment = "positive" | "neutral" | "negative";

export type CoachingType = "behavior" | "process" | "language";

export interface TranscriptMessage {
  index: number; // numeric, strictly increasing; used as evidence pointers
  role: ChatRole;
  text: string;
  ts?: string; // optional ISO timestamp
}

export interface SlaThresholds {
  frt_seconds: number;
  wait_gap_seconds: number;
}

export interface AuditInput {
  chat_id: string | number;
  language?: string; // default: "ar"
  sla_thresholds: SlaThresholds;
  transcript: TranscriptMessage[];
}

export interface AuditOutput {
  summary: string;
  scores: {
    total: number;
    compliance: number;
    quality: number;
    resolution: number;
    sla: number;
  };
  risk_level: RiskLevel;
  sentiment: Sentiment;
  category: string;
  checks: Array<{
    id: string;
    status: AuditStatus;
    severity: RiskLevel;
    evidence: {
      message_index: number;
      reason: string;
    };
  }>;
  coaching: Array<{
    type: CoachingType;
    text: string;
  }>;
}

export interface GenerateAuditOptions {
  /** Preferred model; if not available, we fallback automatically */
  model?: string;
  /** Low temperature for deterministic audits */
  temperature?: number; // default 0.1
  /** Output token cap */
  maxOutputTokens?: number; // default 2048
  /** If true, we try to query available models via REST before fallback */
  tryModelDiscovery?: boolean; // default false
}

/**
 * IMPORTANT: Use env vars, don't hardcode keys.
 * Supported:
 *  - GEMINI_API_KEY (recommended)
 *  - GOOGLE_API_KEY (also supported by SDK docs)
 */
function getGeminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    throw new Error(
      "Missing Gemini API key. Set GEMINI_API_KEY (preferred) or GOOGLE_API_KEY in your environment."
    );
  }
  return key;
}

/**
 * Canonical system instruction for deterministic structured audit JSON.
 * (Embedded from your spec; do not weaken.)
 */
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
  "Statuses: pass | fail | warning."
].join("\n");

/**
 * JSON schema for the REQUIRED OUTPUT (STRICT).
 * Includes propertyOrdering (useful for Gemini 2.0 structured output).
 */
const auditJsonSchema: Record<string, any> = {
  type: "object",
  additionalProperties: false,
  propertyOrdering: [
    "summary",
    "scores",
    "risk_level",
    "sentiment",
    "category",
    "checks",
    "coaching"
  ],
  required: ["summary", "scores", "risk_level", "sentiment", "category", "checks", "coaching"],
  properties: {
    summary: { type: "string" },
    scores: {
      type: "object",
      additionalProperties: false,
      propertyOrdering: ["total", "compliance", "quality", "resolution", "sla"],
      required: ["total", "compliance", "quality", "resolution", "sla"],
      properties: {
        total: { type: "integer", minimum: 0, maximum: 100 },
        compliance: { type: "integer", minimum: 0, maximum: 100 },
        quality: { type: "integer", minimum: 0, maximum: 100 },
        resolution: { type: "integer", minimum: 0, maximum: 100 },
        sla: { type: "integer", minimum: 0, maximum: 100 }
      }
    },
    risk_level: { type: "string", enum: ["low", "medium", "high"] },
    sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
    category: { type: "string" },
    checks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        propertyOrdering: ["id", "status", "severity", "evidence"],
        required: ["id", "status", "severity", "evidence"],
        properties: {
          id: { type: "string" },
          status: { type: "string", enum: ["pass", "fail", "warning"] },
          severity: { type: "string", enum: ["low", "medium", "high"] },
          evidence: {
            type: "object",
            additionalProperties: false,
            propertyOrdering: ["message_index", "reason"],
            required: ["message_index", "reason"],
            properties: {
              message_index: { type: "integer", minimum: 1 },
              reason: { type: "string" }
            }
          }
        }
      }
    },
    coaching: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        propertyOrdering: ["type", "text"],
        required: ["type", "text"],
        properties: {
          type: { type: "string", enum: ["behavior", "process", "language"] },
          text: { type: "string" }
        }
      }
    }
  }
};

function clampInt0to100(n: unknown): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 100) return 100;
  return Math.trunc(x);
}

export function validateAuditOutput(out: any, transcript: TranscriptMessage[]): AuditOutput {
  if (!out || typeof out !== "object") throw new Error("Gemini audit output is not an object.");

  // Basic required fields
  for (const k of ["summary", "scores", "risk_level", "sentiment", "category", "checks", "coaching"]) {
    if (!(k in out)) throw new Error(`Gemini audit output missing required key: ${k}`);
  }

  // Score ranges
  out.scores.total = clampInt0to100(out.scores.total);
  out.scores.compliance = clampInt0to100(out.scores.compliance);
  out.scores.quality = clampInt0to100(out.scores.quality);
  out.scores.resolution = clampInt0to100(out.scores.resolution);
  out.scores.sla = clampInt0to100(out.scores.sla);

  // Evidence index correctness (must exist in transcript indices)
  const validIdx = new Set(transcript.map((m) => m.index));
  if (Array.isArray(out.checks)) {
    for (const c of out.checks) {
      const mi = c?.evidence?.message_index;
      if (typeof mi !== "number" || !validIdx.has(mi)) {
        throw new Error(
          `Invalid evidence.message_index=${String(mi)}. Must match one of transcript indices.`
        );
      }
    }
  } else {
    throw new Error("checks must be an array.");
  }

  return out as AuditOutput;
}

/**
 * Optional: discover available models via REST models.list, then pick best match.
 * If it fails (network/permissions), we fallback safely.
 */
async function listModels(apiKey: string): Promise<string[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
    apiKey
  )}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini models.list failed: ${res.status} ${body}`);
  }
  const json: any = await res.json();
  const models: any[] = Array.isArray(json?.models) ? json.models : [];
  return models
    .map((m) => String(m?.name || "").replace(/^models\//, ""))
    .filter(Boolean);
}

async function pickModel(
  apiKey: string,
  preferred?: string,
  tryDiscovery?: boolean
): Promise<string> {
  if (preferred) return preferred;

  // Good default for speed/cost; structured output works (we provide propertyOrdering).
  const fallbackOrder = [
    process.env.GEMINI_MODEL, // allow env override
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite"
  ].filter(Boolean) as string[];

  if (!tryDiscovery) return fallbackOrder[0] || "gemini-2.0-flash";

  try {
    const available = new Set(await listModels(apiKey));
    for (const m of fallbackOrder) {
      if (available.has(m)) return m;
    }
  } catch {
    // ignore and fallback
  }
  return fallbackOrder[0] || "gemini-2.0-flash";
}

function safeJsonParse(text: string): any {
  // Ideal: structured output returns pure JSON. Still, be defensive.
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
      `Failed to parse Gemini response as JSON. Response preview: ${preview}`
    );
  }
}

/**
 * Main API you’ll call from your Next.js route/server action.
 */
export async function generateChatAudit(
  input: AuditInput,
  opts: GenerateAuditOptions = {}
): Promise<AuditOutput> {
  const apiKey = getGeminiApiKey();
  const model = await pickModel(apiKey, opts.model, opts.tryModelDiscovery);

  const ai = new GoogleGenAI({
    apiKey,
    apiVersion: process.env.GEMINI_API_VERSION // optional; e.g., "v1"
  });

  const payload = {
    chat_id: String(input.chat_id),
    language: input.language ?? "ar",
    sla_thresholds: input.sla_thresholds,
    transcript: input.transcript
  };

  const temperature = opts.temperature ?? 0.1;
  const maxOutputTokens = opts.maxOutputTokens ?? 2048;

  const response = await ai.models.generateContent({
    model,
    contents: JSON.stringify(payload, null, 2),
    config: {
      systemInstruction: AUDIT_SYSTEM_INSTRUCTION,
      temperature,
      maxOutputTokens,
      responseMimeType: "application/json",
      responseJsonSchema: auditJsonSchema
    }
  });

  if (!response) {
    throw new Error("Gemini API returned no response.");
  }

  // Check for errors in response
  if ((response as any).error) {
    throw new Error(`Gemini API error: ${JSON.stringify((response as any).error)}`);
  }

  // Handle different possible response structures
  const responseText = response.text || (response as any).response?.text || (response as any).candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!responseText) {
    throw new Error(
      `Gemini API response missing text content. Response structure: ${JSON.stringify(Object.keys(response || {}))}`
    );
  }

  const out = safeJsonParse(responseText);
  return validateAuditOutput(out, input.transcript);
}
