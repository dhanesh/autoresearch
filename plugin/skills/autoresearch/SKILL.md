---
name: autoresearch
description: Autonomous codebase improvement loop inspired by Karpathy's autoresearch. USE WHEN user wants to iteratively improve a codebase, run autonomous code improvement, or apply the autoresearch pattern. Individual commands use /autoresearch directly.
---

# Autoresearch

Autonomous codebase improvement loop that converges on measurable improvements through iterative improve-evaluate-iterate cycles.

## Quick Start

```
/autoresearch                              # Interactive discovery mode
/autoresearch src/ --profile quality       # Quality-focused on src/
/autoresearch --profile coverage           # Maximize test coverage
/autoresearch --profile performance        # Optimize performance
/autoresearch --resume                     # Resume a previous run
/autoresearch --dry-run                    # Preview what would be evaluated
```

## How It Works

Autoresearch runs a tight loop inspired by Karpathy's autoresearch pattern:

```
┌─ DISCOVER ──────────────────────────────┐
│ Analyze codebase → propose constraints  │
│ → interview user via AskUserQuestion    │
│ → lock evaluation commands              │
└─────────────────────────────────────────┘
         ↓
┌─ BASELINE ──────────────────────────────┐
│ Create git branch → run all evaluators  │
│ → capture baseline scores              │
└─────────────────────────────────────────┘
         ↓
┌─ LOOP (until convergence) ──────────────┐
│ Improve → Evaluate → Decide → Track    │
│                                         │
│ Keep if score improves (git commit)     │
│ Revert if score regresses (git reset)   │
│ Stop on diminishing returns             │
└─────────────────────────────────────────┘
         ↓
┌─ REPORT ────────────────────────────────┐
│ Full LLM evaluation → learning report   │
│ → improvement table → convergence data  │
└─────────────────────────────────────────┘
```

## Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `[scope]` | File or directory path(s) to improve | auto-discover |
| `--profile <name>` | Preset: `quality`, `performance`, `coverage` | interactive |
| `--max-iterations <n>` | Override max iterations | 20 |
| `--time-box <seconds>` | Override per-iteration time box | 120 |
| `--resume` | Resume from `.autoresearch/state.json` | — |
| `--dry-run` | Discovery only, no loop | — |

## Preset Profiles

| Profile | Focus | Evaluators | Time Box |
|---------|-------|------------|----------|
| `quality` | Code quality, type safety, naming | lint 25%, types 20%, tests 25%, LLM 30% | 120s |
| `performance` | Bundle size, algorithms, hot paths | lint 15%, tests 20%, benchmark 35%, LLM 30% | 180s |
| `coverage` | Test coverage, edge cases | coverage 35%, tests 25%, lint 10%, LLM 30% | 150s |

## Evaluation Axes

1. **Static Analysis** — Lint warnings, type errors, complexity scores
2. **Test Suite** — Pass rate, coverage percentage
3. **LLM Rubric** — Readability, architecture, maintainability, idiomaticness (full or lite probe)
4. **Custom Commands** — User-defined evaluation scripts

Each axis is grounded in ISO 25010 quality characteristics with documented weight rationale and pre-computed orthogonality analysis.

## Production-Ready Features

- **Pre-flight permissions** — All Bash, Write, and git permissions requested upfront. Loop runs uninterrupted.
- **Phase-adaptive scoring** — Arithmetic mean early (broad improvement), harmonic mean late (enforce balance)
- **Adaptive LLM scheduling** — Full eval when volatile, lite 1-dimension probe when stable. 60-75% token savings.
- **Fallback evaluators** — If a permission is denied, the axis auto-substitutes with an LLM-based fallback.
- **Token economics** — Per-phase breakdown, cost estimation, tokens-per-improvement-point efficiency ratio
- **Confidence intervals** — LLM scores reported with 95% CI from rubric dimension variance
- **Trajectory prediction** — Diminishing returns curve fit, predicted quality ceiling, optimal stop point

## Safety Guarantees

- Git branch isolation (never touches main)
- Command sandboxing (SHA-256 hash verification)
- Scope enforcement (writes only within scope)
- Circuit breaker (stops on >10% regression)
- Non-destructive git (never force-push or delete)
- Permission scope minimization (least-privilege manifest)
- No mid-loop permission escalation

## Output

- `.autoresearch/state.json` — Loop state for resume (includes token breakdown, volatility, eval decisions)
- `.autoresearch/report.md` — Full report with token dashboard, confidence intervals, trajectory analysis, learning summary
- Git branch `autoresearch/<timestamp>-<scope>` with per-iteration commits

## Reference Implementation

The TypeScript modules in `src/` provide structured reference implementations:

| Module | Purpose |
|--------|---------|
| `src/types.ts` | Type definitions and defaults |
| `src/loop.ts` | Core loop state machine |
| `src/discovery.ts` | Codebase introspection + constraint pipeline |
| `src/report.ts` | Summary report generation |
| `src/permissions.ts` | Permission manifest + pre-flight verification |
| `src/scoring.ts` | Phase-adaptive composite scoring (arithmetic/harmonic/geometric) |
| `src/analytics.ts` | Token dashboard, confidence intervals, trajectory prediction |
| `src/scheduling.ts` | Adaptive LLM eval scheduling + volatility detection |
| `src/evaluators/` | Static, test, LLM, custom, and fallback evaluators |
