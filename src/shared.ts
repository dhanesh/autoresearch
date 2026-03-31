// Shared utilities extracted to eliminate DRY violations across modules
// Satisfies: Clean Code Ch.17 (DRY), Clean Architecture (single source of truth)

import type { EvalConstraint, IterationScores, LoopState, NormalizedScore } from "./types";

/** Get the most recent iteration from state, or undefined if none exist */
export function lastIteration(state: LoopState): IterationScores | undefined {
  return state.iterations[state.iterations.length - 1];
}

/** Compute improvement percentage from baseline to final score.
 *  Returns 100 if baseline is 0 and final > 0, 0 if both are 0. */
export function computeImprovementPct(baselineScore: NormalizedScore, finalScore: NormalizedScore): number {
  if (baselineScore > 0) {
    return ((finalScore - baselineScore) / baselineScore) * 100;
  }
  return finalScore > 0 ? 100 : 0;
}

/** Rebalance constraint weights to sum to 1.0.
 *  Optionally exclude a constraint by ID before rebalancing. */
export function rebalanceWeights(
  constraints: EvalConstraint[],
  excludeId?: string,
): EvalConstraint[] {
  const remaining = excludeId
    ? constraints.filter((c) => c.id !== excludeId)
    : constraints;
  const totalWeight = remaining.reduce((sum, c) => sum + c.weight, 0);
  if (totalWeight === 0 || remaining.length === 0) return remaining;
  return remaining.map((c) => ({
    ...c,
    weight: c.weight / totalWeight,
  }));
}
