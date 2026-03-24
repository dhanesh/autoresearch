import { describe, expect, it } from "vitest";
import {
  buildLlmEvalPrompt,
  buildLlmResult,
  LLM_RUBRIC_DIMENSIONS,
  parseLlmEvalResponse,
  shouldRunLlmEval,
} from "../src/evaluators/llm";

describe("LLM_RUBRIC_DIMENSIONS", () => {
  it("should have 4 dimensions with weights summing to 1", () => {
    expect(LLM_RUBRIC_DIMENSIONS).toHaveLength(4);
    const totalWeight = LLM_RUBRIC_DIMENSIONS.reduce((sum, d) => sum + d.weight, 0);
    expect(totalWeight).toBeCloseTo(1.0, 5);
  });

  it("should have unique dimension names", () => {
    const names = LLM_RUBRIC_DIMENSIONS.map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("buildLlmEvalPrompt", () => {
  it("should include all changed files", () => {
    const prompt = buildLlmEvalPrompt(
      [{ path: "src/foo.ts", diff: "+const x = 1;" }],
      false
    );
    expect(prompt).toContain("src/foo.ts");
    expect(prompt).toContain("+const x = 1;");
  });

  it("should include learning instruction for full report", () => {
    const prompt = buildLlmEvalPrompt([], true);
    expect(prompt).toContain("explain WHY");
    expect(prompt).toContain("learning");
  });

  it("should not include learning instruction for sampling", () => {
    const prompt = buildLlmEvalPrompt([], false);
    expect(prompt).not.toContain("ADDITIONALLY");
  });

  it("should reference all rubric dimensions", () => {
    const prompt = buildLlmEvalPrompt([], false);
    for (const dim of LLM_RUBRIC_DIMENSIONS) {
      expect(prompt).toContain(dim.name);
    }
  });
});

describe("parseLlmEvalResponse", () => {
  it("should parse valid JSON response", () => {
    const response = JSON.stringify({
      scores: {
        readability: { score: 80, justification: "good" },
        architecture: { score: 75, justification: "ok" },
        maintainability: { score: 70, justification: "decent" },
        idiomaticness: { score: 85, justification: "great" },
      },
      composite: 77.5,
      summary: "Overall good quality",
    });

    const result = parseLlmEvalResponse(response);
    expect(result.score).toBe(78); // Weighted: 80*0.25 + 75*0.25 + 70*0.25 + 85*0.25 = 77.5 → 78
    expect(result.details.readability.score).toBe(80);
  });

  it("should extract JSON from markdown code block", () => {
    const response = `Here's my evaluation:\n\`\`\`json\n${JSON.stringify({
      scores: {
        readability: { score: 90, justification: "" },
        architecture: { score: 90, justification: "" },
        maintainability: { score: 90, justification: "" },
        idiomaticness: { score: 90, justification: "" },
      },
    })}\n\`\`\``;

    const result = parseLlmEvalResponse(response);
    expect(result.score).toBe(90);
  });

  it("should return 50 for unparseable response", () => {
    const result = parseLlmEvalResponse("This is not JSON at all");
    expect(result.score).toBe(50);
    expect(result.details).toEqual({});
  });

  it("should extract learning field when present", () => {
    const response = JSON.stringify({
      scores: {
        readability: { score: 85, justification: "" },
        architecture: { score: 85, justification: "" },
        maintainability: { score: 85, justification: "" },
        idiomaticness: { score: 85, justification: "" },
      },
      learning: "The refactoring improved separation of concerns...",
    });

    const result = parseLlmEvalResponse(response);
    expect(result.learning).toContain("separation of concerns");
  });
});

describe("shouldRunLlmEval", () => {
  it("should always run on final report", () => {
    expect(shouldRunLlmEval(1, 3, true)).toBe(true);
    expect(shouldRunLlmEval(2, 3, true)).toBe(true);
  });

  it("should run every Nth iteration", () => {
    expect(shouldRunLlmEval(0, 3, false)).toBe(true);
    expect(shouldRunLlmEval(3, 3, false)).toBe(true);
    expect(shouldRunLlmEval(6, 3, false)).toBe(true);
  });

  it("should skip non-Nth iterations", () => {
    expect(shouldRunLlmEval(1, 3, false)).toBe(false);
    expect(shouldRunLlmEval(2, 3, false)).toBe(false);
    expect(shouldRunLlmEval(4, 3, false)).toBe(false);
  });
});

describe("buildLlmResult", () => {
  it("should build result from valid response", () => {
    const response = JSON.stringify({
      scores: {
        readability: { score: 80, justification: "" },
        architecture: { score: 80, justification: "" },
        maintainability: { score: 80, justification: "" },
        idiomaticness: { score: 80, justification: "" },
      },
    });

    const result = buildLlmResult("eval-llm", response, 500);
    expect(result.mechanism).toBe("llm");
    expect(result.normalizedScore).toBe(80);
    expect(result.success).toBe(true);
  });
});
