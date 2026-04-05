# commandments-uplift

## Outcome

Implement the 7 prioritized recommendations from the Engineering Commandments Assessment Report (claudedocs/commandments-report.md) to uplift overall codebase maturity from 3.0/5 to ~3.7/5. Specifically:

1. **Add CI/CD Pipeline** (Cmd 6: Level 2 -> 3) — GitHub Actions workflow enforcing typecheck, lint, test with coverage thresholds on every push/PR
2. **Add Runtime Schema Validation** (Cmd 7+8: Level 3 -> 4) — Zod schemas for LLM responses and custom command outputs, replacing ad-hoc regex parsing
3. **Add Structured Logging** (Cmd 4: Level 3 -> 4) — Minimal dependency-free logger with info/warn/error levels and structured JSON output to stderr
4. **Add Integration Tests** (Cmd 3: Level 3 -> 4) — End-to-end loop lifecycle tests (discovery -> baseline -> loop -> report) with mock evaluator outputs
5. **Implement Retry with Backoff** (Cmd 1: Level 3 -> 4) — Exponential backoff with jitter for custom command evaluation, max 3 retries
6. **Create Architectural Decision Records** (Cmd 5: Level 4 -> 5) — ADRs for state machine design, circuit breaker strategy, adaptive scheduling, permission manifest
7. **Implement Parallel Evaluation** (Cmd 10: Level 3 -> 4) — Promise.allSettled-based concurrent evaluator execution with concurrency limits

---

## Constraints

### Business

#### B1: Uplift Overall Maturity to ≥3.5/5

The combined effect of all changes must raise the Engineering Commandments overall maturity score from 3.0/5 to at least 3.5/5 as measured by a re-assessment using the same criteria.

> **Rationale:** The assessment identified 3.0/5 as the baseline. A 0.5+ improvement demonstrates meaningful progress across multiple commandments, not just cosmetic changes.

#### B2: All Existing Tests Must Continue to Pass

Every one of the existing 150+ unit tests must pass without modification after each priority is implemented. No test may be deleted, skipped, or weakened.

> **Rationale:** The test suite is a verified project strength (Level 3). Regressing it while improving other areas defeats the purpose.

#### B3: Plugin Distribution Must Work Without Package Manager

The plugin must remain installable via `install/install.sh` without requiring `npm install` or `bun install` at the destination (`~/.claude/` or `~/.amp/`). Any new runtime dependency (zod) must be bundled or otherwise resolved by the install script.

> **Rationale:** (Pre-mortem) The install script copies source files directly — no package manager runs at the destination. Adding zod as a runtime dep without updating distribution would break all installations.

### Technical

#### T1: GitHub Actions CI/CD with Bun Runtime

CI/CD pipeline must use GitHub Actions with `oven-sh/setup-bun` action, running `bun run typecheck`, `bun run lint`, and `bun run test:coverage` on every push and pull_request event.

> **Rationale:** Matches the project's existing bun-types toolchain. Enforces quality gates that currently only run manually.

#### T2: Coverage Thresholds Enforced in CI

Vitest coverage must enforce minimum thresholds: lines ≥80%, functions ≥80%, branches ≥75%. CI must fail if thresholds are not met.

> **Rationale:** Coverage exists but has no enforcement. Without thresholds, coverage can silently regress. These are industry-standard minimums for a well-tested codebase.

**Threshold:** deterministic — lines 80%, functions 80%, branches 75%

#### T3: Zod Runtime Schema Validation for External Inputs

All LLM response parsing (`evaluators/llm.ts`) and custom command output parsing (`evaluators/custom.ts`) must use zod `.safeParse()` instead of ad-hoc regex/try-catch. Zod is the sole permitted runtime dependency.

> **Rationale:** Ad-hoc parsing in `llm.ts:90-117` and `custom.ts:54-82` handles happy paths but lacks structured error reporting. Zod provides typed error objects and safe fallbacks.

#### T4: Structured Logger with Opt-in Activation

A minimal, dependency-free `Logger` module must provide `info`/`warn`/`error` levels with structured JSON output. Logger must default to silent (no output) and require explicit opt-in via `LoopConfig`.

> **Rationale:** Zero logging exists currently (only `Math.log()` in scoring.ts). Real-time observability during loop execution aids debugging. Must be opt-in to avoid interfering with host environments.

#### T5: Retry with Exponential Backoff

