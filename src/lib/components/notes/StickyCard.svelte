<script lang="ts">
	import type { Note, TodoNote, ReminderNote, TextNote } from "$lib/models/notes";
	import {
		togglePinNote,
		deleteNote,
		toggleTodoItem,
		setTodoItemText,
		addTodoItem,
		removeTodoItem,
		updateNote,
		noteCategoriesStore,
	} from "$lib/stores";
	import { STICKY_COLORS } from "$lib/utils/sticky-colors";
	import { MAX_BODY_LEN, MAX_TITLE_LEN, MAX_TODO_ITEMS } from "$lib/models/notes";
	import { m } from "$lib/paraglide/messages";
	import { confirm as tauriConfirm } from "@tauri-apps/plugin-dialog";

	let { note, ago }: { note: Note; ago: string } = $props();

	let category = $derived($noteCategoriesStore.find((c) => c.key === note.category_key));
	let tone = $derived(category ? STICKY_COLORS[category.color] : STICKY_COLORS.slate);

	let expanded = $state(false);

	function onCardClick(e: MouseEvent) {
		// Don't expand when clicking interactive children (buttons, checkboxes, inputs).
		const target = e.target as HTMLElement;
		if (target.closest("button, input, textarea, .todo-item")) return;
		expanded = !expanded;
	}

	async function onDelete(e: MouseEvent) {
		// Stop propagation so the underlying card-click handler doesn't fire.
		// Use Tauri's async dialog plugin instead of window.confirm() — the
		// native confirm() does not block reliably when fired from within an
		// overlay-portal context (notes panel z=61), so deletion would run
		// before the user could answer.
		e.stopPropagation();
		const ok = await tauriConfirm(m.notes_delete_note_confirm(), {
			title: m.notes_delete_note_title(),
			kind: "warning",
		});
		if (ok) deleteNote(note.id);
	}

	function onPin(e: MouseEvent) {
		e.stopPropagation();
		togglePinNote(note.id);
	}

	function onTitleInput(e: Event) {
		const v = (e.target as HTMLInputElement).value.slice(0, MAX_TITLE_LEN);
		updateNote(note.id, { title: v } as Partial<Note>);
	}

	function onBodyInput(e: Event) {
		const v = (e.target as HTMLTextAreaElement).value.slice(0, MAX_BODY_LEN);
		updateNote(note.id, { body: v } as Partial<Note>);
	}

	function onWhenInput(e: Event) {
		const v = (e.target as HTMLInputElement).value;
		// HTML datetime-local format: "YYYY-MM-DDTHH:MM"
		if (!v) {
			updateNote(note.id, { when: null, fired: false } as Partial<Note>);
			return;
		}
		const t = new Date(v).getTime();
		if (Number.isNaN(t)) return;
		// Setting a new time resets `fired` so the tick re-fires it.
		updateNote(note.id, { when: t, fired: false } as Partial<Note>);
	}

	function whenInputValue(when: number | null): string {
		if (when == null) return "";
		const d = new Date(when);
		const pad = (n: number) => n.toString().padStart(2, "0");
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}

	function fmtReminderWhen(when: number | null): string {
		if (when == null) return m.notes_reminder_no_time();
		const d = new Date(when);
		const now = new Date();
		const sameDay =
			d.getFullYear() === now.getFullYear() &&
			d.getMonth() === now.getMonth() &&
			d.getDate() === now.getDate();
		const pad = (n: number) => n.toString().padStart(2, "0");
		if (sameDay) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
		return `${d.toLocaleDateString()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}

	function onTodoToggle(i: number, e: MouseEvent) {
		e.stopPropagation();
		toggleTodoItem(note.id, i);
	}

	function onTodoItemInput(i: number, e: Event) {
		const v = (e.target as HTMLInputElement).value;
		setTodoItemText(note.id, i, v);
	}

	function onTodoItemRemove(i: number, e: MouseEvent) {
		e.stopPropagation();
		removeTodoItem(note.id, i);
	}

	let newItemText = $state("");

	function commitNewItem() {
		const v = newItemText.trim();
		if (!v) return;
		addTodoItem(note.id, v);
		newItemText = "";
	}

	function onNewItemKey(e: KeyboardEvent) {
		if (e.key === "Enter") {
			e.preventDefault();
			commitNewItem();
		} else if (e.key === "Escape") {
			(e.target as HTMLElement).blur();
			e.stopPropagation();
		}
	}

	// Stop key events from bubbling to the panel-level ESC handler when editing.
	function trapKeys(e: KeyboardEvent) {
		if (e.key === "Escape") {
			(e.target as HTMLElement).blur();
			expanded = false;
			e.stopPropagation();
		}
	}

	let todoCounts = $derived.by(() => {
		if (note.type !== "todo") return { done: 0, total: 0 };
		const todo = note as TodoNote;
		return { done: todo.items.filter((i) => i.d).length, total: todo.items.length };
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
	class="card"
	style:background={tone.bg}
	style:border-color={tone.border}
	style:border-left-color={tone.fg}
	style:box-shadow="0 0 0 1px {tone.fg}40, 0 6px 14px rgba(0,0,0,0.4)"
	onclick={onCardClick}
	title={m.notes_card_edit_title()}
>
	<!-- corner clip -->
	<svg class="corner" width="14" height="14" viewBox="0 0 14 14" fill="none">
		<path d="M0 0H14V14L0 0Z" fill={tone.fg} fill-opacity="0.12" />
	</svg>

	<!-- head row -->
	<div class="head">
		<span class="type-icon" style:color={tone.fg}>
			{#if note.type === "reminder"}
				<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
					<path d="M6 1.5v.8M3 5.2a3 3 0 0 1 6 0v2l1 1.5H2l1-1.5z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round" />
					<path d="M5 10.5a1 1 0 0 0 2 0" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" />
				</svg>
			{:else if note.type === "todo"}
				<span class="todo-glyph" style:border-color={tone.fg}></span>
			{:else}
				<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
					<path d="M2.5 2h6.5l3 3v7H2.5z" stroke="currentColor" stroke-width="1.2" />
					<path d="M9 2v3h3" stroke="currentColor" stroke-width="1.2" />
				</svg>
			{/if}
		</span>

		<button
			type="button"
			class="pin"
			class:pinned={note.pinned}
			onclick={onPin}
			title={note.pinned ? m.notes_unpin_title() : m.notes_pin_title()}
			aria-label={note.pinned ? m.notes_unpin_title() : m.notes_pin_title()}
		>
			<svg width="11" height="11" viewBox="0 0 12 12" fill="none">
				<path d="M7 1.5l3.5 3.5L8.5 7 7 8.5l-2-2L2.5 9 1 11l2-1.5L5 7 3 5 4.5 3.5 7 1.5z" stroke="currentColor" stroke-width="1" stroke-linejoin="round" />
			</svg>
		</button>

		{#if expanded}
			<input
				class="title-input"
				value={note.title}
				oninput={onTitleInput}
				onkeydown={trapKeys}
				maxlength={MAX_TITLE_LEN}
				style:color={tone.fg}
			/>
		{:else}
			<span class="title" style:color={tone.fg}>{note.title}</span>
		{/if}

		<span class="age">{ago}</span>

		<button
			type="button"
			class="delete"
			onclick={onDelete}
			title={m.notes_delete_note_title()}
			aria-label={m.notes_delete_note_title()}
		>×</button>
	</div>

	<!-- body varies by type -->
	{#if note.type === "todo"}
		{@const todo = note as TodoNote}
		<div class="todo-body">
			{#each (expanded ? todo.items : todo.items.slice(0, 3)) as item, i (i)}
				<div class="todo-item" class:done={item.d}>
					<!-- svelte-ignore a11y_consider_explicit_label -->
					<button
						type="button"
						class="todo-check"
						onclick={(e) => onTodoToggle(i, e)}
						style:border-color={tone.fg}
						style:background={item.d ? tone.fg : "transparent"}
					>
						{#if item.d}
							<svg width="8" height="8" viewBox="0 0 10 10" fill="none">
								<path d="M2 5l2 2 4-4" stroke="#131313" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
							</svg>
						{/if}
					</button>
					{#if expanded}
						<input
							class="todo-input"
							value={item.t}
							oninput={(e) => onTodoItemInput(i, e)}
							onkeydown={trapKeys}
						/>
						<button
							type="button"
							class="todo-remove"
							onclick={(e) => onTodoItemRemove(i, e)}
							title={m.notes_remove_todo_item_title()}
							aria-label={m.notes_remove_todo_item_title()}
						>×</button>
					{:else}
						<span class="todo-text">{item.t}</span>
					{/if}
				</div>
			{/each}
			{#if !expanded && todo.items.length > 3}
				<div class="todo-more" style:color={tone.fg}>{m.notes_todo_more({ count: todo.items.length - 3 })}</div>
			{/if}
			{#if expanded && todo.items.length < MAX_TODO_ITEMS}
				<div class="todo-item add-row">
					<span class="todo-check ghost" style:border-color="{tone.fg}55">+</span>
					<input
						class="todo-input add"
						bind:value={newItemText}
						onkeydown={onNewItemKey}
						onblur={commitNewItem}
						placeholder={m.notes_add_todo_item_placeholder()}
					/>
				</div>
			{/if}
		</div>
	{:else if note.type === "reminder"}
		{@const reminder = note as ReminderNote}
		<div class="reminder-row" style:color={tone.fg}>
			<svg width="11" height="11" viewBox="0 0 12 12" fill="none">
				<circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1" />
				<path d="M6 3.5V6l1.5 1.2" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" />
			</svg>
			{#if expanded}
				<input
					type="datetime-local"
					class="when-input"
					value={whenInputValue(reminder.when)}
					oninput={onWhenInput}
					onkeydown={trapKeys}
					style:color={tone.fg}
				/>
			{:else}
				<span>{fmtReminderWhen(reminder.when)}</span>
			{/if}
		</div>
		{#if expanded}
			<textarea
				class="body-input"
				value={reminder.body}
				oninput={onBodyInput}
				onkeydown={trapKeys}
				placeholder={m.notes_card_body_placeholder()}
				rows="2"
			></textarea>
		{:else if reminder.body}
			<div class="prose">{reminder.body}</div>
		{/if}
	{:else}
		{@const text = note as TextNote}
		{#if expanded}
			<textarea
				class="body-input"
				value={text.body}
				oninput={onBodyInput}
				onkeydown={trapKeys}
				placeholder={m.notes_card_body_placeholder()}
				rows="4"
			></textarea>
		{:else}
			<div class="prose clamp-3">{text.body}</div>
		{/if}
	{/if}

	<!-- footer -->
	{#if note.tag || note.type === "todo"}
		<div class="foot">
			<span class="tag" style:color={tone.fg}>{note.tag ?? ""}</span>
			{#if note.type === "todo"}
				<span class="todo-count" style:color={tone.fg}>{todoCounts.done}/{todoCounts.total}</span>
			{/if}
		</div>
	{/if}
</div>

<style>
	.card {
		margin: 6px 10px;
		padding: 9px 11px 10px;
		border-style: solid;
		border-width: 1px;
		border-left-width: 3px;
		border-radius: 2px;
		position: relative;
		transition: box-shadow 0.15s;
		cursor: pointer;
	}
	.corner {
		position: absolute;
		top: 0;
		right: 0;
		opacity: 0.5;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-bottom: 4px;
	}
	.type-icon {
		display: inline-flex;
		opacity: 0.9;
	}
	.todo-glyph {
		width: 10px;
		height: 10px;
		border-style: solid;
		border-width: 1px;
		border-radius: 2px;
		display: inline-block;
	}
	.pin {
		background: transparent;
		border: 0;
		padding: 0;
		color: #4d4352;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.pin.pinned {
		color: #dac839;
	}
	.title,
	.title-input {
		font-family: var(--font-display);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.02em;
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.title-input {
		background: transparent;
		border: 0;
		border-bottom: 1px dashed rgba(255, 255, 255, 0.15);
		outline: none;
		padding: 0;
		min-width: 0;
	}
	.age {
		font-family: var(--font-mono);
		font-size: 9px;
		font-variant-numeric: tabular-nums;
		color: #998d9d;
		flex-shrink: 0;
	}
	.delete {
		background: transparent;
		border: 0;
		color: #4d4352;
		font-size: 14px;
		line-height: 1;
		padding: 0 2px;
		cursor: pointer;
		border-radius: 2px;
	}
	.delete:hover {
		color: #ffb4ab;
		background: rgba(255, 180, 171, 0.08);
	}
	.todo-body {
		font-family: var(--font-mono);
		font-size: 10px;
		color: #e5e2e1;
		line-height: 1.55;
	}
	.todo-item {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.todo-item.done {
		opacity: 0.4;
	}
	.todo-item.done .todo-text {
		text-decoration: line-through;
	}
	.todo-check {
		width: 10px;
		height: 10px;
		border-style: solid;
		border-width: 1px;
		border-radius: 2px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		flex-shrink: 0;
		cursor: pointer;
	}
	.todo-check.ghost {
		cursor: default;
		font-family: var(--font-mono);
		font-size: 10px;
		line-height: 1;
		color: inherit;
		opacity: 0.6;
	}
	.todo-input {
		flex: 1;
		min-width: 0;
		background: transparent;
		border: 0;
		outline: none;
		color: #e5e2e1;
		font-family: var(--font-mono);
		font-size: 10px;
		line-height: 1.55;
		padding: 0;
	}
	.todo-input.add::placeholder {
		color: #5a5662;
	}
	.todo-remove {
		background: transparent;
		border: 0;
		color: #4d4352;
		font-size: 12px;
		line-height: 1;
		padding: 0 4px;
		cursor: pointer;
		border-radius: 2px;
		flex-shrink: 0;
	}
	.todo-remove:hover {
		color: #ffb4ab;
		background: rgba(255, 180, 171, 0.08);
	}
	.add-row {
		opacity: 0.85;
		margin-top: 2px;
	}
	.todo-more {
		font-size: 9px;
		opacity: 0.6;
		margin-top: 2px;
		margin-left: 16px;
	}
	.reminder-row {
		font-family: var(--font-mono);
		font-size: 10.5px;
		display: flex;
		align-items: center;
		gap: 5px;
		margin-bottom: 3px;
	}
	.when-input {
		background: transparent;
		border: 0;
		border-bottom: 1px dashed rgba(255, 255, 255, 0.15);
		outline: none;
		font-family: var(--font-mono);
		font-size: 10.5px;
		padding: 0;
		min-width: 0;
		color-scheme: dark;
	}
	.prose {
		font-family: var(--font-mono);
		font-size: 10px;
		color: #cfc2d4;
		line-height: 1.5;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.clamp-3 {
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.body-input {
		width: 100%;
		background: rgba(0, 0, 0, 0.25);
		border: 1px dashed rgba(255, 255, 255, 0.1);
		color: #cfc2d4;
		font-family: var(--font-mono);
		font-size: 10px;
		line-height: 1.5;
		padding: 4px 6px;
		outline: none;
		border-radius: 2px;
		resize: vertical;
	}
	.body-input:focus {
		border-style: solid;
	}
	.foot {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-top: 6px;
	}
	.tag {
		font-family: var(--font-mono);
		font-size: 9px;
		opacity: 0.7;
	}
	.todo-count {
		font-family: var(--font-mono);
		font-size: 9px;
		opacity: 0.55;
	}
</style>
