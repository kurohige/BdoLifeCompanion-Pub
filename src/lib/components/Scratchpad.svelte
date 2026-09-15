<!--
	Notes list window (spec 15a/15b) — the free-floating notes/tasks/reminders
	panel. Runs in two modes: `detached` IS the standalone window, otherwise it
	is a panel inside the main window.

	Schema v2: a note may carry prose AND a checklist AND a time at once, so
	rendering branches on the FIELDS, not on `type`. `type` survives only as
	what quick capture writes.

	The editor is a second OS window over the same store (services/note-window).
	Every rule here assumes it may be open, closed, or focused.
-->
<script lang="ts">
	import { tick } from "svelte";
	import {
		notesStore,
		noteCategoriesStore,
		notesCaptureCategoryStore,
		notesLastSavedStore,
		addNote,
		deleteNote,
		togglePinNote,
		toggleTodoItem,
	} from "$lib/stores/notes";
	import { settingsStore, setScratchpadOpen, setScratchpadPos } from "$lib/stores/settings";
	import { openScratchpadWindow, focusScratchpadWindow } from "$lib/services/scratchpad-window";
	import { openNoteEditor } from "$lib/services/note-window";
	import { getCurrentWindow } from "@tauri-apps/api/window";
	import { tickStore } from "$lib/stores/boss-timer";
	import { parseCapture, newId } from "$lib/utils/note-parser";
	import { dueChip, ageOf, isDone, isOverdue } from "$lib/utils/note-format";
	import type { Note } from "$lib/models/notes";
	import { m } from "$lib/paraglide/messages";

	// detached = this instance IS the standalone notes window (/scratchpad route)
	let { detached = false }: { detached?: boolean } = $props();

	const open = $derived($settingsStore.scratchpad_open);
	const pos = $derived($settingsStore.scratchpad_pos);
	// In the main window the panel yields while a detached window exists.
	const visible = $derived(detached ? true : open && !$settingsStore.scratchpad_detached);

	/** Which note the editor window holds (null = editor closed). */
	const editingId = $derived($settingsStore.note_editing_id);

	function categoryName(key: string): string {
		return $noteCategoriesStore.find((c) => c.key === key)?.name ?? "";
	}

	let showDone = $state(false);

	// ── Search (Part 5) ──
	// The query is deliberately component state, never persisted: a pad
	// reopened tomorrow showing yesterday's filtered three notes reads as
	// data loss (5.12).
	let searching = $state(false);
	let query = $state("");
	let catFilter = $state<string | null>(null);
	let searchEl: HTMLInputElement | null = $state(null);

	const q = $derived(query.trim().toLowerCase());
	const hasQuery = $derived(q.length > 0);

	/** Case-insensitive substring. No fuzzy matching, no ranking (5.4). */
	function hit(text: string | null | undefined): boolean {
		return !!text && text.toLowerCase().includes(q);
	}
	function matches(note: Note): boolean {
		if (!hasQuery) return true;
		if (hit(note.title)) return true;
		if (hit(note.body)) return true;
		if (hit(note.tag)) return true;
		// Category NAME, never category_key — the key is an opaque id the user
		// never sees, and would match query fragments by accident.
		if (hit(categoryName(note.category_key))) return true;
		if (note.items?.some((i) => hit(i.t))) return true;
		// `when` is deliberately NOT searched: a clock time is a filter, not a
		// text query (5.5).
		return false;
	}

	// ── Ordering ──
	const byUpdated = (a: Note, b: Note) => b.updated - a.updated;
	function pinnedFirst(list: Note[]): Note[] {
		return [...list.filter((n) => n.pinned).sort(byUpdated), ...list.filter((n) => !n.pinned).sort(byUpdated)];
	}

	/** Live sort — pinned first, then updated descending. */
	const liveSorted = $derived(pinnedFirst($notesStore.filter((n) => !isDone(n))));
	const doneNotes = $derived($notesStore.filter(isDone).sort(byUpdated));

	// ── Frozen sort while the editor holds a note (3.7) ──
	// Every patch bumps `updated` and the list sorts on it, so without this the
	// note being edited jumps to the top on the first keystroke and the list
	// resorts under the user's cursor while they type. Freeze the ID ORDER at
	// the moment the editor opens; updates still apply in place, and pins,
	// deletes and additions still take effect — they just don't resort.
	let frozenOrder = $state<string[] | null>(null);
	let frozenFor = $state<string | null>(null);

	$effect(() => {
		const id = editingId;
		if (!id) {
			// Editor closed — release and resort.
			frozenOrder = null;
			frozenFor = null;
			return;
		}
		if (frozenFor === id) return;
		// Opened, or swapped to a different note — re-freeze on the order the
		// user can currently see.
		frozenFor = id;
		frozenOrder = liveSorted.map((n) => n.id);
	});

	const sorted = $derived.by(() => {
		const active = $notesStore.filter((n) => !isDone(n));
		const order = frozenOrder;
		if (!order) return pinnedFirst(active);
		const byId = new Map(active.map((n) => [n.id, n]));
		// Frozen ids first, in their frozen order, skipping any since deleted
		// or completed; then anything new, at the front where it was added.
		const kept: Note[] = [];
		for (const id of order) {
			const n = byId.get(id);
			if (n) {
				kept.push(n);
				byId.delete(id);
			}
		}
		return [...pinnedFirst([...byId.values()]), ...kept];
	});

	// ── Result sets while searching ──
	const activeMatches = $derived(hasQuery ? sorted.filter(matches) : sorted);
	// 5.6 — done notes join the results regardless of the Show-done toggle. A
	// search that respected that filter would lie about what is in the library.
	const doneMatches = $derived(hasQuery ? doneNotes.filter(matches) : []);

	/** Category chips count the RESULT SET, not the library (5.8). */
	const catCounts = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const n of [...activeMatches, ...doneMatches]) {
			counts.set(n.category_key, (counts.get(n.category_key) ?? 0) + 1);
		}
		return counts;
	});
	const totalMatches = $derived(activeMatches.length + doneMatches.length);

	function inCatFilter(n: Note): boolean {
		return catFilter === null || n.category_key === catFilter;
	}
	const shownActive = $derived(hasQuery ? activeMatches.filter(inCatFilter) : activeMatches);
	const shownDone = $derived(doneMatches.filter(inCatFilter));
	const noMatches = $derived(hasQuery && shownActive.length === 0 && shownDone.length === 0);

	// ── Match highlighting (5.9) ──
	interface Seg {
		t: string;
		hit: boolean;
	}
	function segments(text: string): Seg[] {
		if (!hasQuery || !text) return [{ t: text ?? "", hit: false }];
		const lower = text.toLowerCase();
		const out: Seg[] = [];
		let i = 0;
		for (;;) {
			const at = lower.indexOf(q, i);
			if (at === -1) {
				if (i < text.length) out.push({ t: text.slice(i), hit: false });
				break;
			}
			if (at > i) out.push({ t: text.slice(i, at), hit: false });
			out.push({ t: text.slice(at, at + q.length), hit: true });
			i = at + q.length;
		}
		return out;
	}

	/** A body hit renders ±24 characters around the match, not the paragraph. */
	function bodySnippet(body: string): string {
		const at = body.toLowerCase().indexOf(q);
		if (at === -1) return body.slice(0, 80);
		const from = Math.max(0, at - 24);
		const to = Math.min(body.length, at + q.length + 24);
		return `${from > 0 ? "…" : ""}${body.slice(from, to)}${to < body.length ? "…" : ""}`;
	}

	// ── Saved-ago footer ──
	const savedAgo = $derived.by(() => {
		const at = $notesLastSavedStore;
		if (!at) return null;
		const s = Math.max(0, Math.floor(($tickStore - at) / 1000));
		if (s < 60) return `${s}s`;
		return `${Math.floor(s / 60)}m`;
	});

	// ── Composer ──
	let composerText = $state("");
	let composerEl: HTMLTextAreaElement | null = $state(null);

	function saveComposer() {
		const note = parseCapture(composerText, $notesCaptureCategoryStore);
		if (note) addNote(note);
		composerText = "";
	}
	function handleComposerKeydown(e: KeyboardEvent) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			saveComposer();
		} else if (e.key === "Escape") {
			e.preventDefault();
			composerText = "";
			composerEl?.blur();
		}
	}

	// ── New note (3.2) ──
	// The note is created immediately and exists in the list from that moment;
	// it does not appear only once the user types.
	function makeBlankNote(title: string): Note {
		const now = Date.now();
		return {
			id: newId(),
			category_key: $notesCaptureCategoryStore,
			pinned: false,
			title,
			tag: null,
			created: now,
			updated: now,
			type: "text",
			body: "",
		} as Note;
	}
	async function handleNewNote(title = "") {
		const note = makeBlankNote(title);
		addNote(note);
		await openNoteEditor(note.id);
	}

	// ── Search open/close (5.1 / 5.2) ──
	async function openSearch() {
		searching = true;
		await tick();
		searchEl?.focus();
	}
	function closeSearch() {
		searching = false;
		query = "";
		catFilter = null;
	}
	function handleSearchKeydown(e: KeyboardEvent) {
		if (e.key === "Escape") {
			e.preventDefault();
			// Two presses always get you back: clear the query, then close.
			if (query) {
				query = "";
				catFilter = null;
			} else {
				closeSearch();
			}
			return;
		}
		if (e.key === "Enter") {
			e.preventDefault();
			const top = shownActive[0] ?? shownDone[0];
			if (top) void openNoteEditor(top.id);
		}
	}

	// ── Window keys ──
	async function handleWindowKeydown(e: KeyboardEvent) {
		if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "n") {
			e.preventDefault();
			if (!detached && $settingsStore.scratchpad_detached) {
				// The pad lives in its own window right now — bring it forward.
				void focusScratchpadWindow();
				return;
			}
			if (!open && !detached) {
				setScratchpadOpen(true);
				await tick();
			}
			// Ctrl+N keeps its shipped meaning: focus the composer (3.6).
			searching = false;
			await tick();
			composerEl?.focus();
			return;
		}
		if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "f") {
			e.preventDefault();
			await openSearch();
		}
	}

	// ── Detach / re-attach ──
	function handleDetach() {
		void openScratchpadWindow();
	}
	function handleClose() {
		if (detached) {
			// Closing the window re-attaches (main window listens for destroy).
			void getCurrentWindow().close();
		} else {
			setScratchpadOpen(false);
		}
	}

	// ── Drag by the header dots ──
	let panelEl: HTMLDivElement | null = $state(null);
	let dragging = $state(false);
	let dragPos = $state<{ x: number; y: number } | null>(null);
	let dragOffset = { x: 0, y: 0 };

	function onDragStart(e: PointerEvent) {
		if (detached) {
			// Detached: the header drags the whole OS window.
			void getCurrentWindow().startDragging();
			return;
		}
		if (!panelEl) return;
		const rect = panelEl.getBoundingClientRect();
		dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
		dragging = true;
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
	}
	function onDragMove(e: PointerEvent) {
		if (!dragging || !panelEl) return;
		const w = panelEl.offsetWidth;
		const h = panelEl.offsetHeight;
		dragPos = {
			x: Math.min(Math.max(0, e.clientX - dragOffset.x), window.innerWidth - w),
			y: Math.min(Math.max(0, e.clientY - dragOffset.y), window.innerHeight - h),
		};
	}
	function onDragEnd() {
		if (!dragging) return;
		dragging = false;
		if (dragPos) setScratchpadPos(dragPos);
	}

	const panelStyle = $derived.by(() => {
		if (detached) return "";
		const p = dragPos ?? pos;
		if (p) return `left:${p.x}px; top:${p.y}px; right:auto; bottom:auto;`;
		return "";
	});
