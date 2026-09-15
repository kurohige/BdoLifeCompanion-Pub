/**
 * Ship material totals — validated against the shipped data files, not fixtures.
 *
 * The point of the totals panel is a number the user cannot get by hand
 * (500 Sturdy Coral Support across the four Falasi stages), so the tests read
 * static/data/bartering/*.json directly. If a future patch changes a
 * requirement, these numbers are supposed to fail and be re-checked against
 * the patch note — that is the tripwire, not a nuisance.
 */

import { describe, expect, it } from "vitest";

import shipUpgrades from "../../../static/data/bartering/ship-upgrades.json";
import shipRecipes from "../../../static/data/bartering/ship-material-recipes.json";
import type {
	ShipMaterialRecipesData,
	ShipProgress,
	ShipUpgradesData,
} from "$lib/models/bartering";
import {
	computeShipMaterialTotals,
	massProcessBatches,
	rollUpIngredients,
} from "./ship-materials";

const UPGRADES = shipUpgrades as unknown as ShipUpgradesData;
const RECIPES = shipRecipes as unknown as ShipMaterialRecipesData;

const advance = UPGRADES.paths.find((p) => p.variant === "advance")!;
const panokseon = UPGRADES.paths.find((p) => p.variant === "panokseon")!;

function emptyProgress(variant: ShipProgress["variant"]): ShipProgress {
	return { variant, materials: {}, completedStages: {} };
}

function find(totals: ReturnType<typeof computeShipMaterialTotals>, baseId: string) {
	const hit = totals.find((t) => t.baseId === baseId);
	expect(hit, `no total for ${baseId}`).toBeDefined();
	return hit!;
}

describe("data integrity", () => {
	it("gives every material a baseId", () => {
		for (const path of UPGRADES.paths) {
			for (const stage of path.stages) {
				for (const mat of stage.materials) {
					expect(mat.baseId, `${path.variant}/${stage.id}/${mat.id}`).toBeTruthy();
				}
			}
		}
	});

	it("maps each baseId to exactly one item name", () => {
		const names = new Map<string, string>();
		for (const path of UPGRADES.paths) {
			for (const stage of path.stages) {
				for (const mat of stage.materials) {
					const seen = names.get(mat.baseId!);
					if (seen) expect(seen).toBe(mat.name);
					else names.set(mat.baseId!, mat.name);
				}
			}
		}
	});

	it("keeps recipe notes as translation keys, never as prose", () => {
		const known = new Set(["enhance_stage", "untracked_chain"]);
		for (const [id, recipe] of Object.entries(RECIPES.recipes)) {
			// A `note` field would render untranslated in the Spanish UI.
			expect(recipe, `${id} carries prose instead of a key`).not.toHaveProperty("note");
			if (recipe.noteKey) expect(known, `unknown noteKey in ${id}`).toContain(recipe.noteKey);
		}
	});

	it("has a recipe for every craft-source material", () => {
		const craftIds = new Set<string>();
		for (const path of UPGRADES.paths) {
			for (const stage of path.stages) {
				for (const mat of stage.materials) {
					if (mat.source === "craft") craftIds.add(mat.baseId!);
				}
			}
		}
		for (const id of craftIds) expect(RECIPES.recipes[id], `missing recipe: ${id}`).toBeDefined();
	});
});

