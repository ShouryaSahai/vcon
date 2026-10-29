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

/**
 * The production caller: Gemini REST with structured output, thinking
 * disabled (3.x models otherwise think for minutes) and a hard 45s timeout
 * so a slow model can never hang a check. Raw REST because the SDK's
 * structured-output path misbehaves with current Gemini 3.x models; the
 * AiCaller interface keeps the provider swappable (OpenRouter next).
 * Returns null when no credentials are configured — the pipeline then runs
 * deterministic checks only.
 */
export function defaultAiCaller(): AiCaller | null {
  const nebiusKey = process.env.NEBIUS_API_KEY;
  if (nebiusKey) {
    const model = process.env.NEBIUS_MODEL ?? "nvidia/Nemotron-3_5-Lightning";
    const schemaInstruction =
      '\n\nReturn ONLY a valid JSON object with this exact shape: ' +
      '{"findings":[{"rule_ref":"string","title":"string","explanation":"string","severity":"low"|"medium"|"high","confidence":0.9,"suggested_fix":"string","location_hint":"string"}]}';

    return async ({ system, prompt }) => {
      const response = await fetch(
        "https://api.tokenfactory.nebius.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${nebiusKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            temperature: 0,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: system + schemaInstruction },
              { role: "user", content: prompt },
            ],
          }),
          signal: AbortSignal.timeout(45_000),
        },
      );
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Nebius API ${response.status}: ${body.slice(0, 200)}`);
      }
      const data = (await response.json()) as {
        choices?: { message?: { content?: string | null } }[];
      };
      const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
      if (!raw) throw new Error("Empty Nebius response");
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      return JSON.parse(cleaned);
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const model = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";
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
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
        signal: AbortSignal.timeout(45_000),
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
    if (!text) throw new Error("Empty Gemini response");
    return JSON.parse(text);
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

/**
 * Grounded AI checks. The model only sees this kit's rules and must cite one
 * by its exact ref; citation is ENFORCED below (code, not prompt):
 *   - cited rule exists  -> finding keeps the citation;
 *   - cited rule missing -> downgraded to needs_human with no citation, so a
 *     human confirms before it counts. No source, no flag.
 * Malformed output is retried once; a second failure becomes one needs_human
 * finding rather than a guess.
 */
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
      // Brief backoff before the retry — free-tier 503 spikes are usually short.
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
      // No source, no flag: keep it visible but demote to human review.
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