Custom command evaluation must support retry with exponential backoff and jitter. Maximum 3 retries. Configurable via `LoopConfig` with `maxRetries` and `baseDelayMs` fields.

> **Rationale:** Currently, command timeouts fail immediately with no retry. Transient failures (process contention, temporary file locks) would benefit from retry.

**Threshold:** deterministic — ceiling of 3 retries

#### T6: Parallel Evaluation via Promise.allSettled

When `parallelEval: true` in LoopConfig, evaluators must execute concurrently using `Promise.allSettled()` with a configurable concurrency limit. Partial failures (some evaluators fail, others succeed) must be handled gracefully in composite scoring.

> **Rationale:** The `parallelEval` flag exists in `types.ts:100` but is not implemented. Concurrent evaluation reduces iteration time for large constraint sets.

#### T7: Parallel Evaluation Must Be Score-Deterministic

Composite scores produced by parallel evaluation must be identical to scores produced by sequential evaluation for the same inputs. Evaluator execution order must not affect the final score.

> **Rationale:** (Pre-mortem) Floating-point ordering differences in concurrent execution could cause non-deterministic convergence detection and flaky tests.

#### T8: Integration Tests for Full Loop Lifecycle

Integration tests must cover the complete plugin lifecycle: `initState` → `shouldStop` → `processIterationResults` cycle with mock evaluator outputs. Must test: normal convergence, circuit breaker activation, permission denial with fallback, and plateau detection.

> **Rationale:** Only unit tests exist. No test validates the state machine transitions end-to-end, so subtle interaction bugs between modules go undetected.

### User Experience

#### U1: No Breaking Changes to Plugin Public API

All exported types and functions from `src/` must maintain their existing signatures. New parameters must be optional with backward-compatible defaults.

> **Rationale:** The plugin is already in use. Breaking the API forces all consumers to update simultaneously, which is unacceptable for a maturity uplift.

#### U2: No Breaking Changes to Plugin Configuration

All existing `LoopConfig` fields must retain their current defaults. New fields (retry config, logging config, concurrency limit) must be optional and default to preserving current behavior.

> **Rationale:** Existing `.autoresearch` configurations in user projects must continue to work without modification.

#### U3: Logging Must Not Interfere with Host Environment

The logger must never write to stdout or stderr by default. When enabled, output must go to a configurable destination (file or callback). Must not interfere with Claude Code's tool output parsing or AMP's harness.

> **Rationale:** (Pre-mortem) JSON log lines mixed into stderr would cause parse errors in Claude Code's harness, breaking user sessions.

### Security

#### S1: LLM Output Must Be Validated Before Use

All parsed values from LLM responses must pass zod schema validation before being used in scoring. Malformed responses must produce typed fallback values (not throw), with the validation error recorded in `EvalResult.error`.

> **Rationale:** LLM outputs are untrusted external input. The current regex parsing in `llm.ts` silently falls back to score 50 without recording why. Structured validation provides audit trail.

#### S2: Logging Must Not Expose Sensitive Data

Log entries must never include: full LLM prompts/responses, file contents being evaluated, API keys, or user configuration values. Only metadata (iteration number, constraint name, score, duration) is permitted.

> **Rationale:** Debug logs can leak sensitive codebase content. A plugin running in user workspaces must treat all evaluated content as confidential.

### Operational

#### O1: ADRs for 4 Key Design Decisions

Create Architectural Decision Records in `docs/adr/` for: (1) state machine design, (2) circuit breaker strategy, (3) adaptive scheduling algorithm, (4) permission manifest approach. Each ADR must follow the standard template (Title, Status, Context, Decision, Consequences).

> **Rationale:** These design decisions are currently undocumented. The constraint-to-code traceability (Satisfies: comments) explains WHAT, but ADRs explain WHY alternatives were rejected.

#### O2: All New Code Must Have Corresponding Tests

Every new module (logger, retry, schemas) and every modified module must have tests added in the same PR. No new code without test coverage.

> **Rationale:** The existing test coverage is a project strength. New code without tests would create coverage gaps and regress the testing commandment.

#### O3: Install Script Must Handle Bundled Dependencies

The `install/install.sh` script must be updated to handle any bundled runtime dependencies (zod). Either bundle zod inline or copy it from node_modules during installation.

> **Rationale:** (Pre-mortem) Current install script copies `src/` and `plugin/` directories only. Adding a runtime dependency without updating distribution would silently break all installations.

---

## Tensions

