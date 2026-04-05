# ADR-002: Per-Constraint Circuit Breaker for Regression Detection

## Status
Accepted

## Date
2026-04-05

## Context
During the improvement loop, a single iteration could regress quality on one or more axes. For example, an LLM-driven improvement might increase readability scores while introducing architectural violations. The loop needs a safety mechanism to detect such regressions and halt before cascading damage occurs.

The `checkCircuitBreaker` function in `loop.ts` runs after each evaluation. It compares each constraint's current score against its historical best (`bestScores` in `LoopState`). The `regressionThreshold` configuration (default `0.10`, i.e., 10%) defines the maximum tolerable drop from best before the breaker trips.

The design question was: should the circuit breaker operate on individual constraint scores or only on the composite score?

## Decision
Per-constraint regression detection. The circuit breaker iterates over every constraint score and checks whether any single constraint has regressed by more than `regressionThreshold` from its best recorded value. If any constraint trips the threshold, the breaker fires immediately with action `"circuit_break"`, halting the loop. The regression details include the specific constraint ID and the percentage drop.

The breaker triggers a full stop rather than a revert-and-continue. When a single axis regresses significantly, it indicates the improvement strategy has gone off course, and continuing risks further damage.

```typescript
// From loop.ts
for (const [constraintId, score] of Object.entries(scores)) {
  const best = state.bestScores[constraintId] ?? state.baseline.scores[constraintId] ?? 0;
  if (best > 0) {
    const regressionPct = (best - score) / best;
    if (regressionPct > state.config.regressionThreshold) {
      return { constraintId, regressionPct };
    }
  }
}
```

## Consequences

### Positive
- **Catches hidden regressions**: A composite score can improve while an individual axis regresses. For example, +5 on readability and -12 on architecture nets out positive in the composite but represents real damage. Per-constraint detection catches this.
- **Prevents cascading damage**: Stopping immediately on significant regression prevents subsequent iterations from compounding a bad change.
- **Transparent diagnostics**: The stop details include the exact constraint ID and regression percentage, making it clear why the loop halted and what to investigate.

### Negative
- **More conservative than composite-only**: On volatile axes (e.g., LLM-evaluated style scores that naturally fluctuate), per-constraint checking may trigger false positives and stop the loop prematurely. The 10% default threshold mitigates this but does not eliminate it.
- **First-match halting**: The breaker returns on the first constraint that trips, not the worst. In practice this is acceptable since any breach warrants stopping, but it means the report may not show all regressed axes.

### Neutral
- The `regressionThreshold` is configurable via `LoopConfig`, so teams with volatile evaluators can raise the threshold to reduce false positives.
- The breaker uses best-ever scores rather than previous-iteration scores, which means the bar rises over time as the codebase improves.

## Alternatives Considered

### Composite-only check
Check only whether the weighted composite score dropped by more than the threshold. Rejected because:
- Composite scores can mask individual axis regressions. A +8 on one axis and -12 on another might net out to -2 composite, but if weights differ, it could net positive while real damage occurred.
- The entire purpose of multi-constraint evaluation is to ensure no axis is neglected. A composite-only breaker undermines this.

### Revert-and-continue
Instead of halting on regression, revert the bad iteration (via git) and continue the loop. Rejected because:
- If the improvement strategy produced a regression, subsequent iterations using the same strategy are likely to produce similar results.
- Continuing after a revert wastes token budget on a potentially broken improvement approach.
- The current design already supports `"revert"` as a separate action for minor regressions (composite delta < 0 but no per-constraint breach). The circuit breaker is the escalation for serious regressions.

## Related
- Satisfies: O3 (Circuit Breaker), T5 (Diminishing Returns), TN4 (Retry Before Trip)
- Files: `src/loop.ts` (`checkCircuitBreaker`, `processIterationResults`), `src/types.ts` (`LoopConfig.regressionThreshold`)
