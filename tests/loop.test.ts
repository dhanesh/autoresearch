import { describe, expect, it } from "vitest";
import {
  formatProgress,
  generateBranchName,
  initLoopState,
  processIterationResults,
  shouldStop,
  updateState,
} from "../src/loop";
import type { EvalResult, IterationScores, LoopConfig } from "../src/types";
import { DEFAULTS } from "../src/types";

const baseConfig: LoopConfig = { ...DEFAULTS, maxIterations: 5 };

function makeBaseline(): IterationScores {
  return {
    iteration: 0,
    timestamp: new Date().toISOString(),
    scores: { lint: 80, tests: 90 },
    compositeScore: 85,
    delta: 0,
    tokensUsed: 0,
    durationMs: 0,
    status: "improved",
  };
}

describe("initLoopState", () => {
  it("should create valid initial state from baseline", () => {
    const baseline = makeBaseline();
    const state = initLoopState(baseConfig, ["src/"], baseline, "autoresearch/test");

    expect(state.runId).toMatch(/^ar-/);
    expect(state.branch).toBe("autoresearch/test");
    expect(state.scope).toEqual(["src/"]);
    expect(state.currentIteration).toBe(0);
    expect(state.plateauCounter).toBe(0);
    expect(state.bestComposite).toBe(85);
    expect(state.bestScores.lint).toBe(80);
    expect(state.bestScores.tests).toBe(90);
    expect(state.iterations).toHaveLength(0);
  });
});

describe("shouldStop", () => {
  it("should stop at max iterations", () => {
    const state = initLoopState(baseConfig, ["src/"], makeBaseline(), "test");
    state.currentIteration = 5;
    const result = shouldStop(state);
    expect(result).not.toBeNull();
    expect(result?.reason).toBe("max_iterations");
  });

  it("should stop when token budget exhausted", () => {
    const state = initLoopState(baseConfig, ["src/"], makeBaseline(), "test");
    state.totalTokensUsed = 600_000;
    const result = shouldStop(state);
    expect(result).not.toBeNull();
    expect(result?.reason).toBe("token_budget");
  });

  it("should stop on plateau", () => {
    const state = initLoopState(baseConfig, ["src/"], makeBaseline(), "test");
    state.plateauCounter = 3;
    const result = shouldStop(state);
    expect(result).not.toBeNull();
    expect(result?.reason).toBe("converged");
  });

  it("should continue when no stop condition met", () => {
    const state = initLoopState(baseConfig, ["src/"], makeBaseline(), "test");
    expect(shouldStop(state)).toBeNull();
  });
});

describe("processIterationResults", () => {
  it("should detect improvement", () => {
    const state = initLoopState(baseConfig, ["src/"], makeBaseline(), "test");
    const results: EvalResult[] = [
      { constraintId: "lint", mechanism: "static", rawOutput: "", normalizedScore: 90, durationMs: 100, success: true },
      { constraintId: "tests", mechanism: "tests", rawOutput: "", normalizedScore: 95, durationMs: 200, success: true },
    ];

    const { action, scores } = processIterationResults(state, results, 1000, 300);
    expect(action).toBe("keep");
    expect(scores.compositeScore).toBeGreaterThan(85);
  });

  it("should detect regression within circuit breaker threshold", () => {
    const state = initLoopState(baseConfig, ["src/"], makeBaseline(), "test");
    // Small regression: lint 80→74 (7.5%), tests 90→86 (4.4%) — both under 10% threshold
    const results: EvalResult[] = [
      { constraintId: "lint", mechanism: "static", rawOutput: "", normalizedScore: 74, durationMs: 100, success: true },
      { constraintId: "tests", mechanism: "tests", rawOutput: "", normalizedScore: 86, durationMs: 200, success: true },
    ];

    const { action } = processIterationResults(state, results, 1000, 300);
    expect(action).toBe("revert");
  });

  it("should trigger circuit breaker on large regression", () => {
    const state = initLoopState(baseConfig, ["src/"], makeBaseline(), "test");
    // >10% regression from best: lint was 80, now 60 = 25% regression
    const results: EvalResult[] = [
      { constraintId: "lint", mechanism: "static", rawOutput: "", normalizedScore: 60, durationMs: 100, success: true },
      { constraintId: "tests", mechanism: "tests", rawOutput: "", normalizedScore: 90, durationMs: 200, success: true },
    ];

    const { action, regressionDetails } = processIterationResults(state, results, 1000, 300);
    expect(action).toBe("circuit_break");
    expect(regressionDetails).toContain("lint");
  });
});

describe("updateState", () => {
  it("should update best scores on improvement", () => {
    const state = initLoopState(baseConfig, ["src/"], makeBaseline(), "test");
    const iterScores: IterationScores = {
      iteration: 1,
      timestamp: new Date().toISOString(),
      scores: { lint: 90, tests: 95 },
      compositeScore: 93,
      delta: 8,
      tokensUsed: 1000,
      durationMs: 500,
      status: "improved",
    };

    const newState = updateState(state, iterScores, "keep", "abc123");
    expect(newState.bestScores.lint).toBe(90);
    expect(newState.bestScores.tests).toBe(95);
    expect(newState.bestComposite).toBe(93);
    expect(newState.plateauCounter).toBe(0);
    expect(newState.currentIteration).toBe(1);
  });

  it("should increment plateau on small delta", () => {
    const state = initLoopState(baseConfig, ["src/"], makeBaseline(), "test");
    const iterScores: IterationScores = {
      iteration: 1,
      timestamp: new Date().toISOString(),
      scores: { lint: 80, tests: 90 },
      compositeScore: 85,
      delta: 0.1,
      tokensUsed: 1000,
      durationMs: 500,
      status: "reverted",
    };

    const newState = updateState(state, iterScores, "revert");
    expect(newState.plateauCounter).toBe(1);
  });
});

describe("generateBranchName", () => {
  it("should produce valid git branch name", () => {
    const name = generateBranchName(["src/", "tests/"]);
    expect(name).toMatch(/^autoresearch\/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-src-_tests-$/);
  });
});

describe("formatProgress", () => {
  it("should format baseline state", () => {
    const state = initLoopState(baseConfig, ["src/"], makeBaseline(), "test");
    const output = formatProgress(state);
    expect(output).toContain("Iteration 0/5");
    expect(output).toContain("Baseline captured");
  });

  it("should format iteration with delta", () => {
    const state = initLoopState(baseConfig, ["src/"], makeBaseline(), "test");
    state.iterations.push({
      iteration: 1,
      timestamp: new Date().toISOString(),
      scores: { lint: 90 },
      compositeScore: 90,
      delta: 5,
      tokensUsed: 500,
      durationMs: 200,
      status: "improved",
    });

    const output = formatProgress(state);
    expect(output).toContain("Iteration 1/5");
    expect(output).toContain("+5.0");
  });
});
