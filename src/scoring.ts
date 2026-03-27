// Satisfies: RT-2 (Composite Scoring Engine)
// Satisfies: B2 (Scientific Grounding), T3 (Statistical Composite), T8 (Aggregation-Strategy Alignment)
// Resolution: TN5-C (Adaptive Aggregation: arithmetic early -> harmonic late)

import type {
  AggregationMethod,
  EvalResult,
  NormalizedScore,
  ScoringConfig,
} from "./types";

/** Default scoring configuration. Satisfies: TN5 */
export const DEFAULT_SCORING: ScoringConfig = {
  method: "arithmetic",
  phaseTransitionMethod: "harmonic",
  phaseTransitionPct: 0.4,
  phaseTransitionScoreThreshold: 80,
};

/** Weighted arithmetic mean — compensatory, rewards broad improvement. Satisfies: T3 */
export function weightedArithmeticMean(
  scores: number[],
  weights: number[]
): number {
  if (scores.length === 0) return 0;
  let sum = 0;
  let weightSum = 0;
  for (let i = 0; i < scores.length; i++) {
    sum += scores[i] * weights[i];
    weightSum += weights[i];
  }
  return weightSum > 0 ? Math.round(sum / weightSum) : 0;
}

/** Weighted harmonic mean — penalizes imbalance, rewards fixing weakest axis. Satisfies: T3 */
export function weightedHarmonicMean(
  scores: number[],
  weights: number[]
): number {
  if (scores.length === 0) return 0;
  let reciprocalSum = 0;
  let weightSum = 0;
  for (let i = 0; i < scores.length; i++) {
    if (scores[i] <= 0) return 0; // Harmonic mean undefined for zero
    reciprocalSum += weights[i] / scores[i];
    weightSum += weights[i];
  }
  return reciprocalSum > 0 ? Math.round(weightSum / reciprocalSum) : 0;
}

/** Weighted geometric mean — scale-independent, balanced. Satisfies: T3 */
export function weightedGeometricMean(
  scores: number[],
  weights: number[]
): number {
  if (scores.length === 0) return 0;
  let logSum = 0;
  let weightSum = 0;
  for (let i = 0; i < scores.length; i++) {
    if (scores[i] <= 0) return 0; // Log undefined for zero
    logSum += weights[i] * Math.log(scores[i]);
    weightSum += weights[i];
  }
  return weightSum > 0 ? Math.round(Math.exp(logSum / weightSum)) : 0;
}

/** Select aggregation function by method name */
function getAggregator(
  method: AggregationMethod
): (scores: number[], weights: number[]) => number {
  switch (method) {
    case "arithmetic":
      return weightedArithmeticMean;
    case "harmonic":
      return weightedHarmonicMean;
    case "geometric":
      return weightedGeometricMean;
  }
}

/** Determine which aggregation phase we're in. Satisfies: TN5-C */
export function getAggregationPhase(
  iteration: number,
  maxIterations: number,
  allScores: number[],
  config: ScoringConfig
): AggregationMethod {
  const pctComplete = iteration / maxIterations;
  const allAboveThreshold = allScores.every(
    (s) => s >= config.phaseTransitionScoreThreshold
  );

  if (pctComplete >= config.phaseTransitionPct || allAboveThreshold) {
    return config.phaseTransitionMethod;
  }
  return config.method;
}

/** Phase-adaptive composite scoring. Satisfies: T3, T8, TN5 */
export function phaseAdaptiveComposite(
  results: EvalResult[],
  weights: Record<string, number>,
  config: ScoringConfig,
  iteration: number,
  maxIterations: number
): CompositeScoreResult {
  const scoreValues: number[] = [];
  const weightValues: number[] = [];
  const scoreMap: Record<string, NormalizedScore> = {};

  for (const r of results) {
    scoreMap[r.constraintId] = r.normalizedScore;
    scoreValues.push(r.normalizedScore);
    weightValues.push(weights[r.constraintId] ?? 1 / results.length);
  }

  const method = getAggregationPhase(
    iteration,
    maxIterations,
    scoreValues,
    config
  );
  const aggregator = getAggregator(method);
  const compositeScore = aggregator(scoreValues, weightValues);

  return { scores: scoreMap, compositeScore, method };
}

/** Result of composite scoring with method used */
export interface CompositeScoreResult {
  scores: Record<string, NormalizedScore>;
  compositeScore: NormalizedScore;
  method: AggregationMethod;
}

/** Compute Cohen's d effect size between baseline and current. Satisfies: B2 */
export function computeEffectSize(
  baselineScores: number[],
  currentScores: number[]
): number {
  if (baselineScores.length === 0 || currentScores.length === 0) return 0;

  const meanBaseline =
    baselineScores.reduce((a, b) => a + b, 0) / baselineScores.length;
  const meanCurrent =
    currentScores.reduce((a, b) => a + b, 0) / currentScores.length;

  const pooledVariance =
    (variance(baselineScores) + variance(currentScores)) / 2;
  const pooledStdDev = Math.sqrt(pooledVariance);

  return pooledStdDev > 0 ? (meanCurrent - meanBaseline) / pooledStdDev : 0;
}

/** Compute sample variance */
function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return (
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1)
  );
}
