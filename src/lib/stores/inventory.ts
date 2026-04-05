/**
 * Inventory store - manages item quantities with persistence
 */

import { writable, get } from "svelte/store";
import { loadInventory, saveInventory } from "$lib/services/persistence";
import { save, open } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";

// Inventory: Map<itemId, quantity>
export const inventoryStore = writable<Map<string, number>>(new Map());

// Loading state
export const inventoryLoadingStore = writable<boolean>(true);

// Debounce timer for auto-save
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Initialize inventory - load from disk
 */
export async function initInventory(): Promise<void> {
	inventoryLoadingStore.set(true);
	try {
		const inventory = await loadInventory();
		inventoryStore.set(inventory);
	} catch (error) {
		console.error("Failed to initialize inventory:", error);
	} finally {
		inventoryLoadingStore.set(false);
	}
}

/**
 * Save inventory with debounce (500ms)
 */
function debouncedSave() {
	if (saveTimeout) {
		clearTimeout(saveTimeout);
	}
	saveTimeout = setTimeout(async () => {
		try {
			const inventory = get(inventoryStore);
			await saveInventory(inventory);
		} catch (error) {
			console.error("Failed to save inventory:", error);
		}
	}, 500);
}

/**
 * Get quantity for an item
 */
export function getInventoryQuantity(itemId: string): number {
	const inventory = get(inventoryStore);
	return inventory.get(itemId.toLowerCase()) ?? 0;
}

/**
 * Set inventory quantity for an item
 */
export function setInventoryQuantity(itemId: string, quantity: number): void {
	inventoryStore.update((inv) => {
		const newInv = new Map(inv);
		const key = itemId.toLowerCase();
		if (quantity <= 0) {
			newInv.delete(key);
		} else {
			newInv.set(key, quantity);
		}
		return newInv;
	});
	debouncedSave();
}

/**
 * Add to inventory
 */
export function addToInventory(itemId: string, amount: number): void {
	inventoryStore.update((inv) => {
		const newInv = new Map(inv);
		const key = itemId.toLowerCase();
		const currentQty = newInv.get(key) ?? 0;
		newInv.set(key, currentQty + amount);
		return newInv;
	});
	debouncedSave();
}

/**
 * Consume from inventory
 */
export function consumeFromInventory(itemId: string, amount: number): void {
	inventoryStore.update((inv) => {
		const newInv = new Map(inv);
		const key = itemId.toLowerCase();
		const currentQty = newInv.get(key) ?? 0;
		const newQty = Math.max(0, currentQty - amount);
		if (newQty === 0) {
			newInv.delete(key);
		} else {
			newInv.set(key, newQty);
		}
		return newInv;
	});
	debouncedSave();
}

/**
 * Clear all inventory
 */
export function clearInventory(): void {
	inventoryStore.set(new Map());
	debouncedSave();
}

/**
 * Get all inventory items as array (for display)
 */
export function getInventoryItems(): Array<{ itemId: string; quantity: number }> {
	const inventory = get(inventoryStore);
	const items: Array<{ itemId: string; quantity: number }> = [];
	for (const [itemId, quantity] of inventory) {
		items.push({ itemId, quantity });
	}
	return items.sort((a, b) => a.itemId.localeCompare(b.itemId));
}

/**
 * Export inventory to CSV file
 */
export async function exportInventoryToCSV(): Promise<boolean> {
	try {
		const filePath = await save({
			defaultPath: "inventory.csv",
			filters: [{ name: "CSV Files", extensions: ["csv"] }],
		});

		if (!filePath) return false;

		const inventory = get(inventoryStore);
		const lines = ["Item,Quantity"];

		for (const [itemId, quantity] of inventory) {
			// Escape commas and quotes in item names
			const escapedId = itemId.includes(",") || itemId.includes('"')
				? `"${itemId.replace(/"/g, '""')}"`
				: itemId;
			lines.push(`${escapedId},${quantity}`);
		}

		await writeTextFile(filePath, lines.join("\n"));
		return true;
	} catch (error) {
		console.error("Failed to export inventory:", error);
		return false;
	}
}

/**
 * Import inventory from CSV file
 */
export async function importInventoryFromCSV(merge: boolean = false): Promise<boolean> {
	try {
		const filePath = await open({
			filters: [{ name: "CSV Files", extensions: ["csv"] }],
			multiple: false,
		});

		if (!filePath || Array.isArray(filePath)) return false;

		const content = await readTextFile(filePath);
		const lines = content.split(/\r?\n/).filter(line => line.trim());

		// Skip header if present
		const startIndex = lines[0]?.toLowerCase().includes("item") ? 1 : 0;

		const newInventory = merge ? new Map(get(inventoryStore)) : new Map<string, number>();

		for (let i = startIndex; i < lines.length; i++) {
			const line = lines[i].trim();
			if (!line) continue;

			// Parse CSV line (handle quoted values)
			let itemId: string;
			let quantity: number;

			if (line.startsWith('"')) {
				// Quoted item name
				const endQuote = line.indexOf('",', 1);
				if (endQuote === -1) continue;
				itemId = line.slice(1, endQuote).replace(/""/g, '"');
				quantity = parseInt(line.slice(endQuote + 2), 10);
			} else {
				// Simple case
				const parts = line.split(",");
				if (parts.length < 2) continue;
				itemId = parts[0].trim();
				quantity = parseInt(parts[1].trim(), 10);
			}

			if (itemId && !isNaN(quantity) && quantity > 0) {
				const key = itemId.toLowerCase();
				if (merge) {
					newInventory.set(key, (newInventory.get(key) ?? 0) + quantity);
				} else {
					newInventory.set(key, quantity);
				}
			}
		}

		inventoryStore.set(newInventory);
		debouncedSave();
		return true;
	} catch (error) {
		console.error("Failed to import inventory:", error);
		return false;
	}
}
