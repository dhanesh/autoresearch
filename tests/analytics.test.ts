// Tests for RT-3 (Token Accounting), RT-6 (Report Analytics)
// Validates: B3, B4, T4, U2, U3, U4

import { describe, expect, it } from "vitest";
import {
  addPhaseTokens,
  computeConfidenceInterval,
  computeEfficiencyRatio,
  emptyTokenBreakdown,
  estimateCost,
  findOptimalStopIteration,
  fitDiminishingReturnsCurve,
  renderConfidenceIntervals,
  renderTokenDashboard,
  renderTrajectoryAnalysis,
} from "../src/analytics";
import type { IterationScores } from "../src/types";

describe("Token Accounting (RT-3, T4)", () => {
  it("creates empty breakdown", () => {
    const bd = emptyTokenBreakdown();
    expect(bd.discovery + bd.baseline + bd.evaluation + bd.improvement + bd.reporting).toBe(0);
  });

  it("accumulates phase tokens", () => {
    let bd = emptyTokenBreakdown();
    bd = addPhaseTokens(bd, "evaluation", 5000);
    bd = addPhaseTokens(bd, "evaluation", 3000);
    bd = addPhaseTokens(bd, "improvement", 10000);
    expect(bd.evaluation).toBe(8000);
    expect(bd.improvement).toBe(10000);
  });

  it("does not mutate original", () => {
    const bd = emptyTokenBreakdown();
    const bd2 = addPhaseTokens(bd, "discovery", 1000);
    expect(bd.discovery).toBe(0);
    expect(bd2.discovery).toBe(1000);
  });
});

describe("Efficiency Ratio (B3, U2)", () => {
  it("computes tokens per improvement point", () => {
    expect(computeEfficiencyRatio(100000, 10)).toBe(10000);
  });

  it("returns Infinity for zero improvement", () => {
    expect(computeEfficiencyRatio(50000, 0)).toBe(Number.POSITIVE_INFINITY);
  });

  it("returns Infinity for negative improvement", () => {
    expect(computeEfficiencyRatio(50000, -5)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("Cost Estimation (U2)", () => {
  it("estimates cost from token count", () => {
    const cost = estimateCost(100000);
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeLessThan(10); // Sanity check: 100k tokens shouldn't cost $10
  });

  it("returns 0 for 0 tokens", () => {
    expect(estimateCost(0)).toBe(0);
  });
});

describe("Confidence Intervals (U3)", () => {
  it("computes CI from dimension scores", () => {
    const ci = computeConfidenceInterval([80, 85, 72, 90]);
    expect(ci.mean).toBeCloseTo(81.8, 0);
    expect(ci.lower).toBeLessThan(ci.mean);
    expect(ci.upper).toBeGreaterThan(ci.mean);
    expect(ci.n).toBe(4);
  });

  it("handles single score (no spread)", () => {
    const ci = computeConfidenceInterval([75]);
    expect(ci.mean).toBe(75);
    expect(ci.lower).toBe(75);
    expect(ci.upper).toBe(75);
    expect(ci.stdDev).toBe(0);
  });

  it("handles empty array", () => {
    const ci = computeConfidenceInterval([]);
    expect(ci.mean).toBe(0);
    expect(ci.n).toBe(0);
  });

  it("widens interval for high variance", () => {
    const narrow = computeConfidenceInterval([78, 80, 79, 81]);
    const wide = computeConfidenceInterval([40, 90, 50, 100]);
    expect(wide.upper - wide.lower).toBeGreaterThan(narrow.upper - narrow.lower);
  });
});

const mockIterations: IterationScores[] = [
  { iteration: 1, timestamp: "", scores: {}, compositeScore: 72, delta: 7.0, tokensUsed: 20000, durationMs: 30000, status: "improved" },
  { iteration: 2, timestamp: "", scores: {}, compositeScore: 78, delta: 6.0, tokensUsed: 18000, durationMs: 25000, status: "improved" },
  { iteration: 3, timestamp: "", scores: {}, compositeScore: 82, delta: 4.0, tokensUsed: 22000, durationMs: 28000, status: "improved" },
  { iteration: 4, timestamp: "", scores: {}, compositeScore: 84, delta: 2.0, tokensUsed: 19000, durationMs: 26000, status: "improved" },
  { iteration: 5, timestamp: "", scores: {}, compositeScore: 85, delta: 1.0, tokensUsed: 21000, durationMs: 27000, status: "improved" },
  { iteration: 6, timestamp: "", scores: {}, compositeScore: 85, delta: 0.0, tokensUsed: 20000, durationMs: 25000, status: "reverted" },
];

describe("Trajectory Analysis (U4)", () => {
  it("fits diminishing returns curve", () => {
    const curve = fitDiminishingReturnsCurve(mockIterations);
    expect(curve.ceiling).toBeGreaterThanOrEqual(85);
    expect(curve.ceiling).toBeLessThanOrEqual(100);
    expect(curve.decayRate).toBeGreaterThan(0);
    expect(curve.iterations).toBe(6);
  });

  it("handles insufficient data", () => {
    const curve = fitDiminishingReturnsCurve(mockIterations.slice(0, 2));
    expect(curve.ceiling).toBe(100); // Default
  });

  it("predicts ceiling above current score", () => {
    const curve = fitDiminishingReturnsCurve(mockIterations);
    const lastScore = mockIterations[mockIterations.length - 1].compositeScore;
    expect(curve.ceiling).toBeGreaterThanOrEqual(lastScore);
  });
});

describe("Optimal Stop (U4)", () => {
  it("finds iteration with best ROI", () => {
    const optimal = findOptimalStopIteration(mockIterations, 500000);
    expect(optimal).toBeGreaterThan(0);
    expect(optimal).toBeLessThanOrEqual(mockIterations.length);
  });

  it("returns 1 for single iteration", () => {
    expect(findOptimalStopIteration([mockIterations[0]], 500000)).toBe(1);
  });
});

describe("Report Rendering", () => {
  it("renders token dashboard markdown (U2)", () => {
    const breakdown = { discovery: 5000, baseline: 10000, evaluation: 40000, improvement: 35000, reporting: 10000 };
    const md = renderTokenDashboard(breakdown, 100000, 13, mockIterations);
    expect(md).toContain("Token Consumption Dashboard");
    expect(md).toContain("Estimated Cost");
    expect(md).toContain("Efficiency");
    expect(md).toContain("Points per Dollar");
  });

  it("renders trajectory analysis markdown (U4)", () => {
    const curve = fitDiminishingReturnsCurve(mockIterations);
    const md = renderTrajectoryAnalysis(mockIterations, curve, 3, 4);
    expect(md).toContain("Trajectory Analysis");
    expect(md).toContain("Predicted Ceiling");
    expect(md).toContain("Optimal Stop");
    expect(md).toContain("Aggregation Phase Transition");
  });

  it("renders confidence intervals markdown (U3)", () => {
    const intervals = {
      "eval-llm": computeConfidenceInterval([80, 85, 72, 90]),
    };
    const md = renderConfidenceIntervals(intervals);
    expect(md).toContain("Score Confidence");
    expect(md).toContain("eval-llm");
    expect(md).toContain("95% CI");
  });
});
