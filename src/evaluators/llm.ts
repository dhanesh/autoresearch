// Satisfies: RT-1 (Score Normalization), RT-3 (Eval Axis Independence), TN2 (Sampling), TN7 (Learning)
// Evaluator for LLM-based rubric scoring of code quality

import type { EvalResult, NormalizedScore } from "../types";

/** The rubric dimensions for LLM evaluation. Satisfies: RT-3 (independence from other axes) */
export const LLM_RUBRIC_DIMENSIONS = [
  {
    name: "readability",
    weight: 0.25,
    prompt: "Rate code readability (naming clarity, logical flow, self-documenting style) on 0-100.",
  },
  {
    name: "architecture",
    weight: 0.25,
    prompt: "Rate architectural quality (separation of concerns, cohesion, coupling, modularity) on 0-100.",
  },
  {
    name: "maintainability",
    weight: 0.25,
    prompt: "Rate maintainability (ease of modification, test-friendliness, documentation quality) on 0-100.",
  },
  {
    name: "idiomaticness",
    weight: 0.25,
    prompt: "Rate how idiomatic the code is for its language/framework (follows conventions, uses standard patterns) on 0-100.",
  },
] as const;

/** Build the LLM evaluation prompt for a set of changed files.
 *  This prompt is sent to Claude during the evaluation phase.
 *  Satisfies: TN7 — includes "explain WHY" instruction for learning value */
export function buildLlmEvalPrompt(
  changedFiles: { path: string; diff: string }[],
  isFullReport: boolean
): string {
  const fileList = changedFiles
    .map((f) => `### ${f.path}\n\`\`\`diff\n${f.diff}\n\`\`\``)
    .join("\n\n");

  const reportInstruction = isFullReport
    ? `\n\nADDITIONALLY: For each change, explain WHY it improves the code. What pattern does it apply? What was wrong with the original? This explanation is for developer learning.`
    : "";

  return `You are evaluating code changes for quality. Score each dimension 0-100.

## Changed Files

${fileList}

## Scoring Rubric

For each dimension, provide:
1. A score from 0-100
2. A brief justification (1-2 sentences)

Dimensions:
${LLM_RUBRIC_DIMENSIONS.map((d) => `- **${d.name}** (${d.weight * 100}% weight): ${d.prompt}`).join("\n")}
${reportInstruction}

## Response Format (STRICT)

Respond ONLY with valid JSON:
{
  "scores": {
    "readability": { "score": <0-100>, "justification": "<text>" },
    "architecture": { "score": <0-100>, "justification": "<text>" },
    "maintainability": { "score": <0-100>, "justification": "<text>" },
    "idiomaticness": { "score": <0-100>, "justification": "<text>" }
  },
  "composite": <weighted average 0-100>,
  "summary": "<1-2 sentence overall assessment>"${isFullReport ? ',\n  "learning": "<detailed explanation of WHY each change improves the code>"' : ""}
}`;
}

/** Score and justification for a single rubric dimension */
export interface DimensionScore {
  score: number;
  justification: string;
}

/** Parsed result from an LLM quality evaluation */
export interface LlmEvalParsedResult {
  score: NormalizedScore;
  details: Record<string, DimensionScore>;
  learning?: string;
}

/** Parse LLM evaluation JSON response and extract normalized composite score */
export function parseLlmEvalResponse(raw: string): LlmEvalParsedResult {
  try {
    // Extract JSON from response (may be wrapped in markdown code block)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in LLM response");

    const parsed = JSON.parse(jsonMatch[0]);
    const scores = parsed.scores;

    // Calculate weighted composite
    let composite = 0;
    for (const dim of LLM_RUBRIC_DIMENSIONS) {
      const dimScore = scores[dim.name]?.score ?? 50;
      composite += dimScore * dim.weight;
    }

    return {
      score: Math.round(composite),
      details: scores,
      learning: parsed.learning,
    };
  } catch {
    return {
      score: 50, // Conservative middle score on parse failure
      details: {},
    };
  }
}

/** Determine if LLM eval should run this iteration. Satisfies: TN2 */
export function shouldRunLlmEval(
  currentIteration: number,
  llmEvalInterval: number,
  isFinalReport: boolean
): boolean {
  // Always run on final report (TN7: learning-focused summary)
  if (isFinalReport) return true;
  // Sample every Nth iteration (TN2: token budget management)
  return currentIteration % llmEvalInterval === 0;
}

/** Build an EvalResult from LLM evaluation. Satisfies: RT-1 */
export function buildLlmResult(
  constraintId: string,
  rawResponse: string,
  durationMs: number
): EvalResult {
  const parsed = parseLlmEvalResponse(rawResponse);
  return {
    constraintId,
    mechanism: "llm",
    rawOutput: rawResponse,
    normalizedScore: parsed.score,
    durationMs,
    success: true,
  };
}

// ─── Lite Probe Mode (TN3-A) ────────────────────────────────────────────────

/** Build a lite probe prompt for a single rubric dimension. Satisfies: TN3, RT-5 */
export function buildLiteProbePrompt(
  changedFiles: { path: string; diff: string }[],
  dimension: string = "readability"
): string {
  const dim = LLM_RUBRIC_DIMENSIONS.find((d) => d.name === dimension);
  if (!dim) {
    return buildLiteProbePrompt(changedFiles, "readability");
  }

  const fileList = changedFiles
    .map((f) => `### ${f.path}\n\`\`\`diff\n${f.diff}\n\`\`\``)
    .join("\n\n");

  return `You are evaluating code changes on a single quality dimension. Score 0-100.

## Changed Files

${fileList}

## Scoring

**${dim.name}**: ${dim.prompt}

## Response Format (STRICT)

Respond ONLY with valid JSON:
{
  "score": <0-100>,
  "justification": "<1-2 sentences>"
}`;
}

/** Parse lite probe response. Satisfies: TN3 */
export function parseLiteProbeResponse(raw: string): NormalizedScore {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return 50;
    const parsed = JSON.parse(jsonMatch[0]);
    const score = parsed.score ?? 50;
    return Math.max(0, Math.min(100, Math.round(score)));
  } catch {
    return 50;
  }
}

/** Build an EvalResult from a lite probe. Satisfies: TN3, RT-5 */
export function buildLiteProbeResult(
  constraintId: string,
  rawResponse: string,
  durationMs: number
): EvalResult {
  const score = parseLiteProbeResponse(rawResponse);
  return {
    constraintId,
    mechanism: "llm",
    rawOutput: rawResponse,
    normalizedScore: score,
    durationMs,
    success: true,
  };
}
