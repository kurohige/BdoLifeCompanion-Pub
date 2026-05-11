/**
 * Reactive locale signal — Svelte 5 $state rune that all paraglide message
 * functions read from. Updating it via setCurrentLocale() re-renders every
 * template that called m.foo() without needing a page reload.
 *
 * Wiring: overwriteGetLocale() replaces paraglide's runtime getter with our
 * rune-backed one. Templates calling m.foo() → getLocale() → getCurrentLocale()
 * → reads _locale, which Svelte 5 tracks as a reactive dependency.
 */

import { overwriteGetLocale } from "$lib/paraglide/runtime";
import type { Locale } from "$lib/services/persistence";

let _locale = $state<Locale>("en");

export function getCurrentLocale(): Locale {
	return _locale;
}

export function setCurrentLocale(value: Locale): void {
	_locale = value;
}

// Wire on module load so any later m.foo() calls go through us.
overwriteGetLocale(getCurrentLocale);
