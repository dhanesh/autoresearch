// Satisfies: RT-1 (Permission Manifest System)
// Satisfies: B1 (Zero-Interrupt), T1 (Upfront Manifest), S1 (Scope Minimization)
// Satisfies: S2 (No Mid-Loop Escalation), U1 (Pre-Flight Checklist), O1 (Graceful Denial), O4 (Verification)
// Resolution: TN1-A (Exact Manifest)

import type {
  EvalConstraint,
  FallbackEvaluator,
  PermissionEntry,
  PermissionManifest,
  PermissionVerifyResult,
} from "./types";

/** Build permission manifest from constraints and scope. Satisfies: T1, S1, TN1 */
export function buildPermissionManifest(
  constraints: EvalConstraint[],
  scope: string[]
): PermissionManifest {
  const entries: PermissionEntry[] = [];

  // Eval command permissions (Bash)
  for (const c of constraints) {
    if (c.command !== "llm-eval") {
      entries.push({
        type: "bash",
        target: c.command,
        purpose: "evaluation",
        requiredBy: c.id,
        required: true,
      });
    }
  }

  // Scope file write permissions
  for (const s of scope) {
    entries.push({
      type: "write",
      target: s,
      purpose: "improvement",
      requiredBy: "loop",
      required: true,
    });
    entries.push({
      type: "read",
      target: s,
      purpose: "improvement",
      requiredBy: "loop",
      required: true,
    });
  }

  // Git operations
  const gitOps = [
    "git checkout -b",
    "git add",
    "git commit",
    "git checkout --",
    "git diff",
    "git status",
  ];
  for (const op of gitOps) {
    entries.push({
      type: "bash",
      target: op,
      purpose: "git",
      requiredBy: "loop",
      required: true,
    });
  }

  // State file writes
  entries.push({
    type: "write",
    target: ".autoresearch/",
    purpose: "state",
    requiredBy: "loop",
    required: true,
  });

  const groups = groupByPurpose(entries);
  return { entries, groups };
}

/** Group permission entries by purpose for display. Satisfies: TN1-A */
export function groupByPurpose(
  entries: PermissionEntry[]
): Record<string, PermissionEntry[]> {
  const groups: Record<string, PermissionEntry[]> = {};
  for (const entry of entries) {
    const group = groups[entry.purpose] ?? [];
    group.push(entry);
    groups[entry.purpose] = group;
  }
  return groups;
}

/** Format manifest for user display. Satisfies: U1 */
export function formatManifestChecklist(manifest: PermissionManifest): string {
  const lines: string[] = [
    "## Pre-Flight Permission Checklist",
    "",
    "The following permissions are needed for this autoresearch run:",
    "",
  ];

  for (const [purpose, entries] of Object.entries(manifest.groups)) {
    lines.push(`### ${purpose} (${entries.length} permissions)`);
    lines.push("");
    for (const e of entries) {
      const tag = e.required ? "required" : "optional";
      lines.push(`- \`${e.type}\`: \`${e.target}\` (${tag}, for ${e.requiredBy})`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/** Verify each permission with a dry-run probe. Satisfies: O4 */
export function verifyPermissions(
  manifest: PermissionManifest,
  probeResults: Map<string, boolean>
): PermissionVerifyResult[] {
  return manifest.entries.map((entry) => {
    const key = `${entry.type}:${entry.target}`;
    const granted = probeResults.get(key) ?? false;
    return {
      entry,
      granted,
      error: granted ? undefined : `Permission denied for ${key}`,
    };
  });
}

/** Handle denied permissions: remove constraints, activate fallbacks. Satisfies: O1 */
export function handleDenials(
  verifyResults: PermissionVerifyResult[],
  constraints: EvalConstraint[],
  fallbacks: FallbackEvaluator[]
): DenialResolution {
  const denied = verifyResults.filter((r) => !r.granted && r.entry.required);
  const affectedConstraintIds = new Set(denied.map((d) => d.entry.requiredBy));

  const activatedFallbacks: FallbackEvaluator[] = [];
  const droppedConstraintIds: string[] = [];

  for (const id of affectedConstraintIds) {
    if (id === "loop") continue; // Core permissions can't be substituted
    const fallback = fallbacks.find((f) => f.primaryId === id);
    if (fallback) {
      activatedFallbacks.push(fallback);
    } else {
      droppedConstraintIds.push(id);
    }
  }

  const remainingCount =
    constraints.length - droppedConstraintIds.length + activatedFallbacks.length;
  const corePermissionsDenied = denied.some((d) => d.entry.requiredBy === "loop");

  return {
    denied,
    activatedFallbacks,
    droppedConstraintIds,
    remainingAxisCount: remainingCount,
    canProceed: !corePermissionsDenied && remainingCount >= 2,
  };
}

/** Result of handling permission denials */
export interface DenialResolution {
  denied: PermissionVerifyResult[];
  activatedFallbacks: FallbackEvaluator[];
  droppedConstraintIds: string[];
  remainingAxisCount: number;
  canProceed: boolean;
}
