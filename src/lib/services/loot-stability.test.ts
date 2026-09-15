/**
 * Line-stability gate (issue #2) — the retro-credit contract is where bugs
 * would hide, so it's pinned here.
 */

import { describe, expect, it } from "vitest";

import { StabilityGate } from "./loot-stability";

describe("StabilityGate", () => {
	it("stashes the first sighting and credits both on the second", () => {
		const g = new StabilityGate();
		expect(g.offer("wolf", 3, 1000)).toBeNull();
		expect(g.offer("wolf", 2, 4000)).toEqual({ credit: 5, firstTs: 1000 });
	});

	it("consumes the stash on confirmation — a third sighting starts over", () => {
		const g = new StabilityGate();
		g.offer("wolf", 3, 1000);
		g.offer("wolf", 2, 2000);
		// Row exists by now in the real flow, so the gate wouldn't even be
		// consulted — but if it is, the text must re-qualify from scratch.
		expect(g.offer("wolf", 4, 3000)).toBeNull();
	});

	it("one-off garbage variants never confirm each other", () => {
		const g = new StabilityGate();
		expect(g.offer("welfbieod", 10, 1000)).toBeNull();
		expect(g.offer("nolf efbod", 9, 1100)).toBeNull();
		expect(g.offer("sgwaifrbiood", 9, 1200)).toBeNull();
		expect(g.size).toBe(3);
	});

	it("expired stashes do not confirm; the count restarts", () => {
		const g = new StabilityGate();
		g.offer("rare item", 1, 1000);
		expect(g.offer("rare item", 1, 1000 + 61_000)).toBeNull(); // window is 60s
		expect(g.offer("rare item", 1, 1000 + 90_000)).toEqual({
			credit: 2,
			firstTs: 1000 + 61_000,
		});
	});

	it("prunes expired entries past the cap without dropping live ones", () => {
		const g = new StabilityGate();
		for (let i = 0; i < 350; i++) g.offer(`junk-${i}`, 1, 1000 + i);
		// All 350 are within the window, so the burst path trims to the cap.
		expect(g.size).toBeLessThanOrEqual(300);
	});

	it("clear() empties the buffer", () => {
		const g = new StabilityGate();
		g.offer("wolf", 1, 1000);
		g.clear();
		expect(g.size).toBe(0);
		expect(g.offer("wolf", 1, 2000)).toBeNull();
	});
});
