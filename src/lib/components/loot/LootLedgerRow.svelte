<!--
	One ledger row — shared by TRACK (editable) and the LOGS detail view
	(read-only).

	Structure follows LOOT_OCR_MARKUP.md §1 exactly: five cells, always five,
	because the grid contract in LootView's :global block assumes them. A row
	with a missing cell silently shifts every column after it.

	The rail hue arrives as a `loot-rail-*` class setting `--rail`, which the
	row rule reads — the palette lives only in CSS.
-->
<script lang="ts">
	import type { Snippet } from "svelte";
	import type { CapturedRow } from "$lib/models/loot";
	import { railClass, sourceLabel } from "$lib/utils/loot-format";
	import { m } from "$lib/paraglide/messages";

	interface Props {
		row: CapturedRow;
		/** Zebra striping — the caller knows its own index. */
		alt?: boolean;
		/** Catalog icon path, resolved by the caller from its own icon map. */
		icon?: string;
		actions?: Snippet<[CapturedRow]>;
	}

	let { row, alt = false, icon, actions }: Props = $props();

	/**
	 * Line 1 is the item as the user knows it: the catalog name, or the name
	 * they typed. Only a row that is neither matched nor renamed falls back to
	 * the raw OCR string — a rename on an unmatched row is still the user's
	 * answer and must not be overwritten by the scanner's spelling.
	 */
	const showsRaw = $derived(!row.matchedItemId && !row.edited);
	const showReadAs = $derived(!showsRaw && row.rawName !== row.displayName);

	const indicator = $derived.by(() => {
		if (row.edited) {
			return { glyph: "✎", cls: "loot-row-ind-edited", label: m.loot_indicator_edited() };
		}
		if (row.matchedItemId) {
			return { glyph: "✓", cls: "loot-row-ind-matched", label: m.loot_indicator_matched() };
		}
		return { glyph: "?", cls: "loot-row-ind-unmatched", label: m.loot_indicator_unmatched() };
	});
</script>

<div
	class="loot-ledger-row {railClass(row.matchedSource)}"
	class:loot-ledger-row-alt={alt}
>
	<span class="loot-row-ind {indicator.cls}" title={indicator.label}>{indicator.glyph}</span>

	<span class="loot-row-icon" class:loot-row-icon-empty={!icon}>
		{#if icon}
			<img src="/{icon}" alt="" loading="lazy" />
		{/if}
	</span>

	<span class="loot-row-name" title={row.note ? row.note : row.edited ? row.rawName : row.displayName}>
		<span class="loot-row-name-line">
			<span class="loot-row-name-primary" class:loot-row-name-primary-raw={showsRaw}>
				{showsRaw ? row.rawName : row.displayName}
			</span>
			{#if row.edited}<span class="loot-row-badge">{m.loot_row_edited_badge()}</span>{/if}
		</span>
		<span class="loot-row-name-secondary">
			{row.matchedItemId ? sourceLabel(row.matchedSource) : m.loot_row_no_match()}
			{#if showReadAs}
				<span class="loot-row-name-connector">· {m.loot_row_read_as()}</span>
				{row.rawName}
			{/if}
			{#if row.note}
				<span class="loot-row-note">· {row.note}</span>
			{/if}
		</span>
	</span>

	<span class="loot-row-count">{row.count}</span>

	{#if actions}
		<span class="loot-row-actions">{@render actions(row)}</span>
	{/if}
</div>
