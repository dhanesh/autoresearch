// Satisfies: RT-1 (Score Normalization), RT-8 (Constraint-to-Command Pipeline)
// Evaluator for static analysis: linters, type checkers, complexity analyzers

import type { EvalResult, NormalizedScore } from "../types";
import { formatError } from "./custom";

// Named constants replacing magic numbers (Clean Code Ch.17)
/** Penalty weight per lint error in score calculation */
const LINT_ERROR_PENALTY = 2;
/** Penalty weight per lint warning in score calculation */
const LINT_WARNING_PENALTY = 0.5;
/** Penalty per TypeScript compiler error in score calculation */
const TSC_ERROR_PENALTY = 5;
/** Cyclomatic complexity threshold for perfect score (avg <= this = 100) */
const COMPLEXITY_LOW_THRESHOLD = 5;
/** Cyclomatic complexity threshold for zero score (avg >= this = 0) */
const COMPLEXITY_HIGH_THRESHOLD = 30;

/** Parse ESLint JSON output and normalize to 0-100 score (100 = no issues) */
export function normalizeEslintOutput(raw: string): NormalizedScore {
  try {
    const results: { errorCount: number; warningCount: number }[] = JSON.parse(raw);
    let totalErrors = 0;
    let totalWarnings = 0;
    for (const r of results) {
      totalErrors += r.errorCount;
      totalWarnings += r.warningCount;
    }
    const penalty = totalErrors * LINT_ERROR_PENALTY + totalWarnings * LINT_WARNING_PENALTY;
    return Math.max(0, Math.min(100, Math.round(100 - penalty)));
  } catch {
    return 0;
  }
}

/** Parse TypeScript compiler output (error count) and normalize */
export function normalizeTscOutput(raw: string): NormalizedScore {
  const errorMatch = raw.match(/Found (\d+) error/);
  if (!errorMatch) return raw.includes("error") ? 50 : 100;
  const errors = parseInt(errorMatch[1], 10);
  return Math.max(0, 100 - errors * TSC_ERROR_PENALTY);
}

/** Parse cyclomatic complexity output (average) and normalize.
 *  Lower complexity = higher score. Target: avg < 10 */
export function normalizeComplexityOutput(raw: string): NormalizedScore {
  try {
    const avgMatch = raw.match(/average[:\s]+(\d+\.?\d*)/i);
    if (!avgMatch) return 50;
    const avg = parseFloat(avgMatch[1]);
    if (avg <= COMPLEXITY_LOW_THRESHOLD) return 100;
    if (avg >= COMPLEXITY_HIGH_THRESHOLD) return 0;
    const range = COMPLEXITY_HIGH_THRESHOLD - COMPLEXITY_LOW_THRESHOLD;
    return Math.round(100 - (avg - COMPLEXITY_LOW_THRESHOLD) * (100 / range));
  } catch {
    return 50;
  }
}

/** Generic normalizer: parse a single number from output, map to 0-100 range */
export function normalizeNumericOutput(
  raw: string,
  min: number,
  max: number,
  invert = false
): NormalizedScore {
  const match = raw.match(/(\d+\.?\d*)/);
  if (!match) return 0;
  const value = parseFloat(match[1]);
  const clamped = Math.max(min, Math.min(max, value));
  const normalized = ((clamped - min) / (max - min)) * 100;
  return Math.round(invert ? 100 - normalized : normalized);
}

/** Build an EvalResult from command output. Satisfies: RT-1, S3 */
export function buildStaticResult(
  constraintId: string,
  rawOutput: string,
  normalizer: (raw: string) => NormalizedScore,
  durationMs: number
): EvalResult {
  try {
    const score = normalizer(rawOutput);
    return {
      constraintId,
      mechanism: "static",
      rawOutput,
      normalizedScore: score,
      durationMs,
      success: true,
    };
  } catch (error) {
    return {
      constraintId,
      mechanism: "static",
      rawOutput,
      normalizedScore: 0,
      durationMs,
      success: false,
      error: formatError(error),
    };
  }
}
