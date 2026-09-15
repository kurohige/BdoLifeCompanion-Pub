/**
 * Shared note formatters. These live here rather than in Scratchpad.svelte
 * because the list window and the editor window both render them and must not
 * drift: a note reading "in 20m" in one window and "Due in 19m" in the other
 * is the kind of thing nobody notices until they trust the wrong one.
 */

import { m } from "$lib/paraglide/messages";
import type { Note } from "$lib/models/notes";

export interface DueChip {
	text: string;
	overdue: boolean;
}

/**
 * The due/overdue chip for any note carrying a time. Takes `Note`, not
 * `ReminderNote` — under schema v2 any note may have a `when`.
 */
export function dueChip(note: Note, now: number): DueChip | null {
	if (note.when == null) return null;
	const diff = note.when - now;
	if (diff <= 0) {
		const t = new Date(note.when).toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit",
			hour12: false,
		});
		return { text: m.scratchpad_was_due({ time: t }), overdue: true };
	}
	const totalMin = Math.ceil(diff / 60_000);
	const h = Math.floor(totalMin / 60);
	const min = totalMin % 60;
	const span = h > 0 ? `${h}h ${min}m` : `${min}m`;
	return { text: m.scratchpad_due_in({ time: span }), overdue: false };
}

/** Coarse "how long since" stamp — days, then hours, then a 1m floor. */
export function ageOf(updated: number, now = Date.now()): string {
	const days = Math.floor((now - updated) / 86_400_000);
	if (days >= 1) return `${days}d`;
	const hours = Math.floor((now - updated) / 3_600_000);
	if (hours >= 1) return `${hours}h`;
	return `${Math.max(1, Math.floor((now - updated) / 60_000))}m`;
}

/** A note is done when it HAS a checklist and every item is checked. */
export function isDone(note: Note): boolean {
	return !!note.items?.length && note.items.every((i) => i.d);
}

/** A note is overdue when it HAS a time and that time has passed. */
export function isOverdue(note: Note, now: number): boolean {
	return note.when != null && note.when <= now;
}
