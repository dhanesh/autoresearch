// Integration tests for the full loop lifecycle
// Validates: convergence, circuit breaker, plateau detection, state immutability

import { describe, expect, it } from "vitest";
import { initLoopState, shouldStop, processIterationResults, updateState } from "../../src/loop";
import type { LoopConfig, IterationScores, EvalResult } from "../../src/types";
import { DEFAULTS } from "../../src/types";

const testConfig: LoopConfig = {
  ...DEFAULTS,
  maxIterations: 10,
  plateauWindow: 3,
  convergenceThreshold: 0.5,
  regressionThreshold: 0.10,
};

function makeBaseline(scores: Record<string, number>, composite: number): IterationScores {
  return {
    iteration: 0,
    timestamp: new Date().toISOString(),
    scores,
    compositeScore: composite,
    delta: 0,
    tokensUsed: 0,
    durationMs: 0,
    status: "improved",
  };
}

function makeResults(scores: Record<string, number>): EvalResult[] {
  return Object.entries(scores).map(([id, score]) => ({
    constraintId: id,
    mechanism: "static" as const,
    rawOutput: "",
    normalizedScore: score,
    durationMs: 100,
    success: true,
  }));
}

describe("Normal convergence lifecycle", () => {
  it("initState -> improving iterations -> shouldStop returns converged", () => {
    const baseline = makeBaseline({ lint: 60, tests: 60 }, 60);
    let state = initLoopState(testConfig, ["src/"], baseline, "test-branch");

    // Verify initial state
    expect(state.currentIteration).toBe(0);
    expect(state.bestComposite).toBe(60);
    expect(shouldStop(state)).toBeNull();

    // Iteration 1: significant improvement
    const results1 = makeResults({ lint: 75, tests: 75 });
    const { action: action1, scores: scores1 } = processIterationResults(state, results1, 500, 200);
    expect(action1).toBe("keep");
    expect(scores1.compositeScore).toBe(75);
    state = updateState(state, scores1, action1);
    expect(state.currentIteration).toBe(1);
    expect(state.bestComposite).toBe(75);
    expect(state.plateauCounter).toBe(0);

    // Iteration 2: more improvement
    const results2 = makeResults({ lint: 85, tests: 85 });
    const { action: action2, scores: scores2 } = processIterationResults(state, results2, 500, 200);
    expect(action2).toBe("keep");
    state = updateState(state, scores2, action2);
    expect(state.bestComposite).toBe(85);

    // Iterations 3-5: plateau (delta < convergenceThreshold of 0.5)
    for (let i = 3; i <= 5; i++) {
      const results = makeResults({ lint: 85, tests: 85 });
      const { scores } = processIterationResults(state, results, 500, 200);
      state = updateState(state, scores, "revert");
    }

    // After 3 plateau iterations, shouldStop should return converged
    expect(state.plateauCounter).toBe(3);
    const stopCondition = shouldStop(state);
    expect(stopCondition).not.toBeNull();
    expect(stopCondition?.reason).toBe("converged");
  });
});

describe("Circuit breaker lifecycle", () => {
  it("processIterationResults with regressed score triggers circuit_break", () => {
    const baseline = makeBaseline({ lint: 80, tests: 90 }, 85);
    const state = initLoopState(testConfig, ["src/"], baseline, "test-branch");

    // Large regression: lint 80 -> 60 = 25% regression (exceeds 10% threshold)
    const results = makeResults({ lint: 60, tests: 90 });
    const { action, regressionDetails } = processIterationResults(state, results, 500, 200);

    expect(action).toBe("circuit_break");
    expect(regressionDetails).toBeDefined();
    expect(regressionDetails).toContain("lint");
  });

  it("small regression results in revert, not circuit_break", () => {
    const baseline = makeBaseline({ lint: 80, tests: 90 }, 85);
    const state = initLoopState(testConfig, ["src/"], baseline, "test-branch");

    // Small regression: lint 80 -> 75 = 6.25% (under 10% threshold)
    const results = makeResults({ lint: 75, tests: 90 });
    const { action } = processIterationResults(state, results, 500, 200);

    expect(action).toBe("revert");
  });

  it("circuit break is checked against best scores, not just previous iteration", () => {
    const baseline = makeBaseline({ lint: 70, tests: 70 }, 70);
    let state = initLoopState(testConfig, ["src/"], baseline, "test-branch");

    // Iteration 1: improve lint to 90
    const results1 = makeResults({ lint: 90, tests: 80 });
    const { scores: scores1 } = processIterationResults(state, results1, 500, 200);
    state = updateState(state, scores1, "keep");
    expect(state.bestScores.lint).toBe(90);

    // Iteration 2: lint drops to 70 (22% regression from best of 90)
    const results2 = makeResults({ lint: 70, tests: 80 });
    const { action } = processIterationResults(state, results2, 500, 200);
    expect(action).toBe("circuit_break");
  });
});

