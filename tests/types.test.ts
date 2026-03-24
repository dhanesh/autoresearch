import { describe, expect, it } from "vitest";
import { DEFAULTS } from "../src/types";

describe("DEFAULTS", () => {
  it("should have valid default configuration", () => {
    expect(DEFAULTS.maxIterations).toBe(20);
    expect(DEFAULTS.timeBoxSeconds).toBe(120);
    expect(DEFAULTS.plateauWindow).toBe(3);
    expect(DEFAULTS.regressionThreshold).toBeGreaterThan(0);
    expect(DEFAULTS.regressionThreshold).toBeLessThan(1);
  });

  it("should have positive token budget", () => {
    expect(DEFAULTS.tokenBudget).toBeGreaterThan(0);
  });

  it("should have reasonable convergence threshold", () => {
    expect(DEFAULTS.convergenceThreshold).toBeGreaterThan(0);
    expect(DEFAULTS.convergenceThreshold).toBeLessThan(10);
  });
});
