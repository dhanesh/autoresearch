// Satisfies: T3 (Zod Runtime Validation), S1 (LLM Output Validated), RT-5 (Fallback Values)
// Resolution: TN1 — imports from bundled vendor/zod.js

// Note: In the plugin distribution, zod is bundled at vendor/zod.js
// During development, we import from the npm package
import { z } from "zod";

/** Schema for a single LLM rubric dimension score */
export const DimensionScoreSchema = z.object({
	score: z.number().min(0).max(100),
	justification: z.string(),
});

/** Schema for full LLM evaluation response. Satisfies: S1 */
export const LlmEvalResponseSchema = z.object({
	scores: z.object({
		readability: DimensionScoreSchema,
		architecture: DimensionScoreSchema,
		maintainability: DimensionScoreSchema,
		idiomaticness: DimensionScoreSchema,
	}),
	composite: z.number().min(0).max(100),
	summary: z.string(),
	learning: z.string().optional(),
});

/** Schema for lite probe response */
export const LiteProbeResponseSchema = z.object({
	score: z.number().min(0).max(100),
	justification: z.string(),
});

/** Schema for custom command JSON output */
export const CustomOutputJsonSchema = z.union([
	z.number(),
	z.object({ score: z.number() }),
	z.object({ value: z.number() }),
]);

/** Type aliases from schemas */
export type LlmEvalResponse = z.infer<typeof LlmEvalResponseSchema>;
export type LiteProbeResponse = z.infer<typeof LiteProbeResponseSchema>;
export type CustomOutputJson = z.infer<typeof CustomOutputJsonSchema>;

/** Parse LLM eval response with safe fallback. Satisfies: RT-5
 *  Returns validated result or fallback with error details */
export function safeParseLlmResponse(raw: string): {
	success: boolean;
	data?: LlmEvalResponse;
	error?: string;
	fallbackScore: number;
} {
	try {
		const jsonMatch = raw.match(/\{[\s\S]*\}/);
		if (!jsonMatch) {
			return {
				success: false,
				error: "No JSON found in LLM response",
				fallbackScore: 50,
			};
		}

		const parsed: unknown = JSON.parse(jsonMatch[0]);
		const result = LlmEvalResponseSchema.safeParse(parsed);

		if (result.success) {
			return {
				success: true,
				data: result.data,
				fallbackScore: result.data.composite,
			};
		}

		return {
			success: false,
			error: result.error.issues
				.map((i) => `${i.path.join(".")}: ${i.message}`)
				.join("; "),
			fallbackScore: 50,
		};
	} catch (e) {
		return {
			success: false,
			error: e instanceof Error ? e.message : String(e),
			fallbackScore: 50,
		};
	}
}

/** Parse lite probe response with safe fallback. Satisfies: RT-5 */
export function safeParseLiteProbe(raw: string): {
	success: boolean;
	score: number;
	error?: string;
} {
	try {
		const jsonMatch = raw.match(/\{[\s\S]*\}/);
		if (!jsonMatch)
			return { success: false, score: 50, error: "No JSON found" };

		const parsed: unknown = JSON.parse(jsonMatch[0]);
		const result = LiteProbeResponseSchema.safeParse(parsed);

		if (result.success) {
			return {
				success: true,
				score: Math.max(0, Math.min(100, Math.round(result.data.score))),
			};
		}

		return {
			success: false,
			score: 50,
			error: result.error.issues.map((i) => i.message).join("; "),
		};
	} catch (e) {
		return {
			success: false,
			score: 50,
			error: e instanceof Error ? e.message : String(e),
		};
	}
}

/** Parse custom command JSON output with safe fallback. Satisfies: RT-5 */
export function safeParseCustomJson(raw: string): {
	success: boolean;
	score: number;
	error?: string;
} {
	try {
		const parsed: unknown = JSON.parse(raw.trim());
		const result = CustomOutputJsonSchema.safeParse(parsed);

		if (result.success) {
			const score =
				typeof result.data === "number"
					? result.data
					: "score" in result.data
						? result.data.score
						: result.data.value;
			return {
				success: true,
				score: Math.max(0, Math.min(100, Math.round(score))),
			};
		}

		return {
			success: false,
			score: 0,
			error: result.error.issues.map((i) => i.message).join("; "),
		};
	} catch {
		return { success: false, score: 0 };
	}
}
