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
 * Design: docs/NOTES_SIDETAB_DESIGN.md
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

export const NOTES_SCHEMA_VERSION = 1;

export const MAX_CATEGORIES = 30;
export const MAX_TITLE_LEN = 80;
export const MAX_CATEGORY_NAME_LEN = 24;
export const MAX_BODY_LEN = 4000;
export const MAX_TODO_ITEMS = 20;
