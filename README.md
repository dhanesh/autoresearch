# Autoresearch

Autonomous codebase improvement loop for Claude Code, inspired by [Karpathy's autoresearch](https://github.com/karpathy/autoresearch).

Runs a tight improve-evaluate-iterate loop that converges on measurable codebase improvements across code quality, test coverage, performance, and architecture.

## Install

### As a Claude Code plugin

```bash
# Add to your project's .claude/settings.json
{
  "plugins": ["github:dhanesh/autoresearch#plugin"]
}
```

### Local development

```bash
claude --plugin-dir /path/to/autoresearch/plugin
```

### Via install script

```bash
# From clone
bash install/install.sh

# From remote
curl -fsSL https://raw.githubusercontent.com/dhanesh/autoresearch/main/install/install.sh | bash
```

## Usage

```
/autoresearch                              # Interactive — discover constraints from your codebase
/autoresearch src/ --profile quality       # Quality-focused improvement on src/
/autoresearch --profile coverage           # Maximize test coverage
/autoresearch --profile performance        # Optimize performance
/autoresearch --max-iterations 10          # Limit iterations
/autoresearch --resume                     # Resume a previous run
/autoresearch --dry-run                    # Preview what would be evaluated
```

## How It Works

```
DISCOVER → BASELINE → LOOP → REPORT
```

1. **Discover** — Analyzes your codebase tooling (linters, test runners, type checkers), proposes evaluation constraints, and interviews you via AskUserQuestion to accept/modify/add constraints
2. **Baseline** — Creates a git branch, runs all evaluators, captures baseline scores (0-100 per axis)
3. **Loop** — Each iteration: improve code → evaluate across all axes → keep if composite improves, revert if it regresses → auto-stop on diminishing returns
4. **Report** — Full LLM evaluation explaining WHY each change was made, improvement tables, convergence analysis

## Evaluation Axes

| Axis | What it measures | Examples |
|------|-----------------|----------|
| Static Analysis | Lint warnings, type errors, complexity | ESLint, TSC, Biome, Ruff |
| Test Suite | Pass rate, coverage percentage | Jest, Vitest, pytest |
| LLM Rubric | Readability, architecture, maintainability | 4-dimension weighted rubric |
| Custom | User-defined metrics | Bundle size, benchmarks, custom scripts |

All scores normalized to 0-100 and combined via weighted composite.

## Preset Profiles

| Profile | Best for | Weights |
|---------|----------|---------|
| `quality` | Reducing complexity, improving naming, strengthening types | lint 25%, types 20%, tests 25%, LLM 30% |
| `performance` | Bundle size, algorithmic complexity, hot paths | lint 15%, tests 20%, benchmark 35%, LLM 30% |
| `coverage` | Adding tests, covering edge cases, assertion quality | coverage 35%, tests 25%, lint 10%, LLM 30% |

## Safety

- **Git branch isolation** — never touches main/master
- **Command sandboxing** — SHA-256 hash verification on all registered commands
- **Scope enforcement** — reads anything, writes only within declared scope
- **Circuit breaker** — auto-stops on >10% regression in any metric
- **Non-destructive git** — never force-push, delete branches, or rewrite history
- **Iteration cap + wall-clock timeout** — hard limits prevent runaway loops

## Project Structure

```
autoresearch/
├── plugin/                    # Claude Code plugin (distributable)
│   ├── plugin.json            # Plugin metadata
│   ├── commands/              # /autoresearch command
│   ├── skills/autoresearch/   # Overview skill
│   ├── hooks/                 # SessionStart + PreCompact hooks
│   ├── lib/                   # TypeScript reference implementations
│   ├── profiles/              # Preset evaluation profiles
│   └── README.md              # Plugin documentation
├── install/                   # Installation scripts
│   ├── install.sh             # Multi-agent installer
│   └── uninstall.sh           # Cleanup
├── src/                       # Source (canonical)
│   ├── types.ts               # Core types and defaults
│   ├── loop.ts                # Loop state machine
│   ├── discovery.ts           # Codebase introspection
│   ├── report.ts              # Report generation
│   └── evaluators/            # Multi-axis evaluation engine
├── profiles/                  # Preset profiles (canonical)
├── SKILL.md                   # Main skill definition
├── package.json               # Project metadata
└── .manifold/                 # Constraint manifold (design docs)
```

## License

MIT
