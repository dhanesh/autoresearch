# Engineering Commandments Assessment Report

**Repository:** autoresearch
**Date:** 2026-04-05
**Overall Maturity:** Level 3.0 / 5

## Tech Stack

| Category | Technologies |
|----------|-------------|
| Languages | TypeScript 6.0 (ES2022 target, strict mode) |
| Runtime | Bun (bun-types) |
| Frameworks | None (zero runtime dependencies) |
| Testing | Vitest 4.1 with v8 coverage provider |
| Linting/Formatting | Biome 2.4 (linter + formatter) |
| Type Checking | TypeScript compiler (noEmit) |
| CI/CD | None detected |
| Infrastructure | Shell scripts (install/uninstall) |

## Maturity Summary

| # | Commandment | Level | Score |
|---|------------|-------|-------|
| 1 | Design for Failure | Level 3 | 3/5 |
| 2 | Keep It Simple | Level 3 | 3/5 |
| 3 | Test Early and Often | Level 3 | 3/5 |
| 4 | Build for Observability | Level 3 | 3/5 |
| 5 | Document Thy Intent | Level 4 | 4/5 |
| 6 | Automate Everything Repeatable | Level 2 | 2/5 |
| 7 | Secure by Design | Level 3 | 3/5 |
| 8 | Respect Data Consistency | Level 3 | 3/5 |
| 9 | Separate Concerns | Level 4 | 4/5 |
| 10 | Plan for Scale | Level 3 | 3/5 |
| | **Overall** | | **3.0/5** |

## Detailed Assessments

### 1. Design for Failure - Level 3/5

**Evidence Found:**
- `src/evaluators/custom.ts:58-65,154-174` - Try-catch blocks with `formatError()` utility for contextual error capture
- `src/evaluators/static.ts:9-22,36-46,71-91` - Three try-catch blocks for ESLint/TSC/complexity parsing; returns 0 on failure
- `src/evaluators/llm.ts:91-116,185-194` - Try-catch on JSON parsing with conservative fallback (score 50) on failure
- `src/evaluators/custom.ts:38-45` - `wrapWithTimeout()` function wraps all custom commands with timeout enforcement (RT-5)
- `src/types.ts:88,102` - `totalTimeoutSeconds` and `commandTimeoutSeconds` fields in LoopConfig
- `src/loop.ts:132-147` - `checkCircuitBreaker()` detects constraint regression beyond threshold, triggers auto-stop
- `src/evaluators/fallbacks.ts:60-96` - Complete fallback registry maps bash-dependent evaluators to LLM-based alternatives
- `src/permissions.ts:135-168` - `handleDenials()` activates fallbacks on permission denial; graceful degradation

**Evidence Missing (for Level 4):**
- No retry logic with exponential backoff (timeouts fail immediately)
- No observable error logging/telemetry during execution
- No recovery mechanism for circuit breaker (auto-stop is permanent)
- No metrics tracking failure rates and recovery effectiveness
- No SLO definitions for error rates or recovery times

**Assessment Rationale:**
Consistent defensive strategy across critical paths: timeouts on external commands, circuit breaker for regressions, fallback evaluators for permission denials, and structured error capture in EvalResult. This represents a well-defined error handling strategy (Level 3). However, no retry/backoff for transient failures, no observable error telemetry, and no metrics-driven improvement cycle prevent Level 4.

---

### 2. Keep It Simple - Level 3/5

**Evidence Found:**
- Average source file: 212 LOC (1,694 total / 8 main files); largest: `analytics.ts` (341 LOC)
- Maximum nesting depth: 4 levels (in `loop.ts`, `analytics.ts`) - remains readable
- 0 runtime dependencies; 5 devDependencies only (`biome`, `vitest`, `coverage-v8`, `bun-types`, `typescript`)
- Single responsibility per file: `loop.ts` = state machine, `scoring.ts` = aggregation, `analytics.ts` = reporting math
- No deep inheritance, factory patterns, or DI containers - flat interfaces throughout
- `biome.json` enforces `noExcessiveCognitiveComplexity` (warns at threshold 15)

