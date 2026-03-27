// Tests for RT-2 (Composite Scoring Engine)
// Validates: B2, T3, T8, TN5

import { describe, expect, it } from "vitest";
import {
  computeEffectSize,
  DEFAULT_SCORING,
  getAggregationPhase,
  phaseAdaptiveComposite,
  weightedArithmeticMean,
  weightedGeometricMean,
  weightedHarmonicMean,
} from "../src/scoring";
import type { EvalResult } from "../src/types";

describe("weightedArithmeticMean (T3)", () => {
  it("computes weighted average", () => {
    expect(weightedArithmeticMean([80, 60], [0.5, 0.5])).toBe(70);
  });

  it("applies unequal weights", () => {
    expect(weightedArithmeticMean([100, 0], [0.75, 0.25])).toBe(75);
  });

  it("handles empty inputs", () => {
    expect(weightedArithmeticMean([], [])).toBe(0);
  });

  it("handles single score", () => {
    expect(weightedArithmeticMean([85], [1.0])).toBe(85);
  });
});

describe("weightedHarmonicMean (T3)", () => {
  it("penalizes imbalance more than arithmetic", () => {
    const scores = [100, 20];
    const weights = [0.5, 0.5];
    const harmonic = weightedHarmonicMean(scores, weights);
    const arithmetic = weightedArithmeticMean(scores, weights);
    expect(harmonic).toBeLessThan(arithmetic);
  });

  it("equals arithmetic when all scores are equal", () => {
    expect(weightedHarmonicMean([70, 70, 70], [1, 1, 1])).toBe(70);
  });

  it("returns 0 for zero scores", () => {
    expect(weightedHarmonicMean([100, 0], [0.5, 0.5])).toBe(0);
  });

  it("handles empty inputs", () => {
    expect(weightedHarmonicMean([], [])).toBe(0);
  });
});

describe("weightedGeometricMean (T3)", () => {
  it("is between harmonic and arithmetic for unequal scores", () => {
    const scores = [80, 40];
    const weights = [0.5, 0.5];
    const geo = weightedGeometricMean(scores, weights);
    const harm = weightedHarmonicMean(scores, weights);
    const arith = weightedArithmeticMean(scores, weights);
    expect(geo).toBeGreaterThanOrEqual(harm);
    expect(geo).toBeLessThanOrEqual(arith);
  });

  it("returns 0 for zero scores", () => {
    expect(weightedGeometricMean([50, 0], [0.5, 0.5])).toBe(0);
  });
});

describe("getAggregationPhase (TN5-C)", () => {
  it("returns primary method before transition point", () => {
    const method = getAggregationPhase(2, 20, [50, 60], DEFAULT_SCORING);
    expect(method).toBe("arithmetic");
  });

  it("switches after 40% of iterations", () => {
    const method = getAggregationPhase(9, 20, [70, 75], DEFAULT_SCORING);
    expect(method).toBe("harmonic");
  });

  it("switches when all scores above threshold", () => {
    const method = getAggregationPhase(3, 20, [85, 90, 82], DEFAULT_SCORING);
    expect(method).toBe("harmonic");
  });

  it("does not switch if any score below threshold", () => {
    const method = getAggregationPhase(3, 20, [85, 90, 75], DEFAULT_SCORING);
    expect(method).toBe("arithmetic");
  });
});

describe("phaseAdaptiveComposite (T3, T8, TN5)", () => {
  const results: EvalResult[] = [
    { constraintId: "a", mechanism: "static", rawOutput: "", normalizedScore: 80, durationMs: 0, success: true },
    { constraintId: "b", mechanism: "tests", rawOutput: "", normalizedScore: 60, durationMs: 0, success: true },
  ];
  const weights = { a: 0.5, b: 0.5 };

  it("uses arithmetic mean in early iterations", () => {
    const result = phaseAdaptiveComposite(results, weights, DEFAULT_SCORING, 2, 20);
    expect(result.method).toBe("arithmetic");
    expect(result.compositeScore).toBe(70); // (80+60)/2
  });

  it("uses harmonic mean after phase transition", () => {
    const result = phaseAdaptiveComposite(results, weights, DEFAULT_SCORING, 10, 20);
    expect(result.method).toBe("harmonic");
    expect(result.compositeScore).toBeLessThan(70); // harmonic < arithmetic for unequal
  });

  it("produces score map from results", () => {
    const result = phaseAdaptiveComposite(results, weights, DEFAULT_SCORING, 2, 20);
    expect(result.scores).toEqual({ a: 80, b: 60 });
  });
});

describe("computeEffectSize (B2)", () => {
  it("returns 0 for identical distributions", () => {
    expect(computeEffectSize([70, 70, 70], [70, 70, 70])).toBe(0);
  });

  it("returns positive for improvement", () => {
    expect(computeEffectSize([60, 62, 58], [80, 82, 78])).toBeGreaterThan(0);
  });

  it("returns negative for regression", () => {
    expect(computeEffectSize([80, 82, 78], [60, 62, 58])).toBeLessThan(0);
  });

  it("handles empty arrays", () => {
    expect(computeEffectSize([], [])).toBe(0);
  });
});