### TN1: Zod Runtime Dependency vs File-Copy Distribution

Adding zod as a runtime dependency (T3) conflicts with the file-copy distribution model (B3) where `install.sh` copies raw `.ts` files to `~/.claude/` without running any package manager. The install script (O3) must also be updated.

> **Resolution:** Bundle zod as a single self-contained `.ts` file using `bun build`, checked into the repo at `plugin/lib/vendor/zod.ts`. The install script copies the `vendor/` directory alongside existing `lib/` files. No package manager needed at destination.

**TRIZ:** Technical contradiction — must have dependency (for validation) and must not have dependency (for distribution). Applied P1 (Segmentation): separate the dependency into a pre-bundled artifact.

**Propagation:**
- O3: TIGHTENED — install script must now copy `vendor/` subdirectory
- B3: LOOSENED — bundling eliminates package manager requirement

### TN2: Logging Observability vs Host Environment Safety

Structured logging (T4) wants to emit real-time diagnostic output, but the host environment (U3) cannot tolerate writes to stdout/stderr that would corrupt Claude Code's tool output parsing.

> **Resolution:** Callback-based logger. Instead of writing to any stream, the logger accepts an optional `onLog: (entry: LogEntry) => void` callback in LoopConfig. When no callback is configured, the logger is completely silent. The caller controls output destination (file, custom stream, aggregator). This satisfies both observability (T4) and host safety (U3).

**TRIZ:** Physical contradiction — logger must produce output (observability) and must not produce output (host safety). Applied P35 (Parameter Changes): change the output medium from fixed stream to configurable callback.

**Propagation:**
- S2: LOOSENED — callback model means caller controls output, reducing accidental data exposure
- U2: TIGHTENED — new optional `onLog` field in LoopConfig (backward compatible, defaults to undefined)

### TN3: Parallel Evaluation Speed vs Score Determinism

Parallel evaluation (T6) executes evaluators concurrently for speed, but concurrent execution could produce non-deterministic composite scores (violating T7) if floating-point accumulation order varies.

> **Resolution:** Sort evaluator results by constraint name before passing to composite scoring functions. `Promise.allSettled` returns results in submission order (stable), and the scoring functions (`weightedArithmeticMean`, `weightedHarmonicMean`, `weightedGeometricMean`) are mathematically commutative. Sorting guarantees identical input ordering regardless of execution strategy.

**TRIZ:** Technical contradiction — improving speed (parallel) degrades determinism. Applied P4 (Asymmetry): execution is asymmetric (parallel), but scoring input is symmetric (sorted).

**Propagation:**
- T6: TIGHTENED — adds a sort step after Promise.allSettled (~0.1ms overhead, negligible)

### TN4: Retry Backoff Time vs Command Timeout Budget

Retry with exponential backoff (T5) could extend total wall-clock time far beyond `commandTimeoutSeconds` (default 30s). 3 retries with full timeouts = 3x30s + backoff delays = ~97s per evaluator.

> **Resolution:** Retries share the timeout budget. Total time for all attempts (including retries and backoff delays) must fit within `commandTimeoutSeconds`. Each retry gets `remaining_budget / remaining_attempts`. Example: 30s budget → attempt 1: 15s, backoff 1s, attempt 2: 10s, backoff 2s, attempt 3: 5s. Predictable wall-clock behavior, no config change needed.

**TRIZ:** Resource tension — retry count and timeout budget compete for the same time resource. Applied P5 (Merging): merge retry budget into existing timeout budget.

**Propagation:**
- T5: TIGHTENED — individual retry attempts get shorter timeouts, so transient failures must resolve faster
- U2: TIGHTENED — existing `commandTimeoutSeconds` default (30s) now covers retries too (backward compatible)

---

## Required Truths

### RT-1: Zod Bundle Available at Plugin Runtime (BINDING CONSTRAINT)

Zod must be available as a self-contained bundle that works without `node_modules` at the plugin installation destination.

**Gap:** Zod is not bundled. Currently a devDependency only. `plugin/lib/vendor/` does not exist.

**Evidence:** `bun build node_modules/zod/index.js --outfile vendor/zod.js --target bun --format esm --minify` produces a 320KB standalone bundle that passes `.safeParse()` tests without node_modules. Verified 2026-04-05.

- **RT-1.1:** bun build can produce self-contained zod bundle — **SATISFIED** (verified: 320KB minified, works standalone)
- **RT-1.2:** install.sh copies vendor/ to destination — **NOT SATISFIED** (install script has no vendor/ handling)

