// Tests for T4 (Structured Logger), U3 (No Host Interference), S2 (No Sensitive Data)
// Validates: callback-based logger, silent by default

import { describe, expect, it, vi } from "vitest";
import { createLogger } from "../src/logger";
import type { LogEntry } from "../src/logger";

describe("createLogger with no callback", () => {
  it("produces no output and no errors", () => {
    const logger = createLogger();
    expect(() => logger.info("test message")).not.toThrow();
    expect(() => logger.warn("test warning")).not.toThrow();
    expect(() => logger.error("test error")).not.toThrow();
  });

  it("is completely silent — no stdout/stderr writes", () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const logger = createLogger();
    logger.info("should not appear");
    logger.warn("should not appear");
    logger.error("should not appear");

    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
    expect(consoleSpy).not.toHaveBeenCalled();

    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});

describe("createLogger with callback", () => {
  it("passes LogEntry to callback on info", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger((entry) => entries.push(entry));

    logger.info("hello info");

    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe("info");
    expect(entries[0].message).toBe("hello info");
  });

  it("passes LogEntry to callback on warn", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger((entry) => entries.push(entry));

    logger.warn("hello warn");

    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe("warn");
    expect(entries[0].message).toBe("hello warn");
  });

  it("passes LogEntry to callback on error", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger((entry) => entries.push(entry));

    logger.error("hello error");

    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe("error");
    expect(entries[0].message).toBe("hello error");
  });
});

describe("LogEntry structure", () => {
  it("has correct level for each method", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger((entry) => entries.push(entry));

    logger.info("i");
    logger.warn("w");
    logger.error("e");

    expect(entries[0].level).toBe("info");
    expect(entries[1].level).toBe("warn");
    expect(entries[2].level).toBe("error");
  });

  it("has ISO 8601 timestamp", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger((entry) => entries.push(entry));

    logger.info("ts check");

    const ts = entries[0].timestamp;
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(new Date(ts).toISOString()).toBe(ts);
  });

  it("includes message", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger((entry) => entries.push(entry));

    logger.info("specific message content");

    expect(entries[0].message).toBe("specific message content");
  });
});

describe("LogEntry meta fields", () => {
  it("includes iteration when provided", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger((entry) => entries.push(entry));

    logger.info("iter", { iteration: 3 });

    expect(entries[0].iteration).toBe(3);
  });

  it("includes constraint when provided", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger((entry) => entries.push(entry));

    logger.info("constraint check", { constraint: "lint" });

    expect(entries[0].constraint).toBe("lint");
  });

  it("includes score when provided", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger((entry) => entries.push(entry));

    logger.info("score check", { score: 85 });

    expect(entries[0].score).toBe(85);
  });

  it("includes durationMs when provided", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger((entry) => entries.push(entry));

    logger.info("duration check", { durationMs: 1234 });

    expect(entries[0].durationMs).toBe(1234);
  });

  it("includes multiple meta fields together", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger((entry) => entries.push(entry));

    logger.info("combined", { iteration: 2, constraint: "tests", score: 90, durationMs: 500 });

    expect(entries[0].iteration).toBe(2);
    expect(entries[0].constraint).toBe("tests");
    expect(entries[0].score).toBe(90);
    expect(entries[0].durationMs).toBe(500);
  });

  it("omits meta fields when not provided", () => {
    const entries: LogEntry[] = [];
    const logger = createLogger((entry) => entries.push(entry));

    logger.info("no meta");

    expect(entries[0].iteration).toBeUndefined();
    expect(entries[0].constraint).toBeUndefined();
    expect(entries[0].score).toBeUndefined();
    expect(entries[0].durationMs).toBeUndefined();
  });
});
