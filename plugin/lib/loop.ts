// Satisfies: RT-6 (Iteration State Machine), RT-2 (Baseline Capture), RT-4 (Non-Interactive Git)
// Satisfies: T5 (Diminishing Returns), O1 (Max Iterations), O2 (Token Budget), O3 (Circuit Breaker)
// Satisfies: T1 (Git Branch Isolation), T6 (Parallel Eval), TN4 (Retry Before Trip), TN6 (Plateau Window)
// Core loop engine — orchestrates the improve-evaluate-iterate cycle

import type {
  EvalResult,
  IterationScores,
  LoopConfig,
  LoopState,
  NormalizedScore,
} from "./types";

/** Get the most recent iteration from state, or undefined if none exist */
function lastIteration(state: LoopState): IterationScores | undefined {
  return state.iterations[state.iterations.length - 1];
}

/** Initialize a new loop state with baseline scores. Satisfies: RT-2, RT-6, T1 */
export function initLoopState(
  config: LoopConfig,
  scope: string[],
  baseline: IterationScores,
  branch: string
): LoopState {
  const bestScores: Record<string, NormalizedScore> = {};
  for (const [id, score] of Object.entries(baseline.scores)) {
    bestScores[id] = score;
  }

  return {
    runId: `ar-${Date.now()}`,
    branch,
    scope,
    startedAt: new Date().toISOString(),
    config,
    baseline,
    iterations: [],
    currentIteration: 0,
    bestScores,
    bestComposite: baseline.compositeScore,
    plateauCounter: 0,
    totalTokensUsed: 0,
    totalDurationMs: 0,
    stopReason: undefined,
    stopDetails: undefined,
    scopeExpansionProposals: [],
  };
}

/** Check if the loop should continue. Satisfies: O1, O2, O4, T5, TN6
 *  Returns null if should continue, or stop reason if should stop */
export function shouldStop(state: LoopState): {
  reason: LoopState["stopReason"];
  details: string;
} | null {
  // O1: Max iterations cap
  if (state.currentIteration >= state.config.maxIterations) {
    return {
      reason: "max_iterations",
      details: `Reached maximum iteration cap (${state.config.maxIterations})`,
    };
  }

  // O2: Token budget
  if (state.totalTokensUsed >= state.config.tokenBudget) {
    return {
      reason: "token_budget",
      details: `Token budget exhausted (${state.totalTokensUsed}/${state.config.tokenBudget})`,
    };
  }

  // O4: Wall-clock timeout
  const elapsed =
    (Date.now() - new Date(state.startedAt).getTime()) / 1000;
  if (elapsed >= state.config.totalTimeoutSeconds) {
    return {
      reason: "timeout",
      details: `Wall-clock timeout reached (${Math.round(elapsed)}s / ${state.config.totalTimeoutSeconds}s)`,
    };
  }

  // T5 + TN6: Diminishing returns with plateau window
  if (state.plateauCounter >= state.config.plateauWindow) {
    return {
      reason: "converged",
      details: `Diminishing returns detected: ${state.plateauCounter} consecutive iterations below threshold (${state.config.convergenceThreshold})`,
    };
  }

  return null; // Continue
}

/** Result of processing an iteration's evaluation results */
export interface IterationProcessResult {
  scores: IterationScores;
  action: "keep" | "revert" | "circuit_break";
  regressionDetails?: string;
}

/** Build the score map and weighted composite from evaluation results */
function computeComposite(results: EvalResult[]): {
  scores: Record<string, NormalizedScore>;
  compositeScore: NormalizedScore;
} {
  const scores: Record<string, NormalizedScore> = {};
  for (const r of results) {
    scores[r.constraintId] = r.normalizedScore;
  }

  const count = results.length;
  const compositeScore =
    count > 0
      ? Math.round(results.reduce((sum, r) => sum + r.normalizedScore, 0) / count)
      : 0;

  return { scores, compositeScore };
}

/** Check if any constraint regressed beyond the circuit breaker threshold. Satisfies: O3 */
function checkCircuitBreaker(
  scores: Record<string, NormalizedScore>,
  state: LoopState
): { constraintId: string; regressionPct: number } | null {
  for (const [constraintId, score] of Object.entries(scores)) {
    const best = state.bestScores[constraintId] ?? state.baseline.scores[constraintId] ?? 0;
    if (best > 0) {
      const regressionPct = (best - score) / best;
      if (regressionPct > state.config.regressionThreshold) {
        return { constraintId, regressionPct };
      }
    }
  }
  return null;
}

