// Satisfies: T5 (Retry with Backoff), TN4 (Retries Share Timeout Budget)
// Resolution: TN4 — retries share commandTimeoutSeconds budget

/** Retry configuration. Satisfies: T5 */
export interface RetryConfig {
	/** Maximum number of retry attempts (default: 3). Satisfies: T5 */
	maxRetries: number;
	/** Base delay in ms for exponential backoff (default: 1000) */
	baseDelayMs: number;
}

/** Default retry configuration */
export const DEFAULT_RETRY: RetryConfig = {
	maxRetries: 3,
	baseDelayMs: 1000,
};

/** Compute backoff delay with jitter for attempt N (0-indexed).
 *  Uses full jitter: random(0, baseDelay * 2^attempt) */
export function computeBackoffMs(
	attempt: number,
	baseDelayMs: number,
): number {
	const maxDelay = baseDelayMs * Math.pow(2, attempt);
	return Math.floor(Math.random() * maxDelay);
}

/** Compute timeout for a single attempt within the shared budget.
 *  Satisfies: TN4 — total time for all attempts <= totalBudgetMs */
export function computeAttemptTimeout(
	totalBudgetMs: number,
	attemptNumber: number,
	maxRetries: number,
	elapsedMs: number,
): number {
	const remaining = totalBudgetMs - elapsedMs;
	if (remaining <= 0) return 0;
	const attemptsLeft = maxRetries - attemptNumber + 1;
	return Math.floor(remaining / attemptsLeft);
}

/** Build a timeout-wrapped command string with retry budget.
 *  Returns an array of {command, timeoutSeconds} for each attempt.
 *  Satisfies: T5, TN4 */
export function buildRetryPlan(
	command: string,
	totalTimeoutSeconds: number,
	config: RetryConfig,
): Array<{ command: string; timeoutSeconds: number; backoffMs: number }> {
	const totalMs = totalTimeoutSeconds * 1000;
	const plan: Array<{
		command: string;
		timeoutSeconds: number;
		backoffMs: number;
	}> = [];
	let elapsed = 0;

	for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
		const backoffMs =
			attempt === 0 ? 0 : computeBackoffMs(attempt - 1, config.baseDelayMs);
		elapsed += backoffMs;

		const timeoutMs = computeAttemptTimeout(
			totalMs,
			attempt,
			config.maxRetries,
			elapsed,
		);
		if (timeoutMs <= 0) break;

		const timeoutSeconds = Math.max(1, Math.floor(timeoutMs / 1000));
		plan.push({ command, timeoutSeconds, backoffMs });

		elapsed += timeoutMs;
	}

	return plan;
}
