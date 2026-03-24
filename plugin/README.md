# Autoresearch - Claude Code Plugin

Autonomous codebase improvement loop inspired by Karpathy's autoresearch. Iteratively improves code quality, test coverage, performance, and architecture using multi-metric evaluation with diminishing returns detection.

## Installation

### Local plugin (development)

```bash
claude --plugin-dir /path/to/autoresearch/plugin
```

### From repository

```bash
# Add to your project's .claude/settings.json
{
  "plugins": ["github:dhanesh/autoresearch#plugin"]
}
```

### Via install script

```bash
curl -fsSL https://raw.githubusercontent.com/dhanesh/autoresearch/main/install/install.sh | bash
```

## What's Included

### Command (1)

| Command | Purpose |
|---------|---------|
| `/autoresearch` | Run the autonomous improvement loop |

### Skill (1)

- `/autoresearch` - Overview skill with quick start and argument reference

### Hooks (2)

- **SessionStart** - Detects active autoresearch runs and suggests resume
- **PreCompact** - Preserves loop state across context compaction

### Profiles (3)

| Profile | Focus | Time Box |
|---------|-------|----------|
| `quality` | Code quality, type safety, naming | 120s |
| `performance` | Bundle size, algorithms, hot paths | 180s |
| `coverage` | Test coverage, edge cases | 150s |

## Quick Start

```
# Interactive mode — discover constraints from your codebase
/autoresearch

# Use a preset profile
/autoresearch src/ --profile quality

# Customize iteration limits
/autoresearch --max-iterations 10 --time-box 60

# Resume a previous run
/autoresearch --resume

# Preview without running
/autoresearch --dry-run
```

## How It Works

1. **Discover** — Analyzes your codebase, proposes evaluation constraints, interviews you via AskUserQuestion
2. **Baseline** — Creates a git branch, runs all evaluators, captures baseline scores
3. **Loop** — Iteratively improves code, evaluates across 4 axes, keeps improvements / reverts regressions
4. **Report** — Generates a learning report with full LLM evaluation explaining WHY each change was made

## Safety Guarantees

- Git branch isolation (never touches main)
- Command sandboxing (SHA-256 hash verification)
- Scope enforcement (writes only within declared scope)
- Circuit breaker (auto-stops on >10% regression in any metric)
- Non-destructive git (never force-push, delete branches, or rewrite history)
- Iteration cap and wall-clock timeout

## File Storage

Autoresearch state is stored in your project's `.autoresearch/` directory:

```
.autoresearch/
├── state.json    # Loop state (for resume)
└── report.md     # Final improvement report
```

## Reference Implementation

The `lib/` directory contains TypeScript modules that define the loop's behavior:

```
lib/
├── types.ts           # Core types and defaults
├── loop.ts            # Loop state machine
├── discovery.ts       # Codebase introspection
├── report.ts          # Report generation
└── evaluators/
    ├── static.ts      # Lint/type/complexity
    ├── tests.ts       # Test pass rate + coverage
    ├── llm.ts         # LLM rubric evaluation
    ├── custom.ts      # User command execution
    └── index.ts       # Barrel export
```

## Documentation

- [GitHub Repository](https://github.com/dhanesh/autoresearch)
