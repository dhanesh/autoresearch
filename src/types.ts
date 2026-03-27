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

// ─── Production-Ready Extensions (manifold: production-ready) ────────────────

/** Aggregation method for composite scoring. Satisfies: T3, TN5 */
export type AggregationMethod = "arithmetic" | "harmonic" | "geometric";

/** Scoring configuration for adaptive aggregation. Satisfies: T3, T8, TN5 */
export interface ScoringConfig {
  method: AggregationMethod;
  /** Method to switch to after phase transition */
  phaseTransitionMethod: AggregationMethod;
  /** Fraction of maxIterations before switching (0-1). Default: 0.4 */
  phaseTransitionPct: number;
  /** Switch when all axes exceed this score. Default: 80 */
  phaseTransitionScoreThreshold: number;
}

/** Token breakdown by phase. Satisfies: T4, U2 */
export interface TokenBreakdown {
  discovery: number;
  baseline: number;
  evaluation: number;
  improvement: number;
  reporting: number;
}

/** Per-constraint token usage in a single iteration. Satisfies: T4 */
export interface ConstraintTokenUsage {
  constraintId: string;
  tokensUsed: number;
}

/** Permission entry for the manifest. Satisfies: T1, S1, TN1 */
export interface PermissionEntry {
  type: "bash" | "write" | "edit" | "read" | "git";
  target: string;
  purpose: string;
  requiredBy: string;
  required: boolean;
}

/** Full permission manifest. Satisfies: T1, U1, TN1 */
export interface PermissionManifest {
  entries: PermissionEntry[];
  groups: Record<string, PermissionEntry[]>;
}

/** Permission verification result. Satisfies: O4 */
export interface PermissionVerifyResult {
  entry: PermissionEntry;
  granted: boolean;
  error?: string;
}

/** Fallback evaluator definition. Satisfies: TN4 */
export interface FallbackEvaluator {
  primaryId: string;
  fallback: UnhashedConstraint;
  expectedCorrelation: number;
}

/** Confidence interval for a score. Satisfies: U3 */
export interface ConfidenceInterval {
  mean: number;
  lower: number;
  upper: number;
  stdDev: number;
  n: number;
}

/** Eval scheduling decision. Satisfies: T5, TN3 */
export type EvalScheduleDecision = "full" | "lite" | "skip";

/** Weight rationale for a single constraint. Satisfies: T7 */
export interface ConstraintRationale {
  iso25010: string;
  justification: string;
  reference?: string;
}

/** Pre-computed orthogonality data. Satisfies: T2 */
export interface OrthogonalityMatrix {
  correlations: Record<string, Record<string, number>>;
  isOrthogonal: boolean;
}

/** Extended preset profile with scientific grounding. Satisfies: T7, TN2, RT-4 */
export interface ScientificProfile extends PresetProfile {
  scoring: ScoringConfig;
  constraintRationale: Record<string, ConstraintRationale>;
  orthogonalityMatrix?: OrthogonalityMatrix;
}

/** Extended report with analytics. Satisfies: B4, U2, U3, U4, RT-6 */
export interface ProductionReport extends AutoresearchReport {
  tokenBreakdown: TokenBreakdown;
  perIterationTokens: ConstraintTokenUsage[][];
  estimatedCostUsd: number;
  tokensPerImprovementPoint: number;
  confidenceIntervals: Record<string, ConfidenceInterval>;
  predictedCeiling: number;
  optimalStopIteration: number;
  aggregationPhaseTransition?: number;
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