</script>

<svelte:window onkeydown={handleWindowKeydown} />

{#if visible}
	<div class="pad {detached ? 'pad-detached' : ''}" bind:this={panelEl} style={panelStyle} role="complementary" aria-label={m.notes_window_title()}>
		<!-- Header (3.1) -->
		<div class="pad-head">
			<button
				type="button"
				class="drag-dots"
				onpointerdown={onDragStart}
				onpointermove={onDragMove}
				onpointerup={onDragEnd}
				onpointercancel={onDragEnd}
				aria-label={m.notes_window_title()}
			>
				{#each Array(6) as _}
					<span class="dot"></span>
				{/each}
			</button>
			<span class="pad-title">{m.notes_window_title()}</span>
			<span class="pad-count">{m.notes_count_notes({ count: $notesStore.length })}</span>
			<button
				type="button"
				class="head-btn"
				onclick={() => (searching ? closeSearch() : openSearch())}
				title={m.notes_search_open()}
				aria-label={m.notes_search_open()}
				aria-pressed={searching}
			>⌕</button>
			<button
				type="button"
				class="head-btn head-btn-new"
				onclick={() => void handleNewNote()}
				title={m.notes_new_note()}
				aria-label={m.notes_new_note()}
			>+</button>
			{#if !detached}
				<!-- Docked-only mode controls: without these the panel cannot be
				     detached or collapsed at all. -->
				<button type="button" class="head-btn" onclick={handleDetach} title={m.scratchpad_detach_title()} aria-label={m.scratchpad_detach_title()}>⧉</button>
				<button type="button" class="head-btn head-btn-collapse" onclick={() => setScratchpadOpen(false)} title={m.scratchpad_collapse()} aria-label={m.scratchpad_collapse()}>▲</button>
			{/if}
			<button type="button" class="head-btn" onclick={handleClose} title={detached ? m.scratchpad_reattach_title() : m.chrome_titlebar_close_title()} aria-label={detached ? m.scratchpad_reattach_title() : m.chrome_titlebar_close_title()}>✕</button>
		</div>

		<!-- Composer / search share one slot: same height, same padding, no
		     layout shift when they swap (5.1). -->
		{#if searching}
			<div class="composer">
				<span class="search-glyph" aria-hidden="true">⌕</span>
				<input
					bind:this={searchEl}
					bind:value={query}
					onkeydown={handleSearchKeydown}
					class="composer-input"
					placeholder={m.notes_search_placeholder()}
				/>
			</div>
			{#if hasQuery && totalMatches > 0}
				<div class="cat-chips">
					<button type="button" class="cat-chip {catFilter === null ? 'cat-chip-on' : ''}" onclick={() => (catFilter = null)}>
						{m.notes_search_all({ count: totalMatches })}
					</button>
					{#each $noteCategoriesStore.filter((c) => (catCounts.get(c.key) ?? 0) > 0) as cat (cat.key)}
						<button type="button" class="cat-chip {catFilter === cat.key ? 'cat-chip-on' : ''}" onclick={() => (catFilter = cat.key)}>
							{cat.name} {catCounts.get(cat.key)}
						</button>
					{/each}
				</div>
			{/if}
		{:else}
			<div class="composer">
				<textarea
					bind:this={composerEl}
					bind:value={composerText}
					onkeydown={handleComposerKeydown}
					placeholder={m.scratchpad_write()}
					rows="1"
					class="composer-input"
				></textarea>
				<span class="kbd-pill">Ctrl+N</span>
			</div>
		{/if}

		<!-- List -->
		<div class="pad-list">
			{#if noMatches}
				<!-- 5.10 -->
				<div class="no-match">
					<div class="no-match-line">{m.notes_search_no_match({ query })}</div>
					<div class="no-match-covers">{m.notes_search_covers()}</div>
					<div class="no-match-chips">
						<button type="button" class="nm-chip nm-chip-new" onclick={() => void handleNewNote(query.trim())}>
							{m.notes_search_new_note({ query: query.trim() })}
						</button>
						<button type="button" class="nm-chip" onclick={closeSearch}>{m.notes_search_clear()}</button>
					</div>
				</div>
			{:else if shownActive.length === 0 && !hasQuery && (!showDone || doneNotes.length === 0)}
				<div class="empty-line">{m.scratchpad_empty()}</div>
			{/if}

			{#each shownActive as note (note.id)}
				{@const overdue = isOverdue(note, $tickStore)}
				{@const editing = note.id === editingId}
				{@const chip = dueChip(note, $tickStore)}
				<div class="note {note.pinned ? 'note-pinned' : ''} {editing ? 'note-editing' : ''} {overdue ? 'note-overdue' : ''}">
					{#if note.pinned || editing}
						<div class="note-toprow">
							<span class="{editing ? 'editing-eyebrow' : 'pinned-eyebrow'}">
								{editing ? m.notes_editing_eyebrow() : m.notes_section_pinned()}
							</span>
							<span class="note-age">{ageOf(note.updated, $tickStore)}</span>
						</div>
					{/if}

					<div class="note-body">
						{#each segments(note.title || note.body || "") as seg}{#if seg.hit}<mark class="hl">{seg.t}</mark>{:else}{seg.t}{/if}{/each}
					</div>
					{#if note.title && note.body}
						<div class="note-sub">
							{#each segments(hasQuery && hit(note.body) ? bodySnippet(note.body) : note.body) as seg}{#if seg.hit}<mark class="hl">{seg.t}</mark>{:else}{seg.t}{/if}{/each}
						</div>
					{/if}

					{#if note.items?.length}
						{@const shownItems = hasQuery
							? note.items.map((it, i) => ({ it, i })).filter(({ it }) => hit(it.t))
							: note.items.map((it, i) => ({ it, i }))}
						{#if shownItems.length}
							<div class="check-head">
								<span class="check-count">{note.items.filter((i) => i.d).length} / {note.items.length}</span>
							</div>
							<div class="check-items">
								{#each shownItems as { it, i } (i)}
									<label class="check-item">
										<input type="checkbox" checked={it.d} onchange={() => toggleTodoItem(note.id, i)} class="sr-only" />
										<span class="box {it.d ? 'box-done' : ''}">{it.d ? "✓" : ""}</span>
										<span class={it.d ? "item-done" : ""}>
											{#each segments(it.t) as seg}{#if seg.hit}<mark class="hl">{seg.t}</mark>{:else}{seg.t}{/if}{/each}
										</span>
									</label>
								{/each}
							</div>
						{/if}
					{/if}

					<div class="pill-row">
						{#if chip}
							<span class="pill {chip.overdue ? 'pill-overdue' : 'pill-due'}">{chip.text}</span>
						{/if}
						{#if note.tag}
							<span class="pill pill-cat">
								{#each segments(note.tag) as seg}{#if seg.hit}<mark class="hl">{seg.t}</mark>{:else}{seg.t}{/if}{/each}
							</span>
						{/if}
						{#if categoryName(note.category_key)}
							<span class="pill pill-cat {overdue ? 'pill-cat-overdue' : ''}">
								{#each segments(categoryName(note.category_key)) as seg}{#if seg.hit}<mark class="hl">{seg.t}</mark>{:else}{seg.t}{/if}{/each}
							</span>
						{/if}
						<span class="row-actions">
							<button type="button" class="row-btn" onclick={() => void openNoteEditor(note.id)} title={m.notes_open_in_editor()} aria-label={m.notes_open_in_editor()}>⤤</button>
							<button type="button" class="row-btn" onclick={() => togglePinNote(note.id)} title={note.pinned ? m.scratchpad_unpin() : m.scratchpad_pin()}>{note.pinned ? "✦" : "✧"}</button>
							<button type="button" class="row-btn" onclick={() => deleteNote(note.id)} title={m.scratchpad_delete()}>✕</button>
						</span>
					</div>
				</div>
			{/each}

			<!-- Done: grouped under an eyebrow while searching (5.6), behind the
			     footer toggle otherwise. -->
			{#if hasQuery && shownDone.length > 0}
				<div class="done-eyebrow">{m.notes_search_done_matches({ count: shownDone.length })}</div>
			{/if}
			{#if (hasQuery && shownDone.length > 0) || (!hasQuery && showDone)}
				{#each (hasQuery ? shownDone : doneNotes) as note (note.id)}
					<div class="note note-done">
						<div class="note-body item-done">
							{#each segments(note.title || note.items?.[0]?.t || "") as seg}{#if seg.hit}<mark class="hl hl-struck">{seg.t}</mark>{:else}{seg.t}{/if}{/each}
						</div>
						<div class="pill-row">
							<span class="row-actions">
								<button type="button" class="row-btn" onclick={() => void openNoteEditor(note.id)} title={m.notes_open_in_editor()} aria-label={m.notes_open_in_editor()}>⤤</button>
								<button type="button" class="row-btn" onclick={() => deleteNote(note.id)} title={m.scratchpad_delete()}>✕</button>
							</span>
						</div>
					</div>
				{/each}
			{/if}
		</div>

		<!-- Footer — both of its jobs are being done by the query while one is
		     live, so both swap (5.7). -->
		<div class="pad-foot">
			{#if hasQuery}
				<span class="foot-saved">{m.notes_search_count({ n: shownActive.length + shownDone.length, total: $notesStore.length })}</span>
				<button type="button" class="foot-done" onclick={closeSearch}>{m.notes_search_clear()}</button>
			{:else}
				<span class="foot-saved">{savedAgo ? m.scratchpad_saved_ago({ ago: savedAgo }) : ""}</span>
				{#if doneNotes.length > 0}
					<button type="button" class="foot-done" onclick={() => (showDone = !showDone)}>
						{showDone ? m.scratchpad_hide_done() : m.scratchpad_show_done({ count: doneNotes.length })}
					</button>
				{/if}
			{/if}
		</div>
	</div>
{/if}

<style>
	.pad {
		position: fixed;
		right: 16px;
		bottom: 16px;
		width: 300px;
		max-height: calc(100vh - 140px);
		z-index: 45;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: var(--card-bg);
		border: 1px solid #e0dace;
		border-radius: 16px;
		box-shadow: var(--shadow-float);
	}
	/* Detached: the pad IS the (transparent, frameless) window — fill it. */
	.pad-detached {
		inset: 0;
		width: auto;
		height: 100vh;
		max-height: none;
		border-radius: 14px;
		box-shadow: none;
	}
	.pad-detached .pad-list {
		flex: 1;
	}

	/* ── Header ── */
	.pad-head {
		display: flex;
		align-items: center;
		gap: 9px;
		padding: 11px 13px;
		border-bottom: 1px solid var(--hairline);
		flex: none;
	}
	.drag-dots {
		display: grid;
		grid-template-columns: 2px 2px;
		gap: 3px;
		padding: 4px;
		margin: -4px;
		border: none;
		background: transparent;
		cursor: grab;
		touch-action: none;
	}
	.drag-dots:active { cursor: grabbing; }
	.dot {
		width: 2px;
		height: 2px;
		background: #c8c2b6;
		border-radius: 50%;
	}
	.pad-title {
		font: 600 12px 'IBM Plex Sans', sans-serif;
		flex: 1;
	}
	.pad-count {
		font: 400 12.5px 'IBM Plex Mono', monospace;
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
	.head-btn-collapse {
		background: var(--teal-tint);
		color: var(--teal);
	}
	/* The + is the only filled control in the header (3.1). */
	.head-btn-new {
		width: 24px;
		height: 24px;
		border-radius: 6px;
		background: var(--teal);
		color: #fff;
		font-size: 14px;
		line-height: 1;
	}
	.head-btn:hover { filter: brightness(0.95); }

	/* ── Composer / search (one slot) ── */
	.composer {
		display: flex;
		align-items: center;
		gap: 9px;
		padding: 9px 13px;
		background: var(--row);
		border-bottom: 1px solid var(--hairline);
		flex: none;
	}
	.composer-input {
		flex: 1;
		min-width: 0;
		resize: none;
		border: none;
		outline: none;
		background: transparent;
		font: 400 12.5px 'IBM Plex Sans', sans-serif;
		color: var(--ink);
		line-height: 1.4;
	}
	.composer-input::placeholder { color: #a39d92; }
	.search-glyph {
		flex: none;
		font-size: 12.5px;
		color: var(--ink-faint);
	}
	.kbd-pill {
		flex: none;
		padding: 2px 8px;
		background: var(--hairline);
		color: var(--ink-muted);
		border-radius: 999px;
		font: 600 12px 'IBM Plex Sans', sans-serif;
	}

	/* ── Category chips (search) ── */
	.cat-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		padding: 8px 13px;
		border-bottom: 1px solid var(--hairline);
		flex: none;
	}
	.cat-chip {
		padding: 2px 9px;
		border: 1px solid var(--card-border);
		border-radius: 999px;
		background: transparent;
		font: 500 12px 'IBM Plex Sans', sans-serif;
		color: var(--ink-muted);
		cursor: pointer;
	}
	.cat-chip-on {
		background: var(--teal);
		border-color: var(--teal);
		color: #fff;
	}

	/* ── List ── */
	.pad-list {
		display: flex;
		flex-direction: column;
		gap: 7px;
		padding: 11px 13px;
		overflow-y: auto;
		min-height: 0;
	}
	.empty-line {
		align-self: flex-start;
		padding: 6px 10px;
		border: 1px dashed #ded8cd;
		border-radius: 9px;
		font-size: 12px;
		color: #a39d92;
	}

	/* ── No-match state (5.10) ── */
	.no-match {
		padding: 12px;
		border: 1px dashed #ded8cd;
		border-radius: 10px;
		display: flex;
		flex-direction: column;
		gap: 7px;
	}
	.no-match-line {
		font: 500 12.5px 'IBM Plex Sans', sans-serif;
		color: var(--ink);
		overflow-wrap: anywhere;
	}
	.no-match-covers {
		font-size: 12px;
		color: #a39d92;
		line-height: 1.4;
	}
	.no-match-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
	}
	.nm-chip {
		padding: 3px 10px;
		border: 1px solid var(--card-border);
		border-radius: 999px;
		background: transparent;
		font: 500 12px 'IBM Plex Sans', sans-serif;
		color: var(--ink-muted);
		cursor: pointer;
		overflow-wrap: anywhere;
	}
	.nm-chip-new {
		background: var(--teal);
		border-color: var(--teal);
		color: #fff;
	}

	.note {
		padding: 10px 11px;
		background: var(--row);
		border-radius: 10px;
	}
	.note-pinned {
		border-left: 2px solid var(--teal);
		border-radius: 4px 10px 10px 4px;
	}
	/* 3.4 — the note the editor holds takes the pinned treatment's left rule. */
	.note-editing {
		border-left: 2px solid var(--teal);
		border-radius: 4px 10px 10px 4px;
		background: var(--teal-tint);
	}
	.note-overdue {
		background: var(--rust-tint);
		border: 1px solid var(--rust-tint-border);
	}
	.note-done { opacity: 0.75; }

	.note-toprow {
		display: flex;
		align-items: baseline;
		gap: 7px;
		justify-content: space-between;
	}
	.pinned-eyebrow,
	.editing-eyebrow {
		font: 600 12px 'IBM Plex Sans', sans-serif;
		letter-spacing: 0.16em;
		color: var(--teal);
	}
	.note-age {
		font: 400 12px 'IBM Plex Mono', monospace;
		color: var(--ink-faint);
	}
	.note-body {
		font-size: 12.5px;
		margin-top: 5px;
		overflow-wrap: anywhere;
	}
	.note-sub {
		font-size: 12.5px;
		color: var(--ink-muted);
		margin-top: 3px;
		overflow-wrap: anywhere;
	}

	.check-head {
		display: flex;
		justify-content: flex-end;
		margin-top: 5px;
	}
	.check-count {
		font: 400 12px 'IBM Plex Mono', monospace;
		color: var(--ink-faint);
	}
	.check-items {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-top: 6px;
	}
	.check-item {
		display: flex;
		align-items: center;
		gap: 9px;
		font-size: 12.5px;
		cursor: pointer;
	}
	.box {
		width: 14px;
		height: 14px;
		flex: none;
		border: 1.5px solid #c2bcb0;
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #fff;
		font-size: 12px;
	}
	.note-overdue .box { border-color: #d8a696; }
	.box-done {
		background: var(--teal);
		border-color: var(--teal);
	}
	.item-done {
		color: #a39d92;
		text-decoration: line-through;
	}

	/* ── Match highlight (5.9) ── */
	.hl {
		background: var(--match-tint);
		border-radius: 3px;
		padding: 0 2px;
		color: inherit;
	}
	/* On struck-through done text the strike would otherwise run straight
	   through the highlight. */
	.hl-struck {
		text-decoration: none;
		color: #5f5b53;
	}

	.done-eyebrow {
		margin-top: 4px;
		font: 600 10.5px 'IBM Plex Sans', sans-serif;
		letter-spacing: 0.10em;
		color: var(--eyebrow-ink);
	}

	.pill-row {
		display: flex;
		align-items: center;
		gap: 5px;
		margin-top: 7px;
	}
	.pill {
		padding: 2px 8px;
		border-radius: 999px;
		font: 600 12px 'IBM Plex Sans', sans-serif;
		white-space: nowrap;
	}
	.pill-due { background: var(--teal-tint); color: var(--teal); }
	.pill-overdue {
		background: var(--card-bg);
		color: var(--rust);
		border: 1px solid var(--rust-tint-border);
	}
	.pill-cat { background: var(--hairline); color: var(--ink-muted); }
	.pill-cat-overdue { background: #f6ece7; color: #a2705f; }

	.row-actions {
		margin-left: auto;
		display: flex;
		gap: 2px;
		opacity: 0;
		transition: opacity 0.15s;
	}
	.note:hover .row-actions { opacity: 1; }
	.row-btn {
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
	}
	.row-btn:hover { color: var(--ink); background: var(--chip); }

	/* ── Footer ── */
	.pad-foot {
		margin-top: auto;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 13px;
		border-top: 1px solid var(--hairline);
		flex: none;
	}
	.foot-saved {
		font: 400 12px 'IBM Plex Mono', monospace;
		color: var(--ink-faint);
	}
	.foot-done {
		border: none;
		background: transparent;
		font-size: 12.5px;
		color: var(--teal);
		cursor: pointer;
		padding: 0;
	}
	.foot-done:hover { text-decoration: underline; }
</style>