**Evidence Missing (for Level 4):**
- `types.ts` is 286 LOC and growing (could split by domain)
- Some functions take 5+ parameters (could use config objects)
- No formal complexity budgets for components
- No tracking of complexity trends over time

**Assessment Rationale:**
Clean, modular codebase with minimal dependencies and shallow nesting. Biome enforces cognitive complexity limits. Each module has a clear single purpose. Simplicity principles are followed consistently but not formally tracked with metrics or budgets.

---

### 3. Test Early and Often - Level 3/5

**Evidence Found:**
- 11 test files covering all 8 main source modules (~150+ tests total)
- Test-to-source LOC ratio: 0.87 (1,497 test LOC / 1,694 source LOC)
- `vitest.config.ts` properly configured with v8 coverage, include/exclude patterns
- Package.json scripts: `test` (vitest run), `test:coverage` (vitest run --coverage)
- Clear test naming conventions: "should detect improvement", "should stop on plateau"
- Helper functions reduce boilerplate (e.g., `makeBaseline()` in `loop.test.ts`)

**Evidence Missing (for Level 4):**
- No coverage threshold enforcement in vitest.config.ts
- No integration tests (only unit tests; no end-to-end plugin lifecycle tests)
- No property-based testing (no fast-check or similar)
- No CI/CD pipeline running tests automatically
- No canary deployments or feature flags

**Assessment Rationale:**
Comprehensive automated test suite with good organization and consistent coverage across all modules. Vitest is properly configured. However, no coverage thresholds enforced, integration tests absent, and no automated test pipeline (CI/CD). Tests cover core logic well but lack end-to-end validation.

---

### 4. Build for Observability - Level 3/5

**Evidence Found:**
- `src/analytics.ts:16-51` - `TokenBreakdown` type tracks per-phase tokens (discovery, baseline, evaluation, improvement, reporting)
- `src/analytics.ts:32-39` - `computeEfficiencyRatio()` and `estimateCost()` expose token-to-quality ROI
- `src/analytics.ts:55-80` - `computeConfidenceInterval()` with 95% CI using t-distribution
- `src/analytics.ts:84-105` - `fitDiminishingReturnsCurve()` models asymptotic improvement trajectory
- `src/report.ts:55-106` - Renders structured metrics (improvement%, iteration history, convergence analysis)
- `src/report.ts:149-168` - `formatConvergenceMessage()` explains WHY the loop stopped
- `src/scheduling.ts:78-116` - `estimateTokenSavings()` compares fixed vs adaptive scheduling
- `src/evaluators/custom.ts:15-17` - `formatError()` converts errors to strings for structured EvalResult storage

**Evidence Missing (for Level 4):**
- Zero console logging or logger instances in source code (only `Math.log()` in scoring.ts)
- No tracing/span infrastructure (no OpenTelemetry, no correlation IDs)
- No health check endpoints or real-time metrics export
- No centralized error tracking (errors stay in EvalResult structures)
- No runtime dashboards (only post-hoc markdown reports)

**Assessment Rationale:**
Excellent post-hoc observability: comprehensive token accounting, confidence intervals, trajectory fitting, and convergence analysis. Reports are highly informative. However, all observability is post-hoc - there's no real-time logging, tracing, or metrics during execution. For a plugin, this is a reasonable trade-off, but it prevents Level 4 which requires SLOs and proactive anomaly detection.

---

### 5. Document Thy Intent - Level 4/5

**Evidence Found:**
- 152 JSDoc blocks across source files (48 in `types.ts`, 13 in `loop.ts`, 12 in `analytics.ts`, 12 in `custom.ts`)
- All 8 main source files start with multi-line comments explaining module purpose and constraints satisfied
- Inline comments explain WHY, not WHAT (e.g., `analytics.ts:47` mathematical reasoning, `loop.ts:60-92` stop condition explanations)
- Constraint-to-code traceability: every major function references design constraints (e.g., "Satisfies: RT-2, RT-6, T1")
- `README.md` (115 lines): installation, usage, how it works, safety guarantees, project structure
- `plugin/README.md`, `SKILL.md`, `plugin/commands/autoresearch.md` - plugin-specific docs
- `src/types.ts` - JSDoc on 48+ types describing purpose and constraint references
- `.manifold/` folder contains design constraint specifications

