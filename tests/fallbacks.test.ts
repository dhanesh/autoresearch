// Tests for RT-7 (Fallback Evaluator System)
// Validates: O1, T6, TN4

import { describe, expect, it } from "vitest";
import {
  activateFallback,
  buildFallbackRegistry,
  findFallback,
  rebalanceWeights,
} from "../src/evaluators/fallbacks";
import type { EvalConstraint } from "../src/types";

const sampleConstraints: EvalConstraint[] = [
  { id: "eval-lint", name: "Lint", mechanism: "static", command: "bun run lint", commandHash: "abc", normalizer: "eslint", weight: 0.25, isLlmEval: false },
  { id: "eval-types", name: "Types", mechanism: "static", command: "bun run typecheck", commandHash: "def", normalizer: "tsc", weight: 0.2, isLlmEval: false },
  { id: "eval-tests", name: "Tests", mechanism: "tests", command: "bun test", commandHash: "ghi", normalizer: "pass_rate", weight: 0.25, isLlmEval: false },
  { id: "eval-llm", name: "LLM", mechanism: "llm", command: "llm-eval", commandHash: "jkl", normalizer: "llm", weight: 0.3, isLlmEval: true },
];

describe("findFallback (TN4)", () => {
  it("finds fallback for static-lint constraint", () => {
    const fb = findFallback(sampleConstraints[0]);
    expect(fb).not.toBeNull();
    expect(fb!.primaryId).toBe("eval-lint");
    expect(fb!.fallback.mechanism).toBe("llm");
    expect(fb!.fallback.weight).toBe(0.25);
  });

  it("finds fallback for test constraint", () => {
    const fb = findFallback(sampleConstraints[2]);
    expect(fb).not.toBeNull();
    expect(fb!.fallback.mechanism).toBe("llm");
  });

  it("returns null for LLM constraint (no Bash-free fallback needed)", () => {
    const fb = findFallback(sampleConstraints[3]);
    // LLM constraints are already Bash-free, key "llm-llm" has no entry
    expect(fb).toBeNull();
  });
});

describe("buildFallbackRegistry (RT-7)", () => {
  it("builds fallbacks for non-LLM constraints only", () => {
    const fallbacks = buildFallbackRegistry(sampleConstraints);
    expect(fallbacks).toHaveLength(3); // lint, types, tests (not llm)
    expect(fallbacks.every((f) => f.fallback.mechanism === "llm")).toBe(true);
  });

  it("preserves original weights", () => {
    const fallbacks = buildFallbackRegistry(sampleConstraints);
    const lintFb = fallbacks.find((f) => f.primaryId === "eval-lint");
    expect(lintFb?.fallback.weight).toBe(0.25);
  });
});

describe("activateFallback (O1)", () => {
  it("replaces primary with fallback", () => {
    const fb = findFallback(sampleConstraints[0])!;
    const updated = activateFallback(sampleConstraints, fb);
    const replaced = updated.find((c) => c.id === `fallback-eval-lint`);
    expect(replaced).toBeDefined();
    expect(replaced!.mechanism).toBe("llm");
    expect(replaced!.isLlmEval).toBe(true);
  });

  it("does not modify other constraints", () => {
    const fb = findFallback(sampleConstraints[0])!;
    const updated = activateFallback(sampleConstraints, fb);
    const unchanged = updated.find((c) => c.id === "eval-tests");
    expect(unchanged).toEqual(sampleConstraints[2]);
  });

  it("maintains total constraint count", () => {
    const fb = findFallback(sampleConstraints[0])!;
    const updated = activateFallback(sampleConstraints, fb);
    expect(updated).toHaveLength(sampleConstraints.length);
  });
});

describe("rebalanceWeights (O1)", () => {
  it("redistributes weights proportionally", () => {
    const rebalanced = rebalanceWeights(sampleConstraints, "eval-lint");
    const totalWeight = rebalanced.reduce((sum, c) => sum + c.weight, 0);
    expect(totalWeight).toBeCloseTo(1.0, 5);
  });

  it("removes the dropped constraint", () => {
    const rebalanced = rebalanceWeights(sampleConstraints, "eval-lint");
    expect(rebalanced.find((c) => c.id === "eval-lint")).toBeUndefined();
  });

  it("preserves weight ratios among remaining", () => {
    const rebalanced = rebalanceWeights(sampleConstraints, "eval-lint");
    const testsWeight = rebalanced.find((c) => c.id === "eval-tests")!.weight;
    const llmWeight = rebalanced.find((c) => c.id === "eval-llm")!.weight;
    // Original ratio: 0.25/0.3 ≈ 0.833
    expect(testsWeight / llmWeight).toBeCloseTo(0.25 / 0.3, 2);
  });

  it("handles empty result gracefully", () => {
    const single: EvalConstraint[] = [sampleConstraints[0]];
    const result = rebalanceWeights(single, "eval-lint");
    expect(result).toHaveLength(0);
  });
});
