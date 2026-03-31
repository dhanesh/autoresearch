// Satisfies: RT-3 (Granular Token Accounting), RT-6 (Report Analytics Engine)
// Satisfies: B3 (Maximum ROI), B4 (Actionable Insights), T4 (Token Accounting)
// Satisfies: U2 (Token Dashboard), U3 (Confidence Intervals), U4 (Trajectory Visualization)
// Resolution: TN2-C (Pre-computed rigor, runtime CI only)

import { computeImprovementPct } from "./shared";
import type {
  ConfidenceInterval,
  ConstraintTokenUsage,
  IterationScores,
  LoopState,
  NormalizedScore,
  ProductionReport,
  TokenBreakdown,
} from "./types";

// Named constants replacing magic numbers (Clean Code Ch.17)
/** Assumed fraction of tokens that are input (for cost estimation) */
const INPUT_TOKEN_FRACTION = 0.6;
/** Assumed fraction of tokens that are output (for cost estimation) */
const OUTPUT_TOKEN_FRACTION = 0.4;
/** t-distribution critical values for small sample confidence intervals */
const T_DISTRIBUTION_VALUES: Record<number, number> = { 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571 };
/** Fallback z-value for large samples (approximates t-distribution) */
const LARGE_SAMPLE_Z_VALUE = 1.96;

// ─── Token Accounting (RT-3) ─────────────────────────────────────────────────

/** Create an empty token breakdown. Satisfies: T4 */
export function emptyTokenBreakdown(): TokenBreakdown {
  return { discovery: 0, baseline: 0, evaluation: 0, improvement: 0, reporting: 0 };
}

/** Accumulate tokens into a breakdown by phase. Satisfies: T4 */
export function addPhaseTokens(
  breakdown: TokenBreakdown,
  phase: keyof TokenBreakdown,
  tokens: number
): TokenBreakdown {
  return { ...breakdown, [phase]: breakdown[phase] + tokens };
}

/** Compute tokens-per-improvement-point ratio. Satisfies: B3, U2 */
export function computeEfficiencyRatio(
  totalTokens: number,
  compositeImprovement: number
): number {
  if (compositeImprovement <= 0) return Number.POSITIVE_INFINITY;
  return Math.round(totalTokens / compositeImprovement);
}

/** Estimate cost in USD from token count. Satisfies: U2 */
export function estimateCost(
  tokens: number,
  inputPricePer1k: number = 0.003,
  outputPricePer1k: number = 0.015
): number {
  const inputTokens = tokens * INPUT_TOKEN_FRACTION;
  const outputTokens = tokens * OUTPUT_TOKEN_FRACTION;
  return (inputTokens / 1000) * inputPricePer1k + (outputTokens / 1000) * outputPricePer1k;
}

// ─── Confidence Intervals (RT-6, U3) ────────────────────────────────────────

/** Compute confidence interval from a set of dimension scores. Satisfies: U3 */
export function computeConfidenceInterval(
  scores: number[],
  confidenceLevel: number = 0.95
): ConfidenceInterval {
  const n = scores.length;
  if (n === 0) return { mean: 0, lower: 0, upper: 0, stdDev: 0, n: 0 };
  if (n === 1) return { mean: scores[0], lower: scores[0], upper: scores[0], stdDev: 0, n: 1 };

  const mean = scores.reduce((a, b) => a + b, 0) / n;
  const variance = scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / (n - 1);
  const stdDev = Math.sqrt(variance);

  const t = T_DISTRIBUTION_VALUES[n] ?? LARGE_SAMPLE_Z_VALUE;
  const margin = t * (stdDev / Math.sqrt(n));

  return {
    mean: Math.round(mean * 10) / 10,
    lower: Math.round((mean - margin) * 10) / 10,
    upper: Math.round((mean + margin) * 10) / 10,
    stdDev: Math.round(stdDev * 10) / 10,
    n,
  };
}

// ─── Trajectory Analysis (RT-6, U4) ─────────────────────────────────────────