**Evidence Missing (for Level 5):**
- No ADR/ (Architectural Decision Records) explaining design choices
- No algorithm pseudocode or derivation comments for statistical functions
- No glossary for domain terms (autoresearch, constraint, evaluator, normalizer)
- No auto-generated documentation from code

**Assessment Rationale:**
Documentation is integrated throughout the codebase at multiple levels: file-level intent, function-level JSDoc, inline WHY comments, and explicit constraint traceability. README provides comprehensive user-facing documentation. This represents Level 4 quality - documentation integrated with development artifacts and regularly reviewed. Missing ADRs and algorithm derivations prevent Level 5.

---

### 6. Automate Everything Repeatable - Level 2/5

**Evidence Found:**
- `package.json:7-13` - 6 npm scripts: `typecheck`, `lint`, `test`, `test:coverage`, `install:plugin`, `uninstall:plugin`
- `install/install.sh` (183 lines) - Comprehensive installer for Claude Code and AMP installations
- `install/uninstall.sh` (40 lines) - Automated cleanup of both installations
- `biome.json` - Linter/formatter configuration for consistent code quality

**Evidence Missing (for Level 3):**
- No CI/CD pipeline (.github/workflows/, Jenkinsfile, .gitlab-ci.yml)
- No Dockerfile or containerization
- No Makefile or build orchestration
- No infrastructure-as-code (terraform, etc.)
- No pre-commit hooks configuration
- No automated release/versioning

**Assessment Rationale:**
Local development automation exists (npm scripts for lint, typecheck, test) and plugin distribution is automated (install/uninstall scripts). However, no CI/CD pipeline means tests, linting, and type-checking are not enforced on every change. This is the defining gap between Level 2 and Level 3.

---

### 7. Secure by Design - Level 3/5

**Evidence Found:**
- `src/evaluators/custom.ts:84-102` - `detectDangerousPatterns()` - regex detection of dangerous shell operations (rm -rf, chmod 777, curl|sh, eval, device overwrites)
- `src/evaluators/custom.ts:19-36` - `verifyCommandHash()` - SHA-256 hash integrity checking for eval commands (TN5)
- `src/evaluators/custom.ts:110-133` - `validateRegisteredCommands()` - pre-flight validation before loop starts
- `src/evaluators/custom.ts:38-45` - `wrapWithTimeout()` - command timeout enforcement preventing hanging processes
- `src/permissions.ts:14-82` - Upfront permission declaration with scope minimization (excludes llm-eval from bash permissions)
- `src/permissions.ts:119-133` - Dry-run permission verification probes before execution

**Evidence Missing (for Level 4):**
- No validation/sanitization of LLM response outputs before parsing
- No audit logging of command execution with timestamps
- No security scanning tools integrated
- No rate limiting or backpressure mechanisms
- No encryption for persisted state files

**Assessment Rationale:**
Strong command-level security: hash verification prevents command tampering, dangerous pattern detection blocks hazardous shell operations, timeout wrapping prevents hanging, and permission manifests enforce least-privilege access. This is a consistent, well-defined security strategy (Level 3). Missing automated security testing in CI/CD and LLM output validation prevent Level 4.

---

### 8. Respect Data Consistency - Level 3/5

**Evidence Found:**
- `tsconfig.json:6` - `"strict": true` - full strict type checking enabled
- `src/types.ts` (287 lines) - 30+ interfaces defining all data structures with constraint references
- `src/types.ts:4-5` - `NormalizedScore` type for strong typing of 0-100 scores
- `src/evaluators/custom.ts:54-82` - `normalizeCustomOutput()` - defensive runtime parsing (JSON, percentage, bare number, fallback to 0)
- `src/evaluators/llm.ts:90-117` - Regex JSON extraction with fallback to conservative score (50) on parse failure
- `src/loop.ts:198-234` - Spread operators preserve state immutability patterns
- `biome.json:13-19` - Rules enforce `useConst` (error), `noNonNullAssertion` (warn)
- 159 test cases across 11 test files covering type safety and state transitions

