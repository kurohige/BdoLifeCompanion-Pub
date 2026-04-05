/**
 * Material type explanations for BDO recipes
 * These are generic ingredient types that can be substituted with specific items
 */

export const MATERIAL_EXPLANATIONS: Record<string, string> = {
	// Blood Types
	"blood 1": "Wolf, Flamingo, Rhino, Cheetah blood",
	"blood 2": "Deer, Sheep, Pig, Waragon, Ox, Llama, Goat blood",
	"blood 3": "Weasel, Fox, Raccoon, Scorpion, Marmot blood",
	"blood 4": "Troll, Bear, Ogre, Dinosaur, Yak, Lion blood",
	"blood 5": "Worm, Lizard, Bat, Kuku, Cobra blood",
	"blood 6": "Legendary Beast's, Tyrant's, Clown's, Sinner's, Wise Man's blood",

	// Vegetables
	vegetable: "Tomato, Paprika, Pumpkin, Cabbage, Olive",
	vegetables: "Tomato, Paprika, Pumpkin, Cabbage, Olive",

	// Fruits
	fruit: "Strawberry, Grape, Apple, Cherry, Pear, Banana, Pineapple",
	fruits: "Strawberry, Grape, Apple, Cherry, Pear, Banana, Pineapple",

	// Starch/Grain
	grain: "Potato, Corn, Barley, Sweet Potato, Wheat",
	starch: "Potato, Corn, Barley, Sweet Potato, Wheat",

	// Meat
	meat: "Any animal meat (Beef, Pork, Wolf, Deer, etc.)",
	"bird meat": "Chicken, Kuku Bird, Flamingo, Pigeon meat",

	// Seafood
	seafood: "Any fish or shellfish",
	fish: "Blue/Gold/Green/White fish, Cuttlefish, Octopus",

	// Flowers
	flower: "Sunflower, Tulip, Rose, etc.",
	flowers: "Sunflower, Tulip, Rose, etc.",

	// Herbs
	"wild herb": "Any gatherable wild herbs",
	"wild herbs": "Any gatherable wild herbs",

	// Saps
	sap: "Pine, Cedar, Fir, Elder Tree sap",

	// Trace materials
	"trace of nature": "Any trace from gathering",
	"fruits of nature": "Any fruit from gathering",

	// Common reagents
	"pure powder reagent": "Craft: Sugar x1 + Silver Azalea x1 + Purified Water x1 + Weeds x1",
	"clear liquid reagent": "Craft: Salt x1 + Sunrise Herb x1 + Purified Water x1 + Weeds x1",
};

/**
 * Check if an ingredient has a material explanation
 */
export function getMaterialExplanation(itemId: string): string | null {
	const key = itemId.toLowerCase().trim();
	return MATERIAL_EXPLANATIONS[key] ?? null;
}
