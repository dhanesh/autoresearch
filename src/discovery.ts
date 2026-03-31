// Satisfies: RT-7 (Codebase Introspection), RT-8 (Constraint-to-Command Pipeline)
// Satisfies: T4 (Hybrid Constraint Discovery), U2 (AskUserQuestion), U4 (Presets)
// Satisfies: TN1 (Adaptive Eval Selection), TN5 (Command Registration + Hashing)
// Constraint discovery engine — analyzes codebase and builds evaluation constraints

import { hashCommand } from "./evaluators/custom";
import { rebalanceWeights } from "./shared";
import type { CodebaseProfile, EvalConstraint, EvalMechanism, UnhashedConstraint } from "./types";

/** What a file pattern indicates about the codebase */
export interface IntrospectionIndicator {
  language?: string;
  framework?: string;
  tool?: string;
  toolType?: string;
}

/** A rule mapping a file pattern to codebase characteristics */
export interface IntrospectionRule {
  pattern: string;
  indicates: IntrospectionIndicator;
}

/** File patterns that indicate language/framework. Satisfies: RT-7 */
export const INTROSPECTION_RULES: IntrospectionRule[] = [
  // JavaScript/TypeScript ecosystem
  { pattern: "package.json", indicates: { language: "typescript", tool: "npm/bun" } },
  { pattern: "tsconfig.json", indicates: { language: "typescript", toolType: "typeChecker" } },
  { pattern: "bun.lockb", indicates: { tool: "bun", toolType: "packageManager" } },
  { pattern: "package-lock.json", indicates: { tool: "npm", toolType: "packageManager" } },
  { pattern: "yarn.lock", indicates: { tool: "yarn", toolType: "packageManager" } },
  { pattern: "pnpm-lock.yaml", indicates: { tool: "pnpm", toolType: "packageManager" } },
  { pattern: ".eslintrc*", indicates: { tool: "eslint", toolType: "linter" } },
  { pattern: "eslint.config.*", indicates: { tool: "eslint", toolType: "linter" } },
  { pattern: "biome.json", indicates: { tool: "biome", toolType: "linter" } },
  { pattern: "vitest.config.*", indicates: { tool: "vitest", toolType: "testRunner" } },
  { pattern: "jest.config.*", indicates: { tool: "jest", toolType: "testRunner" } },
  { pattern: "next.config.*", indicates: { framework: "nextjs" } },
  { pattern: "nuxt.config.*", indicates: { framework: "nuxt" } },
  { pattern: "svelte.config.*", indicates: { framework: "svelte" } },
  { pattern: "angular.json", indicates: { framework: "angular" } },

  // Python ecosystem
  { pattern: "pyproject.toml", indicates: { language: "python" } },
  { pattern: "setup.py", indicates: { language: "python" } },
  { pattern: "requirements.txt", indicates: { language: "python" } },
  { pattern: ".flake8", indicates: { tool: "flake8", toolType: "linter" } },
  { pattern: "ruff.toml", indicates: { tool: "ruff", toolType: "linter" } },
  { pattern: "pytest.ini", indicates: { tool: "pytest", toolType: "testRunner" } },
  { pattern: "conftest.py", indicates: { tool: "pytest", toolType: "testRunner" } },

  // Rust ecosystem
  { pattern: "Cargo.toml", indicates: { language: "rust" } },
  { pattern: "clippy.toml", indicates: { tool: "clippy", toolType: "linter" } },

  // Go ecosystem
  { pattern: "go.mod", indicates: { language: "go" } },
  { pattern: ".golangci.yml", indicates: { tool: "golangci-lint", toolType: "linter" } },
];

/** Mapping from a detected tool to the shell command that evaluates it */
export interface ToolCommand {
  command: string;
  mechanism: Extract<EvalMechanism, "static" | "tests">;
}

/** Map detected tools to evaluation commands. Satisfies: RT-8 */
export const TOOL_TO_COMMAND: Record<string, ToolCommand> = {
  // Linters
  eslint: { command: "npx eslint . --format json 2>&1 || true", mechanism: "static" },
  biome: { command: "npx biome check . --reporter json 2>&1 || true", mechanism: "static" },
  flake8: { command: "flake8 --statistics 2>&1 || true", mechanism: "static" },
  ruff: { command: "ruff check . --statistics 2>&1 || true", mechanism: "static" },
  clippy: { command: "cargo clippy --message-format json 2>&1 || true", mechanism: "static" },
  "golangci-lint": { command: "golangci-lint run --out-format json 2>&1 || true", mechanism: "static" },

  // Type checkers
  typescript: { command: "npx tsc --noEmit 2>&1 || true", mechanism: "static" },

  // Test runners
  vitest: { command: "npx vitest run --reporter verbose 2>&1 || true", mechanism: "tests" },
  jest: { command: "npx jest --verbose 2>&1 || true", mechanism: "tests" },
  pytest: { command: "python -m pytest -v 2>&1 || true", mechanism: "tests" },
  bun_test: { command: "bun test 2>&1 || true", mechanism: "tests" },
};

/** Build default constraints from a codebase profile. Satisfies: T4, RT-8 */
export function buildDefaultConstraints(
  profile: CodebaseProfile
): UnhashedConstraint[] {
  const constraints: UnhashedConstraint[] = [];
  let nextId = 1;

  // Add linter constraint if detected
  if (profile.linter && TOOL_TO_COMMAND[profile.linter]) {
    const tool = TOOL_TO_COMMAND[profile.linter];
    constraints.push({
      id: `eval-${nextId++}`,
      name: `${profile.linter} lint score`,
      mechanism: tool.mechanism,
      command: tool.command,
      normalizer: "eslint", // Will be resolved to actual normalizer
      weight: 0.25,
      isLlmEval: false,
    });
  }

  // Add type checker constraint if detected
  if (profile.typeChecker && TOOL_TO_COMMAND[profile.typeChecker]) {
    const tool = TOOL_TO_COMMAND[profile.typeChecker];
    constraints.push({
      id: `eval-${nextId++}`,
      name: `${profile.typeChecker} type check score`,
      mechanism: tool.mechanism,
      command: tool.command,
      normalizer: "tsc",
      weight: 0.2,
      isLlmEval: false,
    });
  }

  // Add test runner constraint if detected
  if (profile.testRunner && TOOL_TO_COMMAND[profile.testRunner]) {
    const tool = TOOL_TO_COMMAND[profile.testRunner];
    constraints.push({
      id: `eval-${nextId++}`,
      name: `${profile.testRunner} test pass rate`,
      mechanism: "tests",
      command: tool.command,
      normalizer: "pass_rate",
      weight: 0.25,
      isLlmEval: false,
    });
  }

  // Always add LLM evaluation as a dimension. Satisfies: RT-3
  constraints.push({
    id: `eval-${nextId++}`,
    name: "LLM code quality rubric",
    mechanism: "llm",
    command: "llm-eval", // Special marker — handled by the skill prompt, not shell
    normalizer: "llm",
    weight: 0.3,
    isLlmEval: true,
  });

  return constraints;
}

/** Finalize constraints by computing command hashes. Satisfies: TN5 */
export function finalizeConstraints(
  constraints: UnhashedConstraint[]
): EvalConstraint[] {
  return constraints.map((c) => ({
    ...c,
    commandHash: hashCommand(c.command),
  }));
}

// rebalanceWeights is re-exported from shared.ts (DRY — Clean Code Ch.17)
export { rebalanceWeights } from "./shared";