**Evidence Missing (for Level 4):**
- No runtime schema validation library (zod, joi, io-ts) - relies on compile-time only
- No transaction/atomic operation semantics
- No rollback mechanisms for failed state updates
- No state schema versioning for migrations
- No explicit idempotency assertions

**Assessment Rationale:**
Strong compile-time consistency through strict TypeScript. Runtime has defensive parsing with fallback strategies for external inputs (custom command output, LLM responses). Immutability patterns used for state updates. Biome rules enforce const usage. However, no structured runtime validation library and no transactional semantics prevent Level 4.

---

### 9. Separate Concerns - Level 4/5

**Evidence Found:**
- 14 focused modules with clear single-responsibility boundaries:
  - `types.ts` - data structures only (no logic)
  - `loop.ts` - state machine orchestration
  - `scoring.ts` - composite score aggregation
  - `analytics.ts` - token accounting and trajectory analysis
  - `report.ts` - markdown report rendering
  - `permissions.ts` - permission manifest and verification
  - `discovery.ts` - codebase introspection
  - `scheduling.ts` - adaptive evaluation scheduling
  - `evaluators/` - isolated evaluator implementations (custom, llm, static, tests, fallbacks)
- Cross-module dependencies flow downward (toward types.ts)
- `evaluators/index.ts` - barrel export for clean API surface
- No circular dependencies detected
- Average imports per file: 1-2 (mostly just types.ts)

**Evidence Missing (for Level 5):**
- No automated architecture compliance verification
- No metrics tracking coupling/cohesion over time
- No published module interfaces (evaluators not packaged separately)

**Assessment Rationale:**
Exemplary module organization. Each file has a single clear responsibility. Dependencies flow in one direction toward the types layer. Evaluators are properly compartmentalized in their own directory with a barrel export. Minimal coupling through types-only boundaries. This represents Level 4 - architecture enforces separation with regular structure review evident from the clean boundaries.

---

### 10. Plan for Scale - Level 3/5

**Evidence Found:**
- `src/types.ts:100-101` - `parallelEval: boolean` configuration for parallel evaluation
- `src/scheduling.ts:22-47` - `getEvalDecision()` - adaptive "full"/"lite"/"skip" scheduling based on volatility
- `src/types.ts:91` - Token budget hard cap (default 500k tokens) with tracking
- `src/types.ts:85-95` - Hard caps: maxIterations (20), totalTimeoutSeconds (3600), convergenceThreshold (0.5)
- `src/loop.ts:132-147` - Circuit breaker with configurable regression threshold (default 10%)
- `src/loop.ts:59-92` - Multi-condition stop logic prevents infinite loops
- `src/analytics.ts:84-127` - Diminishing returns curve fitting predicts optimal stop iteration
- `src/types.ts:48-80` - LoopState is immutable, serializable, resumable
- `src/scheduling.ts:78-116` - Token savings estimation across fixed vs adaptive scheduling

**Evidence Missing (for Level 4):**
- No actual concurrent/parallel execution (parallelEval flag exists but unused)
- No caching layer (in-memory or persistent)
- No async/await patterns for concurrent evaluations
- No queue/worker pool architecture
- No capacity planning documentation

**Assessment Rationale:**
Well-designed resource controls: token budgets, iteration caps, timeouts, convergence detection, and circuit breakers. Adaptive scheduling reduces token usage for stable evaluations. Immutable, serializable state supports resumability. However, actual concurrency is not implemented (only configured), and no caching or async patterns exist. Level 3 is appropriate - scalability requirements are defined and partially implemented.

---

## Actionable Improvements (Prioritized by Impact)

### Priority 1: Add CI/CD Pipeline
**Commandment:** 6 (Automate Everything Repeatable)
**Current Level:** 2 -> **Target Level:** 3
**Effort:** Low
**Impact:** Enforces quality gates (typecheck, lint, test) on every push/PR. Currently these only run manually.

