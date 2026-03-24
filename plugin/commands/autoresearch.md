---
name: autoresearch
description: Autonomous codebase improvement loop inspired by Karpathy's autoresearch. Iteratively improves code quality, test coverage, performance, and architecture using multi-metric evaluation with diminishing returns detection. USE WHEN user wants to iteratively improve a codebase, run autonomous code improvement, or apply the autoresearch pattern.
---

# /autoresearch — Autonomous Codebase Improvement Loop

You are executing the autoresearch skill — an autonomous improve-evaluate-iterate loop that converges on measurable codebase improvements. Follow this protocol EXACTLY.

## Arguments

Parse from ARGUMENTS string:
- `[scope]` — File or directory path(s) to improve (default: auto-discover)
- `--profile <name>` — Preset profile: `quality`, `performance`, `coverage` (default: interactive discovery)
- `--max-iterations <n>` — Override max iterations (default: 20)
- `--time-box <seconds>` — Override per-iteration time box (default: 120)
- `--resume` — Resume a previous run from `.autoresearch/state.json`
- `--dry-run` — Run discovery only, show what would be evaluated, don't loop

## Phase 1: Constraint Discovery

<!-- Satisfies: T4, U2, U4, RT-7, RT-8, TN1 -->

### Step 1.1: Codebase Introspection

Analyze the target codebase to detect its tooling:

```
1. Use Glob to find: package.json, tsconfig.json, pyproject.toml, Cargo.toml, go.mod
2. Use Glob to find: .eslintrc*, eslint.config.*, biome.json, .flake8, ruff.toml
3. Use Glob to find: vitest.config.*, jest.config.*, pytest.ini, conftest.py
4. Read detected config files to understand the setup
5. Count files in scope using Glob
```

Build a CodebaseProfile from findings.

### Step 1.2: Profile Selection or Interactive Discovery

**If `--profile` specified:** Load the preset from `profiles/<name>.json`. Replace `auto-detect` commands with actual commands based on detected tooling.

**If no profile:** Use AskUserQuestion for hybrid discovery:

1. Present the codebase analysis findings
2. Propose default constraints based on detected tools
3. Ask user to accept/reject/modify each proposed constraint
4. Ask if they want to add custom evaluation commands
5. Ask for time box preference (suggest based on codebase size)
6. Ask for iteration cap preference

**CRITICAL:** Every accepted constraint MUST have a runnable command. Validate by executing each command once with a 10-second timeout. Report any that fail.

### Step 1.3: Timing Calibration

<!-- Satisfies: TN1 (Adaptive Eval Selection) -->

Run each evaluation command once and measure duration:
```bash
time <command>
```

If total eval time exceeds 40% of the time box:
1. Show the timing breakdown to the user
2. Ask which mechanisms to keep via AskUserQuestion
3. Drop the slowest mechanisms that don't fit

### Step 1.4: Command Registration

<!-- Satisfies: TN5 (Phase-Lock + Signature Verification) -->

For each accepted constraint:
1. Record the exact command string
2. Compute SHA-256 hash: `echo -n "<command>" | shasum -a 256`
3. Store in the constraint config

These commands are now LOCKED. You MUST NOT modify, generate, or execute any command not in this registered set during the loop.

## Phase 2: Baseline Capture

<!-- Satisfies: RT-2, T1 -->

```
1. Create git branch: autoresearch/<timestamp>-<scope>
   Command: git checkout -b "autoresearch/$(date +%Y%m%dT%H%M%S)-<scope-slug>"

2. Create .autoresearch/ directory for state files

3. Run ALL registered evaluation commands
   - Execute each command with timeout wrapper
   - Normalize each result to 0-100 score
   - Calculate weighted composite score
   - Record as baseline in state.json

4. Display baseline scores to user:
   "Baseline captured:
    - lint: 72/100
    - tests: 85/100 (pass rate)
    - llm-quality: 65/100
    Composite: 74.0"

5. Write initial state to .autoresearch/state.json
6. Commit: "autoresearch: baseline capture"
```

## Phase 3: The Loop

<!-- Satisfies: RT-6, O1, O2, O3, O4, T2, T5, T6, TN4, TN6 -->

