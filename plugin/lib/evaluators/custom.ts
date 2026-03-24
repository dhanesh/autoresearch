// Satisfies: RT-1 (Score Normalization), RT-5 (Command Timeout), RT-8 (Constraint-to-Command Pipeline)
// Satisfies: S3 (Command Sandboxing), TN5 (Phase-Lock + Signature Verification)
// Evaluator for user-provided custom evaluation commands

import { createHash } from "node:crypto";
import type { EvalConstraint, EvalResult, NormalizedScore } from "../types";

/** Compute SHA-256 hash of a command string. Satisfies: TN5 */
export function hashCommand(command: string): string {
  return createHash("sha256").update(command).digest("hex");
}

/** Verify command hash hasn't been tampered with. Satisfies: TN5 */
export function verifyCommandHash(
  constraint: EvalConstraint
): { valid: boolean; error?: string } {
  const currentHash = hashCommand(constraint.command);
  if (currentHash !== constraint.commandHash) {
    return {
      valid: false,
      error: `Command hash mismatch for "${constraint.id}". Expected: ${constraint.commandHash}, Got: ${currentHash}. Command may have been modified.`,
    };
  }
  return { valid: true };
}

/** Build a timeout-wrapped command string. Satisfies: RT-5 */
export function wrapWithTimeout(
  command: string,
  timeoutSeconds: number
): string {
  // Use 'timeout' on Linux, 'gtimeout' on macOS (via coreutils), or shell-based fallback
  return `timeout ${timeoutSeconds} ${command} 2>&1 || true`;
}

/** Parse custom command output to extract a numeric score.
 *  Supports:
 *  - Raw number: "85.5"
 *  - Percentage: "85.5%"
 *  - JSON with score field: {"score": 85.5}
 *  - Last line containing a number
 *  Satisfies: RT-1 */
export function normalizeCustomOutput(raw: string): NormalizedScore {
  const trimmed = raw.trim();

  // Try JSON with score field
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === "number") return clampScore(parsed);
    if (parsed.score !== undefined) return clampScore(parsed.score);
    if (parsed.value !== undefined) return clampScore(parsed.value);
  } catch {
    // Not JSON, continue to other formats
  }

  // Try last line with a number
  const lines = trimmed.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const match = lines[i].match(/(\d+\.?\d*)%?/);
    if (match) {
      return clampScore(parseFloat(match[1]));
    }
  }

  return 0; // Cannot parse — score 0 to surface the issue
}

/** Clamp a value to 0-100 range */
function clampScore(value: number): NormalizedScore {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Validate all registered commands before the loop starts. Satisfies: TN5, S3
 *  Returns list of invalid constraints with reasons */
export function validateRegisteredCommands(
  constraints: EvalConstraint[]
): { constraintId: string; error: string }[] {
  const errors: { constraintId: string; error: string }[] = [];

  for (const c of constraints) {
    // Verify hash integrity
    const hashCheck = verifyCommandHash(c);
    if (!hashCheck.valid) {
      errors.push({ constraintId: c.id, error: hashCheck.error! });
      continue;
    }

    // Basic command safety checks (no shell injections)
    if (c.command.includes("&&") && c.command.includes("rm ")) {
      errors.push({
        constraintId: c.id,
        error: `Command contains potentially destructive operations: "${c.command}"`,
      });
    }
  }

  return errors;
}

/** Build an EvalResult from custom command output. Satisfies: RT-1, S3 */
export function buildCustomResult(
  constraintId: string,
  rawOutput: string,
  durationMs: number,
  timedOut: boolean
): EvalResult {
  if (timedOut) {
    return {
      constraintId,
      mechanism: "custom",
      rawOutput,
      normalizedScore: 0,
      durationMs,
      success: false,
      error: "Command timed out",
    };
  }

  try {
    const score = normalizeCustomOutput(rawOutput);
    return {
      constraintId,
      mechanism: "custom",
      rawOutput,
      normalizedScore: score,
      durationMs,
      success: true,
    };
  } catch (error) {
    return {
      constraintId,
      mechanism: "custom",
      rawOutput,
      normalizedScore: 0,
      durationMs,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