describe("Plateau detection lifecycle", () => {
  it("multiple iterations with delta below threshold triggers converged after plateauWindow", () => {
    const baseline = makeBaseline({ lint: 80, tests: 80 }, 80);
    let state = initLoopState(testConfig, ["src/"], baseline, "test-branch");

    // Run plateauWindow iterations with minimal change
    for (let i = 0; i < testConfig.plateauWindow; i++) {
      expect(shouldStop(state)).toBeNull();

      const results = makeResults({ lint: 80, tests: 80 });
      const { scores } = processIterationResults(state, results, 500, 200);
      state = updateState(state, scores, "revert");
    }

    expect(state.plateauCounter).toBe(testConfig.plateauWindow);
    const stop = shouldStop(state);
    expect(stop).not.toBeNull();
    expect(stop?.reason).toBe("converged");
  });

  it("a meaningful improvement resets the plateau counter", () => {
    const baseline = makeBaseline({ lint: 70, tests: 70 }, 70);
    let state = initLoopState(testConfig, ["src/"], baseline, "test-branch");

    // 2 plateau iterations
    for (let i = 0; i < 2; i++) {
      const results = makeResults({ lint: 70, tests: 70 });
      const { scores } = processIterationResults(state, results, 500, 200);
      state = updateState(state, scores, "revert");
    }
    expect(state.plateauCounter).toBe(2);

    // Meaningful improvement resets counter
    const improvResults = makeResults({ lint: 85, tests: 85 });
    const { scores: improvScores } = processIterationResults(state, improvResults, 500, 200);
    state = updateState(state, improvScores, "keep");
    expect(state.plateauCounter).toBe(0);
  });
});

describe("State immutability", () => {
  it("updateState returns new object, original unchanged", () => {
    const baseline = makeBaseline({ lint: 80, tests: 80 }, 80);
    const original = initLoopState(testConfig, ["src/"], baseline, "test-branch");

    const originalIteration = original.currentIteration;
    const originalPlateau = original.plateauCounter;
    const originalTokens = original.totalTokensUsed;
    const originalIterationsLength = original.iterations.length;

    const iterScores: IterationScores = {
      iteration: 1,
      timestamp: new Date().toISOString(),
      scores: { lint: 90, tests: 90 },
      compositeScore: 90,
      delta: 10,
      tokensUsed: 1000,
      durationMs: 500,
      status: "improved",
    };

    const newState = updateState(original, iterScores, "keep", "abc123");

    // New state is updated
    expect(newState.currentIteration).toBe(1);
    expect(newState.bestComposite).toBe(90);
    expect(newState.iterations).toHaveLength(1);
    expect(newState.totalTokensUsed).toBe(1000);

    // Original state is unchanged
    expect(original.currentIteration).toBe(originalIteration);
    expect(original.plateauCounter).toBe(originalPlateau);
    expect(original.totalTokensUsed).toBe(originalTokens);
    expect(original.iterations).toHaveLength(originalIterationsLength);
  });

  it("updateState does not share iterations array reference", () => {
    const baseline = makeBaseline({ lint: 80, tests: 80 }, 80);
    const original = initLoopState(testConfig, ["src/"], baseline, "test-branch");

    const iterScores: IterationScores = {
      iteration: 1,
      timestamp: new Date().toISOString(),
      scores: { lint: 85, tests: 85 },
      compositeScore: 85,
      delta: 5,
      tokensUsed: 500,
      durationMs: 200,
      status: "improved",
    };

    const newState = updateState(original, iterScores, "keep");

    // Mutating new state's iterations should not affect original
    expect(newState.iterations).not.toBe(original.iterations);
  });
});
