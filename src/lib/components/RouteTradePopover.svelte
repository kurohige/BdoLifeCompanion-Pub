<script lang="ts">
	import { untrack } from "svelte";
	import {
		findItemsByName,
		lookupTradeDefaults,
		tierDefaultSilver,
		addTrade,
		barterItemsStore,
	} from "$lib/stores";
	import TierBadge from "$lib/components/ui/TierBadge.svelte";
	import type { IslandNode, BarterTier, BarterItemDef } from "$lib/models/bartering";

	interface Props {
		node: IslandNode;
		onClose: () => void;
	}

	let { node, onClose }: Props = $props();

	let receiveQuery = $state("");
	let resolvedItem = $state<BarterItemDef | null>(null);
	// Popover is mounted fresh per node click — seed manualTier from the node's tier
	// once, then let the user override it freely.
	let manualTier = $state<BarterTier>(untrack(() => node.tier));
	let qty = $state(1);
	let giveText = $state("");
	let highlightIdx = $state(0);
	let inputEl = $state<HTMLInputElement | null>(null);
	let isSp = $state(false);
	let silverPerUnit = $state(0);

	let suggestions = $derived(
		!resolvedItem && receiveQuery.trim().length > 0
			? findItemsByName(receiveQuery, 8)
			: []
	);

	$effect(() => {
		if (inputEl) inputEl.focus();
	});

	$effect(() => {
		// When the user picks an item, refresh defaults
		if (resolvedItem) {
			const defaults = lookupTradeDefaults(resolvedItem.id, node.region);
			if (defaults) {
				manualTier = defaults.tier;
				silverPerUnit = defaults.silverPerUnit;
				isSp = defaults.sp;
			}
		} else if (!receiveQuery.trim()) {
			silverPerUnit = 0;
			isSp = false;
		} else {
			// Free text — fall back to current manual tier's default silver
			silverPerUnit = tierDefaultSilver(manualTier);
			isSp = false;
		}
	});

	function pickSuggestion(item: BarterItemDef) {
		resolvedItem = item;
		receiveQuery = item.name;
	}

	function clearItem() {
		resolvedItem = null;
		receiveQuery = "";
		highlightIdx = 0;
	}

	function onKeyDown(e: KeyboardEvent) {
		if (e.key === "Escape") {
			e.preventDefault();
			onClose();
			return;
		}
		if (suggestions.length === 0) return;
		if (e.key === "ArrowDown") {
			e.preventDefault();
			highlightIdx = Math.min(highlightIdx + 1, suggestions.length - 1);
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			highlightIdx = Math.max(highlightIdx - 1, 0);
		} else if (e.key === "Enter") {
			e.preventDefault();
			pickSuggestion(suggestions[highlightIdx]);
		}
	}

	function commit() {
		const name = receiveQuery.trim();
		if (!name || qty < 1) return;
		addTrade({
			nodeId: node.id,
			receiveName: name,
			receiveTier: resolvedItem?.tier ?? manualTier,
			qty,
			silverPerUnit,
			receiveSp: isSp || undefined,
			giveText: giveText.trim() || undefined,
			receiveItemId: resolvedItem?.id,
		});
		onClose();
	}

	const TIER_OPTS: BarterTier[] = [1, 2, 3, 4, 5, 6, 7];
	const SP_BLOCK_VAR = "var(--tsp)";
</script>

<div
	class="popover glass-card"
	role="dialog"
	aria-label="Add barter trade at {node.name}"
	style:--tier-color="var(--t{node.tier})"
