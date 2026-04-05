// Satisfies: T4 (Structured Logger), U3 (No Host Interference), S2 (No Sensitive Data)
// Resolution: TN2 — callback-based logger, silent by default

/** Log severity levels */
export type LogLevel = "info" | "warn" | "error";

/** Structured log entry. Contains ONLY metadata, never content. Satisfies: S2 */
export interface LogEntry {
	level: LogLevel;
	timestamp: string;
	iteration?: number;
	constraint?: string;
	message: string;
	durationMs?: number;
	score?: number;
}

/** Logger callback type. Satisfies: TN2 (callback model) */
export type LogCallback = (entry: LogEntry) => void;

/** Create a logger instance. Returns a no-op logger when no callback is provided.
 *  Satisfies: U3 — never writes to stdout/stderr */
export function createLogger(onLog?: LogCallback) {
	const emit = (
		level: LogLevel,
		message: string,
		meta?: Partial<Omit<LogEntry, "level" | "timestamp" | "message">>,
	) => {
		if (!onLog) return;
		onLog({
			level,
			timestamp: new Date().toISOString(),
			message,
			...meta,
		});
	};

	return {
		info: (
			message: string,
			meta?: Partial<Omit<LogEntry, "level" | "timestamp" | "message">>,
		) => emit("info", message, meta),
		warn: (
			message: string,
			meta?: Partial<Omit<LogEntry, "level" | "timestamp" | "message">>,
		) => emit("warn", message, meta),
		error: (
			message: string,
			meta?: Partial<Omit<LogEntry, "level" | "timestamp" | "message">>,
		) => emit("error", message, meta),
	};
}

/** Logger instance type */
export type Logger = ReturnType<typeof createLogger>;
