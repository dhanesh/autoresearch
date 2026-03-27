// Satisfies: RT-7 (Fallback Evaluator System)
// Satisfies: O1 (Graceful Denial), T6 (Evaluation Completeness)
// Resolution: TN4-A (Auto-Substitution)

import type { EvalConstraint, FallbackEvaluator, UnhashedConstraint } from "../types";

/**
 * Fallback evaluator registry.
 * Maps primary mechanism types to Bash-free fallback evaluators.
 * Satisfies: TN4 — each axis has a fallback requiring no Bash permission.
 */
export const FALLBACK_REGISTRY: Record<string, UnhashedConstraint> = {
  "static-eslint": {
    id: "fallback-lint",
    name: "LLM lint assessment",
    mechanism: "llm",
    command: "llm-eval",
    normalizer: "llm",
    weight: 0,
    isLlmEval: true,
  },
  "static-tsc": {
    id: "fallback-types",
    name: "LLM type safety assessment",
    mechanism: "llm",
    command: "llm-eval",
    normalizer: "llm",
    weight: 0,
    isLlmEval: true,
  },
  "tests-pass_rate": {
    id: "fallback-tests",
    name: "LLM test quality assessment",
    mechanism: "llm",
    command: "llm-eval",
    normalizer: "llm",
    weight: 0,
    isLlmEval: true,
  },
  "tests-coverage": {
    id: "fallback-coverage",
    name: "LLM coverage assessment",
    mechanism: "llm",
    command: "llm-eval",
    normalizer: "llm",
    weight: 0,
    isLlmEval: true,
  },
  "custom-custom": {
    id: "fallback-custom",
    name: "LLM custom metric assessment",
    mechanism: "llm",
    command: "llm-eval",
    normalizer: "llm",
    weight: 0,
    isLlmEval: true,
  },
};

/** Build the registry key for a constraint */
function registryKey(constraint: EvalConstraint): string {
  return `${constraint.mechanism}-${constraint.normalizer}`;
}

/** Look up a fallback for a given constraint. Satisfies: TN4 */
export function findFallback(
  constraint: EvalConstraint
): FallbackEvaluator | null {
  const key = registryKey(constraint);
  const fallbackTemplate = FALLBACK_REGISTRY[key];

  if (!fallbackTemplate) {
    // Try mechanism-only lookup
    const mechanismFallback = FALLBACK_REGISTRY[constraint.mechanism];
    if (!mechanismFallback) return null;
    return {
      primaryId: constraint.id,
      fallback: {
        ...mechanismFallback,
        id: `fallback-${constraint.id}`,
        weight: constraint.weight,
      },
      expectedCorrelation: 0.6,
    };
  }

  return {
    primaryId: constraint.id,
    fallback: {
      ...fallbackTemplate,
      id: `fallback-${constraint.id}`,
      weight: constraint.weight,
    },
    expectedCorrelation: 0.5,
  };
}

/** Build fallback evaluators for all constraints. Satisfies: RT-7 */
export function buildFallbackRegistry(
  constraints: EvalConstraint[]
): FallbackEvaluator[] {
  const fallbacks: FallbackEvaluator[] = [];
  for (const c of constraints) {
    // LLM-evaluated constraints don't need a fallback (they don't require Bash)
    if (c.isLlmEval) continue;
    const fb = findFallback(c);
    if (fb) fallbacks.push(fb);
  }
  return fallbacks;
}

/** Activate a fallback: swap the constraint in the list. Satisfies: O1 */
export function activateFallback(
  constraints: EvalConstraint[],
  fallback: FallbackEvaluator
): EvalConstraint[] {
  return constraints.map((c) => {
    if (c.id === fallback.primaryId) {
      return {
        ...fallback.fallback,
        commandHash: "", // Fallback doesn't need hash (LLM-based)
      } as EvalConstraint;
    }
    return c;
  });
}

/** Rebalance weights after dropping a constraint. Satisfies: O1 */
export function rebalanceWeights(
  constraints: EvalConstraint[],
  droppedId: string
): EvalConstraint[] {
  const remaining = constraints.filter((c) => c.id !== droppedId);
  const totalWeight = remaining.reduce((sum, c) => sum + c.weight, 0);

  if (totalWeight <= 0 || remaining.length === 0) return remaining;

  return remaining.map((c) => ({
    ...c,
    weight: c.weight / totalWeight,
  }));
}
