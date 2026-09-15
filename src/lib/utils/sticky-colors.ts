/**
 * Sticky color palette for the Notes panel — 6 tones desaturated to read
 * against the Obsidian black slab. Each tone exposes `bg`, `fg`, `border`,
 * and `soft` (~8% fg tint for soft backgrounds). Tones taken verbatim from
 * the design handoff (`docs/archive/features/design_handoff_notes_sidetab/components/shared.jsx`).
 */

import type { StickyColor } from "$lib/models/notes";

export interface StickyTone {
	bg: string;
	fg: string;
	border: string;
	soft: string;
}

export const STICKY_COLORS: Record<StickyColor, StickyTone> = {
	amber:  { bg: "#3a2e16", fg: "#f5d97a", border: "#5a4520", soft: "rgba(245,217,122,0.08)" },
	violet: { bg: "#2e1c3a", fg: "#e1b6ff", border: "#4c2f5c", soft: "rgba(225,182,255,0.08)" },
	cyan:   { bg: "#15303a", fg: "#bdf4ff", border: "#1f4f5c", soft: "rgba(189,244,255,0.08)" },
	rose:   { bg: "#3a1c25", fg: "#ff9eb4", border: "#5c2935", soft: "rgba(255,158,180,0.08)" },
	lime:   { bg: "#1c3a1f", fg: "#a7e08a", border: "#2c5c33", soft: "rgba(167,224,138,0.08)" },
	slate:  { bg: "#22232a", fg: "#cfd3dd", border: "#3a3c46", soft: "rgba(207,211,221,0.06)" },
};

export const STICKY_COLOR_KEYS: StickyColor[] = ["amber", "violet", "cyan", "rose", "lime", "slate"];

export function nextStickyColor(usedColors: StickyColor[]): StickyColor {
	// Pick the first palette tone that isn't already in use; if all 6 are used,
	// cycle from the start based on count modulo 6.
	for (const k of STICKY_COLOR_KEYS) {
		if (!usedColors.includes(k)) return k;
	}
	return STICKY_COLOR_KEYS[usedColors.length % STICKY_COLOR_KEYS.length];
}