describe("computeShipMaterialTotals", () => {
	it("sums a material across the stages that share it", () => {
		const totals = computeShipMaterialTotals(advance, emptyProgress("advance"), RECIPES);

		// 125 per Falasi stage x 4 Falasi stages in this path
		expect(find(totals, "sturdy_coral_support").needed).toBe(500);
		expect(find(totals, "raging_wave_plywood").needed).toBe(300);
		expect(find(totals, "crimson_coral_adhesive").needed).toBe(200);
		// Seaweed Stalk is split across two stages under different material ids
		expect(find(totals, "seaweed_stalk").needed).toBe(205);
		expect(find(totals, "seaweed_stalk").stageIds).toHaveLength(2);
	});

	it("caps each stage's have-count at that stage's requirement", () => {
		const progress = emptyProgress("advance");
		// Over-stocked on one stage, empty on the other three
		progress.materials["sturdy_coral_support_cannon"] = 400;

		const totals = computeShipMaterialTotals(advance, progress, RECIPES);
		const scs = find(totals, "sturdy_coral_support");

		expect(scs.have).toBe(125); // not 400
		expect(scs.remaining).toBe(375);
	});

	it("drops completed stages from the remaining total", () => {
		const progress = emptyProgress("advance");
		progress.completedStages["falasi_cannon"] = true;

		const totals = computeShipMaterialTotals(advance, progress, RECIPES);
		expect(find(totals, "sturdy_coral_support").needed).toBe(375);
		expect(find(totals, "sturdy_coral_support").remaining).toBe(375);
	});

	it("counts a completed stage as stocked when asked for the gross total", () => {
		const progress = emptyProgress("advance");
		progress.completedStages["falasi_cannon"] = true;

		const totals = computeShipMaterialTotals(advance, progress, RECIPES, true);
		const scs = find(totals, "sturdy_coral_support");

		expect(scs.needed).toBe(500);
		expect(scs.have).toBe(125); // the completed stage's requirement, counted as met
		expect(scs.remaining).toBe(375);
	});

	it("scales ingredients to what is still missing", () => {
		const progress = emptyProgress("advance");
		progress.materials["sturdy_coral_support_cannon"] = 125;

		const scs = find(
			computeShipMaterialTotals(advance, progress, RECIPES),
			"sturdy_coral_support",
		);

		expect(scs.remaining).toBe(375);
		expect(scs.crafts).toBe(375); // yield 1
		const bone = scs.ingredients.find((i) => i.id === "lyngbakrs_bone")!;
		expect(bone.amount).toBe(375);
		expect(massProcessBatches(scs)).toBe(38); // ceil(375 / 10)
	});

	it("expands against the whole path in gross mode, not just what is missing", () => {
		const progress = emptyProgress("advance");
		progress.completedStages["falasi_cannon"] = true;

		const remaining = find(
			computeShipMaterialTotals(advance, progress, RECIPES, false),
			"sturdy_coral_support",
		);
		const gross = find(
			computeShipMaterialTotals(advance, progress, RECIPES, true),
			"sturdy_coral_support",
		);

		// Same path, same progress — the header's question decides the basis.
		expect(remaining.basis).toBe(375);
		expect(remaining.crafts).toBe(375);
		expect(gross.basis).toBe(500);
		expect(gross.crafts).toBe(500);
		expect(gross.ingredients.find((i) => i.id === "lyngbakrs_bone")!.amount).toBe(500);
	});

	it("expands nothing once a material is fully stocked", () => {
		const progress = emptyProgress("advance");
		for (const part of ["cannon", "sail", "figurehead", "plating"]) {
			progress.materials[`sturdy_coral_support_${part}`] = 125;
		}

		const scs = find(
			computeShipMaterialTotals(advance, progress, RECIPES),
			"sturdy_coral_support",
		);
		expect(scs.remaining).toBe(0);
		expect(scs.crafts).toBe(0);
		expect(scs.ingredients.every((i) => i.amount === 0)).toBe(true);
	});

	it("links the +10 gear to the stage that builds it instead of expanding it", () => {
		const chiro = find(
			computeShipMaterialTotals(advance, emptyProgress("advance"), RECIPES),
			"chiro_cannon_p10",
		);

		expect(chiro.producedByStageId).toBe("blue_cannon_caravel");
		// Expanding would double-count: blue_cannon_caravel is its own tracked stage.
		expect(chiro.ingredients).toHaveLength(0);
	});

	it("leaves the Panokseon +10 gear unlinked — its chain is not tracked here", () => {
		const byukgye = find(
			computeShipMaterialTotals(panokseon, emptyProgress("panokseon"), RECIPES),
			"byukgye_cannon_p10",
		);

		expect(byukgye.producedByStageId).toBeUndefined();
		// A key, not prose — the note is translated in the component.
		expect(byukgye.recipe?.noteKey).toBe("untracked_chain");
	});

	it("returns an empty list for an unknown path", () => {
		expect(computeShipMaterialTotals(undefined, emptyProgress("advance"), RECIPES)).toEqual([]);
	});

	it("still totals correctly with no recipe data loaded", () => {
		const totals = computeShipMaterialTotals(advance, emptyProgress("advance"), null);
		expect(find(totals, "sturdy_coral_support").needed).toBe(500);
		expect(find(totals, "sturdy_coral_support").ingredients).toHaveLength(0);
	});
});

