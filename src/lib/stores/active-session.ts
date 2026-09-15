/**
 * Active-session aggregator — the overlay widgets show "whichever session is
 * running", identified by its nav icon plus its place name (spec 8d). Today
 * that is the grinding countdown timer; the Phase-3 crafting session plugs in
 * here so the widgets never need to know about individual stores.
 */

import { derived } from "svelte/store";
import {
	grindingTimerStore,
	grindingTimerDisplay,
	grindingTimerProgress,
	selectedSpotStore,
} from "./grinding";
import { craftingSessionStore, craftingSessionDisplay } from "./crafting-session";

export interface ActiveSession {
	kind: "grinding" | "crafting";
	/** Nav icon path for the running activity. */
	icon: string;
	/** Where / what — spot name, recipe name. */
	place: string;
	/** Formatted timer string. */
	display: string;
	/** 0-1 remaining fraction for progress rings, or null when open-ended. */
	progress: number | null;
	paused: boolean;
}

export const activeSessionStore = derived(
	[grindingTimerStore, grindingTimerDisplay, grindingTimerProgress, selectedSpotStore, craftingSessionStore, craftingSessionDisplay],
	([$timer, $display, $progress, $spot, $craft, $craftDisplay]): ActiveSession | null => {
		if ($craft) {
			return {
				kind: "crafting",
				icon: `/icons/${$craft.category === "draughts" ? "draught" : $craft.category}.png`,
				place: "",
				display: $craftDisplay,
				progress: null,
				paused: $craft.isPaused,
			};
		}
		if ($timer.isRunning || $timer.isPaused) {
			return {
				kind: "grinding",
				icon: "/icons/grinding.png",
				place: $spot?.name ?? "",
				display: $display,
				progress: $progress,
				paused: $timer.isPaused,
			};
		}
		return null;
	},
);
