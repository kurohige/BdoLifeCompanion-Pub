<script lang="ts">
	import {
		notesStore,
		notesActiveCategoryStore,
		notesSearchStore,
		noteCategoriesStore,
	} from "$lib/stores";
	import type { Note, TodoNote, TextNote, ReminderNote } from "$lib/models/notes";
	import type { StickyTone } from "$lib/utils/sticky-colors";
	import { m } from "$lib/paraglide/messages";
	import StickyCard from "./StickyCard.svelte";

	let { focusTone }: { focusTone: StickyTone } = $props();

	// Local "now" used for the today/earlier split + relative-age labels.
	// Updated every minute so cards reshuffle as TODAY rolls forward.
	let now = $state(Date.now());
	$effect(() => {
		const id = setInterval(() => (now = Date.now()), 60_000);
		return () => clearInterval(id);
	});

	function isToday(ts: number, ref: number): boolean {
		const a = new Date(ts);
		const b = new Date(ref);
		return (
			a.getFullYear() === b.getFullYear() &&
			a.getMonth() === b.getMonth() &&
			a.getDate() === b.getDate()
		);
	}

	function ago(ts: number, ref: number): string {
		const diff = ref - ts;
		if (diff < 60_000) return "now";
		const mins = Math.floor(diff / 60_000);
		if (mins < 60) return `${mins}m`;
		const hrs = Math.floor(mins / 60);
		if (hrs < 24) return `${hrs}h`;
		const days = Math.floor(hrs / 24);
		if (days === 1) return "yest";
		if (days < 7) return `${days}d`;
		const weeks = Math.floor(days / 7);
		if (weeks < 4) return `${weeks}w`;
		const months = Math.floor(days / 30);
		return `${months}mo`;
	}

	function matchesSearch(n: Note, q: string): boolean {
		if (!q) return true;
		const needle = q.toLowerCase();
		if (n.title.toLowerCase().includes(needle)) return true;
		if (n.tag?.toLowerCase().includes(needle)) return true;
		if (n.type === "text") return (n as TextNote).body.toLowerCase().includes(needle);
		if (n.type === "reminder") return (n as ReminderNote).body.toLowerCase().includes(needle);
		if (n.type === "todo") {
			return (n as TodoNote).items.some((it) => it.t.toLowerCase().includes(needle));
		}
		return false;
	}

	let visible = $derived.by(() => {
		const q = $notesSearchStore.trim();
		const activeKey = $notesActiveCategoryStore;
		// When a category is active, HIDE off-category notes outright. (The
		// design originally dimmed them to 55% so misfiled notes were visible
		// across categories, but users found that confusing — a "new category"
		// should look empty, not pre-populated with dimmed prior notes.)
		return $notesStore.filter((n) => {
			if (activeKey != null && n.category_key !== activeKey) return false;
			return matchesSearch(n, q);
		});
	});

	let pinned = $derived(visible.filter((n) => n.pinned));
	let today = $derived(visible.filter((n) => !n.pinned && isToday(n.updated, now)));
	let earlier = $derived(visible.filter((n) => !n.pinned && !isToday(n.updated, now)));

	function sortByUpdated(a: Note, b: Note): number {
		return b.updated - a.updated;
	}

	let sections = $derived([
		{ key: "PINNED" as const, label: m.notes_section_pinned(), rows: [...pinned].sort(sortByUpdated) },
		{ key: "TODAY" as const, label: m.notes_section_today(), rows: [...today].sort(sortByUpdated) },
		{ key: "EARLIER" as const, label: m.notes_section_earlier(), rows: [...earlier].sort(sortByUpdated) },
	]);

	let totalVisible = $derived(visible.length);
	let activeCat = $derived(
		$noteCategoriesStore.find((c) => c.key === $notesActiveCategoryStore) ?? null,
	);
</script>

<div class="list no-scrollbar">
	{#if totalVisible === 0}
		<div class="empty">
			{#if $notesSearchStore.trim()}
				<p class="empty-text">{m.notes_empty_search({ query: $notesSearchStore })}</p>
			{:else if activeCat}
				<p class="empty-text">{m.notes_empty_filter({ category: activeCat.name })}</p>
			{:else}
				<p class="empty-text">{m.notes_empty_all()}</p>
			{/if}
		</div>
	{:else}
		{#each sections as section (section.key)}
			{#if section.rows.length > 0}
				<div class="section">
					<div class="section-head">
						<span class="section-label" style:color={focusTone.fg}>{section.label}</span>
						<div
							class="section-divider"
							style:background="linear-gradient(90deg, {focusTone.fg}30, transparent)"
						></div>
						<span class="section-count">{section.rows.length}</span>
					</div>
					{#each section.rows as n (n.id)}
						<StickyCard note={n} ago={ago(n.updated, now)} />
					{/each}
				</div>
			{/if}
		{/each}
	{/if}
	<div class="tail"></div>
</div>

<style>
	.list {
		flex: 1;
		overflow-y: auto;
		overflow-x: hidden;
		padding: 4px 0;
	}
	.no-scrollbar::-webkit-scrollbar {
		display: none;
	}
	.no-scrollbar {
		scrollbar-width: none;
	}
	.section {
		margin-top: 6px;
	}
	.section-head {
		padding: 8px 14px 2px;
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.section-label {
		font-family: var(--font-display);
		font-size: 9px;
		letter-spacing: 0.26em;
		opacity: 0.85;
	}
	.section-divider {
		flex: 1;
		height: 1px;
	}
	.section-count {
		font-family: var(--font-mono);
		font-size: 9px;
		font-variant-numeric: tabular-nums;
		color: #4d4352;
	}
	.empty {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 32px 16px;
		text-align: center;
	}
	.empty-text {
		font-family: var(--font-mono);
		font-size: 11px;
		color: #998d9d;
		line-height: 1.5;
	}
	.tail {
		height: 60px;
	}
</style>
