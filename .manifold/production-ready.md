# production-ready

## Outcome

Make autoresearch production-ready: upfront permission acquisition to eliminate user prompt dependency during loops, scientifically grounded evaluation axes with comprehensive preset profiles, insightful reports with session token consumption analytics, and iteration optimization for maximum improvement impact per token spent.

---

## Constraints

### Business

#### B1: Zero-Interrupt Autonomous Execution

Once the pre-flight phase completes, the loop must run to completion without requiring user interaction for permissions.

> **Rationale:** Permission prompts mid-loop break flow, waste tokens on context rebuild, and defeat the purpose of autonomous improvement. The user should be able to start a run and walk away.

#### B2: Scientifically Grounded Evaluation Methodology

All evaluation axes, scoring normalization, and composite aggregation must be based on established measurement theory — not ad-hoc heuristics.

> **Rationale:** Ad-hoc scoring leads to gaming (improving one metric at the cost of real quality), non-comparable runs, and false confidence. Grounding in psychometrics/software metrics literature ensures validity.

#### B3: Maximum Improvement ROI Per Token

Each iteration should deliver the highest possible quality improvement per token consumed.

> **Rationale:** Token budgets are finite and expensive. Spending 50k tokens on an iteration that yields +0.1 composite improvement is wasteful when another strategy could yield +2.0 for the same cost.

#### B4: Actionable Report Insights

Reports must inform decisions — not just display raw metrics. Includes efficiency analysis, bottleneck identification, ceiling prediction, and next-step recommendations.

> **Rationale:** A report that says "composite went from 82 to 96" is data. A report that says "lint improvements exhausted at iteration 3, LLM-evaluated maintainability has 12 points of headroom, recommend targeting extract-method refactoring" is insight.

### Technical

#### T1: Upfront Permission Manifest

Generate and execute a permission manifest at session start covering all Bash commands, file operations, and git operations the loop will use.

> **Rationale:** Claude Code requires user approval for Bash, Write, and Edit operations. Each prompt costs context tokens and blocks the loop. By enumerating all needed permissions at pre-flight and obtaining them in batch, the loop can execute uninterrupted.

**Implemented by:** New `buildPermissionManifest()` function in discovery phase

#### T2: Orthogonal Evaluation Axes

Each evaluation axis must measure an independent quality dimension. High inter-axis correlation indicates redundancy and must be flagged.

> **Rationale:** If "lint score" and "type-check score" are highly correlated (both penalize the same issues), weighting them separately double-counts that dimension. Orthogonality ensures the composite score reflects genuine multi-dimensional quality.

#### T3: Statistical Composite Scoring

Composite score must support configurable aggregation (arithmetic, harmonic, geometric mean) with effect-size reporting, not just naive weighted average.

> **Rationale:** Arithmetic mean allows a high score on one axis to compensate for a low score on another. Harmonic mean penalizes imbalance. Geometric mean is scale-independent. The choice of aggregation function should match the quality model (compensatory vs non-compensatory).

#### T4: Granular Token Accounting

Track tokens per phase (discovery, baseline, evaluation, improvement, reporting) and per-constraint per-iteration.

> **Rationale:** Without granular tracking, you can't identify where tokens are wasted. Current system tracks `totalTokensUsed` per iteration but doesn't break down eval vs improvement vs overhead.

#### T5: Adaptive LLM Eval Scheduling

Replace fixed every-3rd-iteration with trajectory-based scheduling: run LLM eval more when scores are volatile, less when stable.

> **Rationale:** Fixed scheduling wastes tokens on LLM evals during stable plateaus and misses important inflection points. Adaptive scheduling allocates eval budget where it provides the most signal.

#### T6: Evaluation Completeness

Minimum 4 orthogonal axes required per profile: structural quality, behavioral correctness, maintainability, and domain-specific metrics.

> **Rationale:** A profile with only 2 axes (e.g., lint + tests) misses entire quality dimensions. Four axes ensures minimum coverage of the software quality space as defined by ISO 25010.

#### T7: Profile Weight Scientific Basis

Each profile's weight distribution must have documented rationale grounded in quality measurement literature.

> **Rationale:** Current profiles use arbitrary percentages (lint 25%, types 20%, tests 25%, LLM 30%). These should be justified — e.g., citing GQM (Goal-Question-Metric), ISO 25010 quality characteristics, or empirical defect-prediction research.

#### T8: Aggregation-Strategy Alignment *(pre-mortem)*

The composite aggregation function must be paired with an iteration strategy aware of its incentive structure. Harmonic mean → prioritize weakest axis; arithmetic mean → broad improvement; geometric mean → balanced scaling.

> **Rationale:** Pre-mortem revealed that switching to harmonic mean without adjusting the improvement strategy caused the loop to obsess over one weak axis, burning tokens while ignoring easy wins. The aggregation function shapes the optimization landscape — the iteration strategy must navigate it accordingly.

### User Experience