/** Process evaluation results for an iteration. Satisfies: RT-6, O3, TN4, TN6 */
export function processIterationResults(
  state: LoopState,
  results: EvalResult[],
  tokensUsed: number,
  durationMs: number
): IterationProcessResult {
  const { scores, compositeScore } = computeComposite(results);

  const prevComposite = lastIteration(state)?.compositeScore ?? state.baseline.compositeScore;

  const delta = compositeScore - prevComposite;

  // O3 + TN4: Check for regression circuit breaker
  const regression = checkCircuitBreaker(scores, state);
  if (regression) {
    return {
      scores: {
        iteration: state.currentIteration + 1,
        timestamp: new Date().toISOString(),
        scores,
        compositeScore,
        delta,
        tokensUsed,
        durationMs,
        status: "regressed",
      },
      action: "circuit_break",
      regressionDetails: `Constraint "${regression.constraintId}" regressed ${(regression.regressionPct * 100).toFixed(1)}% from best. Threshold: ${state.config.regressionThreshold * 100}%`,
    };
  }

  const improved = compositeScore > prevComposite;

  return {
    scores: {
      iteration: state.currentIteration + 1,
      timestamp: new Date().toISOString(),
      scores,
      compositeScore,
      delta,
      tokensUsed,
      durationMs,
      status: improved ? "improved" : "reverted",
    },
    action: improved ? "keep" : "revert",
  };
}

/** Update loop state after an iteration. Satisfies: RT-6 */
export function updateState(
  state: LoopState,
  iterationScores: IterationScores,
  action: "keep" | "revert",
  commitHash?: string
): LoopState {
  const newState = { ...state };

  iterationScores.commitHash = commitHash;
  iterationScores.status = action === "keep" ? "improved" : "reverted";
  newState.iterations = [...state.iterations, iterationScores];
  newState.currentIteration = state.currentIteration + 1;
  newState.totalTokensUsed = state.totalTokensUsed + iterationScores.tokensUsed;
  newState.totalDurationMs = state.totalDurationMs + iterationScores.durationMs;

  // Update best scores if improved
  if (action === "keep") {
    for (const [id, score] of Object.entries(iterationScores.scores)) {
      if (score > (newState.bestScores[id] ?? 0)) {
        newState.bestScores[id] = score;
      }
    }
    if (iterationScores.compositeScore > newState.bestComposite) {
      newState.bestComposite = iterationScores.compositeScore;
    }
  }

  // Update plateau counter (TN6)
  const belowThreshold =
    Math.abs(iterationScores.delta) < state.config.convergenceThreshold;
  newState.plateauCounter = belowThreshold
    ? state.plateauCounter + 1
    : 0; // Reset on meaningful change

  return newState;
}

/** Format live progress line for display. Satisfies: U1 */
export function formatProgress(state: LoopState): string {
  const latest = lastIteration(state);
  const elapsed = Math.round(
    (Date.now() - new Date(state.startedAt).getTime()) / 1000
  );

  if (!latest) {
    return `[autoresearch] Iteration 0/${state.config.maxIterations} | Baseline captured | Elapsed: ${elapsed}s`;
  }

  const delta = latest.delta >= 0 ? `+${latest.delta.toFixed(1)}` : latest.delta.toFixed(1);
  const plateauIndicator =
    state.plateauCounter > 0
      ? ` | Plateau: ${state.plateauCounter}/${state.config.plateauWindow}`
      : "";

  return `[autoresearch] Iteration ${latest.iteration}/${state.config.maxIterations} | Score: ${latest.compositeScore} (${delta}) | Tokens: ${state.totalTokensUsed} | Elapsed: ${elapsed}s${plateauIndicator}`;
}

/** Generate git branch name. Satisfies: T1 */
export function generateBranchName(scope: string[]): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const scopeSlug = scope
    .map((s) => s.replace(/[^a-zA-Z0-9]/g, "-"))
    .join("_")
    .slice(0, 30);
  return `autoresearch/${timestamp}-${scopeSlug}`;
}
