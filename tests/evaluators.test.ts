import { describe, expect, it } from "vitest";
import {
  buildCustomResult,
  buildStaticResult,
  buildTestResult,
  hashCommand,
  normalizeComplexityOutput,
  normalizeCustomOutput,
  normalizeEslintOutput,
  normalizeTestPassRate,
  normalizeTscOutput,
  verifyCommandHash,
  wrapWithTimeout,
} from "../src/evaluators";

describe("normalizeEslintOutput", () => {
  it("should score 100 for no issues", () => {
    const result = normalizeEslintOutput(JSON.stringify([{ errorCount: 0, warningCount: 0 }]));
    expect(result).toBe(100);
  });

  it("should penalize errors more than warnings", () => {
    const withErrors = normalizeEslintOutput(JSON.stringify([{ errorCount: 5, warningCount: 0 }]));
    const withWarnings = normalizeEslintOutput(JSON.stringify([{ errorCount: 0, warningCount: 5 }]));
    expect(withErrors).toBeLessThan(withWarnings);
  });

  it("should return 0 for invalid JSON", () => {
    expect(normalizeEslintOutput("not json")).toBe(0);
  });

  it("should floor at 0", () => {
    const result = normalizeEslintOutput(JSON.stringify([{ errorCount: 100, warningCount: 100 }]));
    expect(result).toBe(0);
  });
});

describe("normalizeTscOutput", () => {
  it("should score 100 for clean output", () => {
    expect(normalizeTscOutput("")).toBe(100);
  });

  it("should extract error count", () => {
    expect(normalizeTscOutput("Found 5 errors")).toBe(75);
  });

  it("should return 50 for unstructured error output", () => {
    expect(normalizeTscOutput("error TS2345: something went wrong")).toBe(50);
  });
});

describe("normalizeComplexityOutput", () => {
  it("should score 100 for low complexity", () => {
    expect(normalizeComplexityOutput("average: 3")).toBe(100);
  });

  it("should score 0 for very high complexity", () => {
    expect(normalizeComplexityOutput("average: 35")).toBe(0);
  });

  it("should return 50 for unrecognized format", () => {
    expect(normalizeComplexityOutput("no numbers here")).toBe(50);
  });
});

describe("normalizeTestPassRate", () => {
  it("should parse Jest/Vitest format", () => {
    expect(normalizeTestPassRate("Tests: 8 passed, 2 failed, 10 total")).toBe(80);
  });

  it("should parse pytest format", () => {
    expect(normalizeTestPassRate("5 passed, 1 failed")).toBe(83);
  });

  it("should parse ratio format", () => {
    expect(normalizeTestPassRate("9/10 tests passed")).toBe(90);
  });

  it("should return 100 for all passed with no failures", () => {
    expect(normalizeTestPassRate("All 5 tests passed")).toBe(100);
  });

  it("should return 0 for FAIL indicator", () => {
    expect(normalizeTestPassRate("FAIL: something broke")).toBe(0);
  });
});

describe("hashCommand / verifyCommandHash", () => {
  it("should produce consistent hashes", () => {
    const h1 = hashCommand("echo test");
    const h2 = hashCommand("echo test");
    expect(h1).toBe(h2);
  });

  it("should produce different hashes for different commands", () => {
    expect(hashCommand("echo a")).not.toBe(hashCommand("echo b"));
  });

  it("should verify valid hash", () => {
    const hash = hashCommand("echo test");
    const result = verifyCommandHash({
      id: "test",
      name: "test",
      mechanism: "custom",
      command: "echo test",
      commandHash: hash,
      normalizer: "custom",
      weight: 1,
      isLlmEval: false,
    });
    expect(result.valid).toBe(true);
  });

  it("should reject tampered hash", () => {
    const result = verifyCommandHash({
      id: "test",
      name: "test",
      mechanism: "custom",
      command: "echo test",
      commandHash: "wrong",
      normalizer: "custom",
      weight: 1,
      isLlmEval: false,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("mismatch");
  });
});

describe("wrapWithTimeout", () => {
  it("should wrap command with timeout", () => {
    const wrapped = wrapWithTimeout("echo hi", 30);
    expect(wrapped).toContain("timeout 30");
    expect(wrapped).toContain("echo hi");
  });
});

describe("normalizeCustomOutput", () => {
  it("should parse JSON score", () => {
    expect(normalizeCustomOutput('{"score": 85}')).toBe(85);
  });

  it("should parse bare number", () => {
    expect(normalizeCustomOutput("92")).toBe(92);
  });

  it("should parse percentage", () => {
    expect(normalizeCustomOutput("78%")).toBe(78);
  });

  it("should clamp to 0-100", () => {
    expect(normalizeCustomOutput("150")).toBe(100);
    expect(normalizeCustomOutput("-10")).toBe(0);
  });
});

describe("buildStaticResult", () => {
  it("should build successful result", () => {
    const result = buildStaticResult("lint", '[]', () => 100, 50);
    expect(result.success).toBe(true);
    expect(result.normalizedScore).toBe(100);
    expect(result.mechanism).toBe("static");
  });
});

describe("buildTestResult", () => {
  it("should build pass rate result", () => {
    const result = buildTestResult("tests", "8 passed, 2 failed, 10 total", "pass_rate", 100);
    expect(result.success).toBe(true);
    expect(result.normalizedScore).toBe(80);
  });
});

describe("buildCustomResult", () => {
  it("should return 0 for timed out commands", () => {
    const result = buildCustomResult("custom", "partial output", 30000, true);
    expect(result.success).toBe(false);
    expect(result.normalizedScore).toBe(0);
    expect(result.error).toContain("timed out");
  });
});
