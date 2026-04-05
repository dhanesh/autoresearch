# ADR-003: Volatility-Based Adaptive Evaluation Scheduling

## Status
Accepted

## Date
2026-04-05

## Context
Running all evaluators on every iteration is expensive, especially LLM-based evaluators that consume significant token budgets. For a 20-iteration loop with 5 evaluators, the cost is linear and often wasteful -- if an evaluator's score has stabilized, re-running it at full fidelity provides diminishing returns.

The `scheduling.ts` module implements adaptive scheduling that decides per-iteration whether each evaluator should run at `"full"`, `"lite"`, or `"skip"` fidelity. The core question was: what signal should drive the scheduling decision?

## Decision
Use volatility-based scheduling. The `computeVolatility` function calculates the standard deviation of recent score deltas over a rolling window (default 5 iterations). The `getEvalDecision` function maps volatility to a schedule:

- **High volatility** (>= `highVolatilityThreshold`, default 2.0): Scores are changing rapidly. Run full evaluation to capture dynamics accurately.
- **Low volatility** (<= `lowVolatilityThreshold`, default 0.5): Scores have stabilized. A lite probe is sufficient.
- **Medium volatility**: Default to lite between forced full evaluations.
- **Forced full eval**: Always run full on the first 3 iterations (to establish baseline volatility), on every Nth iteration (`minimumFullEvalInterval`, default 5), and on the final iteration (for a complete report).

When insufficient data exists (< 2 iterations), volatility returns `Infinity` to ensure full evaluation during the warm-up phase.

Token savings are estimated via `estimateTokenSavings()`, which projects how many iterations would receive lite or skip decisions based on the scheduling configuration.

## Consequences

### Positive
- **Reduces token usage by 30-50%**: Stable evaluations that would produce near-identical results are downgraded to lite probes, saving significant token budget for the improvement LLM calls that matter.
- **Maintains accuracy on volatile axes**: Evaluators whose scores are actively changing continue to receive full evaluation, ensuring the loop has accurate signals for its improvement strategy.
- **Self-adapting**: No manual tuning required per-project. The volatility window automatically detects when scores settle and when they become active again.
- **Configurable thresholds**: Teams can adjust `highVolatilityThreshold`, `lowVolatilityThreshold`, `volatilityWindow`, and `minimumFullEvalInterval` to match their evaluator characteristics.

### Negative
- **May miss sudden changes**: If a score has been stable for many iterations and then suddenly changes, the lite probe on that iteration might not capture the full picture. The `minimumFullEvalInterval` mitigates this by guaranteeing periodic full evaluation.
- **Window sensitivity**: A window that is too short produces noisy volatility estimates; too long and it is slow to react to regime changes. The default of 5 is a compromise.

### Neutral
- The first 3 iterations always run full evaluation regardless of any volatility signal, ensuring sufficient data before the scheduler activates.
- The `EvalScheduleDecision` type (`"full"` | `"lite"` | `"skip"`) is part of the public type system in `types.ts`, making the scheduling decision transparent to the orchestrator.

## Alternatives Considered

### Fixed interval sampling
Run full evaluation every Nth iteration (e.g., every 3rd) and lite on others, regardless of score dynamics. Rejected because:
- Does not adapt to the actual stability of each evaluator. A volatile evaluator might be lite-probed on a critical iteration, while a stable evaluator wastes tokens on unnecessary full runs.
- Provides no mechanism to increase or decrease frequency based on observed behavior.

### Time-based scheduling
Run full evaluation if a certain wall-clock duration has elapsed since the last full run. Rejected because:
- Iteration duration varies widely (fast static evals vs. slow LLM evals), making time a poor proxy for information freshness.
- Score stability is a more direct and meaningful signal than elapsed time.

### Per-evaluator independent scheduling
Track volatility per evaluator rather than using the composite iteration delta. Considered but deferred because:
- Per-evaluator tracking requires maintaining separate volatility windows for each constraint, adding complexity.
- The current composite-delta approach works well when constraints are correlated (common in practice). Per-evaluator scheduling may be added in a future iteration if divergent evaluator dynamics become a problem.

## Related
- Satisfies: RT-5 (Adaptive LLM Eval Scheduler), T5 (Adaptive Scheduling), U3 (Confidence Data), O3 (Iteration Efficiency)
- Resolution: TN3-A (Lite Eval Fallback)
- Files: `src/scheduling.ts` (`computeVolatility`, `getEvalDecision`, `estimateTokenSavings`), `src/types.ts` (`EvalScheduleDecision`)
