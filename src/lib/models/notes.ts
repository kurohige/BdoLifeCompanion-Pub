/**
 * Notes (Codex Library) model.
 *
 * A user-facing notepad split into color-coded categories. Three note types
 * share a common header (id, category, pinned, title, tag, created, updated)
 * and diverge on body shape:
 *   - text:     freeform body
 *   - todo:     array of items {t, d}
 *   - reminder: optional unix-ms `when` + body + `fired` latch
 *
 * Persistence: single `notes.json` file containing both categories and notes
 * (load_notes / save_notes Rust commands).
 *
 * Design: docs/archive/features/NOTES_SIDETAB_DESIGN.md
 */

export type NoteId = string;
export type NoteCategoryKey = string;
export type StickyColor = "amber" | "violet" | "cyan" | "rose" | "lime" | "slate";
export type NoteType = "text" | "todo" | "reminder";

export interface NoteCategory {
	key: NoteCategoryKey;
	name: string;
	color: StickyColor;
	order: number;
	created: number;
}

interface NoteBase {
	id: NoteId;
	category_key: NoteCategoryKey;
	pinned: boolean;
	title: string;
	tag: string | null;
	created: number;
	updated: number;
	// v2 — any note may carry any of these. The three interfaces below still
	// REQUIRE their own field, so `type` narrowing is unchanged.
	//
	// The undefined/null split is load-bearing on `when` and `items`: absent
	// means "this note has no reminder / no checklist section", while `null`
	// (or `[]`) means "the section exists, its value is unset". The editor's
	// ADD row reads section existence off exactly that distinction, and the
	// Rust side preserves it (see the double Option on `when` in lib.rs).
	body?: string;
	items?: TodoItem[];
	when?: number | null;
	fired?: boolean;
}

export interface TextNote extends NoteBase {
	type: "text";
	body: string;
}

export interface TodoItem {
	t: string;
	d: boolean;
}

export interface TodoNote extends NoteBase {
	type: "todo";
	items: TodoItem[];
}

export interface ReminderNote extends NoteBase {
	type: "reminder";
	when: number | null;
	body: string;
	fired: boolean;
}

export type Note = TextNote | TodoNote | ReminderNote;

export interface NotesData {
	schema_version: number;
	categories: NoteCategory[];
	notes: Note[];
}

/**
 * v2 (2026-09-01): payload fields moved onto the base as optional, so one note
 * can hold prose AND a checklist AND a time. `type` now says only how the list
 * summarises a note — it is not what the note is, and nothing converts between
 * types. No migration: absent fields read as undefined and no note is rewritten.
 */
export const NOTES_SCHEMA_VERSION = 2;

export const MAX_CATEGORIES = 30;
export const MAX_TITLE_LEN = 80;
export const MAX_CATEGORY_NAME_LEN = 24;
export const MAX_BODY_LEN = 4000;
export const MAX_TODO_ITEMS = 20;
