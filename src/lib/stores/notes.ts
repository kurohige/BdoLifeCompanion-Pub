/**
 * Notes (Codex Library) store.
 *
 * Owns:
 *   - notesStore: all notes
 *   - noteCategoriesStore: all categories
 *   - UI-only stores for panel open/active filter/capture-bound category/search
 *
 * Persistence: single `notes.json` via `load_notes` / `save_notes` Rust commands.
 * Writes are debounced 300ms (matches the bartering-routes pattern). Mutations
 * touch the store first (optimistic UI) then schedule a save.
 *
 * Design: docs/NOTES_SIDETAB_DESIGN.md
 */

import { writable, get } from "svelte/store";
import { invoke } from "@tauri-apps/api/core";
import type {
	Note,
	NoteCategory,
	NoteCategoryKey,
	NotesData,
	StickyColor,
	TodoNote,
	ReminderNote,
} from "$lib/models/notes";
import {
	NOTES_SCHEMA_VERSION,
	MAX_CATEGORIES,
	MAX_TITLE_LEN,
	MAX_CATEGORY_NAME_LEN,
	MAX_TODO_ITEMS,
} from "$lib/models/notes";
import { STICKY_COLOR_KEYS, nextStickyColor } from "$lib/utils/sticky-colors";
import { newId } from "$lib/utils/note-parser";

// ─────────── persisted stores ───────────

export const notesStore = writable<Note[]>([]);
export const noteCategoriesStore = writable<NoteCategory[]>([]);
export const notesLoadingStore = writable<boolean>(true);

// ─────────── ui-only stores (not persisted, but live across panel open/close) ───────────

export const notesPanelOpenStore = writable<boolean>(false);
/** Currently filtered category key. `null` = "all" (show all categories). */
export const notesActiveCategoryStore = writable<NoteCategoryKey | null>(null);
/**
 * Which category the command line creates notes under. Always defined —
 * decoupled from `notesActiveCategoryStore` because the user might be filtering
 * "all" but still want capture to land somewhere predictable.
 */
export const notesCaptureCategoryStore = writable<NoteCategoryKey>("");
export const notesSearchStore = writable<string>("");

// ─────────── persistence ───────────

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
const SAVE_DEBOUNCE_MS = 300;

function scheduleSave(): void {
	if (saveTimeout) clearTimeout(saveTimeout);
	saveTimeout = setTimeout(() => {
		saveNotesData().catch((e) => console.error("Failed to save notes:", e));
		saveTimeout = null;
	}, SAVE_DEBOUNCE_MS);
}

async function saveNotesData(): Promise<void> {
	const data: NotesData = {
		schema_version: NOTES_SCHEMA_VERSION,
		categories: get(noteCategoriesStore),
		notes: get(notesStore),
	};
	await invoke("save_notes", { data });
}

/** Force-flush any pending debounced save. Called from the close handler. */
export async function flushNotes(): Promise<void> {
	if (saveTimeout) {
		clearTimeout(saveTimeout);
		saveTimeout = null;
	}
	try {
		await saveNotesData();
	} catch (e) {
		console.error("Failed to flush notes:", e);
	}
}

/**
 * Seed the default category set on a fresh install. English defaults — user
 * renames inline. Once seeded, names are stored literally (don't re-translate
 * on locale change).
 */
function seedDefaultCategories(): NoteCategory[] {
	const now = Date.now();
	const seeds: { name: string; color: StickyColor }[] = [
		{ name: "Bosses", color: "amber" },
		{ name: "Bartering", color: "violet" },
		{ name: "Crafting", color: "cyan" },
		{ name: "Reminders", color: "rose" },
		{ name: "Dailies", color: "lime" },
		{ name: "General", color: "slate" },
	];
	return seeds.map((s, i) => ({
		key: newId(),
		name: s.name,
		color: s.color,
		order: i,
		created: now + i,
	}));
}