>
	<div class="header">
		<div class="title">
			<TierBadge tier={node.tier} size={20} />
			<span class="island-name">{node.name.toUpperCase()}</span>
			<span class="region">{node.region.toUpperCase()}</span>
		</div>
		<button type="button" class="close" onclick={onClose} aria-label="Close">×</button>
	</div>

	<div class="field">
		<div class="input-wrap">
			<input
				bind:this={inputEl}
				type="text"
				class="text-input"
				placeholder="Receive item..."
				bind:value={receiveQuery}
				oninput={() => {
					resolvedItem = null;
					highlightIdx = 0;
				}}
				onkeydown={onKeyDown}
				autocomplete="off"
			/>
			{#if resolvedItem}
				<button type="button" class="clear-btn" onclick={clearItem} aria-label="Clear">×</button>
			{/if}
		</div>

		{#if suggestions.length > 0}
			<div class="suggestions" role="listbox">
				{#each suggestions as item, i (item.id)}
					<button
						type="button"
						class="suggest-row"
						class:active={i === highlightIdx}
						onclick={() => pickSuggestion(item)}
						onmouseenter={() => (highlightIdx = i)}
					>
						<TierBadge tier={item.tier} size={14} />
						<span class="suggest-name">{item.name}</span>
					</button>
				{/each}
			</div>
		{/if}
	</div>

	{#if !resolvedItem}
		<div class="tier-row">
			{#each TIER_OPTS as t (t)}
				<button
					type="button"
					class="tier-btn"
					class:active={manualTier === t}
					style:--btn-color="var(--t{t})"
					onclick={() => (manualTier = t)}
				>T{t}</button>
			{/each}
			<button
				type="button"
				class="tier-btn"
				class:active={isSp}
				style:--btn-color={SP_BLOCK_VAR}
				onclick={() => (isSp = !isSp)}
			>SP</button>
		</div>
	{/if}

	<input
		type="text"
		class="text-input"
		placeholder='Give (optional)'
		bind:value={giveText}
		autocomplete="off"
	/>

	<div class="qty-row">
		<button type="button" class="qty-btn" onclick={() => (qty = Math.max(1, qty - 1))}>−</button>
		<input
			type="number"
			min="1"
			class="qty-input font-mono"
			bind:value={qty}
			oninput={() => {
				if (qty < 1 || isNaN(qty)) qty = 1;
			}}
		/>
		<button type="button" class="qty-btn" onclick={() => (qty = qty + 1)}>+</button>
		<button type="button" class="qty-step" onclick={() => (qty = qty + 5)}>+5</button>
		<button type="button" class="qty-step" onclick={() => (qty = qty + 10)}>+10</button>
	</div>

	{#if silverPerUnit > 0}
		<div class="silver-preview font-mono">
			{(silverPerUnit * qty).toLocaleString()} silver
			<span class="silver-rate">({silverPerUnit.toLocaleString()}/ea)</span>
		</div>
	{/if}

	<button type="button" class="add-btn" disabled={!receiveQuery.trim() || qty < 1} onclick={commit}>
		+ ADD BARTER
	</button>
</div>

<style>
	.popover {
		display: flex;
		flex-direction: column;
		gap: 5px;
		padding: 7px;
		width: 218px;
		box-shadow: inset 0 0 0 1px var(--tier-color), 0 8px 24px rgba(0, 0, 0, 0.6);
	}
	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 4px;
	}
	.title {
		display: flex;
		align-items: center;
		gap: 5px;
		min-width: 0;
	}
	.island-name {
		font-family: 'Space Grotesk', system-ui, sans-serif;
		font-size: 10px;
		letter-spacing: 0.12em;
		color: var(--tier-color);
		font-weight: 700;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.region {
		font-size: 7px;
		letter-spacing: 0.14em;
		color: var(--outline-hud);
		font-weight: 600;
	}
	.close {
		background: none;
		border: 0;
		color: var(--outline-hud);
		font-size: 16px;
		line-height: 1;
		cursor: pointer;
		padding: 0 3px;
	}
	.close:hover { color: var(--on-surface); }
	.field {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.input-wrap {
		position: relative;
	}
	.text-input {
		width: 100%;
		padding: 5px 7px;
		background: var(--surface-lowest);
		border: 0;
		color: var(--on-surface);
		font-size: 10px;
		font-family: 'Manrope', system-ui, sans-serif;
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--tier-color) 30%, transparent);
	}
	.text-input:focus {
		outline: none;
		box-shadow: inset 0 0 0 1px var(--tier-color);
	}
	.clear-btn {
		position: absolute;
		top: 50%;
		right: 4px;
		transform: translateY(-50%);
		background: none;
		border: 0;
		color: var(--outline-hud);
		font-size: 13px;
		cursor: pointer;
		padding: 0 3px;
	}
	.suggestions {
		display: flex;
		flex-direction: column;
		max-height: 160px;
		overflow-y: auto;
		background: var(--surface-lowest);
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--tier-color) 25%, transparent);
	}
	.suggest-row {
		display: flex;
		align-items: center;
		gap: 5px;
		padding: 4px 6px;
		background: none;
		border: 0;
		text-align: left;
		color: var(--on-surface);
		cursor: pointer;
	}
	.suggest-row.active {
		background: var(--surface-container);
		box-shadow: inset 2px 0 0 var(--tier-color);
	}
	.suggest-name {
		font-size: 10px;
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tier-row {
		display: flex;
		gap: 2px;
	}
	.tier-btn {
		flex: 1;
		min-width: 0;
		padding: 3px 0;
		background: var(--surface-lowest);
		color: var(--btn-color);
		border: 0;
		font-size: 9px;
		font-weight: 700;
		font-family: 'Space Grotesk', system-ui, sans-serif;
		letter-spacing: 0.04em;
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--btn-color) 30%, transparent);
		cursor: pointer;
	}
	.tier-btn.active {
		background: var(--btn-color);
		color: var(--bg, #0a0a0a);
		box-shadow: 0 0 6px var(--btn-color);
	}
	.qty-row {
		display: flex;
		align-items: center;
		gap: 3px;
	}
	.qty-btn {
		width: 22px;
		height: 22px;
		background: var(--surface-lowest);
		color: var(--tier-color);
		border: 0;
		font-size: 13px;
		font-weight: 700;
		cursor: pointer;
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--tier-color) 30%, transparent);
	}
	.qty-input {
		flex: 1;
		min-width: 0;
		height: 22px;
		text-align: center;
		background: var(--surface-lowest);
		color: var(--on-surface);
		border: 0;
		font-size: 11px;
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--tier-color) 30%, transparent);
	}
	.qty-step {
		padding: 3px 6px;
		background: var(--surface-lowest);
		color: var(--tier-color);
		border: 0;
		font-size: 9px;
		font-family: 'Space Grotesk', monospace;
		cursor: pointer;
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--tier-color) 25%, transparent);
	}
	.silver-preview {
		font-size: 10px;
		color: var(--tertiary);
		text-align: right;
	}
	.silver-rate {
		font-size: 8px;
		color: var(--outline-hud);
		margin-left: 4px;
	}
	.add-btn {
		width: 100%;
		padding: 6px 0;
		background: var(--tier-color);
		color: var(--bg, #0a0a0a);
		border: 0;
		font-family: 'Space Grotesk', system-ui, sans-serif;
		font-weight: 700;
		font-size: 10px;
		letter-spacing: 0.16em;
		box-shadow: 0 0 12px color-mix(in oklab, var(--tier-color) 50%, transparent);
		cursor: pointer;
	}
	.add-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
		box-shadow: none;
	}
</style>
