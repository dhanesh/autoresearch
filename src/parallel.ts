// Satisfies: T6 (Parallel Evaluation), T7 (Score Determinism), TN3 (Sort Before Score)
// Resolution: TN3 — sort evaluator results by constraint name before scoring

import type { EvalResult } from "./types";

/** Concurrency limiter for parallel evaluation. Satisfies: T6 */
export async function parallelEvaluate(
	tasks: Array<{
		constraintId: string;
		evaluate: () => Promise<EvalResult>;
	}>,
	concurrencyLimit: number = 4,
): Promise<EvalResult[]> {
	const results: EvalResult[] = [];
	const executing = new Set<Promise<void>>();

	for (const task of tasks) {
		const promise = task
			.evaluate()
			.then(
				(result) => {
					results.push(result);
				},
				(error) => {
					results.push({
						constraintId: task.constraintId,
						mechanism: "custom",
						rawOutput: "",
						normalizedScore: 0,
						durationMs: 0,
						success: false,
						error: error instanceof Error ? error.message : String(error),
					});
				},
			)
			.then(() => {
				executing.delete(promise);
			});

		executing.add(promise);

		if (executing.size >= concurrencyLimit) {
			await Promise.race(executing);
		}
	}

	await Promise.all(executing);

	// TN3: Sort by constraint name for deterministic scoring. Satisfies: T7
	return sortResultsByConstraintId(results);
}

/** Sort evaluation results by constraint ID for deterministic composite scoring.
 *  Satisfies: T7, TN3 — order must not affect final score */
export function sortResultsByConstraintId(
	results: EvalResult[],
): EvalResult[] {
	return [...results].sort((a, b) =>
		a.constraintId.localeCompare(b.constraintId),
	);
}
