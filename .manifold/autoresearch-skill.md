# autoresearch-skill

## Outcome

A Claude Code skill/command (`/autoresearch`) that implements Karpathy's autoresearch loop for iterative codebase improvement. The skill interactively discovers evaluation constraints from the user via AskUserQuestion, then runs an autonomous improve-evaluate-iterate loop that converges on measurable codebase improvements. The loop self-evaluates against user-defined constraints and stops when diminishing returns are detected or constraints are satisfied.

---

## Constraints

### Business

#### B1: Codebase Integrity Preservation

The autoresearch loop must never leave the codebase in a worse state than it started. Every iteration must be individually revertable, and the loop must halt if any metric regresses beyond a defined threshold.

> **Rationale:** Users trust the skill with their codebase. A single destructive iteration erodes all trust. Git commit-per-iteration enables granular revert, but the constraint goes beyond that — the loop itself must refuse to continue if it's doing harm.

#### B2: Multi-Dimensional Value Delivery

The skill must serve three distinct value propositions: developer productivity (autonomous improvement while user works elsewhere), code quality gating (pre-release improvement pass), and learning (showing developers improvements they wouldn't have found).

> **Rationale:** A single-purpose tool has narrow adoption. The constraint discovery phase adapts to user intent, making the same core loop serve all three use cases.

#### B3: Measurable Improvement Per Run

Each completed autoresearch run must produce a quantifiable improvement summary showing before/after metrics across all evaluated dimensions. No "trust me, it's better" — evidence required.

> **Rationale:** Without measurable proof of improvement, the skill is indistinguishable from random changes. Users need data to justify the time and token cost.

#### B4: Effective Constraint Discovery

The interactive constraint discovery phase must produce evaluation criteria that are genuinely useful for the target codebase — not generic boilerplate. Effectiveness is measured by whether the loop produces meaningful improvements vs. churning on irrelevant metrics.

> **Rationale:** The entire autoresearch pattern hinges on the quality of the evaluation function. Bad constraints → bad loop → wasted resources. This is the skill's key differentiator from a naive "improve this code" prompt.

---

### Technical

#### T1: Git Branch Isolation

All loop iterations must execute on a dedicated branch created at startup. Each iteration produces exactly one commit. The main/working branch is never modified during the loop. The branch naming convention is `autoresearch/<timestamp>-<scope>`.

> **Rationale:** Follows Karpathy's pattern of using git as the undo mechanism. Branch isolation means the user's workspace is untouched, and cherry-pick/squash/revert are all trivial per-iteration operations.

#### T2: User-Configurable Time Box Per Iteration

Each iteration has a configurable time budget (default suggested during constraint discovery based on codebase analysis). The time box includes both the improvement phase AND evaluation phase.

> **Rationale:** Karpathy uses a fixed 5-minute box. But codebase improvement varies — a small TypeScript project with fast tests needs 30s iterations, while a large monorepo with slow integration tests may need 5+ minutes. Let the codebase dictate the time box.

#### T3: Multi-Metric Evaluation Engine

The evaluation engine must support four concurrent evaluation mechanisms: (1) static analysis (linters, type checkers, complexity), (2) test suite (pass rate, coverage delta), (3) LLM self-evaluation (rubric-based scoring), and (4) custom user commands (arbitrary scripts producing numeric scores). Each produces a normalized 0-100 score.

> **Rationale:** Multi-metric evaluation is the primary defense against Goodhart's Law. A single metric is trivially gamed. Four independent evaluation axes make gaming extremely difficult — improvement must be genuine to score well across all dimensions.

**Implemented by:** Evaluation engine module (to be created)

#### T4: Hybrid Constraint Discovery With Codebase Analysis

Constraint discovery must: (1) analyze the codebase to detect language, framework, test setup, linting config, and current quality metrics, (2) propose smart default constraints based on analysis, (3) interview the user via AskUserQuestion to refine/accept/reject proposals and add custom priorities.

> **Rationale:** Pure interview is slow and relies on user knowing what to measure. Pure automation misses user priorities. The hybrid approach gives users a head start with intelligent defaults while preserving full control.

#### T5: Diminishing Returns Detection

Track the improvement delta (composite score change) across iterations. When the delta drops below a configurable threshold for 3 consecutive iterations, the loop auto-stops. The threshold is derived during constraint discovery based on initial scores.

> **Rationale:** Unlike Karpathy's "NEVER STOP" approach, a codebase improvement loop has natural plateaus. Continuing beyond diminishing returns wastes tokens and risks introducing subtle regressions from increasingly desperate changes.

#### T6: Smart Parallel Evaluation

Evaluation commands run in parallel by default (lint + tests + complexity simultaneously). Falls back to sequential if resource contention is detected (e.g., port conflicts, filesystem locks) or if results become flaky.

> **Rationale:** Parallel evaluation cuts iteration time significantly (often 40-60%) without requiring user configuration. The fallback prevents false negatives from resource contention.

---

### User Experience

#### U1: Live Progress + Summary Report

During the loop: display real-time iteration counter, current metric scores, and improvement deltas. On completion: generate a comprehensive markdown report with all iterations, metric trends, total improvement, and per-iteration diffs.

> **Rationale:** Users need to trust what's happening (live progress) and have a permanent record of what changed and why (summary report). The report also serves the "learning" value proposition — users study it to understand improvement patterns.

#### U2: Interactive Constraint Discovery via AskUserQuestion

The constraint discovery phase must use structured AskUserQuestion prompts — never free-text-only questions. Propose options with descriptions, let users select and customize. Explain why each constraint matters.

> **Rationale:** Structured prompts reduce cognitive load and ensure constraint quality. Users shouldn't need to invent metrics from scratch — they should react to smart proposals.

#### U3: Clear Convergence Communication

When the loop auto-stops due to diminishing returns, display: (1) the diminishing trend data showing the last N iterations' deltas, (2) the total improvement achieved, (3) how to resume if the user disagrees with stopping.

> **Rationale:** Auto-stopping is convenient but can feel opaque. Showing the trend data builds trust and gives the user agency to override if they believe more improvement is possible.

#### U4: Preset Profiles With Customization

Offer preset constraint profiles (e.g., "quality-focused", "perf-focused", "test-coverage") as starting points during discovery. Users can accept a profile as-is or use it as a foundation for customization.

> **Rationale:** Presets reduce time-to-first-loop from minutes to seconds for common use cases, while still allowing full customization for specialized needs.

---

### Security

#### S1: No Destructive Git Operations

The loop must not force-push, delete branches, rebase, or modify git history. Exception: if the user's explicit constraint involves secret removal from git history, the skill may use approved history-rewriting tools (e.g., BFG) with explicit user confirmation before execution.

> **Rationale:** Git history is sacred in shared codebases. The exception for secret removal is the one legitimate case where history rewriting is the correct action — but it must be explicitly requested and confirmed, never automatic.

#### S2: File Scope Enforcement

The loop may only read/modify files within the user-defined scope boundaries. Configuration files (.env, CI configs, package.json scripts) are read-only by default unless explicitly included in scope.

> **Rationale:** An autonomous loop modifying CI pipelines or environment configs could cause production incidents. Scope enforcement prevents the loop from "improving" things it shouldn't touch.

#### S3: Evaluation Command Sandboxing

Shell commands executed during evaluation must come from a pre-approved set (test runners, linters, type checkers, user-specified commands). The skill must never execute arbitrary commands generated by the LLM during the improvement phase.

> **Rationale:** The LLM generates code improvements, but must not generate evaluation commands on the fly. This prevents prompt injection from code comments or crafted file contents from escalating to arbitrary command execution.

---

### Operational

#### O1: Maximum Iterations Cap

A hard cap on total iterations (default: 20, user-configurable during constraint discovery) that cannot be exceeded regardless of convergence state. Prevents infinite loops from faulty convergence detection.

> **Rationale:** Defense in depth — even if diminishing returns detection fails, the cap ensures the loop terminates. 20 iterations is derived from Karpathy's finding that most meaningful improvements are found within the first 20 experiments.

#### O2: Token Budget Guard

Track cumulative token usage across all iterations. Display running total in live progress. Stop the loop if the token budget is exceeded. Default budget is derived from iteration cap × estimated tokens per iteration.

> **Rationale:** Autoresearch loops can consume significant tokens. Users need cost visibility and hard limits to prevent surprise bills. The budget is a first-class operational constraint, not an afterthought.

#### O3: Regression Circuit Breaker

If any single evaluation metric regresses by more than 10% from its best observed value during the run, immediately halt the loop, revert the offending commit, and report the regression with full diagnostics.

> **Rationale:** A large regression indicates the loop has entered a destructive phase. Immediate halt prevents cascading damage. The 10% threshold is a default — user can adjust during constraint discovery.

#### O4: Total Wall-Clock Timeout

A maximum wall-clock time limit for the entire loop run (default: 1 hour, user-configurable). Prevents resource exhaustion from slow iterations or hung evaluation commands.

> **Rationale:** Time box per iteration handles individual cycles, but the total run needs a cap too. A hung evaluation command could block one iteration indefinitely — the timeout catches this.

---

## Tensions

### TN1: Evaluation Depth vs Time Box

Multi-metric evaluation (T3) requires running 4 mechanisms (static analysis, tests, LLM eval, custom commands), but the per-iteration time box (T2) may not accommodate all of them.

> **Resolution:** Adaptive eval selection — measure mechanism durations during constraint discovery, include only those fitting within the time box, prioritize by user preference, and drop the slowest. Users are notified which mechanisms were excluded and why.

### TN2: LLM Evaluation vs Token Budget

LLM self-evaluation (T3) consumes tokens from the same budget as the improvement phase (O2). A thorough rubric-based eval could consume 30-50% of per-iteration tokens.

> **Resolution:** Sampling strategy — run full LLM evaluation every 3rd iteration, use lightweight static metrics for intervening iterations. Reduces eval token cost by ~60% while preserving periodic deep quality checks.

### TN3: File Scope vs Architecture Improvements

Architecture improvements often require cross-module changes (moving functions, updating imports), but file scope enforcement (S2) prevents writing outside the defined boundary.

> **Resolution:** Scope expansion proposals — the loop can READ any file for context understanding but can only WRITE within scope. High-impact improvements requiring out-of-scope files are logged as proposals in the summary report for the user to act on.

### TN4: Parallel Evaluation vs Circuit Breaker Accuracy

Parallel evaluation (T6) may produce flaky results (port conflicts, test ordering issues) that falsely trigger the 10% regression circuit breaker (O3).

> **Resolution:** Retry before trip — when a metric regresses >10%, re-run that specific evaluation sequentially before triggering the circuit breaker. Only trip if the regression confirms on retry. Prevents false positives from parallelism artifacts.

### TN5: Command Sandboxing vs Custom Commands

Users provide custom evaluation commands (T3), but command sandboxing (S3) restricts arbitrary execution. The tension: custom commands are user-approved but the LLM shouldn't invoke them outside evaluation.

> **Resolution:** Phase-locked execution AND command signature verification. Commands are registered and hashed during constraint discovery. They can ONLY execute during the evaluation phase. Hash is verified before each run — modified commands are rejected. Maximum security without limiting user flexibility.

### TN6: Autonomous Operation vs Premature Convergence

Auto-stopping via diminishing returns (T5) might halt before a breakthrough improvement that follows a temporary score dip, reducing the multi-dimensional value delivery (B2).

> **Resolution:** Plateau window — require 3 consecutive below-threshold iterations before auto-stopping. Single-iteration dips followed by recovery do not trigger the stop. The 3-iteration window provides safety margin against premature convergence.

### TN7: Measurable Metrics vs Learning Value

The most valuable improvements for learning (better naming, clearer architecture) are hard to quantify with automated metrics (B3). LLM eval captures this but was deprioritized to sampling by TN2, reducing learning value (B2).

> **Resolution:** Learning-focused summary — the final report ALWAYS includes a full (non-sampled) LLM evaluation with explanations of WHY each change was made, regardless of the sampling strategy used during the loop. Learning value lives in the report, not the loop metrics.

---

## Required Truths

### RT-1: Score Normalization Across Heterogeneous Metrics

All evaluation mechanisms (static analysis, test suite, LLM eval, custom commands) must produce scores on a normalized 0-100 scale so they can be compared, aggregated into a composite score, and tracked for diminishing returns detection.

**Gap:** Each mechanism produces different output formats — lint produces warning counts, tests produce pass/fail + coverage %, LLM produces qualitative assessments, custom commands produce arbitrary output. A normalization layer must map all of these to 0-100.

**Maps to:** T3, B3, O3

### RT-2: Baseline Capture Before First Iteration

The skill must capture a complete baseline score across all evaluation dimensions BEFORE the first improvement iteration. Without a baseline, "improvement" is unmeasurable and the circuit breaker has no reference point.

**Gap:** No baseline capture mechanism exists. Must run all evaluation mechanisms once at startup and store results as the baseline snapshot.

**Maps to:** B1, B3, T5

### RT-3: Evaluation Axis Independence

Each evaluation mechanism must measure a genuinely independent dimension of code quality. If two mechanisms are correlated (e.g., both just measure line count), multi-metric evaluation collapses to single-metric and becomes gameable.

**Gap:** Need to verify that static analysis, test coverage, LLM rubric, and custom commands each capture distinct quality dimensions. The discovery phase must validate independence or warn the user.

**Maps to:** T3, B4

### RT-4: Non-Interactive Git Operations

All git operations (branch creation, committing, reverting) must execute without user interaction — no password prompts, no editor popups, no merge conflict resolution. The loop must handle these programmatically.

**Gap:** Git may require authentication for push, may open editor for commit messages, may encounter merge conflicts if the branch diverges. Must use `--no-edit`, `--allow-empty-message`, and detect conflicts as errors.

**Maps to:** T1, S1

### RT-5: Evaluation Command Timeout Guarantees

Every evaluation command must terminate within a bounded time. A hung test suite or infinite-loop linter would block the iteration indefinitely, eventually hitting the wall-clock timeout with no useful output.

**Gap:** Shell commands have no built-in timeout. Must wrap all evaluation commands with `timeout` (or equivalent) and treat timeout as a failed evaluation, not a hang.

**Maps to:** T2, O4, S3

### RT-6: Iteration State Machine

The loop must maintain state across iterations: current iteration number, cumulative token usage, per-iteration scores, composite score history, plateau counter, and best-observed values. This state drives convergence detection, circuit breaker, and the summary report.

**Gap:** Claude Code skills are stateless between tool calls. Must persist state in a structured format (JSON file on disk or in-memory accumulator passed between tool calls).

**Maps to:** T5, O1, O2, O3, U1

### RT-7: Codebase Introspection Engine

The skill must be able to detect: programming language(s), framework(s), package manager, test runner, linter configuration, and existing quality tooling. This drives the hybrid constraint discovery — without introspection, proposals are generic.

**Gap:** No universal introspection exists. Must analyze `package.json`, `tsconfig.json`, `.eslintrc`, `pyproject.toml`, `Cargo.toml`, etc. via glob patterns and file content parsing.

**Maps to:** T4, U4

### RT-8: Constraint-to-Command Pipeline

Each discovered constraint must map to one or more executable evaluation commands. A constraint like "reduce cyclomatic complexity" is useless without a command that measures cyclomatic complexity and produces a numeric score.

**Gap:** The bridge between abstract constraints ("improve test coverage") and concrete commands (`bun test --coverage | grep 'All files'`) must be built. The discovery phase must validate that every accepted constraint has a runnable command.

**Maps to:** T3, T4, S3

### RT-9: Claude Code Skill Architecture Compliance

The skill must conform to Claude Code's skill system: SKILL.md with proper frontmatter (name, description), invokable via `/autoresearch`, able to use all available tools (Bash, Read, Write, Edit, AskUserQuestion, Agent), and composable with other skills.

**Gap:** The skill structure exists as a convention. Must create SKILL.md with proper frontmatter and ensure the prompt instructs Claude Code to use the right tools in the right sequence.

**Maps to:** B2, U2

### RT-10: CLI Interface With Argument Parsing

The skill must accept arguments: scope path, preset profile, iteration cap override, time box override, and resume flag. Arguments must be parseable from the command invocation string.

**Gap:** Claude Code skills receive arguments as a raw string. Must parse structured arguments from the ARGUMENTS string in the skill prompt.

**Maps to:** U1, U3, U4

---

## Solution Space

### Option A: Single-File Skill With Modular TypeScript <-- Selected

```
skills/autoresearch/
├── SKILL.md          # Skill definition + orchestration prompt
├── loop.ts           # Core loop engine (state machine, convergence)
├── evaluators/
│   ├── static.ts     # Lint/type/complexity scoring
│   ├── tests.ts      # Test runner + coverage
│   ├── llm.ts        # LLM rubric evaluation
│   └── custom.ts     # User command execution
├── discovery.ts      # Hybrid constraint discovery
└── report.ts         # Summary report generation
```

- **Satisfies:** RT-1 through RT-10 (all)
- **Gaps:** None (with implementation)
- **Complexity:** Medium
- **Rationale:** SKILL.md provides the orchestration prompt that instructs Claude Code how to run the loop. TypeScript modules handle the mechanical parts (score normalization, state tracking, timing). This separation keeps the prompt focused on intelligence (what to improve) while code handles reliability (how to measure and track).
