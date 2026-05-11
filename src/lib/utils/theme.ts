import type { AppTheme, ThemeOverrides } from "$lib/services/persistence";

/**
 * The list of inline CSS variables `applyTheme` may write to the documentElement.
 * Kept explicit so we can wipe stale overrides cleanly when the user switches
 * themes — otherwise an obsidian custom primary would bleed into light mode.
 */
const OVERRIDABLE_VARS = [
	"--primary",
	"--ring",
	"--accent",
	"--glow-primary",
	"--glow-primary-rgb",
	"--glow-accent",
	"--glow-accent-rgb",
	"--gold-glow",
	"--gold-glow-rgb",
	"--neon-glow",
] as const;

/**
 * Apply the active theme class plus any user color/glow overrides for that
 * theme. Overrides land as inline CSS vars on `<html>` so they win against
 * the stylesheet without `!important`. Any vars NOT covered by overrides are
 * removed first, so switching theme (or clearing a slot) reverts cleanly to
 * the value baked into app.css.
 */
export function applyTheme(themeId: AppTheme, overrides?: ThemeOverrides): void {
	const html = document.documentElement;
	html.classList.remove("theme-light");
	if (themeId === "light") {
		html.classList.add("theme-light");
	}

	for (const name of OVERRIDABLE_VARS) {
		html.style.removeProperty(name);
	}

	if (!overrides) return;

	if (overrides.primary) {
		const hex = normalizeHex(overrides.primary);
		if (hex) {
			html.style.setProperty("--glow-primary", hex);
			html.style.setProperty("--glow-primary-rgb", hexToRgbTriplet(hex));
			const hsl = hexToHslTriplet(hex);
			html.style.setProperty("--primary", hsl);
			html.style.setProperty("--ring", hsl);
		}
	}

	if (overrides.accent) {
		const hex = normalizeHex(overrides.accent);
		if (hex) {
			html.style.setProperty("--glow-accent", hex);
			html.style.setProperty("--glow-accent-rgb", hexToRgbTriplet(hex));
			html.style.setProperty("--accent", hexToHslTriplet(hex));
		}
	}

	if (overrides.gold) {
		const hex = normalizeHex(overrides.gold);
		if (hex) {
			html.style.setProperty("--gold-glow", hex);
			html.style.setProperty("--gold-glow-rgb", hexToRgbTriplet(hex));
		}
	}

	if (typeof overrides.glow_intensity === "number" && !Number.isNaN(overrides.glow_intensity)) {
		const clamped = Math.max(0, Math.min(2, overrides.glow_intensity));
		html.style.setProperty("--neon-glow", String(clamped));
	}
}

/** Accepts `#abc`, `#aabbcc`, or `aabbcc`; returns canonical `#rrggbb` or null. */
function normalizeHex(input: string): string | null {
	let s = input.trim().toLowerCase();
	if (s.startsWith("#")) s = s.slice(1);
	if (s.length === 3) s = s.split("").map((c) => c + c).join("");
	if (s.length !== 6 || !/^[0-9a-f]{6}$/.test(s)) return null;
	return "#" + s;
}

/** "#c77dff" → "199 125 255" — for use in `rgb(var(--x-rgb) / alpha)`. */
function hexToRgbTriplet(hex: string): string {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return `${r} ${g} ${b}`;
}

/**
 * Convert a hex color to the space-separated HSL components expected by Tailwind's
 * `hsl(var(--token))` consumers (e.g. `275 100% 75%`). Hue is rounded to integer,
 * saturation/lightness are integer percents.
 */
function hexToHslTriplet(hex: string): string {
	const r = parseInt(hex.slice(1, 3), 16) / 255;
	const g = parseInt(hex.slice(3, 5), 16) / 255;
	const b = parseInt(hex.slice(5, 7), 16) / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	let h = 0;
	let s = 0;
	if (max !== min) {
		const d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		switch (max) {
			case r: h = (g - b) / d + (g < b ? 6 : 0); break;
			case g: h = (b - r) / d + 2; break;
			case b: h = (r - g) / d + 4; break;
		}
		h *= 60;
	}
	return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}