describe("held ingredients", () => {
	it("subtracts what the player holds from each ingredient", () => {
		const held = { lyngbakrs_bone: 100, starlight_hardener: 500, starlight_emulsifier: 0 };
		const scs = find(
			computeShipMaterialTotals(advance, emptyProgress("advance"), RECIPES, false, held),
			"sturdy_coral_support",
		);

		const bone = scs.ingredients.find((i) => i.id === "lyngbakrs_bone")!;
		expect(bone.amount).toBe(500);
		expect(bone.held).toBe(100);
		expect(bone.short).toBe(400);

		// Held more than needed clamps the shortfall at zero rather than going negative
		const hardener = scs.ingredients.find((i) => i.id === "starlight_hardener")!;
		expect(hardener.held).toBe(500);
		expect(hardener.short).toBe(0);
	});

	it("caps craftableNow at the scarcest ingredient", () => {
		const held = { lyngbakrs_bone: 100, starlight_hardener: 500, starlight_emulsifier: 40 };
		const scs = find(
			computeShipMaterialTotals(advance, emptyProgress("advance"), RECIPES, false, held),
			"sturdy_coral_support",
		);
		expect(scs.craftableNow).toBe(40); // emulsifier is the bottleneck, not bone
	});

	it("never reports more craftable than are actually needed", () => {
		const held = {
			lyngbakrs_bone: 99999,
			starlight_hardener: 99999,
			starlight_emulsifier: 99999,
		};
		const scs = find(
			computeShipMaterialTotals(advance, emptyProgress("advance"), RECIPES, false, held),
			"sturdy_coral_support",
		);
		expect(scs.crafts).toBe(500);
		expect(scs.craftableNow).toBe(500); // capped at crafts, not 99999
	});

	it("treats a missing or negative held count as zero", () => {
		const scs = find(
			computeShipMaterialTotals(advance, emptyProgress("advance"), RECIPES, false, {
				lyngbakrs_bone: -50,
			}),
			"sturdy_coral_support",
		);
		const bone = scs.ingredients.find((i) => i.id === "lyngbakrs_bone")!;
		expect(bone.held).toBe(0);
		expect(bone.short).toBe(500);
		expect(scs.craftableNow).toBe(0);
	});
});

describe("rollUpIngredients", () => {
	it("merges the shared reagents across all three coral crafts", () => {
		const flat = rollUpIngredients(
			computeShipMaterialTotals(advance, emptyProgress("advance"), RECIPES),
		);
		const amount = (id: string) => flat.find((i) => i.id === id)?.amount;

		// 500 + 300 + 200 crafts, one of each reagent per craft
		expect(amount("starlight_hardener")).toBe(1000);
		expect(amount("starlight_emulsifier")).toBe(1000);
		// Lyngbakr drops stay separate — one per craft type
		expect(amount("lyngbakrs_bone")).toBe(500);
		expect(amount("lyngbakrs_scale")).toBe(300);
		expect(amount("lyngbakrs_fluid")).toBe(200);
	});

	it("sums demand across recipes but never sums the held pile", () => {
		// One pile of 600 Hardener, wanted by all three coral crafts (500+300+200).
		const held = { starlight_hardener: 600 };
		const flat = rollUpIngredients(
			computeShipMaterialTotals(advance, emptyProgress("advance"), RECIPES, false, held),
		);
		const hardener = flat.find((i) => i.id === "starlight_hardener")!;

		expect(hardener.amount).toBe(1000); // demand accumulates
		expect(hardener.held).toBe(600); // the pile does NOT (it is not 1800)
		expect(hardener.short).toBe(400); // the real cross-recipe constraint
	});

	it("sorts the shopping list heaviest first", () => {
		const flat = rollUpIngredients(
			computeShipMaterialTotals(advance, emptyProgress("advance"), RECIPES),
		);
		for (let i = 1; i < flat.length; i++) {
			expect(flat[i - 1].amount).toBeGreaterThanOrEqual(flat[i].amount);
		}
	});
});
