// Tests for RT-5 (Adaptive LLM Eval Scheduler)
// Validates: T5, U3, O3, TN3

import { describe, expect, it } from "vitest";
import {
  computeVolatility,
  DEFAULT_SCHEDULING,
  estimateTokenSavings,
  getEvalDecision,
  shouldForceFullEval,
} from "../src/scheduling";
import type { IterationScores } from "../src/types";

function makeIteration(iteration: number, delta: number): IterationScores {
  return {
    iteration,
    timestamp: "",
    scores: {},
    compositeScore: 80 + delta,
    delta,
    tokensUsed: 10000,
    durationMs: 5000,
    status: delta > 0 ? "improved" : "reverted",
  };
}

describe("computeVolatility (T5)", () => {
  it("returns Infinity for insufficient data", () => {
    expect(computeVolatility([makeIteration(1, 5)])).toBe(Number.POSITIVE_INFINITY);
  });

  it("returns 0 for constant deltas", () => {
    const iters = [makeIteration(1, 2), makeIteration(2, 2), makeIteration(3, 2)];
    expect(computeVolatility(iters)).toBe(0);
  });

  it("returns higher value for variable deltas", () => {
    const stable = [makeIteration(1, 1), makeIteration(2, 1), makeIteration(3, 1)];
    const volatile = [makeIteration(1, 10), makeIteration(2, -5), makeIteration(3, 8)];
    expect(computeVolatility(volatile)).toBeGreaterThan(computeVolatility(stable));
  });

  it("uses only the last N iterations (window)", () => {
    const iters = [
      makeIteration(1, 100), // Old high-volatility data
      makeIteration(2, -50),
      makeIteration(3, 1),   // Recent stable data
      makeIteration(4, 1),
      makeIteration(5, 1),
    ];
    const vol = computeVolatility(iters, 3);
    expect(vol).toBe(0); // Only looks at last 3 (all delta=1)
  });
});

describe("getEvalDecision (T5, TN3)", () => {
  it("always runs full eval on first 3 iterations", () => {
    expect(getEvalDecision(1, [], DEFAULT_SCHEDULING)).toBe("full");
    expect(getEvalDecision(2, [makeIteration(1, 5)], DEFAULT_SCHEDULING)).toBe("full");
    expect(getEvalDecision(3, [makeIteration(1, 5), makeIteration(2, 3)], DEFAULT_SCHEDULING)).toBe("full");
  });

  it("runs full eval for high volatility", () => {
    const volatile = [
      makeIteration(1, 10), makeIteration(2, -5),
      makeIteration(3, 8), makeIteration(4, -3),
    ];
    expect(getEvalDecision(5, volatile, DEFAULT_SCHEDULING)).toBe("full");
  });

  it("runs lite probe for low volatility", () => {
    const stable = [
      makeIteration(1, 0.1), makeIteration(2, 0.2),
      makeIteration(3, 0.1), makeIteration(4, 0.0),
    ];
    const decision = getEvalDecision(6, stable, DEFAULT_SCHEDULING);
    expect(decision).toBe("lite");
  });

  it("forces full eval at minimum interval even with low volatility", () => {
    const stable = [
      makeIteration(1, 0.1), makeIteration(2, 0.1),
      makeIteration(3, 0.1), makeIteration(4, 0.1),
      makeIteration(5, 0.1), makeIteration(6, 0.1),
      makeIteration(7, 0.1), makeIteration(8, 0.1),
      makeIteration(9, 0.1),
    ];
    // Iteration 10 should be full (minimumFullEvalInterval = 5, 10 % 5 === 0)
    const decision = getEvalDecision(10, stable, DEFAULT_SCHEDULING);
    expect(decision).toBe("full");
  });
});

describe("shouldForceFullEval", () => {
  it("forces full eval on final report", () => {
    expect(shouldForceFullEval(5, 20, true)).toBe(true);
  });

  it("forces full eval on last iteration", () => {
    expect(shouldForceFullEval(20, 20, false)).toBe(true);
  });

  it("does not force in normal operation", () => {
    expect(shouldForceFullEval(5, 20, false)).toBe(false);
  });
});

describe("estimateTokenSavings (O3)", () => {
  it("calculates savings from adaptive scheduling", () => {
    const decisions = ["full", "lite", "lite", "full", "lite"] as const;
    const savings = estimateTokenSavings(5, 10000, 2500, [...decisions]);
    expect(savings.fixedCost).toBe(50000);
    expect(savings.fullEvals).toBe(2);
    expect(savings.liteProbes).toBe(3);
    expect(savings.savedTokens).toBeGreaterThan(0);
    expect(savings.savingsPct).toBeGreaterThan(0);
  });

  it("shows 0 savings when all full", () => {
    const decisions = ["full", "full", "full"] as const;
    const savings = estimateTokenSavings(3, 10000, 2500, [...decisions]);
    expect(savings.savedTokens).toBe(0);
    expect(savings.savingsPct).toBe(0);
  });
});
