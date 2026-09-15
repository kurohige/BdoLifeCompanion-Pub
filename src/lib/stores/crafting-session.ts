/**
 * Live crafting session — the status strip's running timer (spec 5a).
 *
 * The session is a stopwatch + counters, not a second log: every craft is
 * still written into the crafting log by the existing "Log a craft" flow
 * (addCraftingSession); a running session just accumulates what was logged
 * while it ran so the strip can show `elapsed · N crafted · rate/hr`.
 * "Stop & log" therefore only stops the clock — the entries are already in
 * the log — keeping one source of truth.
 */

import { writable, derived, get } from "svelte/store";
import { tickStore } from "./boss-timer";
import type { RecipeCategory } from "$lib/models/recipe";

export interface LiveCraftingSession {
	isPaused: boolean;
	category: RecipeCategory;
	/** Wall-clock ms accumulated across pauses. */
	accumulatedMs: number;
	/** Epoch ms of the last (re)start; meaningful while not paused. */
	resumedAtMs: number;
	/** Items crafted (inputs consumed) while the session ran. */
	crafted: number;
	/** Items yielded while the session ran. */
	yielded: number;
}

export const craftingSessionStore = writable<LiveCraftingSession | null>(null);

export function startCraftingSession(category: RecipeCategory): void {
	craftingSessionStore.set({
		isPaused: false,
		category,
		accumulatedMs: 0,
		resumedAtMs: Date.now(),
		crafted: 0,
		yielded: 0,
	});
}

export function pauseCraftingSession(): void {
	craftingSessionStore.update((s) => {
		if (!s || s.isPaused) return s;
		return { ...s, isPaused: true, accumulatedMs: s.accumulatedMs + (Date.now() - s.resumedAtMs) };
	});
}

export function resumeCraftingSession(): void {
	craftingSessionStore.update((s) => {
		if (!s || !s.isPaused) return s;
		return { ...s, isPaused: false, resumedAtMs: Date.now() };
	});
}

/** Stop the clock. Log entries were written as crafts were logged. */
export function stopCraftingSession(): void {
	craftingSessionStore.set(null);
}

/** Called by the "Log a craft" flow so a running session counts it. */
export function recordCraftInSession(crafted: number, yielded: number): void {
	craftingSessionStore.update((s) =>
		s ? { ...s, crafted: s.crafted + crafted, yielded: s.yielded + yielded } : s,
	);
}

export function craftingSessionElapsedMs(s: LiveCraftingSession, nowMs: number): number {
	return s.accumulatedMs + (s.isPaused ? 0 : nowMs - s.resumedAtMs);
}

/** `HH:MM:SS` elapsed display, ticking on the shared 1s tick. */
export const craftingSessionDisplay = derived(
	[craftingSessionStore, tickStore],
	([$s, $tick]) => {
		if (!$s) return "";
		const total = Math.max(0, Math.floor(craftingSessionElapsedMs($s, $tick) / 1000));
		const h = Math.floor(total / 3600);
		const min = Math.floor((total % 3600) / 60);
		const sec = total % 60;
		return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
	},
);

/** Crafts per hour, guarded below one minute of runtime (mirrors Silver/hr). */
export const craftingSessionRate = derived(
	[craftingSessionStore, tickStore],
	([$s, $tick]) => {
		if (!$s) return null;
		const ms = craftingSessionElapsedMs($s, $tick);
		if (ms < 60_000 || $s.crafted === 0) return null;
		return Math.round(($s.crafted * 3_600_000) / ms);
	},
);

export function isCraftingSessionActive(): boolean {
	return get(craftingSessionStore) !== null;
}
