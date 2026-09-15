<!--
	Note editor — the second notes window (spec 14b). Holds exactly ONE note at
	a time; which one lives in `note_editing_id` (settings), so the list window
	pointing it somewhere else is a content swap, not a reload.

	Schema v2: a note GAINS a checklist or a reminder, it never converts from
	one type to another. `type` is left alone here — it only tells the list how
	to summarise the note.

	Saving is automatic (400ms here, then the store's own 300ms) and there is
	deliberately no Save button and no dirty state.
-->
<script lang="ts">
	import { tick } from "svelte";
	import { getCurrentWindow } from "@tauri-apps/api/window";
	import {
		notesStore,
		noteCategoriesStore,
		notesLastSavedStore,
		updateNote,
		deleteNote,
		togglePinNote,
		toggleTodoItem,
		setTodoItemText,
		removeTodoItem,
		insertTodoItem,
		moveTodoItem,
		addChecklistSection,
		removeChecklistSection,
		addReminderSection,
		removeReminderSection,
		setNoteWhen,
		addCategory,
	} from "$lib/stores/notes";
	import { settingsStore } from "$lib/stores/settings";
	import { tickStore } from "$lib/stores/boss-timer";
	import { MAX_TITLE_LEN, MAX_BODY_LEN, MAX_TODO_ITEMS } from "$lib/models/notes";
	import type { Note, StickyColor } from "$lib/models/notes";
	import { STICKY_COLORS } from "$lib/utils/sticky-colors";
	import { dueChip, ageOf } from "$lib/utils/note-format";
	import { getNextDailyReset } from "$lib/utils/reset";
	import { m } from "$lib/paraglide/messages";

	/** Cold-start fallback: the ?id= the window was launched with, used only
	    until settings load and `note_editing_id` takes over. */
	let { fallbackId = null }: { fallbackId?: string | null } = $props();

	const heldId = $derived($settingsStore.note_editing_id ?? fallbackId);
	const note = $derived<Note | null>($notesStore.find((n) => n.id === heldId) ?? null);

	// ── 4.19 · the note vanished from under us ──
	// Only once notes have actually loaded, or a cold start would close the
	// window before the store is populated.
	let sawNote = $state(false);
	$effect(() => {
		if (note) sawNote = true;
		else if (sawNote) void getCurrentWindow().close();
	});

	// ── Local field mirrors ──
	// The store is the source of truth, but typing straight into it would save
	// on every keystroke. These mirror the held note and flush on a 400ms
	// debounce (4.15). They re-sync whenever the editor swaps notes.
	let titleDraft = $state("");
	let bodyDraft = $state("");
	let tagDraft = $state("");
	let syncedId = $state<string | null>(null);

	let titleEl: HTMLInputElement | null = $state(null);
	let bodyEl: HTMLTextAreaElement | null = $state(null);

	$effect(() => {
		const n = note;
		if (!n || n.id === syncedId) return;
		// Swapped onto a different note — adopt its values wholesale.
		syncedId = n.id;
		titleDraft = n.title ?? "";
		bodyDraft = n.body ?? "";
		tagDraft = n.tag ?? "";
		sectionOrder = defaultSectionOrder(n);
		confirmingRemoveSection = null;
		confirmingDelete = false;
		// 4.2 — an empty title means this note was just created, so put the
		// caret where the user is about to type. An existing note gets nothing
		// focused, so a stray keystroke can't edit it by accident.
		void tick().then(() => {
			if (!n.title) titleEl?.focus();
			autogrow();
		});
	});

	// ── Debounced write-back (4.15) ──
	let flushTimer: ReturnType<typeof setTimeout> | null = null;
	function scheduleFieldFlush() {
		if (flushTimer) clearTimeout(flushTimer);
		flushTimer = setTimeout(() => {
			flushTimer = null;
			flushFields();
		}, 400);
	}
	function flushFields() {
		const n = note;
		if (!n) return;
		const patch: Partial<Note> = {};
		const title = titleDraft.slice(0, MAX_TITLE_LEN);
		// 4.3 — the title may be emptied here, so this writes through
		// updateNote rather than setNoteTitle (which refuses empty on purpose).
		if (title !== n.title) patch.title = title;
		const body = bodyDraft.slice(0, MAX_BODY_LEN);
		if (n.body !== undefined || body) {
			if (body !== (n.body ?? "")) patch.body = body;
		}
		// 4.14 — one tag, and empty means null rather than "".
		const tag = tagDraft.trim().replace(/^#+/, "") || null;
		if (tag !== n.tag) patch.tag = tag;
		if (Object.keys(patch).length > 0) updateNote(n.id, patch);
	}

	function autogrow() {
		if (!bodyEl) return;
		bodyEl.style.height = "auto";
		bodyEl.style.height = `${bodyEl.scrollHeight}px`;
	}

	function onBodyInput() {
		autogrow();
		scheduleFieldFlush();
	}

	// ── Sections ──
	// The schema records no section order, so this is session-local: sections
	// present at load list checklist-then-reminder, and a section added here
	// appends. That satisfies "in the order added" for the case it is about.
	type SectionId = "checklist" | "reminder";
	function defaultSectionOrder(n: Note): SectionId[] {
		const out: SectionId[] = [];
		if (Array.isArray(n.items)) out.push("checklist");
		if (n.when !== undefined) out.push("reminder");
		return out;
	}
	let sectionOrder = $state<SectionId[]>([]);

	const hasChecklist = $derived(Array.isArray(note?.items));
	const hasReminder = $derived(note?.when !== undefined);
	const orderedSections = $derived(
		sectionOrder.filter((s) => (s === "checklist" ? hasChecklist : hasReminder)),
	);

	async function handleAddChecklist() {
		const n = note;
		if (!n) return;
		addChecklistSection(n.id);
		if (!sectionOrder.includes("checklist")) sectionOrder = [...sectionOrder, "checklist"];
		// 4.5 — the caret lands in the new empty item.
		await tick();
		focusItem(0);
	}

	function handleAddReminder() {
		const n = note;
		if (!n) return;
		addReminderSection(n.id);
		if (!sectionOrder.includes("reminder")) sectionOrder = [...sectionOrder, "reminder"];
	}

	// 4.9 — removing a section with items asks once, inline in its header.
	let confirmingRemoveSection = $state<SectionId | null>(null);

	function requestRemoveSection(section: SectionId) {
		const n = note;
		if (!n) return;
		const populated = section === "checklist" ? (n.items?.length ?? 0) > 0 : n.when != null;
		if (populated) {
			confirmingRemoveSection = section;
			return;
		}
		removeSection(section);
	}
	function removeSection(section: SectionId) {
		const n = note;
		if (!n) return;
		if (section === "checklist") removeChecklistSection(n.id);
		else removeReminderSection(n.id);
		sectionOrder = sectionOrder.filter((s) => s !== section);
		confirmingRemoveSection = null;
	}

	// ── Checklist items (4.7) ──
	let itemEls = $state<(HTMLInputElement | null)[]>([]);

	function focusItem(index: number, caretToEnd = false) {
		const el = itemEls[index];
		if (!el) return;
		el.focus();
		if (caretToEnd) el.setSelectionRange(el.value.length, el.value.length);
	}

	async function onItemKeydown(e: KeyboardEvent, index: number) {
		const n = note;
		if (!n) return;
		const items = n.items ?? [];
		const value = (e.target as HTMLInputElement).value;

		if (e.key === "Enter") {
			e.preventDefault();
			if (!value.trim()) {
				// Enter on an empty item ends the run and takes the empty row
				// with it — nobody wants a blank line left behind.
				removeTodoItem(n.id, index);
				await tick();
				(document.activeElement as HTMLElement | null)?.blur();
				return;
			}
			if (items.length >= MAX_TODO_ITEMS) return; // 4.8 — silent at the cap
			insertTodoItem(n.id, index);
			await tick();
			focusItem(index + 1);
			return;
		}

		if (e.key === "Backspace" && !value) {
			e.preventDefault();
			if (items.length <= 1) {
				removeTodoItem(n.id, index);
				return;
			}
			removeTodoItem(n.id, index);
			await tick();
			focusItem(Math.max(0, index - 1), true);
		}
	}

	/**
	 * Append a blank item and put the caret in it. The new row's index is the
	 * count BEFORE the insert — capture it first, because `itemCount` has
	 * already re-derived to N+1 by the time the tick resolves.
	 */
	async function addItemAtEnd() {
		const n = note;
		if (!n) return;
		const at = itemCount;
		insertTodoItem(n.id, at - 1);
		await tick();
		focusItem(at);
	}

	// Drag-to-reorder by the ⠿ handle.
	let dragIndex = $state<number | null>(null);
	function onItemDragStart(index: number) {
		dragIndex = index;
	}
	function onItemDragOver(e: DragEvent, index: number) {
		if (dragIndex === null || dragIndex === index) return;
		e.preventDefault();
	}
	function onItemDrop(index: number) {
		const n = note;
		if (!n || dragIndex === null || dragIndex === index) {
			dragIndex = null;
			return;
		}
		moveTodoItem(n.id, dragIndex, index);
		dragIndex = null;
	}

	const doneCount = $derived(note?.items?.filter((i) => i.d).length ?? 0);
	const itemCount = $derived(note?.items?.length ?? 0);
	const atItemCap = $derived(itemCount >= MAX_TODO_ITEMS);

	// ── Reminder time (4.10 / 4.11) ──
	const chip = $derived(note ? dueChip(note, $tickStore) : null);

	/** `HH:MM` for the time field, empty when no time is set. */
	const timeFieldValue = $derived.by(() => {
		if (!note || note.when == null) return "";
		const d = new Date(note.when);
		return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
	});

	/** today/tomorrow label beside the field. */
	const dayLabel = $derived.by(() => {
		if (!note || note.when == null) return "";
		const when = new Date(note.when);
		const today = new Date($tickStore);
		const sameDay =
			when.getFullYear() === today.getFullYear() &&
			when.getMonth() === today.getMonth() &&
			when.getDate() === today.getDate();
		return sameDay ? m.note_time_today() : m.note_time_tomorrow();
	});

	function onTimeInput(e: Event) {
		const n = note;
		if (!n) return;
		const raw = (e.target as HTMLInputElement).value;
		if (!raw) {
			setNoteWhen(n.id, null);
			return;
		}
		const [hh, mm] = raw.split(":").map((v) => Number.parseInt(v, 10));
		if (Number.isNaN(hh) || Number.isNaN(mm)) return;
		const d = new Date();
		d.setHours(hh, mm, 0, 0);
		// A time already past today means the user means tomorrow.
		if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
		setNoteWhen(n.id, d.getTime());
	}

	function presetOffset(minutes: number) {
		const n = note;
		if (!n) return;
		setNoteWhen(n.id, Date.now() + minutes * 60_000);
	}
	function presetTonight() {
		const n = note;
		if (!n) return;
		const d = new Date();
		d.setHours(21, 0, 0, 0);
		if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
		setNoteWhen(n.id, d.getTime());
	}
	function presetBeforeReset() {
		const n = note;
		if (!n) return;
		// 30 minutes before the daily reset (00:00 UTC — the app's server clock).
		const reset = getNextDailyReset(new Date()).getTime() - 30 * 60_000;
		setNoteWhen(n.id, reset > Date.now() ? reset : reset + 86_400_000);
	}
	function clearTime() {
		const n = note;
		if (!n) return;
		setNoteWhen(n.id, null);
	}

	// ── Category (4.13) ──
	let categoryOpen = $state(false);
	const categoryName = $derived(
		$noteCategoriesStore.find((c) => c.key === note?.category_key)?.name ?? "",
	);
	const categoryColor = $derived<StickyColor | null>(
		$noteCategoriesStore.find((c) => c.key === note?.category_key)?.color ?? null,
	);

	function pickCategory(key: string) {
		const n = note;
		if (!n) return;
		updateNote(n.id, { category_key: key } as Partial<Note>);
		categoryOpen = false;
	}
	// Inline rather than window.prompt(): a Tauri webview can suppress native
	// dialogs, which would leave "+ New category…" looking live and doing
	// nothing. The colour comes from nextStickyColor inside addCategory.
	let newCatOpen = $state(false);
	let newCatName = $state("");
	let newCatEl: HTMLInputElement | null = $state(null);

	async function startNewCategory() {
		newCatOpen = true;
		newCatName = "";
		await tick();
		newCatEl?.focus();
	}
	function commitNewCategory() {
		const n = note;
		if (!n || !newCatName.trim()) {
			newCatOpen = false;
			return;
		}
		const cat = addCategory(newCatName);
		if (cat) updateNote(n.id, { category_key: cat.key } as Partial<Note>);
		newCatOpen = false;
		newCatName = "";
		categoryOpen = false;
	}
	function onNewCategoryKeydown(e: KeyboardEvent) {
		if (e.key === "Enter") {
			e.preventDefault();
			commitNewCategory();
		} else if (e.key === "Escape") {
			e.preventDefault();
			newCatOpen = false;
		}
	}

	// ── Header / footer ──
	const savedAgo = $derived.by(() => {
		const at = $notesLastSavedStore;
		if (!at) return null;
		const s = Math.max(0, Math.floor(($tickStore - at) / 1000));
		return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`;
	});

	let confirmingDelete = $state(false);
	function handleDelete() {
		const n = note;
		if (!n) return;
		if (!confirmingDelete) {
			confirmingDelete = true;
			return;
		}
		deleteNote(n.id);
		void getCurrentWindow().close();
	}

	function handleClose() {
		// flushNotes() runs in the route's close handler (4.16); flush the
		// field drafts into the store first so it has something to write.
		if (flushTimer) {
			clearTimeout(flushTimer);
			flushTimer = null;
		}
		flushFields();
		void getCurrentWindow().close();
	}

	function startDrag(e: MouseEvent) {
		if (e.button === 0 && !(e.target as HTMLElement).closest("button, input, textarea")) {
			void getCurrentWindow().startDragging();
		}
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="editor" role="region" aria-label={m.note_editor_title()}>
	{#if note}
		<!-- Header -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="ed-head" onmousedown={startDrag}>
			<span class="drag-dots" aria-hidden="true">
				{#each Array(6) as _}<span class="dot"></span>{/each}
			</span>
			<span class="ed-title">{m.note_editor_title()}</span>
			<span class="ed-stamp">{m.note_edited_ago({ ago: ageOf(note.updated, $tickStore) })}</span>
			<button
				type="button"
				class="head-btn {note.pinned ? 'head-btn-on' : ''}"
				onclick={() => togglePinNote(note.id)}
				title={note.pinned ? m.scratchpad_unpin() : m.scratchpad_pin()}
				aria-pressed={note.pinned}
			>{note.pinned ? "✦" : "✧"}</button>
			<button
				type="button"
				class="head-btn"
				onclick={handleClose}
				title={m.chrome_titlebar_close_title()}
				aria-label={m.chrome_titlebar_close_title()}
			>✕</button>
		</div>

		<!-- Title -->
		<input
			bind:this={titleEl}
			bind:value={titleDraft}
			oninput={scheduleFieldFlush}
			onblur={flushFields}
			maxlength={MAX_TITLE_LEN}
			class="ed-title-input"
			placeholder={m.note_title_placeholder()}
		/>

		<!-- Meta row -->
		<div class="ed-meta">
			<div class="cat-wrap">
				<button type="button" class="meta-chip" onclick={() => (categoryOpen = !categoryOpen)} aria-expanded={categoryOpen}>
					{#if categoryColor}
						<span class="cat-dot" style="background:{STICKY_COLORS[categoryColor].fg}"></span>
					{/if}
					<span>{categoryName || m.note_add_category()}</span>
				</button>
				{#if categoryOpen}
					<div class="cat-menu">
						{#each $noteCategoriesStore as cat (cat.key)}
							<button
								type="button"
								class="cat-opt {cat.key === note.category_key ? 'cat-opt-on' : ''}"
								onclick={() => pickCategory(cat.key)}
							>
								<span class="cat-dot" style="background:{STICKY_COLORS[cat.color].fg}"></span>
								<span>{cat.name}</span>
							</button>
						{/each}
						{#if newCatOpen}
							<div class="cat-opt cat-opt-new">
								<input
									bind:this={newCatEl}
									bind:value={newCatName}
									onkeydown={onNewCategoryKeydown}
									onblur={commitNewCategory}
									class="new-cat-input"
									placeholder={m.note_new_category_prompt()}
								/>
							</div>
						{:else}
							<button type="button" class="cat-opt cat-opt-new" onclick={() => void startNewCategory()}>
								{m.note_new_category()}
							</button>
						{/if}
					</div>
				{/if}
			</div>

			<span class="tag-chip">
				<span class="tag-hash">#</span>
				<input
					bind:value={tagDraft}
					oninput={scheduleFieldFlush}
					onblur={flushFields}
					class="tag-input"
					placeholder={m.note_tag_placeholder()}
					style="width:{Math.min(Math.max(tagDraft.length, 4), 14)}ch"
				/>
			</span>

			<span class="ed-saved">{savedAgo ? `${m.note_saved()} ${savedAgo}` : ""}</span>
		</div>

		<!-- Content -->
		<div class="ed-body">
			<textarea
				bind:this={bodyEl}
				bind:value={bodyDraft}
				oninput={onBodyInput}
				onblur={flushFields}
				maxlength={MAX_BODY_LEN}
				rows="2"
				class="ed-body-input"
				placeholder={m.note_body_placeholder()}
			></textarea>

			{#each orderedSections as section (section)}
				{#if section === "checklist"}
					<section class="ed-section">
						<div class="sec-head">
							<span class="sec-eyebrow">{m.note_section_checklist()}</span>
							{#if confirmingRemoveSection === "checklist"}
								<span class="confirm-text">{m.note_remove_section_confirm({ count: itemCount })}</span>
								<button type="button" class="confirm-yes" onclick={() => removeSection("checklist")}>{m.note_remove_confirm_yes()}</button>
								<button type="button" class="confirm-no" onclick={() => (confirmingRemoveSection = null)}>{m.note_remove_confirm_no()}</button>
							{:else}
								<span class="sec-count">{doneCount} / {itemCount}</span>
								<button
									type="button"
									class="sec-x"
									onclick={() => requestRemoveSection("checklist")}
									title={m.note_remove_section()}
									aria-label={m.note_remove_section()}
								>✕</button>
							{/if}
						</div>

						<div class="items">
							{#each note.items ?? [] as item, idx (idx)}
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div
									class="item-row {dragIndex === idx ? 'item-dragging' : ''}"
									ondragover={(e) => onItemDragOver(e, idx)}
									ondrop={() => onItemDrop(idx)}
								>
									<span
										class="item-handle"
										draggable="true"
										ondragstart={() => onItemDragStart(idx)}
										ondragend={() => (dragIndex = null)}
										role="button"
										tabindex="-1"
										aria-label={m.note_item_reorder()}
									>⠿</span>
									<button
										type="button"
										class="box {item.d ? 'box-done' : ''}"
										onclick={() => toggleTodoItem(note.id, idx)}
										aria-pressed={item.d}
									>{item.d ? "✓" : ""}</button>
									<input
										bind:this={itemEls[idx]}
										value={item.t}
										oninput={(e) => setTodoItemText(note.id, idx, (e.target as HTMLInputElement).value)}
										onkeydown={(e) => onItemKeydown(e, idx)}
										class="item-input {item.d ? 'item-struck' : ''}"
										placeholder={m.note_item_placeholder()}
									/>
									<button
										type="button"
										class="item-x"
										onclick={() => removeTodoItem(note.id, idx)}
										title={m.note_item_remove()}
										aria-label={m.note_item_remove()}
									>✕</button>
								</div>
							{/each}

							{#if atItemCap}
								<!-- 4.8 — the add affordance is replaced, not just disabled, so
								     nobody is left pressing Enter into nothing. -->
								<div class="items-max">{m.note_items_max({ max: MAX_TODO_ITEMS })}</div>
							{:else}
								<button type="button" class="item-add" onclick={() => addItemAtEnd()}>
									{m.note_item_placeholder()}
								</button>
							{/if}
						</div>
					</section>
				{:else}
					<section class="ed-section">
						<div class="sec-head">
							<span class="sec-eyebrow">{m.note_section_reminder()}</span>
							{#if confirmingRemoveSection === "reminder"}
								<span class="confirm-text">{m.note_delete_confirm()}</span>
								<button type="button" class="confirm-yes" onclick={() => removeSection("reminder")}>{m.note_remove_confirm_yes()}</button>
								<button type="button" class="confirm-no" onclick={() => (confirmingRemoveSection = null)}>{m.note_remove_confirm_no()}</button>
							{:else}
								{#if chip}
									<span class="pill {chip.overdue ? 'pill-overdue' : 'pill-due'}">{chip.text}</span>
								{:else}
									<span class="sec-count">{m.note_time_unset()}</span>
								{/if}
								<button
									type="button"
									class="sec-x"
									onclick={() => requestRemoveSection("reminder")}
									title={m.note_remove_section()}
									aria-label={m.note_remove_section()}
								>✕</button>
							{/if}
						</div>

						<div class="time-row">
							<input
								type="time"
								value={timeFieldValue}
								oninput={onTimeInput}
								class="time-input"
								aria-label={m.note_time_label()}
							/>
							<span class="day-label">{dayLabel}</span>
						</div>
						<div class="preset-row">
							<button type="button" class="preset" onclick={() => presetOffset(15)}>{m.note_time_preset_15m()}</button>
							<button type="button" class="preset" onclick={() => presetOffset(60)}>{m.note_time_preset_1h()}</button>
							<button type="button" class="preset" onclick={presetTonight}>{m.note_time_preset_tonight()}</button>
							<button type="button" class="preset" onclick={presetBeforeReset}>{m.note_time_preset_reset()}</button>
							<button type="button" class="preset preset-clear" onclick={clearTime}>{m.note_time_clear()}</button>
						</div>
					</section>
				{/if}
			{/each}
		</div>

		<!-- ADD row — never hides (4.17) -->
		<div class="ed-add">
			<span class="add-label">{m.note_add_label()}</span>
			{#if hasChecklist && hasReminder}
				<span class="add-nothing">{m.note_add_nothing_left()}</span>
			{:else}
				{#if !hasChecklist}
					<button type="button" class="add-chip" onclick={handleAddChecklist}>{m.note_add_checklist()}</button>
				{/if}
				{#if !hasReminder}
					<button type="button" class="add-chip" onclick={handleAddReminder}>{m.note_add_reminder()}</button>
				{/if}
			{/if}
			{#if confirmingDelete}
				<span class="confirm-text del-confirm">{m.note_delete_confirm()}</span>
				<button type="button" class="confirm-no" onclick={() => (confirmingDelete = false)}>{m.note_remove_confirm_no()}</button>
			{/if}
			<button
				type="button"
				class="del-btn {confirmingDelete ? 'del-btn-armed' : ''}"
				onclick={handleDelete}
				title={m.scratchpad_delete()}
				aria-label={m.scratchpad_delete()}
			>✕</button>
		</div>
	{/if}
</div>

<style>
	.editor {
		position: fixed;
		inset: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: var(--card-bg);
		border: 1px solid #e0dace;
		border-radius: 14px;
		color: var(--ink);
	}

	/* ── Header ── */
	.ed-head {
		display: flex;
		align-items: center;
		gap: 9px;
		padding: 11px 13px;
		background: var(--overlay-paper);
		border-bottom: 1px solid var(--hairline);
		flex: none;
		cursor: move;
		user-select: none;
	}
	.drag-dots {
		display: grid;
		grid-template-columns: 2px 2px;
		gap: 3px;
	}
	.dot {
		width: 2px;
		height: 2px;
		background: #c8c2b6;
		border-radius: 50%;
	}
	.ed-title {
		font: 600 12px 'IBM Plex Sans', sans-serif;
		flex: 1;
	}
	.ed-stamp {
		font: 400 12px 'IBM Plex Mono', monospace;
		color: var(--ink-faint);
	}
	.head-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--eyebrow-ink);
		font-size: 12px;
		cursor: pointer;
	}
	.head-btn-on { color: var(--teal); }
	.head-btn:hover { background: var(--chip); }

	/* ── Title ── */
	.ed-title-input {
		flex: none;
		margin: 0;
		padding: 13px 14px 6px;
		border: none;
		outline: none;
		background: transparent;
		font: 600 16px 'IBM Plex Sans', sans-serif;
		color: var(--ink);
	}
	.ed-title-input::placeholder { color: #a39d92; font-weight: 500; }

	/* ── Meta row ── */
	.ed-meta {
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 0 14px 11px;
		border-bottom: 1px solid var(--hairline);
		flex: none;
	}
	.cat-wrap { position: relative; }
	.meta-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 3px 9px;
		border: none;
		border-radius: 999px;
		background: var(--chip);
		font: 500 12px 'IBM Plex Sans', sans-serif;
		color: var(--ink-mid);
		cursor: pointer;
	}
	.meta-chip:hover { filter: brightness(0.96); }
	.cat-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		flex: none;
	}
	.cat-menu {
		position: absolute;
		top: calc(100% + 5px);
		left: 0;
		z-index: 10;
		min-width: 150px;
		max-height: 220px;
		overflow-y: auto;
		padding: 4px;
		background: var(--card-bg);
		border: 1px solid var(--card-border);
		border-radius: 9px;
		box-shadow: var(--shadow-float);
	}
	.cat-opt {
		display: flex;
		align-items: center;
		gap: 7px;
		width: 100%;
		padding: 5px 8px;
		border: none;
		border-radius: 6px;
		background: transparent;
		font: 500 12.5px 'IBM Plex Sans', sans-serif;
		color: var(--ink);
		text-align: left;
		cursor: pointer;
	}
	.cat-opt:hover { background: var(--row); }
	.cat-opt-on { color: var(--teal); }
	.cat-opt-new {
		color: var(--teal);
		border-top: 1px solid var(--hairline);
		margin-top: 4px;
		padding-top: 7px;
		border-radius: 0 0 6px 6px;
	}
	.new-cat-input {
		width: 100%;
		border: none;
		outline: none;
		background: transparent;
		font: 500 12.5px 'IBM Plex Sans', sans-serif;
		color: var(--ink);
	}

	.tag-chip {
		display: inline-flex;
		align-items: center;
		gap: 1px;
		padding: 3px 9px;
		border-radius: 999px;
		background: var(--chip);
		font: 500 12px 'IBM Plex Sans', sans-serif;
		color: var(--ink-mid);
	}
	.tag-hash { color: var(--ink-faint); }
	.tag-input {
		border: none;
		outline: none;
		background: transparent;
		font: 500 12px 'IBM Plex Sans', sans-serif;
		color: var(--ink-mid);
		min-width: 4ch;
	}
	.ed-saved {
		margin-left: auto;
		font: 400 12px 'IBM Plex Mono', monospace;
		color: var(--ink-faint);
	}

	/* ── Content ── */
	.ed-body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 12px 14px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.ed-body-input {
		width: 100%;
		resize: none;
		border: none;
		outline: none;
		background: transparent;
		font: 400 13px 'IBM Plex Sans', sans-serif;
		line-height: 1.5;
		color: var(--ink);
		overflow: hidden;
	}
	.ed-body-input::placeholder { color: #a39d92; }

	.ed-section {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding-top: 12px;
		border-top: 1px solid var(--hairline);
	}
	.sec-head {
		display: flex;
		align-items: center;
		gap: 7px;
	}
	.sec-eyebrow {
		font: 600 10.5px 'IBM Plex Sans', sans-serif;
		letter-spacing: 0.10em;
		color: var(--eyebrow-ink);
		flex: 1;
	}
	.sec-count {
		font: 400 12px 'IBM Plex Mono', monospace;
		color: var(--ink-faint);
	}
	.sec-x,
	.item-x {
		width: 16px;
		height: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		border-radius: 50%;
		background: transparent;
		color: var(--ink-faint);
		font-size: 12px;
		cursor: pointer;
		flex: none;
	}
	.sec-x:hover,
	.item-x:hover { color: var(--ink); background: var(--chip); }

	.confirm-text {
		font: 500 12px 'IBM Plex Sans', sans-serif;
		color: var(--rust-deep);
		flex: 1;
	}
	.confirm-yes,
	.confirm-no {
		border: none;
		background: transparent;
		font: 600 12px 'IBM Plex Sans', sans-serif;
		cursor: pointer;
		padding: 2px 6px;
		border-radius: 6px;
	}
	.confirm-yes { color: var(--rust); }
	.confirm-yes:hover { background: var(--rust-tint); }
	.confirm-no { color: var(--ink-muted); }
	.confirm-no:hover { background: var(--chip); }

	/* ── Checklist ── */
	.items {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	.item-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.item-dragging { opacity: 0.45; }
	.item-handle {
		color: #c8c2b6;
		font-size: 12px;
		cursor: grab;
		flex: none;
		line-height: 1;
	}
	.item-handle:active { cursor: grabbing; }
	.box {
		width: 14px;
		height: 14px;
		flex: none;
		padding: 0;
		border: 1.5px solid #c2bcb0;
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		color: #fff;
		font-size: 12px;
		cursor: pointer;
	}
	.box-done {
		background: var(--teal);
		border-color: var(--teal);
	}
	.item-input {
		flex: 1;
		min-width: 0;
		border: none;
		outline: none;
		background: transparent;
		font: 400 13px 'IBM Plex Sans', sans-serif;
		color: var(--ink);
	}
	.item-input::placeholder { color: #a39d92; }
	.item-struck {
		color: #a39d92;
		text-decoration: line-through;
	}
	.item-x { opacity: 0; transition: opacity 0.15s; }
	.item-row:hover .item-x { opacity: 1; }
	.item-add {
		align-self: flex-start;
		margin-left: 22px;
		border: none;
		background: transparent;
		padding: 2px 0;
		font: 400 13px 'IBM Plex Sans', sans-serif;
		color: #a39d92;
		cursor: pointer;
	}
	.item-add:hover { color: var(--teal); }
	.items-max {
		margin-left: 22px;
		font: 400 12px 'IBM Plex Sans', sans-serif;
		color: #a39d92;
	}

	/* ── Reminder ── */
	.time-row {
		display: flex;
		align-items: center;
		gap: 9px;
	}
	.time-input {
		padding: 4px 8px;
		border: 1px solid var(--card-border);
		border-radius: 7px;
		background: var(--card-bg);
		font: 500 13px 'IBM Plex Mono', monospace;
		color: var(--ink);
	}
	.time-input:focus { outline: none; border-color: var(--teal); }
	.day-label {
		font: 400 12px 'IBM Plex Sans', sans-serif;
		color: var(--ink-muted);
	}
	.preset-row {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
	}
	.preset {
		padding: 3px 9px;
		border: none;
		border-radius: 999px;
		background: var(--chip);
		font: 500 12px 'IBM Plex Sans', sans-serif;
		color: var(--ink-mid);
		cursor: pointer;
	}
	.preset:hover { background: var(--teal-tint); color: var(--teal); }
	.preset-clear { color: var(--ink-faint); }

	.pill {
		padding: 2px 8px;
		border-radius: 999px;
		font: 600 12px 'IBM Plex Sans', sans-serif;
		white-space: nowrap;
	}
	.pill-due { background: var(--teal-tint); color: var(--teal); }
	.pill-overdue {
		background: var(--rust-tint);
		color: var(--rust);
		border: 1px solid var(--rust-tint-border);
	}

	/* ── ADD row ── */
	.ed-add {
		flex: none;
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 10px 14px;
		border-top: 1px solid var(--hairline);
		background: var(--row);
	}
	.add-label {
		font: 600 10.5px 'IBM Plex Sans', sans-serif;
		letter-spacing: 0.10em;
		color: var(--eyebrow-ink);
	}
	.add-chip {
		padding: 3px 10px;
		border: 1px solid var(--card-border);
		border-radius: 999px;
		background: var(--card-bg);
		font: 500 12px 'IBM Plex Sans', sans-serif;
		color: var(--ink-mid);
		cursor: pointer;
	}
	.add-chip:hover { border-color: var(--teal); color: var(--teal); }
	.add-nothing {
		font: 400 12px 'IBM Plex Sans', sans-serif;
		color: #a39d92;
	}
	.del-confirm { flex: none; }
	.del-btn {
		margin-left: auto;
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--rust);
		font-size: 12px;
		cursor: pointer;
		flex: none;
	}
	.del-btn:hover { background: var(--rust-tint); }
	.del-btn-armed { background: var(--rust); color: #fff; }
</style>