/** Fit a diminishing returns curve (asymptotic model: y = ceiling - a * e^(-bx)). Satisfies: U4 */
export function fitDiminishingReturnsCurve(
  iterations: IterationScores[]
): CurveFit {
  if (iterations.length < 3) {
    return { ceiling: 100, decayRate: 0.1, r2: 0, iterations: iterations.length };
  }

  const scores = iterations.map((i) => i.compositeScore);
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);

  // Simple exponential saturation estimate
  // As iterations increase, improvement approaches ceiling asymptotically
  const range = maxScore - minScore;
  const lastScore = scores[scores.length - 1];

  // Estimate ceiling: extrapolate from rate of change decay
  const recentDeltas = iterations.slice(-3).map((i) => Math.max(0, i.delta));
  const avgRecentDelta = recentDeltas.reduce((a, b) => a + b, 0) / recentDeltas.length;

  // If recent deltas are near zero, we're near ceiling
  const estimatedHeadroom = avgRecentDelta > 0.1
    ? Math.min(range * 2, avgRecentDelta * iterations.length * 0.5)
    : range * 0.1;
  const ceiling = Math.min(100, Math.round((lastScore + estimatedHeadroom) * 10) / 10);

  // Decay rate from first half vs second half improvement
  const midpoint = Math.floor(scores.length / 2);
  const firstHalfGain = scores[midpoint] - scores[0];
  const secondHalfGain = scores[scores.length - 1] - scores[midpoint];
  const decayRate = firstHalfGain > 0
    ? Math.round((1 - secondHalfGain / firstHalfGain) * 100) / 100
    : 0;

  // R-squared (coefficient of determination) for quality of fit
  const meanScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const ssTotal = scores.reduce((sum, s) => sum + (s - meanScore) ** 2, 0);
  const predicted = scores.map((_, i) => ceiling - (ceiling - minScore) * Math.exp(-0.3 * i));
  const ssResidual = scores.reduce((sum, s, i) => sum + (s - predicted[i]) ** 2, 0);
  const r2 = ssTotal > 0 ? Math.round((1 - ssResidual / ssTotal) * 100) / 100 : 0;

  return { ceiling, decayRate, r2, iterations: iterations.length };
}

/** Determine optimal stop iteration (where marginal improvement < cost). Satisfies: U4 */
export function findOptimalStopIteration(
  iterations: IterationScores[],
  tokenBudget: number
): number {
  if (iterations.length < 2) return iterations.length;

  let bestRoi = 0;
  let bestIteration = 1;

  for (let i = 1; i <= iterations.length; i++) {
    const totalTokens = iterations.slice(0, i).reduce((sum, it) => sum + it.tokensUsed, 0);
    const improvement = iterations[i - 1].compositeScore - iterations[0].compositeScore + iterations[0].delta;
    const roi = totalTokens > 0 ? improvement / totalTokens : 0;

    if (roi >= bestRoi) {
      bestRoi = roi;
      bestIteration = i;
    }
  }

  return bestIteration;
}

/** Curve fit parameters for diminishing returns model */
export interface CurveFit {
  ceiling: number;
  decayRate: number;
  r2: number;
  iterations: number;
}

// ─── Report Rendering (RT-6) ────────────────────────────────────────────────

