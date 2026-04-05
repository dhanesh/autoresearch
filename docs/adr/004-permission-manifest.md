# ADR-004: Manifest-First Permission Model

## Status
Accepted

## Date
2026-04-05

## Context
As a Claude Code plugin, autoresearch requires several permissions to operate: `bash` (to run evaluation commands like `eslint`, `tsc`, test suites), `read` (to inspect source files in scope), `write` (to apply improvements and persist state), and git operations (to create branches, commit, and revert). Requesting these permissions ad-hoc during the loop would interrupt the autonomous improvement cycle and degrade the user experience.

Additionally, not all evaluators need the same permissions. LLM-based evaluators (`isLlmEval: true`) operate entirely through the LLM context and do not execute shell commands. Granting them bash permissions would unnecessarily expand the attack surface.

The design question was: how should the plugin declare and verify its permissions before starting the loop?

## Decision
Manifest-first permission model with scope minimization, implemented in `permissions.ts`. The `buildPermissionManifest` function generates a complete permission manifest from the discovered constraints and scope:

1. **Explicit declaration**: Every permission entry specifies its `type` (`bash`, `read`, `write`), `target` (the specific command or file path), `purpose` (`evaluation`, `improvement`, `git`, `state`), and `requiredBy` (which constraint or subsystem needs it).
2. **LLM evaluator exclusion**: Constraints where `command === "llm-eval"` are explicitly excluded from bash permission entries. LLM evaluators operate within the LLM context and never run shell commands.
3. **Scope minimization**: Write permissions are scoped to exactly the files in the improvement scope plus `.autoresearch/` for state persistence. No broad glob patterns.
4. **Purpose grouping**: Entries are grouped by purpose (`evaluation`, `improvement`, `git`, `state`) via `groupByPurpose()` for clear presentation to the user.
5. **Dry-run verification**: Before the loop starts, `verifyPermissions()` probes each permission to confirm it will be granted, catching denial early rather than mid-loop.
6. **Graceful degradation**: If permissions are denied for specific evaluators, fallback evaluators activate rather than aborting the entire loop.

## Consequences

### Positive
- **Transparency**: Users see exactly what the plugin will do -- every shell command, every file it will read/write, every git operation -- before granting access. No surprises mid-loop.
- **Reduced attack surface**: LLM evaluators cannot run arbitrary shell commands. Even if the LLM generates a malicious evaluation prompt, it has no bash permission to execute it.
- **Zero-interrupt loop**: By verifying all permissions upfront (satisfying B1: Zero-Interrupt), the loop runs without permission dialogs interrupting the autonomous cycle.
- **Graceful denial handling**: Denied permissions trigger fallback evaluators rather than hard failures, allowing the loop to proceed with reduced capability rather than aborting.
- **Auditable**: The manifest serves as a security audit trail, documenting exactly what permissions were requested and why.

### Negative
- **Upfront complexity in discovery phase**: The manifest must be generated during constraint discovery, before the loop starts. This adds a step to the initialization sequence and requires the constraint list and scope to be finalized before permission verification.
- **Manifest staleness**: If the scope changes mid-loop (e.g., via scope expansion proposals), the manifest may not cover newly added files. Currently, scope changes require a new manifest and re-verification.

### Neutral
- Git operations are enumerated individually (`git checkout -b`, `git add`, `git commit`, etc.) rather than requesting a blanket git permission. This is verbose but precise.
- The `.autoresearch/` directory is always included for state persistence, regardless of the improvement scope.

## Alternatives Considered

### Request-as-needed
Request each permission individually when first needed during the loop. Rejected because:
- Violates B1 (Zero-Interrupt): permission dialogs would interrupt the autonomous loop at unpredictable points.
- Poor UX: the user cannot predict upfront what the plugin will request, making informed consent difficult.
- Non-deterministic: the order and timing of permission requests would depend on which evaluators run first, making the experience inconsistent across runs.

### Broad permission grants
Request broad permissions (e.g., "bash: all commands", "write: all files") at the start. Rejected because:
- Violates S1 (Scope Minimization): grants far more access than needed.
- Security risk: a broad bash permission would allow LLM evaluators to execute arbitrary shell commands if the LLM were to generate malicious output.
- Undermines trust: users are less likely to grant broad permissions, reducing adoption.

### Permission groups without individual declaration
Group permissions by role (e.g., "evaluator role", "improver role") without listing specific commands and files. Rejected because:
- Insufficient transparency: users cannot see exactly which commands will run.
- Difficult to audit: role-based permissions obscure the actual operations performed.
- Does not support per-constraint permission denial and fallback.

## Related
- Satisfies: RT-1 (Permission Manifest System), B1 (Zero-Interrupt), T1 (Upfront Manifest), S1 (Scope Minimization), S2 (No Mid-Loop Escalation), U1 (Pre-Flight Checklist), O1 (Graceful Denial), O4 (Verification)
- Resolution: TN1-A (Exact Manifest)
- Files: `src/permissions.ts` (`buildPermissionManifest`, `verifyPermissions`, `groupByPurpose`), `src/types.ts` (`PermissionManifest`, `PermissionEntry`)