### RT-2: Scoring is Commutative (Order-Independent)

Composite scoring functions must produce identical results regardless of input order.

**Gap:** None — already satisfied.

**Evidence:** All three aggregation functions (`weightedArithmeticMean`, `weightedHarmonicMean`, `weightedGeometricMean`) in `src/scoring.ts` are sum-based operations. Mathematically commutative. Verified by inspection.

### RT-3: Logger is Silent by Default

Logger module must produce zero output (no stdout, no stderr, no file writes) when no `onLog` callback is configured in LoopConfig.

**Gap:** Logger module does not exist. LoopConfig has no `onLog` field.

- **RT-3.1:** LoopConfig accepts optional `onLog` callback — **NOT SATISFIED** (field does not exist in types.ts)

### RT-4: All 159 Existing Tests Pass After Each Change

Every existing unit test must pass without modification throughout the entire uplift.

**Gap:** None — already satisfied.

**Evidence:** `bunx vitest run` — 159 tests pass across 11 test files. Verified 2026-04-05.

### RT-5: Zod Schemas Produce Fallback Values, Not Exceptions

Schema validation via `.safeParse()` must return typed result unions with error details, never throw. Malformed inputs produce fallback scores (50 for LLM, 0 for custom) with error recorded in `EvalResult.error`.

**Gap:** Schemas do not exist. Current parsing uses ad-hoc regex/try-catch in `evaluators/llm.ts:90-117` and `evaluators/custom.ts:54-82`.

- **RT-5.1:** `.safeParse()` returns typed result union — **SATISFIED** (zod API guarantee, verified with test bundle)

### RT-6: CI Pipeline Runs on Every Push/PR

GitHub Actions workflow must exist and execute typecheck, lint, and test:coverage on every push and pull_request event.

**Gap:** No `.github/workflows/` directory exists. No CI configuration at all.

- **RT-6.1:** GitHub Actions workflow file exists — **NOT SATISFIED**
- **RT-6.2:** oven-sh/setup-bun action is available — **SATISFIED** (public GitHub Action)

### RT-7: New Modules Meet Coverage Thresholds

All new code (logger, retry, schemas, parallel eval) must have test coverage meeting lines ≥80%, functions ≥80%, branches ≥75%.

**Gap:** vitest.config.ts has no coverage thresholds. Coverage is reported but not enforced.

- **RT-7.1:** vitest.config.ts has coverage thresholds configured — **NOT SATISFIED**

### RT-8: ADR Directory and Templates Exist

`docs/adr/` directory must exist with 4 ADRs following standard template (Title, Status, Context, Decision, Consequences).

**Gap:** No `docs/adr/` directory. No ADRs exist.

---

## Solution Space

### Option A: Incremental In-Tree Implementation (Recommended)

Implement all 7 priorities incrementally within the existing repository structure. Each priority is a separate commit with its own tests. Zod bundled via `bun build` into `plugin/lib/vendor/zod.js`.

- **Satisfies:** RT-1, RT-3, RT-5, RT-6, RT-7, RT-8
- **Already Satisfied:** RT-2, RT-4
- **Gaps:** None with implementation
- **Complexity:** Medium (7 sequential changes, each testable independently)
- **Reversibility:** TWO_WAY — each change is an additive commit that can be reverted independently

**Implementation order (respects blocking deps):**
1. CI/CD pipeline (RT-6) — no deps, enables all subsequent enforcement
2. Coverage thresholds (RT-7) — depends on CI
3. Zod bundle + schemas (RT-1, RT-5) — binding constraint, unblocks S1
4. Structured logger (RT-3) — independent
5. Retry with backoff (independent)
6. Integration tests (independent, uses all new modules)
7. ADRs (RT-8) — independent, can be done anytime
8. Parallel evaluation — independent, highest complexity
9. Install script update (RT-1.2) — after zod bundle exists

### Option B: Feature Branch with Single Merge

All 7 priorities implemented on a feature branch, merged as a single PR.

- **Satisfies:** All RTs
- **Gaps:** None with implementation
- **Complexity:** Medium-High (harder to review, larger blast radius)
- **Reversibility:** REVERSIBLE_WITH_COST — single revert undoes everything, but also loses all improvements

**Tension validation:** All 4 tensions confirmed by Option A. Option B also honors all resolutions.
