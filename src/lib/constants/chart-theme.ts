/**
 * Chart.js Parchment theme configuration.
 * Activity colors, gradient factories, and global chart styling.
 * Series palette: teal is the accent, orange is the second series (spec 3b);
 * the third series borrows the amber warning hue, kept muted.
 */

import type { ActivityType } from "$lib/stores/dashboard";

export const ACTIVITY_COLORS: Record<ActivityType, string> = {
	grinding: "#16706a",
	hunting: "#ef8f4b",
	crafting: "#c07c2c",
};

export const ACTIVITY_ICONS: Record<ActivityType, string> = {
	grinding: "⚔️",
	hunting: "🏹",
	crafting: "🍳",
};

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
	grinding: "Grinding",
	hunting: "Hunting",
	crafting: "Crafting",
};

export const GRADE_COLORS: Record<string, string> = {
	legendary: "#a8842e",
	epic: "#7d5ba6",
	rare: "#2f6fa8",
	uncommon: "#3f8560",
	common: "#8d8292",
};

export const CHART_COLORS = {
	gridLines: "rgba(32, 33, 31, 0.07)",
	tickLabels: "#6b665d",
	tooltipBg: "#ffffff",
	tooltipBorder: "#e9e4da",
	tooltipText: "#20211f",
};

export function createGradient(
	ctx: CanvasRenderingContext2D,
	color: string,
	height: number,
): CanvasGradient {
	const gradient = ctx.createLinearGradient(0, 0, 0, height);
	gradient.addColorStop(0, color + "4D"); // 30% opacity
	gradient.addColorStop(1, color + "00"); // Transparent
	return gradient;
}

/**
 * Format silver values for chart labels (e.g., 1,200,000 → "1.2M")
 */
export function formatSilverShort(value: number): string {
	if (value >= 1_000_000_000) return (value / 1_000_000_000).toFixed(1) + "B";
	if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + "M";
	if (value >= 1_000) return (value / 1_000).toFixed(0) + "K";
	return value.toString();
}
