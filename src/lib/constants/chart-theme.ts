/**
 * Chart.js cyberpunk theme configuration.
 * Activity colors, gradient factories, and global chart styling.
 */

import type { ActivityType } from "$lib/stores/dashboard";

export const ACTIVITY_COLORS: Record<ActivityType, string> = {
	grinding: "#00E5FF",
	hunting: "#00FF9D",
	crafting: "#C77DFF",
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
	legendary: "#EAB308",
	epic: "#A855F7",
	rare: "#3B82F6",
	uncommon: "#22C55E",
	common: "#6B7280",
};

export const CHART_COLORS = {
	gridLines: "rgba(255, 255, 255, 0.06)",
	tickLabels: "#808080",
	tooltipBg: "rgba(10, 10, 10, 0.95)",
	tooltipBorder: "#333333",
	tooltipText: "#F0F0F0",
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