```
FOR EACH ITERATION (until stop condition met):

  ┌─ CHECK STOP CONDITIONS ─────────────────────────────┐
  │ 1. Current iteration >= max_iterations? → STOP      │
  │ 2. Total tokens >= token_budget? → STOP              │
  │ 3. Wall-clock elapsed >= total_timeout? → STOP       │
  │ 4. Plateau counter >= plateau_window (3)? → STOP     │
  └──────────────────────────────────────────────────────┘

  ┌─ IMPROVE ───────────────────────────────────────────┐
  │ Read the files in scope.                             │
  │ Analyze for improvements based on active constraints.│
  │ Apply ONE focused improvement per iteration.         │
  │ Keep changes small and atomic.                       │
  │                                                      │
  │ SCOPE ENFORCEMENT (S2):                              │
  │ - You may READ any file in the project               │
  │ - You may ONLY WRITE to files within the scope       │
  │ - If you identify an out-of-scope improvement,       │
  │   log it as a ScopeProposal, do NOT implement it     │
  └──────────────────────────────────────────────────────┘

  ┌─ EVALUATE ──────────────────────────────────────────┐
  │ Run registered evaluation commands:                  │
  │                                                      │
  │ COMMAND SAFETY (S3, TN5):                            │
  │ - ONLY execute commands from the registered set      │
  │ - Verify hash before each execution                  │
  │ - Wrap each with: timeout <seconds> <command>        │
  │                                                      │
  │ PARALLELISM (T6):                                    │
  │ - Run independent eval commands in parallel (default)│
  │ - If any command fails/flakes, re-run sequentially   │
  │                                                      │
  │ LLM EVAL SAMPLING (TN2):                             │
  │ - Run LLM eval only every 3rd iteration              │
  │ - Use previous LLM score for skipped iterations      │
  │                                                      │
  │ Normalize all results to 0-100                       │
  │ Calculate weighted composite score                   │
  └──────────────────────────────────────────────────────┘

  ┌─ DECIDE ────────────────────────────────────────────┐
  │ Compare composite to previous iteration:             │
  │                                                      │
  │ IF improved (composite > previous):                  │
  │   → git add + git commit "autoresearch: iteration N" │
  │   → Update best scores                               │
  │   → Reset plateau counter                            │
  │                                                      │
  │ IF regressed (composite <= previous):                │
  │   → git checkout -- . (revert all changes)           │
  │   → Log as "reverted"                                │
  │   → Increment plateau counter                        │
  │                                                      │
  │ CIRCUIT BREAKER (O3, TN4):                           │
  │ IF any metric regressed >10% from best:              │
  │   → Re-run THAT metric sequentially (TN4: retry)     │
  │   → IF regression CONFIRMED on retry:                │
  │     → Revert changes                                 │
  │     → STOP loop with "circuit_breaker" reason        │
  │     → Report the regression details                  │
  │   → IF regression NOT confirmed (was flaky):         │
  │     → Continue normal flow                           │
  └──────────────────────────────────────────────────────┘

  ┌─ TRACK ─────────────────────────────────────────────┐
  │ Update .autoresearch/state.json with:                │
  │ - Iteration scores, delta, status                    │
  │ - Cumulative tokens used                             │
  │ - Plateau counter                                    │
  │ - Best scores                                        │
  │                                                      │
  │ Display progress:                                    │
  │ "[autoresearch] Iteration 5/20 | Score: 78 (+2.1)   │
  │  | Tokens: 45000 | Elapsed: 340s"                    │
  └──────────────────────────────────────────────────────┘

END FOR
```

## Phase 4: Report Generation

<!-- Satisfies: U1, B3, U3, TN7 -->

When the loop stops (for ANY reason):

```
1. Run FULL LLM evaluation (not sampled) on all changes since baseline
   - This is the learning report (TN7)
   - Include WHY each change improves the code
   - Include what patterns were applied

2. Generate .autoresearch/report.md with:
   - Run metadata (scope, duration, iterations, stop reason)
   - Per-constraint improvement table (baseline → final, % change)
   - Iteration history table (score, delta, status per iteration)
   - Convergence analysis (if stopped due to diminishing returns)
   - Out-of-scope proposals (if any)
   - Full learning report from LLM evaluation

3. Display convergence message (U3):
   "Autoresearch complete:
    - Iterations: 12/20
    - Stop reason: diminishing returns (3 consecutive < 0.5 delta)
    - Total improvement: +8.3 points (74.0 → 82.3)
    - Report: .autoresearch/report.md
    - Branch: autoresearch/20260324T202006-src"

4. Commit the report: "autoresearch: final report"
```

## Safety Rules (NON-NEGOTIABLE)

1. **NEVER modify files outside the defined scope** (S2)
2. **NEVER execute commands not in the registered set** (S3)
3. **NEVER force-push, delete branches, or rewrite history** (S1)
4. **NEVER continue after circuit breaker trips** (O3)
5. **NEVER exceed the iteration cap** (O1)
6. **ALWAYS verify command hashes before execution** (TN5)
7. **ALWAYS wrap commands with timeout** (RT-5)
8. **ALWAYS commit before and after changes** (T1, B1)

## Resume Protocol

When `--resume` is passed:

```
1. Read .autoresearch/state.json
2. Verify the autoresearch branch still exists
3. Checkout the branch
4. Display current state (iteration count, scores, budget remaining)
5. Continue the loop from where it left off
```

## Error Handling

| Error | Action |
|-------|--------|
| Evaluation command fails | Score 0 for that constraint, continue |
| Evaluation command times out | Score 0, log timeout, continue |
| Git commit fails | Log error, skip iteration, continue |
| All evaluations fail | STOP loop, report error |
| State file corrupted | STOP loop, report last known good state |
