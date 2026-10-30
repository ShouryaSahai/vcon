import { z } from "zod";

import type { KitRule } from "@/lib/db-types";

import type { FindingSeed } from "./deterministic";

/** Rule types judged by the model rather than deterministic code. */
export const AI_RULE_TYPES = ["approved_claim", "tone_guideline", "custom"] as const;

const aiFindingSchema = z.object({
  rule_ref: z.string().min(1),
  title: z.string().min(1),
  explanation: z.string().min(1),
  severity: z.enum(["low", "medium", "high"]),
  confidence: z.number().min(0).max(1),
  suggested_fix: z.string().min(1),
  location_hint: z.string().optional(),
});

const aiOutputSchema = z.object({
  findings: z.array(aiFindingSchema),
});

/** JSON schema mirroring aiOutputSchema, for Gemini responseSchema. */
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    findings: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          rule_ref: { type: "STRING" },
          title: { type: "STRING" },
          explanation: { type: "STRING" },
          severity: { type: "STRING", enum: ["low", "medium", "high"] },
          confidence: { type: "NUMBER" },
          suggested_fix: { type: "STRING" },
          location_hint: { type: "STRING" },
        },
        required: ["rule_ref", "title", "explanation", "severity", "confidence", "suggested_fix"],
      },
    },
  },
  required: ["findings"],
};

export type AiCaller = (input: { system: string; prompt: string }) => Promise<unknown>;

