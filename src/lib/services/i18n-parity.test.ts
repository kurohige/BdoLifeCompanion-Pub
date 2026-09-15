/**
 * Locale parity — reads the shipped message catalogues directly.
 *
 * Spanish drifts silently: a new English key renders as the raw key name (or
 * falls back to English) with no build error, so the gap only shows up when
 * someone switches language. These tests are the tripwire.
 */

import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import es from "../../../messages/es.json";

type Catalogue = Record<string, string>;

/** `$schema` is tooling metadata, not a message. */
function messages(raw: unknown): Catalogue {
	const out: Catalogue = {};
	for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
		if (key === "$schema") continue;
		out[key] = value as string;
	}
	return out;
}

const EN = messages(en);
const ES = messages(es);

/** `{ship}`, `{count}`, ... — a dropped placeholder renders as a literal brace. */
function placeholders(text: string): string[] {
	return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

describe("locale parity", () => {
	it("translates every English key", () => {
		const missing = Object.keys(EN).filter((k) => !(k in ES));
		expect(missing, `untranslated keys: ${missing.join(", ")}`).toEqual([]);
	});

	it("carries no Spanish key the English catalogue has dropped", () => {
		const orphans = Object.keys(ES).filter((k) => !(k in EN));
		expect(orphans, `orphaned keys: ${orphans.join(", ")}`).toEqual([]);
	});

	it("keeps the same placeholders in both languages", () => {
		const broken: string[] = [];
		for (const [key, text] of Object.entries(EN)) {
			const spanish = ES[key];
			if (spanish === undefined) continue;
			const a = placeholders(text);
			const b = placeholders(spanish);
			if (a.join(",") !== b.join(",")) {
				broken.push(`${key}: en(${a.join(",")}) vs es(${b.join(",")})`);
			}
		}
		expect(broken, broken.join("\n")).toEqual([]);
	});

	it("leaves no message empty", () => {
		for (const [key, text] of Object.entries(ES)) {
			expect(text.trim(), `empty Spanish message: ${key}`).not.toBe("");
		}
	});
});