/** Render token consumption dashboard as markdown. Satisfies: U2 */
export function renderTokenDashboard(
  breakdown: TokenBreakdown,
  totalTokens: number,
  improvement: number,
  iterationHistory: IterationScores[]
): string {
  const cost = estimateCost(totalTokens);
  const efficiency = computeEfficiencyRatio(totalTokens, improvement);
  const total = breakdown.discovery + breakdown.baseline + breakdown.evaluation +
    breakdown.improvement + breakdown.reporting;

  const pct = (phase: number) => total > 0 ? `${Math.round((phase / total) * 100)}%` : "0%";

  const lines: string[] = [
    "## Token Consumption Dashboard",
    "",
    "| Phase | Tokens | % of Total |",
    "|-------|--------|-----------|",
    `| Discovery | ${breakdown.discovery.toLocaleString()} | ${pct(breakdown.discovery)} |`,
    `| Baseline | ${breakdown.baseline.toLocaleString()} | ${pct(breakdown.baseline)} |`,
    `| Evaluation | ${breakdown.evaluation.toLocaleString()} | ${pct(breakdown.evaluation)} |`,
    `| Improvement | ${breakdown.improvement.toLocaleString()} | ${pct(breakdown.improvement)} |`,
    `| Reporting | ${breakdown.reporting.toLocaleString()} | ${pct(breakdown.reporting)} |`,
    `| **Total** | **${totalTokens.toLocaleString()}** | **100%** |`,
    "",
    "| Metric | Value |",
    "|--------|-------|",
    `| Estimated Cost | $${cost.toFixed(2)} |`,
    `| Improvement | +${improvement.toFixed(1)} points |`,
    `| Efficiency | ${efficiency === Number.POSITIVE_INFINITY ? "N/A" : `${efficiency.toLocaleString()} tokens/point`} |`,
    `| Points per Dollar | ${cost > 0 ? (improvement / cost).toFixed(1) : "N/A"} |`,
    "",
  ];

  // Per-iteration sparkline
  if (iterationHistory.length > 0) {
    lines.push("### Per-Iteration Token Usage");
    lines.push("");
    lines.push("| Iter | Tokens | Cumulative | Score |");
    lines.push("|------|--------|------------|-------|");
    let cumulative = 0;
    for (const iter of iterationHistory) {
      cumulative += iter.tokensUsed;
      lines.push(
        `| ${iter.iteration} | ${iter.tokensUsed.toLocaleString()} | ${cumulative.toLocaleString()} | ${iter.compositeScore} |`
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

/** Render trajectory analysis as markdown. Satisfies: U4 */
export function renderTrajectoryAnalysis(
  iterations: IterationScores[],
  curve: CurveFit,
  optimalStop: number,
  phaseTransitionIteration?: number
): string {
  const lines: string[] = [
    "## Trajectory Analysis",
    "",
    `**Predicted Ceiling:** ${curve.ceiling} (fit R\u00B2=${curve.r2})`,
    `**Decay Rate:** ${(curve.decayRate * 100).toFixed(0)}% (second-half gain vs first-half)`,
    `**Optimal Stop:** Iteration ${optimalStop} (best ROI per token)`,
    "",
  ];

  if (phaseTransitionIteration) {
    lines.push(
      `**Aggregation Phase Transition:** Iteration ${phaseTransitionIteration} (arithmetic \u2192 harmonic)`,
      ""
    );
  }

  // ASCII trajectory chart
  if (iterations.length > 0) {
    lines.push("### Score Trajectory");
    lines.push("```");
    const maxScore = Math.max(...iterations.map((i) => i.compositeScore), curve.ceiling);
    const chartHeight = 10;
    for (let row = chartHeight; row >= 0; row--) {
      const threshold = (row / chartHeight) * maxScore;
      const label = Math.round(threshold).toString().padStart(3);
      let rowStr = `${label} |`;
      for (const iter of iterations) {
        const marker = iter.compositeScore >= threshold ? "\u2588" : " ";
        rowStr += ` ${marker}`;
      }
      // Show ceiling line
      if (Math.abs(threshold - curve.ceiling) < maxScore / chartHeight) {
        rowStr += ` \u2190 ceiling (${curve.ceiling})`;
      }
      lines.push(rowStr);
    }
    lines.push(`    +${"\u2500".repeat(iterations.length * 2 + 1)}`);
    const iterLabels = iterations.map((i) => i.iteration.toString().padStart(2)).join("");
    lines.push(`     ${iterLabels}`);
    lines.push("```");
    lines.push("");
  }

  return lines.join("\n");
}

/** Render confidence intervals as markdown. Satisfies: U3 */
export function renderConfidenceIntervals(
  intervals: Record<string, ConfidenceInterval>
): string {
  const lines: string[] = [
    "## Score Confidence",
    "",
    "| Constraint | Score | 95% CI | Std Dev | n |",
    "|------------|-------|--------|---------|---|",
  ];

  for (const [id, ci] of Object.entries(intervals)) {
    lines.push(
      `| ${id} | ${ci.mean} | [${ci.lower}, ${ci.upper}] | \u00B1${ci.stdDev} | ${ci.n} |`
    );
  }
  lines.push("");
  return lines.join("\n");
}

/** Build production-enhanced report from loop state. Satisfies: RT-6, B4 */
export function buildProductionReport(
  state: LoopState,
  breakdown: TokenBreakdown,
  perIterationTokens: ConstraintTokenUsage[][],
  confidenceIntervals: Record<string, ConfidenceInterval>,
  learningReport?: string
): ProductionReport {
  const latest = state.iterations[state.iterations.length - 1];
  const finalScores = latest?.scores ?? state.baseline.scores;

  const improvement: Record<string, number> = {};
  for (const [id, baselineScore] of Object.entries(state.baseline.scores)) {
    const finalScore = finalScores[id] ?? baselineScore;
    improvement[id] = computeImprovementPct(baselineScore, finalScore);
  }

  const baselineComposite = state.baseline.compositeScore;
  const finalComposite = latest?.compositeScore ?? baselineComposite;
  const compositeImprovement = computeImprovementPct(baselineComposite, finalComposite);

  const curve = fitDiminishingReturnsCurve(state.iterations);
  const optimalStop = findOptimalStopIteration(state.iterations, state.config.tokenBudget);
  const absoluteImprovement = finalComposite - baselineComposite;

  return {
    runId: state.runId,
    scope: state.scope,
    startedAt: state.startedAt,
    completedAt: new Date().toISOString(),
    totalIterations: state.currentIteration,
    stopReason: state.stopReason ?? "unknown",
    baseline: state.baseline.scores,
    final: finalScores,
    improvement,
    compositeImprovement,
    iterationHistory: state.iterations,
    scopeProposals: state.scopeExpansionProposals,
    learningReport,
    tokenBreakdown: breakdown,
    perIterationTokens,
    estimatedCostUsd: estimateCost(state.totalTokensUsed),
    tokensPerImprovementPoint: computeEfficiencyRatio(state.totalTokensUsed, absoluteImprovement),
    confidenceIntervals,
    predictedCeiling: curve.ceiling,
    optimalStopIteration: optimalStop,
  };
}
