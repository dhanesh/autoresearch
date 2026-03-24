// Satisfies: RT-1 (Score Normalization), RT-6 (Iteration State Machine), RT-8 (Constraint-to-Command Pipeline)
// Structural foundation for all autoresearch modules

/** Normalized score on 0-100 scale. Satisfies: RT-1 */
export type NormalizedScore = number;

/** Evaluation mechanism types. Satisfies: T3 */
export type EvalMechanism = "static" | "tests" | "llm" | "custom";

/** Known normalizer identifiers for built-in score normalization strategies */
export type NormalizerId = "eslint" | "tsc" | "pass_rate" | "coverage" | "llm" | "custom";

/** A single evaluation constraint discovered from the user. Satisfies: RT-8 */
export interface EvalConstraint {
  id: string;
  name: string;
  mechanism: EvalMechanism;
  /** Shell command that produces the raw metric. Satisfies: S3, TN5 */
  command: string;
  /** SHA-256 hash of the command at registration time. Satisfies: TN5 */
  commandHash: string;
  /** Identifier for the normalization strategy to apply to raw output. Satisfies: RT-1 */
  normalizer: NormalizerId;
  /** Weight in composite score (0-1, sum to 1 across all constraints) */
  weight: number;
  /** Whether this is an LLM-evaluated constraint. Satisfies: TN2 */
  isLlmEval: boolean;
}

/** Constraint before command hash is computed. Used during discovery phase */
export type UnhashedConstraint = Omit<EvalConstraint, "commandHash">;

/** Per-iteration scores snapshot. Satisfies: RT-6 */
export interface IterationScores {
  iteration: number;
  timestamp: string;
  scores: Record<string, NormalizedScore>; // constraintId -> score
  compositeScore: NormalizedScore;
  delta: number; // Change from previous iteration
  tokensUsed: number;
  durationMs: number;
  status: "improved" | "regressed" | "reverted" | "skipped";
  commitHash?: string;
  summary?: string;
}

/** Full loop state persisted to disk between iterations. Satisfies: RT-6 */
export interface LoopState {
  // Identity
  runId: string;
  branch: string;
  scope: string[];
  startedAt: string;

  // Configuration. Satisfies: T2, O1, O2, O4
  config: LoopConfig;

  // Baseline. Satisfies: RT-2
  baseline: IterationScores;

  // History
  iterations: IterationScores[];
  currentIteration: number;

  // Convergence tracking. Satisfies: T5, TN6
  bestScores: Record<string, NormalizedScore>;
  bestComposite: NormalizedScore;
  plateauCounter: number; // Consecutive below-threshold iterations

  // Budget tracking. Satisfies: O2
  totalTokensUsed: number;
  totalDurationMs: number;

  // Stop reason
  stopReason?: "converged" | "max_iterations" | "token_budget" | "timeout" | "circuit_breaker" | "user_stopped";
  stopDetails?: string;

  // Out-of-scope proposals. Satisfies: TN3
  scopeExpansionProposals: ScopeProposal[];
}

/** Configuration for a single autoresearch run. Satisfies: RT-10 */
export interface LoopConfig {
  /** Max iterations hard cap. Satisfies: O1 */
  maxIterations: number;
  /** Per-iteration time box in seconds. Satisfies: T2 */
  timeBoxSeconds: number;
  /** Total wall-clock timeout in seconds. Satisfies: O4 */
  totalTimeoutSeconds: number;
  /** Token budget for entire run. Satisfies: O2 */
  tokenBudget: number;
  /** Composite delta threshold for diminishing returns. Satisfies: T5 */
  convergenceThreshold: number;
  /** Plateau window size. Satisfies: TN6 */
  plateauWindow: number;
  /** Regression threshold for circuit breaker (0-1). Satisfies: O3 */
  regressionThreshold: number;
  /** LLM eval sampling interval. Satisfies: TN2 */
  llmEvalInterval: number;
  /** Evaluation parallelism. Satisfies: T6 */
  parallelEval: boolean;
  /** Per-command timeout in seconds. Satisfies: RT-5 */
  commandTimeoutSeconds: number;
}

/** Out-of-scope improvement proposal. Satisfies: TN3 */
export interface ScopeProposal {
  file: string;
  description: string;
  estimatedImpact: "high" | "medium" | "low";
  relatedConstraints: string[];
}

/** Codebase introspection result. Satisfies: RT-7 */
export interface CodebaseProfile {
  languages: string[];
  frameworks: string[];
  packageManager?: string;
  testRunner?: string;
  linter?: string;
  typeChecker?: string;
  hasTests: boolean;
  hasCi: boolean;
  fileCount: number;
  detectedConfigs: Record<string, string>; // config name -> file path
}

/** Preset constraint profile. Satisfies: U4 */
export interface PresetProfile {
  name: string;
  description: string;
  constraints: UnhashedConstraint[];
  suggestedTimeBox: number;
  suggestedMaxIterations: number;
}

/** Evaluation result from a single mechanism. Satisfies: RT-1 */
export interface EvalResult {
  constraintId: string;
  mechanism: EvalMechanism;
  rawOutput: string;
  normalizedScore: NormalizedScore;
  durationMs: number;
  success: boolean;
  error?: string;
}

/** Summary report structure. Satisfies: U1, B3, TN7 */
export interface AutoresearchReport {
  runId: string;
  scope: string[];
  startedAt: string;
  completedAt: string;
  totalIterations: number;
  stopReason: string;
  baseline: Record<string, NormalizedScore>;
  final: Record<string, NormalizedScore>;
  improvement: Record<string, number>; // percentage change per constraint
  compositeImprovement: number;
  iterationHistory: IterationScores[];
  scopeProposals: ScopeProposal[];
  /** Full LLM evaluation of all changes. Satisfies: TN7 */
  learningReport?: string;
}

/** Default configuration values */
export const DEFAULTS: LoopConfig = {
  maxIterations: 20,
  timeBoxSeconds: 120,
  totalTimeoutSeconds: 3600,
  tokenBudget: 500_000,
  convergenceThreshold: 0.5,
  plateauWindow: 3,
  regressionThreshold: 0.10,
  llmEvalInterval: 3,
  parallelEval: true,
  commandTimeoutSeconds: 30,
};

/** State file path within the autoresearch branch */
export const STATE_FILE = ".autoresearch/state.json";
export const REPORT_FILE = ".autoresearch/report.md";