**Steps:**
1. Create `.github/workflows/ci.yml` with `bun run typecheck`, `bun run lint`, `bun run test:coverage`
2. Add coverage threshold enforcement in vitest.config.ts (`lines: 80, functions: 80, branches: 75`)
3. Run on `push` and `pull_request` events

### Priority 2: Add Runtime Schema Validation
**Commandment:** 8 (Respect Data Consistency) + 7 (Secure by Design)
**Current Level:** 3 -> **Target Level:** 4
**Effort:** Medium
**Impact:** Validates LLM responses and custom command outputs at runtime, not just compile-time. Prevents malformed data from propagating through the system.

**Steps:**
1. Add `zod` as a runtime dependency for schema validation
2. Define schemas for `EvalResult`, custom command output formats, and LLM JSON responses
3. Replace ad-hoc regex parsing in `evaluators/llm.ts:90-117` with zod `.safeParse()`

### Priority 3: Add Structured Logging
**Commandment:** 4 (Build for Observability)
**Current Level:** 3 -> **Target Level:** 4
**Effort:** Medium
**Impact:** Enables real-time debugging during loop execution. Currently all observability is post-hoc (reports generated after completion).

**Steps:**
1. Create a minimal `Logger` interface with `info`/`warn`/`error` levels (keep dependency-free; use structured JSON to stderr)
2. Add logging at key decision points: iteration start/end, evaluator results, stop condition triggers, circuit breaker activations
3. Include correlation context: iteration number, constraint name, elapsed tokens

### Priority 4: Add Integration Tests
**Commandment:** 3 (Test Early and Often)
**Current Level:** 3 -> **Target Level:** 4
**Effort:** Medium
**Impact:** Unit tests cover individual functions well, but no test validates the full plugin lifecycle (discovery -> baseline -> loop -> report).

**Steps:**
1. Create `tests/integration/` directory with end-to-end loop scenarios
2. Test full `initState -> shouldStop -> processIterationResults` cycle with mock evaluator outputs
3. Add coverage for permission denial -> fallback activation -> degraded loop completion

### Priority 5: Implement Retry with Backoff
**Commandment:** 1 (Design for Failure)
**Current Level:** 3 -> **Target Level:** 4
**Effort:** Low
**Impact:** Currently timeouts fail immediately. Adding retry logic handles transient failures (network issues, API rate limits).

**Steps:**
1. Add `retryWithBackoff()` utility in `src/evaluators/custom.ts` (exponential backoff with jitter, max 3 retries)
2. Wrap `wrapWithTimeout()` calls with retry logic for custom command evaluation
3. Add retry configuration to `LoopConfig` (maxRetries, baseDelay)

### Priority 6: Create Architectural Decision Records
**Commandment:** 5 (Document Thy Intent)
**Current Level:** 4 -> **Target Level:** 5
**Effort:** Low
**Impact:** Documents WHY key design decisions were made (state machine design, fallback strategy, scoring algorithms).

**Steps:**
1. Create `docs/adr/` directory with template
2. Write ADRs for: state machine design, circuit breaker strategy, adaptive scheduling algorithm, permission manifest approach
3. Link ADRs from relevant source file comments

### Priority 7: Implement Parallel Evaluation
**Commandment:** 10 (Plan for Scale)
**Current Level:** 3 -> **Target Level:** 4
**Effort:** High
**Impact:** `parallelEval` flag exists in config but is not implemented. Enabling concurrent evaluator execution would reduce iteration time significantly for large constraint sets.

**Steps:**
1. Implement `Promise.allSettled()` based parallel evaluator execution in loop engine
2. Add concurrency limit configuration to prevent resource exhaustion
3. Handle partial failures (some evaluators succeed, some fail) in composite scoring

## Assessment History

| Date | Overall Score | Top Improvement | Notes |
|------|--------------|-----------------|-------|
| 2026-04-05 | 3.0/5 | CI/CD pipeline (Cmd 6: Level 2) | Initial assessment. Strong documentation (L4) and separation of concerns (L4). Automation is the weakest area. |
