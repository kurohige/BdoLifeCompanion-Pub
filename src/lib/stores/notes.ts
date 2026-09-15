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
 * Design: docs/archive/features/NOTES_SIDETAB_DESIGN.md
 */

import { writable, get } from "svelte/store";
import { invoke } from "@tauri-apps/api/core";
import type {
	Note,
	NoteCategory,
	NoteCategoryKey,
	NotesData,
	StickyColor,
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
/** Epoch ms of the last successful notes save — drives "Saved Ns ago". */
export const notesLastSavedStore = writable<number | null>(null);

// ─────────── ui-only stores (not persisted) ───────────

/**
 * Which category the Scratchpad composer creates notes under. Always defined —
 * seeded to the first category on load.
 */
export const notesCaptureCategoryStore = writable<NoteCategoryKey>("");

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
	notesLastSavedStore.set(Date.now());
	// Tell the other window (main app ↔ detached scratchpad) to reload.
	emitNotesChanged().catch(() => undefined);
}

// ─────────── cross-window sync (main app ↔ detached scratchpad) ───────────
// Both windows run their own copy of this store over the same notes.json.
// Whichever window saves emits `notes-changed`; the other reloads from disk.

async function emitNotesChanged(): Promise<void> {
	const { emit } = await import("@tauri-apps/api/event");
	const { getCurrentWindow } = await import("@tauri-apps/api/window");
	await emit("notes-changed", { source: getCurrentWindow().label });
}

/** Subscribe this window to notes saves made by the other window. */
export async function initNotesSync(): Promise<void> {
	const { listen } = await import("@tauri-apps/api/event");
	const { getCurrentWindow } = await import("@tauri-apps/api/window");
	const myLabel = getCurrentWindow().label;
	await listen<{ source: string }>("notes-changed", (e) => {
		if (e.payload?.source !== myLabel) {
			loadNotesData().catch((err) => console.error("Failed to reload notes after sync:", err));
		}
	});
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

// ─────────── checklist item mutations ───────────
//
// Schema v2: these guard on the FIELD, not on `type`. They used to open with
// `n.type !== "todo"`, which meant the moment a text note carried `items` all
// four no-oped silently — the checkbox did nothing, with no error anywhere.

/** True when this note actually carries a checklist. */
function hasItems(n: Note): boolean {
	return Array.isArray(n.items);
}

export function toggleTodoItem(noteId: string, itemIndex: number): void {
	notesStore.update((ns) =>
		ns.map((n) => {
			if (n.id !== noteId || !hasItems(n)) return n;
			const items = n.items!.map((it, i) => (i === itemIndex ? { ...it, d: !it.d } : it));
			return { ...n, items, updated: Date.now() } as Note;
		}),
	);
	scheduleSave();
}

/** Edit the text of a single checklist item in-place. */
export function setTodoItemText(noteId: string, itemIndex: number, text: string): void {
	notesStore.update((ns) =>
		ns.map((n) => {
			if (n.id !== noteId || !hasItems(n)) return n;
			const items = n.items!.map((it, i) => (i === itemIndex ? { ...it, t: text } : it));
			return { ...n, items, updated: Date.now() } as Note;
		}),
	);
	scheduleSave();
}

/**
 * Append an item. Trimmed; no-op on empty input or at the cap. Unlike its
 * siblings this one may CREATE the array — a note gains a checklist here.
 */
export function addTodoItem(noteId: string, text: string): void {
	const trimmed = text.trim();
	if (!trimmed) return;
	notesStore.update((ns) =>
		ns.map((n) => {
			if (n.id !== noteId) return n;
			const items = Array.isArray(n.items) ? n.items : [];
			if (items.length >= MAX_TODO_ITEMS) return n;
			return {
				...n,
				items: [...items, { t: trimmed, d: false }],
				updated: Date.now(),
			} as Note;
		}),
	);
	scheduleSave();
}

/** Remove a single item by index. */
export function removeTodoItem(noteId: string, itemIndex: number): void {
	notesStore.update((ns) =>
		ns.map((n) => {
			if (n.id !== noteId || !hasItems(n)) return n;
			const items = n.items!.filter((_, i) => i !== itemIndex);
			return { ...n, items, updated: Date.now() } as Note;
		}),
	);
	scheduleSave();
}

/**
 * Insert a blank item after `afterIndex` (-1 prepends). Enter inside the
 * checklist needs this: `addTodoItem` appends and rejects empty text, so it
 * cannot open a new row in the middle of a run.
 */
export function insertTodoItem(noteId: string, afterIndex: number): void {
	notesStore.update((ns) =>
		ns.map((n) => {
			if (n.id !== noteId) return n;
			const items = Array.isArray(n.items) ? n.items : [];
			if (items.length >= MAX_TODO_ITEMS) return n;
			const at = Math.min(Math.max(afterIndex + 1, 0), items.length);
			const next = [...items.slice(0, at), { t: "", d: false }, ...items.slice(at)];
			return { ...n, items: next, updated: Date.now() } as Note;
		}),
	);
	scheduleSave();
}

/** Move one item within the checklist (drag-to-reorder by the ⠿ handle). */
export function moveTodoItem(noteId: string, from: number, to: number): void {
	notesStore.update((ns) =>
		ns.map((n) => {
			if (n.id !== noteId || !hasItems(n)) return n;
			const items = [...n.items!];
			if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) return n;
			const [moved] = items.splice(from, 1);
			items.splice(to, 0, moved);
			return { ...n, items, updated: Date.now() } as Note;
		}),
	);
	scheduleSave();
}

