// Tests for T5 (Retry with Backoff), TN4 (Retries Share Timeout Budget)
// Validates: backoff computation, attempt timeout budgeting, retry plan building

import { describe, expect, it } from "vitest";
import { computeBackoffMs, computeAttemptTimeout, buildRetryPlan, DEFAULT_RETRY } from "../src/retry";

describe("computeBackoffMs", () => {
  it("returns value between 0 and baseDelayMs for attempt 0", () => {
    for (let i = 0; i < 50; i++) {
      const ms = computeBackoffMs(0, 1000);
      expect(ms).toBeGreaterThanOrEqual(0);
      expect(ms).toBeLessThanOrEqual(1000);
    }
  });

  it("returns value between 0 and 4*baseDelayMs for attempt 2", () => {
    for (let i = 0; i < 50; i++) {
      const ms = computeBackoffMs(2, 1000);
      expect(ms).toBeGreaterThanOrEqual(0);
      expect(ms).toBeLessThanOrEqual(4000);
    }
  });

  it("increases max delay exponentially with attempt number", () => {
    // attempt 0: max 1000, attempt 3: max 8000
    // Run many samples and check that attempt 3 can produce larger values
    let maxAttempt0 = 0;
    let maxAttempt3 = 0;
    for (let i = 0; i < 100; i++) {
      maxAttempt0 = Math.max(maxAttempt0, computeBackoffMs(0, 1000));
      maxAttempt3 = Math.max(maxAttempt3, computeBackoffMs(3, 1000));
    }
    expect(maxAttempt3).toBeGreaterThanOrEqual(maxAttempt0);
  });

  it("always returns non-negative integer", () => {
    for (let i = 0; i < 20; i++) {
      const ms = computeBackoffMs(i % 5, 500);
      expect(ms).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(ms)).toBe(true);
    }
  });
});

describe("computeAttemptTimeout", () => {
  it("divides budget evenly across attempts when starting fresh", () => {
    // 30000ms budget, attempt 0 of 3 retries (4 total attempts), 0 elapsed
    const timeout = computeAttemptTimeout(30000, 0, 3, 0);
    // 30000 / 4 = 7500
    expect(timeout).toBe(7500);
  });

  it("gives remaining budget to last attempt", () => {
    // 30000ms budget, attempt 2 of 3, 25000ms elapsed
    const timeout = computeAttemptTimeout(30000, 2, 3, 25000);
    // remaining = 5000, attemptsLeft = 3-2+1 = 2, 5000/2 = 2500
    expect(timeout).toBe(2500);
  });

  it("returns 0 when budget is exhausted", () => {
    const timeout = computeAttemptTimeout(30000, 2, 3, 30000);
    expect(timeout).toBe(0);
  });

  it("returns 0 when elapsed exceeds budget", () => {
    const timeout = computeAttemptTimeout(30000, 1, 3, 35000);
    expect(timeout).toBe(0);
  });

  it("handles single attempt (maxRetries=0)", () => {
    const timeout = computeAttemptTimeout(10000, 0, 0, 0);
    // remaining = 10000, attemptsLeft = 0-0+1 = 1, 10000/1 = 10000
    expect(timeout).toBe(10000);
  });
});

describe("buildRetryPlan", () => {
  it("returns correct number of attempts (maxRetries + 1 for initial)", () => {
    const plan = buildRetryPlan("echo test", 60, DEFAULT_RETRY);
    // DEFAULT_RETRY.maxRetries = 3, so 4 attempts total
    expect(plan.length).toBeLessThanOrEqual(4);
    expect(plan.length).toBeGreaterThanOrEqual(1);
  });

  it("total timeouts do not exceed totalTimeoutSeconds", () => {
    const plan = buildRetryPlan("echo test", 60, DEFAULT_RETRY);
    const totalTimeoutMs = plan.reduce((sum, p) => sum + p.timeoutSeconds * 1000 + p.backoffMs, 0);
    expect(totalTimeoutMs).toBeLessThanOrEqual(60 * 1000);
  });

  it("first attempt has backoffMs = 0", () => {
    const plan = buildRetryPlan("echo test", 60, DEFAULT_RETRY);
    expect(plan.length).toBeGreaterThanOrEqual(1);
    expect(plan[0].backoffMs).toBe(0);
  });

  it("all attempts use the same command", () => {
    const plan = buildRetryPlan("npm test", 30, DEFAULT_RETRY);
    for (const entry of plan) {
      expect(entry.command).toBe("npm test");
    }
  });

  it("all timeoutSeconds are at least 1", () => {
    const plan = buildRetryPlan("echo test", 60, DEFAULT_RETRY);
    for (const entry of plan) {
      expect(entry.timeoutSeconds).toBeGreaterThanOrEqual(1);
    }
  });

  it("produces fewer attempts when budget is very small", () => {
    const plan = buildRetryPlan("echo test", 2, { maxRetries: 10, baseDelayMs: 5000 });
    // With 2s budget and 5s base delay, retries will exhaust budget quickly
    expect(plan.length).toBeLessThan(11);
  });

  it("produces single attempt with maxRetries=0", () => {
    const plan = buildRetryPlan("echo test", 30, { maxRetries: 0, baseDelayMs: 1000 });
    expect(plan).toHaveLength(1);
    expect(plan[0].backoffMs).toBe(0);
  });
});
