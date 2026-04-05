// Tests for T6 (Parallel Evaluation), T7 (Score Determinism), TN3 (Sort Before Score)
// Validates: sorting, concurrency, determinism, error handling

import { describe, expect, it } from "vitest";
import { parallelEvaluate, sortResultsByConstraintId } from "../src/parallel";
import type { EvalResult } from "../src/types";

function makeResult(constraintId: string, score: number): EvalResult {
  return {
    constraintId,
    mechanism: "static",
    rawOutput: "",
    normalizedScore: score,
    durationMs: 0,
    success: true,
  };
}

describe("sortResultsByConstraintId", () => {
  it("sorts results alphabetically by constraintId", () => {
    const input = [
      makeResult("zebra", 50),
      makeResult("alpha", 80),
      makeResult("mid", 70),
    ];
    const sorted = sortResultsByConstraintId(input);
    expect(sorted.map((r) => r.constraintId)).toEqual(["alpha", "mid", "zebra"]);
  });

  it("does not mutate the input array", () => {
    const input = [
      makeResult("b", 50),
      makeResult("a", 80),
    ];
    const originalOrder = input.map((r) => r.constraintId);
    sortResultsByConstraintId(input);
    expect(input.map((r) => r.constraintId)).toEqual(originalOrder);
  });

  it("handles empty array", () => {
    expect(sortResultsByConstraintId([])).toEqual([]);
  });

  it("handles single element", () => {
    const input = [makeResult("only", 100)];
    const sorted = sortResultsByConstraintId(input);
    expect(sorted).toHaveLength(1);
    expect(sorted[0].constraintId).toBe("only");
  });
});

describe("parallelEvaluate", () => {
  it("runs all tasks and returns results", async () => {
    const tasks = [
      { constraintId: "a", evaluate: async () => makeResult("a", 80) },
      { constraintId: "b", evaluate: async () => makeResult("b", 90) },
      { constraintId: "c", evaluate: async () => makeResult("c", 70) },
    ];

    const results = await parallelEvaluate(tasks, 4);
    expect(results).toHaveLength(3);
  });

  it("respects concurrency limit", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    const makeDelayedTask = (id: string) => ({
      constraintId: id,
      evaluate: async (): Promise<EvalResult> => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((resolve) => setTimeout(resolve, 50));
        concurrent--;
        return makeResult(id, 80);
      },
    });

    const tasks = Array.from({ length: 8 }, (_, i) => makeDelayedTask(`t${i}`));

    await parallelEvaluate(tasks, 2);
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it("returns results sorted by constraintId (T7 determinism)", async () => {
    const tasks = [
      { constraintId: "z", evaluate: async () => makeResult("z", 50) },
      { constraintId: "a", evaluate: async () => makeResult("a", 90) },
      { constraintId: "m", evaluate: async () => makeResult("m", 70) },
    ];

    const results = await parallelEvaluate(tasks, 4);
    expect(results.map((r) => r.constraintId)).toEqual(["a", "m", "z"]);
  });

  it("handles failed evaluators gracefully", async () => {
    const tasks = [
      { constraintId: "good", evaluate: async () => makeResult("good", 80) },
      {
        constraintId: "bad",
        evaluate: async (): Promise<EvalResult> => {
          throw new Error("evaluator crashed");
        },
      },
    ];

    const results = await parallelEvaluate(tasks, 4);
    expect(results).toHaveLength(2);

    const badResult = results.find((r) => r.constraintId === "bad");
    expect(badResult).toBeDefined();
    expect(badResult?.success).toBe(false);
    expect(badResult?.normalizedScore).toBe(0);
    expect(badResult?.error).toContain("evaluator crashed");
  });

  it("same inputs produce identical results regardless of completion order", async () => {
    const makeTask = (id: string, score: number, delayMs: number) => ({
      constraintId: id,
      evaluate: async (): Promise<EvalResult> => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return makeResult(id, score);
      },
    });

    // First run: c finishes first, a last
    const tasks1 = [
      makeTask("a", 80, 60),
      makeTask("b", 70, 30),
      makeTask("c", 90, 10),
    ];

    // Second run: a finishes first, c last
    const tasks2 = [
      makeTask("a", 80, 10),
      makeTask("b", 70, 30),
      makeTask("c", 90, 60),
    ];

    const results1 = await parallelEvaluate(tasks1, 4);
    const results2 = await parallelEvaluate(tasks2, 4);

    expect(results1.map((r) => r.constraintId)).toEqual(results2.map((r) => r.constraintId));
    expect(results1.map((r) => r.normalizedScore)).toEqual(results2.map((r) => r.normalizedScore));
  });

  it("handles empty task list", async () => {
    const results = await parallelEvaluate([], 4);
    expect(results).toEqual([]);
  });
});