function cleanJsonText(raw: string): string {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

function buildNvidiaCaller(rawKey: string): AiCaller {
  const apiKey = rawKey.trim();
  const isNebius = Boolean(process.env.NEBIUS_API_KEY && !process.env.NVIDIA_API_KEY);
  const endpoint = isNebius
    ? "https://api.tokenfactory.nebius.com/v1/chat/completions"
    : "https://integrate.api.nvidia.com/v1/chat/completions";
  const model =
    process.env.NVIDIA_MODEL ??
    process.env.NEBIUS_MODEL ??
    "meta/llama-3.3-70b-instruct";

  const schemaInstruction =
    '\n\nReturn ONLY a valid JSON object with this exact shape: ' +
    '{"findings":[{"rule_ref":"string","title":"string","explanation":"string","severity":"low","confidence":0.9,"suggested_fix":"string","location_hint":"string"}]}. ' +
    'Note: severity must be one of "low", "medium", or "high". If no rule is violated, return {"findings":[]}.';

  return async ({ system, prompt }) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 1024,
        messages: [
          { role: "system", content: system + schemaInstruction },
          { role: "user", content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`NVIDIA API ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string | null } }[];
    };
    const raw = data.choices?.[0]?.message?.content ?? "";
    if (!raw.trim()) throw new Error("Empty NVIDIA response");
    return JSON.parse(cleanJsonText(raw));
  };
}

function buildGeminiCaller(rawKey: string): AiCaller {
  const apiKey = rawKey.trim();
  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

  return async ({ system, prompt }) => {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Gemini API ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text.trim()) throw new Error("Empty Gemini response");
    return JSON.parse(cleanJsonText(text));
  };
}

/**
 * Provider chain:
 * 1. Tries NVIDIA first (if NVIDIA_API_KEY or NEBIUS_API_KEY is configured).
 * 2. Automatically falls back to Gemini (if GEMINI_API_KEY is configured) when NVIDIA fails.
 */
export function defaultAiCaller(): AiCaller | null {
  const providers: { name: string; call: AiCaller }[] = [];

  const nvidiaKey = process.env.NVIDIA_API_KEY ?? process.env.NEBIUS_API_KEY;
  if (nvidiaKey?.trim()) {
    providers.push({ name: "nvidia", call: buildNvidiaCaller(nvidiaKey) });
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey?.trim()) {
    providers.push({ name: "gemini", call: buildGeminiCaller(geminiKey) });
  }

  if (providers.length === 0) return null;

  return async (input) => {
    let lastError: unknown = null;
    for (const provider of providers) {
      try {
        const rawResult = await provider.call(input);
        const validated = aiOutputSchema.safeParse(rawResult);
        if (validated.success) {
          return validated.data;
        }
        lastError = new Error(`${provider.name} returned invalid schema`);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError ?? new Error("All AI providers failed");
  };
}

function needsHumanFinding(title: string, explanation: string): FindingSeed {
  return {
    kit_rule_id: null,
    source: "ai",
    title,
    explanation,
    severity: "medium",
    confidence: null,
    suggested_fix: null,
    location: null,
    assigned_to_role: "reviewer",
    needs_human: true,
    status: "open",
  };
}

export async function runAiChecks(
  aiRules: KitRule[],
  item: { context_type: string; text_content: string | null },
  opts?: { call?: AiCaller },
): Promise<{ seeds: FindingSeed[]; status: "ran" | "failed"; error?: string }> {
  const text = (item.text_content ?? "").trim();
  if (!text || aiRules.length === 0) return { seeds: [], status: "ran" };

  const call = opts?.call ?? defaultAiCaller();
  if (!call) return { seeds: [], status: "ran" };

  const rulesBlock = aiRules
    .map(
      (r) =>
        `REF: ${r.name}\nTYPE: ${r.rule_type}\nCHECKS: ${JSON.stringify(r.payload)}`,
    )
    .join("\n\n");

  const system =
    "You are a brand-governance checker for pre-publication content. " +
    "Judge the content ONLY against the provided brand rules. " +
    "Check every rule independently: flag unapproved claims under approved_claim rules, " +
    "and flag ALL CAPS, hype, pushy urgency, or fear-based language under tone_guideline rules. " +
    "Every finding MUST cite a rule by its exact REF string. " +
    "If no rule is violated, return an empty findings array. Never invent rules. " +
    "Set confidence below 0.6 whenever you are unsure — such findings are routed to human review. " +
    "Write explanations for the content creator: what is wrong, where, and why.";

  const prompt =
    `CONTEXT: ${item.context_type}\n\n` +
    `BRAND RULES:\n${rulesBlock}\n\n` +
    `CONTENT TO CHECK:\n${text}`;

  let validated: z.infer<typeof aiOutputSchema> | null = null;
  let lastError = "";
  for (let attempt = 1; attempt <= 2 && !validated; attempt++) {
    try {
      const parsed = await call({
        system,
        prompt:
          attempt === 1
            ? prompt
            : `${prompt}\n\nIMPORTANT: Return ONLY JSON matching the required schema.`,
      });
      const check = aiOutputSchema.safeParse(parsed);
      if (check.success) {
        validated = check.data;
      } else {
        lastError = "model output did not match the required schema";
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    if (attempt === 1 && !validated) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  if (!validated) {
    return {
      seeds: [
        needsHumanFinding(
          "AI check could not complete",
          `The model output was unusable after one retry (${lastError}). A human should review this content manually.`,
        ),
      ],
      status: "failed",
      error: lastError,
    };
  }

  const byRef = new Map(aiRules.map((r) => [r.name, r]));
  const seeds: FindingSeed[] = [];

  for (const finding of validated.findings) {
    const rule = byRef.get(finding.rule_ref);
    if (rule) {
      seeds.push({
        kit_rule_id: rule.id,
        source: "ai",
        title: finding.title,
        explanation: finding.explanation,
        severity: finding.severity,
        confidence: finding.confidence,
        suggested_fix: finding.suggested_fix,
        location: finding.location_hint
          ? { type: "text", hint: finding.location_hint }
          : null,
        assigned_to_role: "creator",
        needs_human: false,
        status: "open",
      });
    } else {
      seeds.push({
        kit_rule_id: null,
        source: "ai",
        title: finding.title,
        explanation:
          `${finding.explanation} (The model cited rule “${finding.rule_ref}”, which does ` +
          `not exist in this kit — a human must confirm before this counts.)`,
        severity: finding.severity,
        confidence: finding.confidence,
        suggested_fix: finding.suggested_fix,
        location: null,
        assigned_to_role: "reviewer",
        needs_human: true,
        status: "open",
      });
    }
  }

  return { seeds, status: "ran" };
}