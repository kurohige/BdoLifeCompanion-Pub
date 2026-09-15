<script lang="ts">
	import {
		inventoryStore,
		setInventoryQuantity,
		clearInventory,
		catalogsStore,
		exportInventoryToCSV,
		importInventoryFromCSV,
		showToast,
	} from "$lib/stores";
	import { m } from "$lib/paraglide/messages";
	import { Button } from "$lib/components/ui";

	let searchText = $state("");
	let newItemId = $state("");
	let newItemDisplay = $state("");
	let newItemQuantity = $state(1);
	let showAddForm = $state(false);
	let showSuggestions = $state(false);

	// Handle export
	async function handleExport() {
		const success = await exportInventoryToCSV();
		showToast(success ? m.inventory_toast_exported() : m.inventory_toast_export_cancelled(), success ? "success" : "info");
	}

	// Handle import (replace)
	async function handleImportReplace() {
		if (!confirm(m.inventory_replace_confirm())) return;
		const success = await importInventoryFromCSV(false);
		showToast(success ? m.inventory_toast_imported() : m.inventory_toast_import_cancelled(), success ? "success" : "info");
	}

	// Handle import (merge)
	async function handleImportMerge() {
		const success = await importInventoryFromCSV(true);
		showToast(success ? m.inventory_toast_merged() : m.inventory_toast_import_cancelled(), success ? "success" : "info");
	}

	// Get all items from all catalogs for autocomplete
	const allItems = $derived(() => {
		const items = new Map<string, string>();
		for (const catalog of $catalogsStore.values()) {
			for (const recipe of catalog.recipes) {
				for (const ing of recipe.ingredients) {
					const item = catalog.itemFor(ing.itemId);
					items.set(ing.itemId.toLowerCase(), item.name);
				}
			}
		}
		return Array.from(items.entries())
			.map(([id, name]) => ({ id, name }))
			.sort((a, b) => a.name.localeCompare(b.name));
	});

	// Filter items based on search
	const filteredItems = $derived(() => {
		const items = Array.from($inventoryStore.entries())
			.map(([itemId, quantity]) => ({ itemId, quantity }))
			.sort((a, b) => a.itemId.localeCompare(b.itemId));

		if (!searchText.trim()) return items;

		const search = searchText.toLowerCase();
		return items.filter((item) => item.itemId.includes(search));
	});

	// Autocomplete suggestions for new item
	const suggestions = $derived(() => {
		if (!showSuggestions || !newItemDisplay.trim()) return [];
		const search = newItemDisplay.toLowerCase();
		return allItems()
			.filter((item) => item.name.toLowerCase().includes(search))
			.slice(0, 8);
	});

	function handleAddItem() {
		const idToAdd = newItemId.trim() || newItemDisplay.trim();
		if (idToAdd && newItemQuantity > 0) {
			setInventoryQuantity(idToAdd, newItemQuantity);
			newItemId = "";
			newItemDisplay = "";
			newItemQuantity = 1;
			showSuggestions = false;
			showAddForm = false;
		}
	}

	function handleUpdateQuantity(itemId: string, newValue: string) {
		const quantity = parseInt(newValue, 10);
		if (!isNaN(quantity)) {
			setInventoryQuantity(itemId, quantity);
		}
	}

	function handleDeleteItem(itemId: string) {
		setInventoryQuantity(itemId, 0);
	}

	function handleSelectSuggestion(itemId: string, itemName: string) {
		newItemId = itemId;
		newItemDisplay = itemName;
		showSuggestions = false;
	}

	function handleClearAll() {
		if (confirm(m.inventory_clear_confirm())) {
			clearInventory();
		}
	}

	// Get display name for an item
	function getItemDisplayName(itemId: string): string {
		for (const catalog of $catalogsStore.values()) {
			const item = catalog.itemFor(itemId);
			if (item && item.name !== itemId) {
				return item.name;
			}
		}
		// Title case the item ID
		return itemId
			.split("_")
			.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
			.join(" ");
	}

	// Get image path for an item
	function getItemImagePath(itemId: string): string {
		for (const catalog of $catalogsStore.values()) {
			const item = catalog.itemFor(itemId);
			if (item?.image) {
				return "/" + item.image;
			}
		}
		return "";
	}
</script>

