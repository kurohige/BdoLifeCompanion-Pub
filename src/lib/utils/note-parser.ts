/**
 * Quick-capture command parser for the Notes panel command line.
 *
 * MVP grammar (slash prefix only):
 *   /todo <text>     -> TodoNote (one item)
 *   /remind <text>   -> ReminderNote with when=null (user picks time later)
 *   /note <text>     -> TextNote
 *   <text>           -> TextNote (default)
 *
 * Trailing `#tag` (last whitespace-separated word starting with #) is captured
 * onto every note type's `tag` field.
 *
 * Returns `null` for empty input. Caller is responsible for assigning the note
 * to the active category and persisting it.
 */

import type { Note, NoteCategoryKey, TodoNote, ReminderNote, TextNote } from "$lib/models/notes";
import { MAX_TITLE_LEN, MAX_BODY_LEN } from "$lib/models/notes";

function newId(): string {
	// Simple time-based id with random suffix. Not a true ULID but collision-resistant
	// at single-user volumes and stable in local storage.
	return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

interface ParsedInput {
	tag: string | null;
	body: string;
	command: "todo" | "remind" | "note" | null;
}

function extractTag(input: string): { body: string; tag: string | null } {
	// Match a trailing `#word` preceded by whitespace OR start-of-string.
	// Tag must start with #, then word chars / hyphens.
	const m = input.match(/(^|\s)(#[\w][\w-]*)\s*$/);
	if (!m) return { body: input.trim(), tag: null };
	const tagStart = m.index! + m[1].length;
	return {
		body: input.slice(0, tagStart).trim(),
		tag: m[2],
	};
}

function parsePrefix(input: string): ParsedInput {
	const { body, tag } = extractTag(input);
	const lower = body.toLowerCase();
	if (lower.startsWith("/todo ") || lower === "/todo") {
		return { body: body.slice(5).trim(), tag, command: "todo" };
	}
	if (lower.startsWith("/remind ") || lower === "/remind") {
		return { body: body.slice(7).trim(), tag, command: "remind" };
	}
	if (lower.startsWith("/note ") || lower === "/note") {
		return { body: body.slice(5).trim(), tag, command: "note" };
	}
	return { body, tag, command: null };
}

export function parseCapture(input: string, categoryKey: NoteCategoryKey): Note | null {
	const trimmed = input.trim();
	if (!trimmed) return null;

	const { body, tag, command } = parsePrefix(trimmed);
	if (!body) return null;

	const now = Date.now();
	const title = body.slice(0, MAX_TITLE_LEN);

	const base = {
		id: newId(),
		category_key: categoryKey,
		pinned: false,
		title,
		tag,
		created: now,
		updated: now,
	};

	if (command === "todo") {
		const todo: TodoNote = {
			...base,
			type: "todo",
			items: [{ t: body, d: false }],
		};
		return todo;
	}

	if (command === "remind") {
		const reminder: ReminderNote = {
			...base,
			type: "reminder",
			when: null,
			body: "",
			fired: false,
		};
		return reminder;
	}

	// Default: text note. command === "note" or null.
	const text: TextNote = {
		...base,
		type: "text",
		body: body.slice(0, MAX_BODY_LEN),
	};
	return text;
}

export { newId };