export async function loadNotesData(): Promise<void> {
	notesLoadingStore.set(true);
	try {
		const data = await invoke<NotesData>("load_notes");
		let categories = Array.isArray(data?.categories) ? data.categories : [];
		const notes = Array.isArray(data?.notes) ? data.notes : [];
		let seededFresh = false;
		if (categories.length === 0) {
			categories = seedDefaultCategories();
			seededFresh = true;
		}
		noteCategoriesStore.set(categories);
		notesStore.set(notes);
		notesCaptureCategoryStore.set(categories[0]?.key ?? "");
		if (seededFresh) {
			// Persist seed immediately so the next launch finds the file populated.
			await saveNotesData();
		}
	} catch (e) {
		console.error("Failed to load notes:", e);
		const seeds = seedDefaultCategories();
		noteCategoriesStore.set(seeds);
		notesStore.set([]);
		notesCaptureCategoryStore.set(seeds[0]?.key ?? "");
	} finally {
		notesLoadingStore.set(false);
	}
}

// ─────────── category mutations ───────────

export function addCategory(rawName: string): NoteCategory | null {
	const cats = get(noteCategoriesStore);
	if (cats.length >= MAX_CATEGORIES) return null;
	const name = (rawName.trim() || "New category").slice(0, MAX_CATEGORY_NAME_LEN);
	const usedColors = cats.map((c) => c.color);
	const color = nextStickyColor(usedColors);
	const cat: NoteCategory = {
		key: newId(),
		name,
		color,
		order: cats.length,
		created: Date.now(),
	};
	noteCategoriesStore.set([...cats, cat]);
	scheduleSave();
	return cat;
}

export function renameCategory(key: NoteCategoryKey, rawName: string): void {
	const name = rawName.trim().slice(0, MAX_CATEGORY_NAME_LEN);
	if (!name) return;
	noteCategoriesStore.update((cats) =>
		cats.map((c) => (c.key === key ? { ...c, name } : c)),
	);
	scheduleSave();
}

export function recolorCategory(key: NoteCategoryKey, color: StickyColor): void {
	if (!STICKY_COLOR_KEYS.includes(color)) return;
	noteCategoriesStore.update((cats) =>
		cats.map((c) => (c.key === key ? { ...c, color } : c)),
	);
	scheduleSave();
}

/**
 * Delete a category and all its notes. The UI must prevent deleting the last
 * category (we silently no-op here). If the deleted category was active or
 * bound to capture, fall back to the first remaining category.
 */
export function deleteCategory(key: NoteCategoryKey): void {
	const cats = get(noteCategoriesStore);
	if (cats.length <= 1) return;
	const remaining = cats.filter((c) => c.key !== key);
	noteCategoriesStore.set(remaining);
	notesStore.update((ns) => ns.filter((n) => n.category_key !== key));
	if (get(notesActiveCategoryStore) === key) {
		notesActiveCategoryStore.set(null);
	}
	if (get(notesCaptureCategoryStore) === key) {
		notesCaptureCategoryStore.set(remaining[0]?.key ?? "");
	}
	scheduleSave();
}

// ─────────── note mutations ───────────

export function addNote(note: Note): void {
	notesStore.update((ns) => [note, ...ns]);
	scheduleSave();
}

export function updateNote(id: string, patch: Partial<Note>): void {
	notesStore.update((ns) =>
		ns.map((n) => {
			if (n.id !== id) return n;
			// Spread patch onto n, force updated, keep type from n (patch can't change type).
			return { ...n, ...patch, type: n.type, updated: Date.now() } as Note;
		}),
	);
	scheduleSave();
}

export function deleteNote(id: string): void {
	notesStore.update((ns) => ns.filter((n) => n.id !== id));
	scheduleSave();
}

export function togglePinNote(id: string): void {
	notesStore.update((ns) =>
		ns.map((n) => (n.id === id ? ({ ...n, pinned: !n.pinned, updated: Date.now() } as Note) : n)),
	);
	scheduleSave();
}