#### U1: Pre-Flight Permission Checklist

Before loop starts, display all permissions needed with clear explanations. Batch-obtain all at once.

> **Rationale:** Users need transparency about what the loop will do. A clear checklist builds trust and enables informed consent. Batch acquisition eliminates the drip-feed of permission prompts.

#### U2: Token Consumption Dashboard

Report includes: total tokens, per-phase breakdown, tokens-per-improvement-point ratio, estimated cost, and budget utilization curve.

> **Rationale:** Users need to understand the economics of their runs. "This run cost ~$2.40 and improved quality by 14.4 points (6 points per dollar)" is far more useful than "200k tokens used".

#### U3: Score Confidence Reporting

Report uncertainty bounds on LLM-evaluated axes. Flag scores with high variance across rubric dimensions.

> **Rationale:** LLM scores are inherently noisy. Reporting "maintainability: 78" without confidence is misleading. "maintainability: 78 ± 8 (readability: 85, architecture: 72, idiomaticness: 80, naming: 75)" conveys the full picture.

#### U4: Iteration Trajectory Visualization

Report includes trend analysis: diminishing returns curve, predicted quality ceiling, optimal stop point.

> **Rationale:** Users want to know "should I have stopped earlier?" and "is there more headroom?". A fitted curve with predicted ceiling answers both.

### Security

#### S1: Permission Scope Minimization

Only request the minimum permissions needed for the specific profile, scope, and detected evaluation commands.

> **Rationale:** Requesting blanket Bash permissions when only `bun test` and `bun run lint` are needed violates least-privilege. Over-permissioning erodes user trust.

#### S2: No Mid-Loop Permission Escalation

The loop must never trigger a new permission prompt after the pre-flight phase completes.

> **Rationale:** Mid-loop prompts indicate the permission manifest was incomplete — a bug. They also break autonomy (B1) and waste tokens on context management.

### Operational

#### O1: Graceful Permission Denial Handling

If any permission is denied at pre-flight, adapt strategy (skip that evaluator, rebalance weights) rather than abort.

> **Rationale:** Users may deny specific permissions (e.g., no Bash for security). The system should degrade gracefully — run with fewer axes — rather than refuse to start.

#### O2: Token Budget Phase Allocation

Reserve minimum 10% of token budget for final report generation. Allocate remaining across iterations with diminishing per-iteration allocation.

> **Rationale:** Running out of tokens before generating the report wastes the entire run. Diminishing allocation per iteration reflects the natural diminishing returns of later iterations.

#### O3: Iteration Efficiency Optimization

Implement priority-based constraint ordering: evaluate cheapest/most-informative constraints first. Skip expensive evals when trajectory is clear.

> **Rationale:** Running a 30-second LLM eval when the last 3 iterations showed no change in any metric is wasteful. Cheap static metrics can serve as early-exit signals.

#### O4: Permission Verification After Grant *(pre-mortem)*

After obtaining permissions at pre-flight, verify each permission with a dry-run probe before entering the loop. Detect permission model changes rather than assuming grant semantics are stable.

> **Rationale:** Pre-mortem revealed that Claude Code permission model updates could silently change grant semantics (e.g., per-directory vs blanket). A dry-run probe catches this before tokens are invested in the loop.

---

## Tensions

### TN1: Permission Completeness vs Scope Minimization

T1 (upfront permission manifest) and S1 (permission scope minimization) are both invariants. T1 needs ALL permissions upfront for zero-interrupt. S1 demands MINIMUM permissions for least-privilege.

> **Resolution:** Compute the precise permission set from profile + scope + detected commands at discovery time. "All needed" = "minimum needed" — no blanket permissions. Every requested permission maps to a specific eval command or file operation.

### TN2: Scientific Rigor vs Token Efficiency

B2 (scientific methodology) requires statistical scoring, weight rationale, and confidence intervals — all of which cost tokens. B3 (maximum ROI) and O2 (budget allocation) want to maximize tokens available for actual improvement.

> **Resolution:** Bake weight rationale and axis orthogonality analysis into profile definition files (zero runtime cost). Only confidence intervals for LLM-evaluated axes are computed at runtime. Evaluation overhead stays below 5% of total token budget.

### TN3: Adaptive Eval Skipping vs Confidence Data Quality

T5 (adaptive LLM eval scheduling) and O3 (iteration efficiency) want to skip expensive LLM evals when trajectory is stable. But U3 (confidence reporting) needs enough data points, and T6 (4-axis minimum) requires continuous axis coverage.

> **Resolution:** When the adaptive scheduler decides to skip a full LLM eval, run a single-dimension probe (1/4 cost) instead of skipping entirely. Maintains 4-axis count, provides confidence data continuity, saves ~75% of eval cost on skipped iterations.

### TN4: Graceful Degradation vs Evaluation Completeness

O1 (graceful permission denial) says skip denied evaluators and rebalance. T6 (4-axis minimum) says maintain at least 4 orthogonal axes. If a denied permission kills an axis, these conflict.

