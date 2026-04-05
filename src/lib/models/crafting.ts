/**
 * Crafting session models
 * Ported from BdoLifeCompanion.Models.CraftingSession
 */

export interface CraftingSession {
	timestamp: Date;
	recipe: string;
	category: string;
	masteryRank: string;
	masteryLevel: number;
	canCraft: number;
	craftsAttempted: number;
	yielded: number;
}

/**
 * Mastery ranks for BDO life skills
 */
export type MasteryRank =
	| "Beginner"
	| "Apprentice"
	| "Skilled"
	| "Professional"
	| "Artisan"
	| "Master"
	| "Guru";

/**
 * Helper to create a new crafting session
 */
export function createCraftingSession(
	recipe: string,
	category: string,
	masteryRank: string,
	masteryLevel: number,
	canCraft: number,
	craftsAttempted: number,
	yielded: number
): CraftingSession {
	return {
		timestamp: new Date(),
		recipe,
		category,
		masteryRank,
		masteryLevel,
		canCraft,
		craftsAttempted,
		yielded,
	};
}