/**
 * Replace a note's title. Trims + clamps to MAX_TITLE_LEN.
 *
 * Deliberately refuses an empty title: quick capture depends on never writing
 * one. The editor, where the title IS clearable, calls `updateNote` directly
 * and clamps itself — do not "fix" this to allow empty.
 */
export function setNoteTitle(id: string, title: string): void {
	const trimmed = title.trim().slice(0, MAX_TITLE_LEN);
	if (!trimmed) return;
	updateNote(id, { title: trimmed } as Partial<Note>);
}

// ─────────── section add/remove (schema v2) ───────────
//
// A note GAINS a section; it never converts from one type to another (updateNote
// keeps `type` for exactly that reason). Section existence is the presence of
// the field: `items === undefined` means no checklist, `when === undefined`
// means no reminder. An empty array or a null `when` means the section is there
// with nothing in it yet.

/** Give a note a checklist with one empty item (rule 4.5). */
export function addChecklistSection(noteId: string): void {
	updateNote(noteId, { items: [{ t: "", d: false }] } as Partial<Note>);
}

/** Take the whole checklist away, items and all. */
export function removeChecklistSection(noteId: string): void {
	updateNote(noteId, { items: undefined } as Partial<Note>);
}

/** Give a note a reminder section with no time set yet (rule 4.10). */
export function addReminderSection(noteId: string): void {
	updateNote(noteId, { when: null, fired: false } as Partial<Note>);
}

/** Take the reminder away — the latch goes with it. */
export function removeReminderSection(noteId: string): void {
	updateNote(noteId, { when: undefined, fired: undefined } as Partial<Note>);
}

/**
 * Set (or clear) a reminder's time. Always resets `fired`: the tick loop latches
 * it permanently and nothing else clears it, so without this a re-timed reminder
 * would never fire again.
 */
export function setNoteWhen(noteId: string, when: number | null): void {
	updateNote(noteId, { when, fired: false } as Partial<Note>);
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
		// Schema v2: fire on the FIELD, not on `type`. Guarding on
		// `type === "reminder"` meant a reminder added to a text note never
		// fired — silently, with nothing in the console.
		for (const n of all) {
			if (n.fired) continue;
			if (n.when == null) continue;
			if (n.when > now) continue;
			fired.push(n.id);
			reminderFireCallback?.(n as ReminderNote);
		}
		if (fired.length > 0) {
			notesStore.update((ns) =>
				ns.map((n) => (fired.includes(n.id) ? ({ ...n, fired: true } as Note) : n)),
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