export function toggleTodoItem(noteId: string, itemIndex: number): void {
	notesStore.update((ns) =>
		ns.map((n) => {
			if (n.id !== noteId || n.type !== "todo") return n;
			const todo = n as TodoNote;
			const items = todo.items.map((it, i) => (i === itemIndex ? { ...it, d: !it.d } : it));
			return { ...todo, items, updated: Date.now() } as Note;
		}),
	);
	scheduleSave();
}

/** Edit the text of a single todo item in-place. */
export function setTodoItemText(noteId: string, itemIndex: number, text: string): void {
	notesStore.update((ns) =>
		ns.map((n) => {
			if (n.id !== noteId || n.type !== "todo") return n;
			const todo = n as TodoNote;
			const items = todo.items.map((it, i) => (i === itemIndex ? { ...it, t: text } : it));
			return { ...todo, items, updated: Date.now() } as Note;
		}),
	);
	scheduleSave();
}

/** Append a new item to a todo note. Trimmed; no-op on empty input or when cap reached. */
export function addTodoItem(noteId: string, text: string): void {
	const trimmed = text.trim();
	if (!trimmed) return;
	notesStore.update((ns) =>
		ns.map((n) => {
			if (n.id !== noteId || n.type !== "todo") return n;
			const todo = n as TodoNote;
			if (todo.items.length >= MAX_TODO_ITEMS) return n;
			return {
				...todo,
				items: [...todo.items, { t: trimmed, d: false }],
				updated: Date.now(),
			} as Note;
		}),
	);
	scheduleSave();
}

/** Remove a single item from a todo note by index. */
export function removeTodoItem(noteId: string, itemIndex: number): void {
	notesStore.update((ns) =>
		ns.map((n) => {
			if (n.id !== noteId || n.type !== "todo") return n;
			const todo = n as TodoNote;
			const items = todo.items.filter((_, i) => i !== itemIndex);
			return { ...todo, items, updated: Date.now() } as Note;
		}),
	);
	scheduleSave();
}

/**
 * Replace a note's title. Trims + clamps to MAX_TITLE_LEN.
 */
export function setNoteTitle(id: string, title: string): void {
	const trimmed = title.trim().slice(0, MAX_TITLE_LEN);
	if (!trimmed) return;
	updateNote(id, { title: trimmed } as Partial<Note>);
}

// ─────────── reminder firing (tick loop) ───────────

let reminderInterval: ReturnType<typeof setInterval> | null = null;
let reminderFireCallback: ((r: ReminderNote) => void) | null = null;

/**
 * Register the callback that fires when a reminder's `when` time arrives.
 * Caller (page-level) wires this to toast + sound. We expose a callback rather
 * than importing toast/audio here to keep the store layer free of UI deps.
 */
export function setReminderFireCallback(cb: (r: ReminderNote) => void): void {
	reminderFireCallback = cb;
}

export function startReminderTick(): void {
	if (reminderInterval) return;
	const tick = () => {
		const now = Date.now();
		const fired: string[] = [];
		const all = get(notesStore);
		for (const n of all) {
			if (n.type !== "reminder") continue;
			const r = n as ReminderNote;
			if (r.fired) continue;
			if (r.when == null) continue;
			if (r.when > now) continue;
			fired.push(r.id);
			reminderFireCallback?.(r);
		}
		if (fired.length > 0) {
			notesStore.update((ns) =>
				ns.map((n) => (fired.includes(n.id) && n.type === "reminder" ? ({ ...n, fired: true } as Note) : n)),
			);
			scheduleSave();
		}
	};
	// Run once immediately so reminders past-due at app start fire on the next
	// frame, not 30s in.
	tick();
	reminderInterval = setInterval(tick, 30_000);
}

export function stopReminderTick(): void {
	if (reminderInterval) {
		clearInterval(reminderInterval);
		reminderInterval = null;
	}
}
