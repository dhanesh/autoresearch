// Tests for T3 (Zod Runtime Validation), S1 (LLM Output Validated), RT-5 (Fallback Values)
// Validates: safe parsing with fallbacks for LLM, lite probe, and custom JSON outputs

import { describe, expect, it } from "vitest";
import { safeParseLlmResponse, safeParseLiteProbe, safeParseCustomJson } from "../src/schemas";

const validLlmJson = JSON.stringify({
  scores: {
    readability: { score: 80, justification: "Good readability" },
    architecture: { score: 75, justification: "Decent architecture" },
    maintainability: { score: 85, justification: "Well maintained" },
    idiomaticness: { score: 70, justification: "Mostly idiomatic" },
  },
  composite: 78,
  summary: "Overall good quality code",
});

describe("safeParseLlmResponse", () => {
  it("with valid JSON returns success: true and correct composite", () => {
    const result = safeParseLlmResponse(validLlmJson);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.composite).toBe(78);
    expect(result.fallbackScore).toBe(78);
  });

  it("with invalid JSON returns success: false, fallbackScore: 50, and error message", () => {
    const result = safeParseLlmResponse("this is not json at all");
    expect(result.success).toBe(false);
    expect(result.fallbackScore).toBe(50);
    expect(result.error).toBeDefined();
  });

  it("with JSON in markdown code block still parses", () => {
    const wrapped = `Here is the evaluation:\n\`\`\`json\n${validLlmJson}\n\`\`\`\nEnd of evaluation.`;
    const result = safeParseLlmResponse(wrapped);
    expect(result.success).toBe(true);
    expect(result.data?.composite).toBe(78);
  });

  it("with missing fields returns structured error", () => {
    const partial = JSON.stringify({
      scores: {
        readability: { score: 80, justification: "ok" },
        // missing architecture, maintainability, idiomaticness
      },
      composite: 80,
      summary: "partial",
    });
    const result = safeParseLlmResponse(partial);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.fallbackScore).toBe(50);
  });

  it("with extra fields still parses successfully", () => {
    const extended = JSON.stringify({
      scores: {
        readability: { score: 80, justification: "ok" },
        architecture: { score: 75, justification: "ok" },
        maintainability: { score: 85, justification: "ok" },
        idiomaticness: { score: 70, justification: "ok" },
      },
      composite: 78,
      summary: "good",
      extraField: "ignored",
    });
    const result = safeParseLlmResponse(extended);
    expect(result.success).toBe(true);
  });

  it("with empty string returns error", () => {
    const result = safeParseLlmResponse("");
    expect(result.success).toBe(false);
    expect(result.fallbackScore).toBe(50);
  });
});

describe("safeParseLiteProbe", () => {
  it("with valid response returns correct score", () => {
    const raw = JSON.stringify({ score: 85, justification: "Looks good" });
    const result = safeParseLiteProbe(raw);
    expect(result.success).toBe(true);
    expect(result.score).toBe(85);
  });

  it("with garbage input returns score: 50", () => {
    const result = safeParseLiteProbe("garbage input not json");
    expect(result.success).toBe(false);
    expect(result.score).toBe(50);
  });

  it("with missing justification returns error", () => {
    const raw = JSON.stringify({ score: 75 });
    const result = safeParseLiteProbe(raw);
    expect(result.success).toBe(false);
    expect(result.score).toBe(50);
  });

  it("with score wrapped in markdown still parses", () => {
    const raw = `Response:\n${JSON.stringify({ score: 92, justification: "great" })}\nDone.`;
    const result = safeParseLiteProbe(raw);
    expect(result.success).toBe(true);
    expect(result.score).toBe(92);
  });

  it("clamps score to 0-100 range", () => {
    const raw = JSON.stringify({ score: 150, justification: "overflow" });
    const result = safeParseLiteProbe(raw);
    // Zod schema has max(100), so this should fail validation
    expect(result.success).toBe(false);
    expect(result.score).toBe(50);
  });
});

describe("safeParseCustomJson", () => {
  it("with plain number returns score", () => {
    const result = safeParseCustomJson("75");
    expect(result.success).toBe(true);
    expect(result.score).toBe(75);
  });

  it("with {score: 85} returns 85", () => {
    const result = safeParseCustomJson(JSON.stringify({ score: 85 }));
    expect(result.success).toBe(true);
    expect(result.score).toBe(85);
  });

  it("with {value: 90} returns 90", () => {
    const result = safeParseCustomJson(JSON.stringify({ value: 90 }));
    expect(result.success).toBe(true);
    expect(result.score).toBe(90);
  });

  it("with invalid JSON returns score: 0", () => {
    const result = safeParseCustomJson("not json");
    expect(result.success).toBe(false);
    expect(result.score).toBe(0);
  });

  it("with empty object returns error", () => {
    const result = safeParseCustomJson("{}");
    expect(result.success).toBe(false);
    expect(result.score).toBe(0);
  });

  it("clamps score to 0-100 range", () => {
    const result = safeParseCustomJson("200");
    expect(result.success).toBe(true);
    expect(result.score).toBe(100);
  });

  it("rounds fractional scores", () => {
    const result = safeParseCustomJson("72.6");
    expect(result.success).toBe(true);
    expect(result.score).toBe(73);
  });
});
