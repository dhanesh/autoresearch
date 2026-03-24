// Satisfies: U1 (Live Progress + Report), B3 (Measurable Improvement), TN7 (Learning Summary)
// Satisfies: U3 (Convergence Communication)
// Summary report generator — produces the final markdown report

import type { AutoresearchReport, LoopState } from "./types";

/** Build the final report from loop state. Satisfies: B3, U1, TN7 */
export function buildReport(
  state: LoopState,
  learningReport?: string
): AutoresearchReport {
  const improvement: Record<string, number> = {};
  const finalScores =
    state.iterations.length > 0
      ? state.iterations[state.iterations.length - 1].scores
      : state.baseline.scores;

  for (const [id, baselineScore] of Object.entries(state.baseline.scores)) {
    const finalScore = finalScores[id] ?? baselineScore;
    if (baselineScore > 0) {
      improvement[id] = ((finalScore - baselineScore) / baselineScore) * 100;
    } else {
      improvement[id] = finalScore > 0 ? 100 : 0;
    }
  }

  const baselineComposite = state.baseline.compositeScore;
  const finalComposite =
    state.iterations.length > 0
      ? state.iterations[state.iterations.length - 1].compositeScore
      : baselineComposite;
  const compositeImprovement =
    baselineComposite > 0
      ? ((finalComposite - baselineComposite) / baselineComposite) * 100
      : 0;

  return {
    runId: state.runId,
    scope: state.scope,
    startedAt: state.startedAt,
    completedAt: new Date().toISOString(),
    totalIterations: state.currentIteration,
    stopReason: state.stopReason ?? "unknown",
    baseline: state.baseline.scores,
    final: finalScores,
    improvement,
    compositeImprovement,
    iterationHistory: state.iterations,
    scopeProposals: state.scopeExpansionProposals,
    learningReport,
  };
}

/** Render report as markdown. Satisfies: U1, B3 */
export function renderReportMarkdown(report: AutoresearchReport): string {
  const lines: string[] = [];

  lines.push(`# Autoresearch Report: ${report.runId}`);
  lines.push("");
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| **Scope** | ${report.scope.join(", ")} |`);
  lines.push(`| **Started** | ${report.startedAt} |`);
  lines.push(`| **Completed** | ${report.completedAt} |`);
  lines.push(`| **Iterations** | ${report.totalIterations} |`);
  lines.push(`| **Stop Reason** | ${report.stopReason} |`);
  lines.push(`| **Composite Improvement** | ${report.compositeImprovement >= 0 ? "+" : ""}${report.compositeImprovement.toFixed(1)}% |`);
  lines.push("");

  // Per-constraint improvements
  lines.push("## Improvement Summary");
  lines.push("");
  lines.push("| Constraint | Baseline | Final | Change |");
  lines.push("|------------|----------|-------|--------|");
  for (const [id, pct] of Object.entries(report.improvement)) {
    const baseline = report.baseline[id] ?? 0;
    const final = report.final[id] ?? 0;
    const sign = pct >= 0 ? "+" : "";
    lines.push(`| ${id} | ${baseline} | ${final} | ${sign}${pct.toFixed(1)}% |`);
  }
  lines.push("");

  // Iteration history
  lines.push("## Iteration History");
  lines.push("");
  lines.push("| # | Score | Delta | Status | Tokens | Duration |");
  lines.push("|---|-------|-------|--------|--------|----------|");
  for (const iter of report.iterationHistory) {
    const delta = iter.delta >= 0 ? `+${iter.delta.toFixed(1)}` : iter.delta.toFixed(1);
    lines.push(
      `| ${iter.iteration} | ${iter.compositeScore} | ${delta} | ${iter.status} | ${iter.tokensUsed} | ${(iter.durationMs / 1000).toFixed(1)}s |`
    );
  }
  lines.push("");

  // Convergence trend. Satisfies: U3
  if (report.stopReason === "converged") {
    lines.push("## Convergence Analysis");
    lines.push("");
    lines.push("The loop stopped due to diminishing returns. Last iterations:");
    lines.push("");
    const last5 = report.iterationHistory.slice(-5);
    for (const iter of last5) {
      const bar = "█".repeat(Math.max(0, Math.round(iter.delta)));
      lines.push(`  Iteration ${iter.iteration}: delta=${iter.delta.toFixed(2)} ${bar}`);
    }
    lines.push("");
    lines.push("> To resume from this point, run `/autoresearch --resume`");
    lines.push("");
  }

  // Scope expansion proposals. Satisfies: TN3
  if (report.scopeProposals.length > 0) {
    lines.push("## Out-of-Scope Improvement Proposals");
    lines.push("");
    lines.push("The following improvements were identified but require files outside the current scope:");
    lines.push("");
    for (const p of report.scopeProposals) {
      lines.push(`### ${p.file} (${p.estimatedImpact} impact)`);
      lines.push("");
      lines.push(p.description);
      lines.push(`Related constraints: ${p.relatedConstraints.join(", ")}`);
      lines.push("");
    }
  }

  // Learning report. Satisfies: TN7
  if (report.learningReport) {
    lines.push("## Learning Report");
    lines.push("");
    lines.push("Full LLM evaluation of all changes with explanations:");
    lines.push("");
    lines.push(report.learningReport);
    lines.push("");
  }

  lines.push("---");
  lines.push("*Generated by /autoresearch*");

  return lines.join("\n");
}

/** Format convergence communication for auto-stop display. Satisfies: U3 */
export function formatConvergenceMessage(state: LoopState): string {
  const last = state.iterations.slice(-state.config.plateauWindow);
  const deltas = last.map((i) => i.delta.toFixed(2)).join(", ");
  const totalImprovement =
    state.iterations.length > 0
      ? state.iterations[state.iterations.length - 1].compositeScore -
        state.baseline.compositeScore
      : 0;

  return `
Autoresearch loop auto-stopped: diminishing returns detected.

Last ${state.config.plateauWindow} iteration deltas: [${deltas}]
Threshold: ${state.config.convergenceThreshold}
Total improvement: ${totalImprovement >= 0 ? "+" : ""}${totalImprovement.toFixed(1)} points (${state.baseline.compositeScore} → ${state.iterations[state.iterations.length - 1]?.compositeScore ?? state.baseline.compositeScore})
Iterations completed: ${state.currentIteration}/${state.config.maxIterations}

To resume: /autoresearch --resume
To view full report: see .autoresearch/report.md
`.trim();
}
