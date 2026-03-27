// Tests for RT-1 (Permission Manifest System)
// Validates: B1, T1, S1, S2, U1, O1, O4, TN1

import { describe, expect, it } from "vitest";
import {
  buildPermissionManifest,
  formatManifestChecklist,
  groupByPurpose,
  handleDenials,
  verifyPermissions,
} from "../src/permissions";
import type { EvalConstraint, FallbackEvaluator } from "../src/types";

const sampleConstraints: EvalConstraint[] = [
  { id: "eval-lint", name: "Lint", mechanism: "static", command: "bun run lint", commandHash: "abc", normalizer: "eslint", weight: 0.3, isLlmEval: false },
  { id: "eval-tests", name: "Tests", mechanism: "tests", command: "bun test", commandHash: "def", normalizer: "pass_rate", weight: 0.4, isLlmEval: false },
  { id: "eval-llm", name: "LLM", mechanism: "llm", command: "llm-eval", commandHash: "ghi", normalizer: "llm", weight: 0.3, isLlmEval: true },
];

describe("buildPermissionManifest", () => {
  it("creates entries for non-LLM eval commands", () => {
    const manifest = buildPermissionManifest(sampleConstraints, ["src/"]);
    const bashEntries = manifest.entries.filter((e) => e.type === "bash" && e.purpose === "evaluation");
    expect(bashEntries).toHaveLength(2);
    expect(bashEntries.map((e) => e.target)).toContain("bun run lint");
    expect(bashEntries.map((e) => e.target)).toContain("bun test");
  });

  it("excludes llm-eval commands from bash permissions (S1: scope minimization)", () => {
    const manifest = buildPermissionManifest(sampleConstraints, ["src/"]);
    const evalBash = manifest.entries.filter((e) => e.purpose === "evaluation");
    expect(evalBash.every((e) => e.target !== "llm-eval")).toBe(true);
  });

  it("includes scope file write permissions", () => {
    const manifest = buildPermissionManifest(sampleConstraints, ["src/", "tests/"]);
    const writes = manifest.entries.filter((e) => e.type === "write" && e.purpose === "improvement");
    expect(writes).toHaveLength(2);
  });

  it("includes git operation permissions", () => {
    const manifest = buildPermissionManifest(sampleConstraints, ["src/"]);
    const gitOps = manifest.entries.filter((e) => e.purpose === "git");
    expect(gitOps.length).toBeGreaterThanOrEqual(6);
  });

  it("includes state file permissions", () => {
    const manifest = buildPermissionManifest(sampleConstraints, ["src/"]);
    const state = manifest.entries.filter((e) => e.purpose === "state");
    expect(state.length).toBeGreaterThan(0);
  });
});

describe("groupByPurpose (TN1-A)", () => {
  it("groups entries by purpose", () => {
    const manifest = buildPermissionManifest(sampleConstraints, ["src/"]);
    const groups = manifest.groups;
    expect(Object.keys(groups)).toContain("evaluation");
    expect(Object.keys(groups)).toContain("improvement");
    expect(Object.keys(groups)).toContain("git");
  });
});

describe("formatManifestChecklist (U1)", () => {
  it("produces readable markdown", () => {
    const manifest = buildPermissionManifest(sampleConstraints, ["src/"]);
    const output = formatManifestChecklist(manifest);
    expect(output).toContain("Pre-Flight Permission Checklist");
    expect(output).toContain("evaluation");
    expect(output).toContain("bun run lint");
  });
});

describe("verifyPermissions (O4)", () => {
  it("returns granted status for each entry", () => {
    const manifest = buildPermissionManifest(sampleConstraints, ["src/"]);
    const probeResults = new Map<string, boolean>();
    for (const e of manifest.entries) {
      probeResults.set(`${e.type}:${e.target}`, true);
    }
    const results = verifyPermissions(manifest, probeResults);
    expect(results.every((r) => r.granted)).toBe(true);
  });

  it("reports denied permissions", () => {
    const manifest = buildPermissionManifest(sampleConstraints, ["src/"]);
    const probeResults = new Map<string, boolean>();
    // Grant nothing
    const results = verifyPermissions(manifest, probeResults);
    expect(results.every((r) => !r.granted)).toBe(true);
  });
});

describe("handleDenials (O1)", () => {
  const fallbacks: FallbackEvaluator[] = [
    {
      primaryId: "eval-lint",
      fallback: { id: "fb-lint", name: "LLM lint", mechanism: "llm", command: "llm-eval", normalizer: "llm", weight: 0.3, isLlmEval: true },
      expectedCorrelation: 0.5,
    },
  ];

  it("activates fallbacks for denied constraints", () => {
    const denied = [
      { entry: { type: "bash" as const, target: "bun run lint", purpose: "evaluation", requiredBy: "eval-lint", required: true }, granted: false },
    ];
    const resolution = handleDenials(denied.map((d) => ({ ...d, error: "denied" })), sampleConstraints, fallbacks);
    expect(resolution.activatedFallbacks).toHaveLength(1);
    expect(resolution.canProceed).toBe(true);
  });

  it("drops constraints without fallbacks", () => {
    const denied = [
      { entry: { type: "bash" as const, target: "bun test", purpose: "evaluation", requiredBy: "eval-tests", required: true }, granted: false, error: "denied" },
    ];
    const resolution = handleDenials(denied, sampleConstraints, fallbacks);
    expect(resolution.droppedConstraintIds).toContain("eval-tests");
  });

  it("blocks when core permissions denied", () => {
    const denied = [
      { entry: { type: "bash" as const, target: "git commit", purpose: "git", requiredBy: "loop", required: true }, granted: false, error: "denied" },
    ];
    const resolution = handleDenials(denied, sampleConstraints, fallbacks);
    expect(resolution.canProceed).toBe(false);
  });
});
