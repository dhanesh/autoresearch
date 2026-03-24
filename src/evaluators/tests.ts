// Satisfies: RT-1 (Score Normalization), RT-8 (Constraint-to-Command Pipeline)
// Evaluator for test suites: pass rate and coverage

import type { EvalResult, NormalizedScore } from "../types";

/** Parse test runner output for pass/fail counts and normalize.
 *  Supports common formats: Jest, Vitest, bun test, pytest */
export function normalizeTestPassRate(raw: string): NormalizedScore {
  // Try Jest/Vitest format: "Tests: X passed, Y failed, Z total"
  const jestMatch = raw.match(
    /(\d+)\s+passed.*?(\d+)\s+failed.*?(\d+)\s+total/i
  );
  if (jestMatch) {
    const passed = parseInt(jestMatch[1], 10);
    const total = parseInt(jestMatch[3], 10);
    return total > 0 ? Math.round((passed / total) * 100) : 0;
  }

  // Try pytest format: "X passed, Y failed"
  const pytestMatch = raw.match(/(\d+)\s+passed/i);
  const pytestFailed = raw.match(/(\d+)\s+failed/i);
  if (pytestMatch) {
    const passed = parseInt(pytestMatch[1], 10);
    const failed = pytestFailed ? parseInt(pytestFailed[1], 10) : 0;
    const total = passed + failed;
    return total > 0 ? Math.round((passed / total) * 100) : 0;
  }

  // Try generic "X/Y" format
  const ratioMatch = raw.match(/(\d+)\s*\/\s*(\d+)/);
  if (ratioMatch) {
    const passed = parseInt(ratioMatch[1], 10);
    const total = parseInt(ratioMatch[2], 10);
    return total > 0 ? Math.round((passed / total) * 100) : 0;
  }

  // If all tests pass with no failures mentioned
  if (raw.includes("passed") && !raw.includes("failed")) return 100;

  // If output contains error indicators
  if (raw.includes("FAIL") || raw.includes("failed") || raw.includes("error"))
    return 0;

  return 50; // Unknown format — conservative middle score
}

/** Parse coverage output and normalize.
 *  Looks for "All files" line or total coverage percentage */
export function normalizeCoverageOutput(raw: string): NormalizedScore {
  // Try "All files" format (Istanbul/c8/vitest): "All files | 85.5 | ..."
  const allFilesMatch = raw.match(
    /All files\s*\|\s*(\d+\.?\d*)/i
  );
  if (allFilesMatch) {
    return Math.round(parseFloat(allFilesMatch[1]));
  }

  // Try "Total" format: "TOTAL    85%"
  const totalMatch = raw.match(/total\s+(\d+\.?\d*)%/i);
  if (totalMatch) {
    return Math.round(parseFloat(totalMatch[1]));
  }

  // Try generic percentage: "Coverage: 85.5%"
  const pctMatch = raw.match(/coverage[:\s]+(\d+\.?\d*)%/i);
  if (pctMatch) {
    return Math.round(parseFloat(pctMatch[1]));
  }

  // Try bare percentage at end of output
  const bareMatch = raw.trim().match(/(\d+\.?\d*)%?\s*$/);
  if (bareMatch) {
    const val = parseFloat(bareMatch[1]);
    if (val >= 0 && val <= 100) return Math.round(val);
  }

  return 0; // Cannot parse — score 0 to surface the issue
}

/** Build an EvalResult from test command output. Satisfies: RT-1 */
export function buildTestResult(
  constraintId: string,
  rawOutput: string,
  type: "pass_rate" | "coverage",
  durationMs: number
): EvalResult {
  try {
    const normalizer =
      type === "pass_rate" ? normalizeTestPassRate : normalizeCoverageOutput;
    const score = normalizer(rawOutput);
    return {
      constraintId,
      mechanism: "tests",
      rawOutput,
      normalizedScore: score,
      durationMs,
      success: true,
    };
  } catch (error) {
    return {
      constraintId,
      mechanism: "tests",
      rawOutput,
      normalizedScore: 0,
      durationMs,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
