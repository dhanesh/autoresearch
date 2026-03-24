// Satisfies: RT-1 (Score Normalization), RT-8 (Constraint-to-Command Pipeline)
// Evaluator for static analysis: linters, type checkers, complexity analyzers

import type { EvalResult, NormalizedScore } from "../types";

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
    // Score: 100 minus weighted penalties (errors=2pts, warnings=0.5pts), floor at 0
    const penalty = totalErrors * 2 + totalWarnings * 0.5;
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
  return Math.max(0, 100 - errors * 5);
}

/** Parse cyclomatic complexity output (average) and normalize.
 *  Lower complexity = higher score. Target: avg < 10 */
export function normalizeComplexityOutput(raw: string): NormalizedScore {
  try {
    const avgMatch = raw.match(/average[:\s]+(\d+\.?\d*)/i);
    if (!avgMatch) return 50;
    const avg = parseFloat(avgMatch[1]);
    // Score mapping: 1-5 = 100, 10 = 70, 20 = 30, 30+ = 0
    if (avg <= 5) return 100;
    if (avg >= 30) return 0;
    return Math.round(100 - (avg - 5) * (100 / 25));
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
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