<div class="flex flex-col h-full min-h-0 gap-4">
	<!-- Header with controls -->
	<div class="flex items-center justify-between gap-2">
		<h2 class="text-base font-bold text-foreground">{m.inventory_title()}</h2>
		<div class="flex gap-1 flex-wrap justify-end">
			<Button variant="primary" size="sm" onclick={() => (showAddForm = !showAddForm)}>
				{showAddForm ? m.inventory_btn_cancel() : m.inventory_btn_add()}
			</Button>
			<Button variant="secondary" size="sm" onclick={handleExport} title={m.inventory_btn_export_title()}>
				{m.inventory_btn_export()}
			</Button>
			<Button variant="secondary" size="sm" onclick={handleImportMerge} title={m.inventory_btn_import_merge_title()}>
				{m.inventory_btn_import_merge()}
			</Button>
			<Button variant="secondary" size="sm" onclick={handleImportReplace} title={m.inventory_btn_import_replace_title()}>
				{m.inventory_btn_import_replace()}
			</Button>
			<Button variant="danger" size="sm" onclick={handleClearAll}>
				{m.inventory_btn_clear()}
			</Button>
		</div>
	</div>

	<!-- Add Item Form -->
	{#if showAddForm}
		<div class="paper-card rounded-lg p-3 space-y-2 border-l-2 border-l-primary">
			<h3 class="text-[13px] font-bold text-foreground">{m.inventory_add_new_item()}</h3>
			<div class="relative">
				<input
					type="text"
					bind:value={newItemDisplay}
					placeholder={m.inventory_item_name_placeholder()}
					onfocus={() => { showSuggestions = true; newItemId = ""; }}
					oninput={() => { showSuggestions = true; newItemId = ""; }}
					class="w-full bg-input text-foreground border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
				/>
				{#if suggestions().length > 0}
					<div
						class="absolute z-10 w-full mt-1 paper-dropdown rounded-lg max-h-48 overflow-auto"
					>
						{#each suggestions() as suggestion (suggestion.id)}
							<button
								type="button"
								onmousedown={() => handleSelectSuggestion(suggestion.id, suggestion.name)}
								class="w-full text-left px-2 py-1.5 text-xs hover:bg-secondary transition-colors"
							>
								{suggestion.name}
							</button>
						{/each}
					</div>
				{/if}
			</div>
			<div class="flex gap-2 items-center">
				<label for="new-item-quantity" class="text-[12.5px] text-muted-foreground">{m.inventory_quantity_label()}</label>
				<input
					id="new-item-quantity"
					type="number"
					bind:value={newItemQuantity}
					min="1"
					class="w-20 bg-input text-foreground border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
				/>
				<Button
					variant="primary"
					size="sm"
					onclick={handleAddItem}
					disabled={(!newItemId.trim() && !newItemDisplay.trim()) || newItemQuantity <= 0}
				>
					{m.inventory_form_add()}
				</Button>
			</div>
		</div>
	{/if}

	<!-- Search -->
	<div>
		<input
			type="text"
			bind:value={searchText}
			placeholder={m.inventory_search_placeholder()}
			class="w-full paper-input text-foreground rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
		/>
	</div>

	<!-- Inventory Stats -->
	<div class="flex gap-4 text-[12.5px]">
		<span class="text-muted-foreground">
			{m.inventory_total_items()} <span class="font-bold text-foreground">{$inventoryStore.size}</span>
		</span>
		<span class="text-muted-foreground">
			{m.inventory_showing()} <span class="font-bold text-foreground">{filteredItems().length}</span>
		</span>
	</div>

	<!-- Inventory List -->
	<div class="space-y-2 flex-1 min-h-0 overflow-auto">
		{#if filteredItems().length === 0}
			<div class="text-center py-6 text-muted-foreground text-[12.5px]">
				{#if $inventoryStore.size === 0}
					<img src="/icons/inventory.png" alt={m.inventory_alt_image()} class="h-11 w-auto mx-auto mb-1 opacity-90" />
					<p>{m.inventory_empty_no_items()}</p>
					<p class="mt-1">{m.inventory_empty_no_items_subtitle()}</p>
				{:else}
					<p class="text-2xl mb-1">🔍</p>
					<p>{m.inventory_empty_no_match()}</p>
				{/if}
			</div>
		{:else}
			{#each filteredItems() as item (item.itemId)}
				{@const displayName = getItemDisplayName(item.itemId)}
				{@const imagePath = getItemImagePath(item.itemId)}
				<div
					class="flex items-center gap-2 p-2 paper-card rounded-lg hover:border-primary transition-colors"
				>
					<!-- Item Image -->
					<div
						class="w-8 h-8 border border-muted rounded overflow-hidden bg-secondary flex-shrink-0 flex items-center justify-center"
					>
						{#if imagePath}
							<img
								src={imagePath}
								alt={displayName}
								class="w-full h-full object-contain"
								onerror={(e) => {
									const img = e.currentTarget as HTMLImageElement;
									img.style.display = "none";
								}}
							/>
						{/if}
					</div>

					<!-- Item Name -->
					<div class="flex-1 min-w-0">
						<p class="font-medium text-xs truncate">{displayName}</p>
					</div>

					<!-- Quantity Input -->
					<input
						type="number"
						value={item.quantity}
						min="0"
						onchange={(e) => handleUpdateQuantity(item.itemId, e.currentTarget.value)}
						class="w-16 bg-input text-foreground border border-border rounded px-2 py-1 text-xs text-center focus:outline-none focus:ring-2 focus:ring-primary"
					/>

					<!-- Delete Button -->
					<button
						onclick={() => handleDeleteItem(item.itemId)}
						class="w-6 h-6 flex items-center justify-center text-destructive hover:bg-destructive hover:text-destructive-foreground rounded transition-colors text-[12.5px]"
						title={m.inventory_delete_title()}
					>
						✕
					</button>
				</div>
			{/each}
		{/if}
	</div>
</div>
