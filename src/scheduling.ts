// Satisfies: RT-5 (Adaptive LLM Eval Scheduler)
// Satisfies: T5 (Adaptive Scheduling), U3 (Confidence Data), O3 (Iteration Efficiency)
// Resolution: TN3-A (Lite Eval Fallback)

import type { EvalScheduleDecision, IterationScores } from "./types";

/** Compute rolling volatility (std dev of recent deltas). Satisfies: T5 */
export function computeVolatility(
  iterations: IterationScores[],
  window: number = 5
): number {
  if (iterations.length < 2) return Number.POSITIVE_INFINITY; // High volatility when insufficient data

  const recent = iterations.slice(-window);
  const deltas = recent.map((i) => i.delta);
  const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const variance =
    deltas.reduce((sum, d) => sum + (d - mean) ** 2, 0) / deltas.length;
  return Math.sqrt(variance);
}

/** Determine eval schedule for this iteration. Satisfies: T5, TN3 */
export function getEvalDecision(
  iteration: number,
  iterations: IterationScores[],
  config: SchedulingConfig
): EvalScheduleDecision {
  // Always run full eval on first 3 iterations (establish baseline volatility)
  if (iteration <= 3) return "full";

  // Always run full eval on final iteration (for complete report)
  // (Caller must check this separately since we don't know maxIterations here)

  const volatility = computeVolatility(iterations, config.volatilityWindow);

  // High volatility: scores are changing rapidly -> full eval needed
  if (volatility >= config.highVolatilityThreshold) return "full";

  // Minimum sampling guarantee: full eval every Nth iteration regardless of volatility
  if (iteration % config.minimumFullEvalInterval === 0) return "full";

  // Low volatility: scores are stable -> lite probe sufficient
  if (volatility <= config.lowVolatilityThreshold) return "lite";

  // Medium volatility: default to lite between forced full evals
  return "lite";
}

/** Check if this should be a full eval regardless of schedule (final iteration, etc.) */
export function shouldForceFullEval(
  iteration: number,
  maxIterations: number,
  isFinalReport: boolean
): boolean {
  return isFinalReport || iteration >= maxIterations;
}

/** Configuration for adaptive scheduling */
export interface SchedulingConfig {
  /** Window size for volatility calculation. Default: 5 */
  volatilityWindow: number;
  /** Volatility above this triggers full eval. Default: 2.0 */
  highVolatilityThreshold: number;
  /** Volatility below this allows lite probe. Default: 0.5 */
  lowVolatilityThreshold: number;
  /** Maximum iterations between forced full evals. Default: 5 */
  minimumFullEvalInterval: number;
}

/** Default scheduling configuration */
export const DEFAULT_SCHEDULING: SchedulingConfig = {
  volatilityWindow: 5,
  highVolatilityThreshold: 2.0,
  lowVolatilityThreshold: 0.5,
  minimumFullEvalInterval: 5,
};

/** Estimate token savings from adaptive scheduling vs fixed. Satisfies: O3 */
export function estimateTokenSavings(
  totalIterations: number,
  fullEvalTokens: number,
  liteProbeTokens: number,
  decisions: EvalScheduleDecision[]
): TokenSavings {
  const fixedCost = totalIterations * fullEvalTokens;
  let adaptiveCost = 0;
  let fullCount = 0;
  let liteCount = 0;
  let skipCount = 0;

  for (const d of decisions) {
    switch (d) {
      case "full":
        adaptiveCost += fullEvalTokens;
        fullCount++;
        break;
      case "lite":
        adaptiveCost += liteProbeTokens;
        liteCount++;
        break;
      case "skip":
        skipCount++;
        break;
    }
  }

  return {
    fixedCost,
    adaptiveCost,
    savedTokens: fixedCost - adaptiveCost,
    savingsPct: fixedCost > 0 ? Math.round(((fixedCost - adaptiveCost) / fixedCost) * 100) : 0,
    fullEvals: fullCount,
    liteProbes: liteCount,
    skipped: skipCount,
  };
}

/** Token savings estimate from adaptive scheduling */
export interface TokenSavings {
  fixedCost: number;
  adaptiveCost: number;
  savedTokens: number;
  savingsPct: number;
  fullEvals: number;
  liteProbes: number;
  skipped: number;
}