> **Resolution:** For each evaluation axis, define a fallback evaluator that doesn't require the denied permission (e.g., if `bun test` denied, substitute with LLM-based test quality assessment). Fallback evaluators are validated for orthogonality against remaining axes.

### TN5: Aggregation Choice vs Iteration Strategy

T3 (configurable aggregation) offers multiple statistical methods. T8 (aggregation-strategy alignment) warns that the choice shapes the optimization landscape. B3 (max ROI) wants easy wins harvested first.

> **Resolution:** Use arithmetic mean for the first 40% of iterations (harvest easy wins broadly). Switch to harmonic mean when all axes exceed score 80 or at the 40% iteration mark (enforce balance/polish). Phase transition is logged and visualized in the trajectory chart.

---

## Required Truths

### RT-1: Permission Manifest System

A function can compute the exact set of Bash, Write, Edit, and git permissions needed for a run given profile + scope + commands, then verify them via dry-run probes.

**Gap:** Zero implementation. No permission-related code exists in the codebase. **Binding constraint** — blocks B1 invariant.

**Artifact:** `src/permissions.ts` — `buildPermissionManifest()`, `verifyPermissions()`, `handleDenial()`

### RT-2: Composite Scoring Engine

`computeComposite` supports configurable aggregation (arithmetic, harmonic, geometric) with phase-adaptive switching at 40% iteration mark.

**Gap:** `loop.ts:117` uses unweighted arithmetic average — ignores `weight` field entirely. No harmonic/geometric mean.

**Artifact:** `src/scoring.ts` — `weightedArithmeticMean()`, `weightedHarmonicMean()`, `weightedGeometricMean()`, `phaseAdaptiveComposite()`

### RT-3: Granular Token Accounting

Token usage tracked per phase (discovery/baseline/eval/improve/report) and per-constraint per-iteration.

**Gap:** `IterationScores.tokensUsed` is a single number. No phase or constraint breakdown.

**Artifact:** `src/analytics.ts` — `TokenBreakdown` type, `trackPhaseTokens()`, `computeEfficiencyRatio()`

### RT-4: Profile Scientific Grounding

Each profile includes weight rationale (GQM/ISO 25010 basis), orthogonality analysis, and quality characteristic mapping.

**Gap:** `quality.json` has `"weight": 0.25` with no rationale, no ISO mapping, no orthogonality data.

**Artifact:** Extended `profiles/*.json` — `rationale`, `iso25010Characteristic`, `orthogonalityMatrix` fields

### RT-5: Adaptive LLM Eval Scheduler

`shouldRunLlmEval` uses trajectory volatility (rolling std dev of recent deltas) and supports lite probe fallback (1 dimension, 1/4 cost).

**Gap:** `llm.ts:120` is `currentIteration % llmEvalInterval === 0`. No volatility metric, no lite probe.

**Artifact:** `src/scheduling.ts` — `computeVolatility()`, `shouldRunFullEval()`, `shouldRunLiteProbe()`. Modified `llm.ts` — `buildLiteProbePrompt()`

### RT-6: Report Analytics Engine

Report renderer produces token consumption dashboard, LLM score confidence intervals, and trajectory analysis with ceiling prediction.

**Gap:** `report.ts` renders tables only — no analytics, no curve fitting, no cost estimation.

**Artifact:** `src/analytics.ts` — `renderTokenDashboard()`, `computeConfidenceInterval()`, `fitDiminishingReturnsCurve()`, `predictCeiling()`

### RT-7: Fallback Evaluator System

Each axis type has a defined fallback evaluator that works without Bash permission, with auto-rebalancing.

**Gap:** No fallback concept exists. Permission denial has no recourse.

**Artifact:** `src/evaluators/fallbacks.ts` — `FALLBACK_REGISTRY`, `activateFallback()`, `rebalanceWeights()`

---

## Solution Space

### Option A: Layered Extension (Selected)

New modules alongside existing code. Existing 81 tests untouched.

**Reversibility:** `TWO_WAY` — delete new files to revert.

```
New files:
  src/permissions.ts    → RT-1
  src/scoring.ts        → RT-2
  src/analytics.ts      → RT-3, RT-6
  src/scheduling.ts     → RT-5
  src/evaluators/fallbacks.ts → RT-7

Modified files:
  src/types.ts          → extend with TokenBreakdown, ScoringConfig, etc.
  src/loop.ts           → replace computeComposite import
  src/evaluators/llm.ts → add lite probe mode
  profiles/*.json       → extend with rationale + orthogonality (RT-4)

New tests:
  tests/permissions.test.ts
  tests/scoring.test.ts
  tests/analytics.test.ts
  tests/scheduling.test.ts
  tests/fallbacks.test.ts
```

**Satisfies:** RT-1 through RT-7 (all)
**Complexity:** Medium (5 new files, 3 modified, 5 new test files)
