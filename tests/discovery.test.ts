import { describe, expect, it } from "vitest";
import {
  buildDefaultConstraints,
  finalizeConstraints,
  INTROSPECTION_RULES,
  rebalanceWeights,
  TOOL_TO_COMMAND,
} from "../src/discovery";
import type { CodebaseProfile } from "../src/types";

function makeProfile(overrides: Partial<CodebaseProfile> = {}): CodebaseProfile {
  return {
    languages: ["typescript"],
    frameworks: [],
    hasTests: false,
    hasCi: false,
    fileCount: 10,
    detectedConfigs: {},
    ...overrides,
  };
}

describe("buildDefaultConstraints", () => {
  it("should always include LLM eval constraint", () => {
    const constraints = buildDefaultConstraints(makeProfile());
    const llm = constraints.find((c) => c.isLlmEval);
    expect(llm).toBeDefined();
    expect(llm?.mechanism).toBe("llm");
  });

  it("should add linter constraint when detected", () => {
    const constraints = buildDefaultConstraints(makeProfile({ linter: "eslint" }));
    const lint = constraints.find((c) => c.mechanism === "static");
    expect(lint).toBeDefined();
    expect(lint?.command).toBe(TOOL_TO_COMMAND.eslint.command);
  });

  it("should add type checker when detected", () => {
    const constraints = buildDefaultConstraints(makeProfile({ typeChecker: "typescript" }));
    const tsc = constraints.find((c) => c.name.includes("typescript"));
    expect(tsc).toBeDefined();
  });

  it("should add test runner when detected", () => {
    const constraints = buildDefaultConstraints(makeProfile({ testRunner: "vitest" }));
    const tests = constraints.find((c) => c.mechanism === "tests");
    expect(tests).toBeDefined();
    expect(tests?.command).toBe(TOOL_TO_COMMAND.vitest.command);
  });

  it("should have unique IDs", () => {
    const constraints = buildDefaultConstraints(
      makeProfile({ linter: "eslint", typeChecker: "typescript", testRunner: "vitest" })
    );
    const ids = constraints.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("finalizeConstraints", () => {
  it("should add command hashes to all constraints", () => {
    const constraints = buildDefaultConstraints(makeProfile({ linter: "eslint" }));
    const finalized = finalizeConstraints(constraints);
    for (const c of finalized) {
      expect(c.commandHash).toBeTruthy();
      expect(c.commandHash.length).toBe(64); // SHA-256 hex
    }
  });
});

describe("rebalanceWeights", () => {
  it("should make weights sum to 1.0", () => {
    const constraints = finalizeConstraints(
      buildDefaultConstraints(makeProfile({ linter: "eslint", testRunner: "vitest" }))
    );
    const rebalanced = rebalanceWeights(constraints);
    const total = rebalanced.reduce((sum, c) => sum + c.weight, 0);
    expect(total).toBeCloseTo(1.0, 5);
  });

  it("should handle empty constraints", () => {
    const rebalanced = rebalanceWeights([]);
    expect(rebalanced).toEqual([]);
  });

  it("should return unchanged when all weights are zero", () => {
    const constraints = finalizeConstraints(
      buildDefaultConstraints(makeProfile({ linter: "eslint" }))
    ).map((c) => ({ ...c, weight: 0 }));
    const rebalanced = rebalanceWeights(constraints);
    // All weights zero — returned as-is (no division by zero)
    expect(rebalanced.every((c) => c.weight === 0)).toBe(true);
  });

  it("should preserve relative proportions", () => {
    const constraints = finalizeConstraints(
      buildDefaultConstraints(makeProfile({ linter: "eslint", testRunner: "vitest" }))
    );
    const origRatios = constraints.map((c) => c.weight);
    const rebalanced = rebalanceWeights(constraints);
    // Ratios between first two should remain the same
    const origRatio = origRatios[0] / origRatios[1];
    const newRatio = rebalanced[0].weight / rebalanced[1].weight;
    expect(newRatio).toBeCloseTo(origRatio, 5);
  });
});

describe("INTROSPECTION_RULES", () => {
  it("should have unique patterns", () => {
    const patterns = INTROSPECTION_RULES.map((r) => r.pattern);
    expect(new Set(patterns).size).toBe(patterns.length);
  });

  it("should cover multiple language ecosystems", () => {
    const languages = new Set(
      INTROSPECTION_RULES.filter((r) => r.indicates.language).map((r) => r.indicates.language)
    );
    expect(languages.size).toBeGreaterThanOrEqual(3);
    expect(languages.has("typescript")).toBe(true);
    expect(languages.has("python")).toBe(true);
    expect(languages.has("rust")).toBe(true);
  });
});

describe("TOOL_TO_COMMAND", () => {
  it("should have commands for common tools", () => {
    expect(TOOL_TO_COMMAND.eslint).toBeDefined();
    expect(TOOL_TO_COMMAND.vitest).toBeDefined();
    expect(TOOL_TO_COMMAND.jest).toBeDefined();
    expect(TOOL_TO_COMMAND.pytest).toBeDefined();
  });

  it("should categorize mechanisms correctly", () => {
    expect(TOOL_TO_COMMAND.eslint.mechanism).toBe("static");
    expect(TOOL_TO_COMMAND.vitest.mechanism).toBe("tests");
  });
});
