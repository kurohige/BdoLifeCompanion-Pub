/**
 * Shared ID generation utilities.
 */

/**
 * Generate a unique ID using base-36 timestamp + random suffix.
 * Suitable for local-only session IDs (crafting log, grinding log).
 */
export function generateId(): string {
	return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
