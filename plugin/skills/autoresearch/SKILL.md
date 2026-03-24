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
3. **LLM Rubric** — Readability, architecture, maintainability, idiomaticness
4. **Custom Commands** — User-defined evaluation scripts

## Safety Guarantees

- Git branch isolation (never touches main)
- Command sandboxing (SHA-256 hash verification)
- Scope enforcement (writes only within scope)
- Circuit breaker (stops on >10% regression)
- Non-destructive git (never force-push or delete)

## Output

- `.autoresearch/state.json` — Loop state for resume
- `.autoresearch/report.md` — Full improvement report with learning summary
- Git branch `autoresearch/<timestamp>-<scope>` with per-iteration commits

## Reference Implementation

The TypeScript modules in `lib/` provide structured reference implementations:

| Module | Purpose |
|--------|---------|
| `lib/types.ts` | Type definitions and defaults |
| `lib/loop.ts` | Core loop state machine |
| `lib/discovery.ts` | Codebase introspection + constraint pipeline |
| `lib/report.ts` | Summary report generation |
| `lib/evaluators/` | Static, test, LLM, and custom evaluators |
