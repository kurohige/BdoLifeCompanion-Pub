/**
 * Counting-pipeline contracts. The bucket cases pin behaviours the inline
 * session-store code had before the 2026-09-02 extraction (so the move was
 * behaviour-neutral); the tracker cases pin the physical-line model it
 * documents. Threshold VALUES are validated in `loot-replay.test.ts`.
 */

import { describe, expect, it } from "vitest";

import {
	DEFAULT_DEDUP_CONFIG,
	LineTracker,
	LootDedupPipeline,
	TRACKER_CONFIG,
	type DedupConfig,
} from "./loot-dedup";

const hints = new Map<string, number>([["rough_stone", 260]]);
const bucket = (cfg: Partial<DedupConfig> = {}) =>
	new LootDedupPipeline({ ...DEFAULT_DEDUP_CONFIG, strategy: "bucket", ...cfg }, (k) => hints.get(k));

describe("bucket strategy (shipped)", () => {
	it("merges a same-bucket re-read with jittering qty inside the window", () => {
		const p = bucket();
		expect(p.evaluate("rough_stone", 22, 640, 1000).verdict).toBe("applied");
		expect(p.evaluate("rough_stone", 23, 645, 1400).verdict).toBe("dedup"); // Δ1 ≤ max(2, 5.5)
		expect(p.evaluate("rough_stone", 220, 641, 1800).verdict).toBe("dedup"); // digit tail 10×
	});

	it("keeps the ORIGINAL qty as the comparison baseline across merged jitter", () => {
		const p = bucket();
		p.evaluate("rough_stone", 22, 640, 1000);
		p.evaluate("rough_stone", 27, 640, 1200); // merged, baseline stays 22
		// 33 is within 25 % of 27 but not of 22 → still a new drop.
		expect(p.evaluate("rough_stone", 33, 640, 1400).verdict).toBe("applied");
	});

	it("counts the same item at a different Y bucket and after the window", () => {
		const p = bucket();
		p.evaluate("rough_stone", 22, 640, 1000);
		expect(p.evaluate("rough_stone", 22, 822, 1200).verdict).toBe("applied");
		expect(p.evaluate("rough_stone", 22, 640, 1000 + 3000).verdict).toBe("applied");
	});

	it("events without Y share one bucket", () => {
		const p = bucket();
		p.evaluate("rough_stone", 22, undefined, 1000);
		expect(p.evaluate("rough_stone", 22, undefined, 1500).verdict).toBe("dedup");
	});
});

describe("outlier guard + cluster merge (shared)", () => {
	it("rejects above the hard cap, then above the item hint, cold-start safe", () => {
		const p = bucket();
		expect(p.evaluate("rough_stone", 921, 100, 1000)).toEqual({ verdict: "outlier", outlierReason: "hard-cap" });
		expect(p.evaluate("rough_stone", 305, 300, 1000)).toEqual({ verdict: "outlier", outlierReason: "hint" });
		expect(p.evaluate("copper_ore", 305, 300, 1000).verdict).toBe("applied"); // no hint, under floor
	});

	it("median rule needs samples and only fires at/above the floor", () => {
		const p = bucket();
		for (let i = 0; i < 5; i++) p.evaluate("copper_ore", 22, 100 + i * 200, 1000 + i * 4000);
		expect(p.evaluate("copper_ore", 499, 100, 30_000).verdict).toBe("applied"); // under floor 500
		expect(p.evaluate("copper_ore", 550, 300, 34_000)).toEqual({ verdict: "outlier", outlierReason: "median" });
	});

	it("a rejected outlier never seeds the cluster baseline", () => {
		const p = bucket();
		p.evaluate("copper_ore", 900, 100, 1000); // hard cap
		expect(p.evaluate("copper_ore", 22, 300, 1200).verdict).toBe("applied");
	});

	it("cluster merge is directional and short", () => {
		const p = bucket();
		p.evaluate("copper_ore", 42, 100, 1000);
		expect(p.evaluate("copper_ore", 3, 300, 1300).verdict).toBe("cluster"); // 0.07 < 0.15 within 700 ms
		// A suppressed read refreshes the window (a scroll burst keeps
		// suppressing), so the window closes 700 ms after the LAST one.
		expect(p.evaluate("copper_ore", 3, 500, 1300 + 700).verdict).toBe("applied");
		const q = bucket();
		q.evaluate("copper_ore", 3, 100, 1000);
		expect(q.evaluate("copper_ore", 42, 300, 1300).verdict).toBe("applied"); // small → big is a proc
	});

	it("raw keys only get the re-read layer", () => {
		const p = bucket();
		expect(p.evaluate("raw:wolf", 5000, 100, 1000).verdict).toBe("applied");
		expect(p.evaluate("raw:wolf", 5000, 100, 1200).verdict).toBe("dedup");
	});

	it("clear() forgets everything", () => {
		const p = bucket();
		p.evaluate("rough_stone", 22, 640, 1000);
		p.clear();
		expect(p.evaluate("rough_stone", 22, 640, 1100).verdict).toBe("applied");
	});
});

describe("LineTracker (A/B strategy)", () => {
	const tracker = () => new LineTracker(TRACKER_CONFIG);

	it("a moved-up compatible read is a re-read and updates the position", () => {
		const t = tracker();
		expect(t.check("copper_ore", 22, 822, 1000)).toBe(true);
		expect(t.check("copper_ore", 22, 640, 1300)).toBe(false);
		expect(t.check("copper_ore", 22, 458, 1600)).toBe(false);
		expect(t.size).toBe(1);
	});

	it("a read BELOW the last-known position is always a new line", () => {
		const t = tracker();
		t.check("copper_ore", 22, 640, 1000);
		expect(t.check("copper_ore", 22, 822, 1200)).toBe(true);
	});

	it("a same-slot repeat is a re-read until another line enters, then a new drop", () => {
		const t = tracker();
		t.check("rough_stone", 22, 822, 1000);
		expect(t.check("rough_stone", 22, 825, 1300)).toBe(false);
		t.check("fairy_powder", 2, 822, 1500); // new line → everything displaced
		expect(t.check("rough_stone", 22, 822, 1800)).toBe(true);
	});

	it("respects the re-read gap and lifetime", () => {
		const t = tracker();
		t.check("rough_stone", 22, 822, 1000);
		expect(t.check("rough_stone", 22, 640, 1000 + TRACKER_CONFIG.trackerRereadGapMs + 1)).toBe(true);
	});

	it("pipeline routes to the tracker when configured", () => {
		const p = new LootDedupPipeline(TRACKER_CONFIG);
		p.evaluate("copper_ore", 22, 822, 1000);
		expect(p.evaluate("copper_ore", 22, 640, 1300).verdict).toBe("dedup");
	});
});
