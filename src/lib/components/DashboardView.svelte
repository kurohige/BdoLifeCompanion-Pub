<script lang="ts">
	import DashboardPanel from "./DashboardPanel.svelte";
	import type { DashboardTab, TimeRange } from "$lib/stores";
	import { showToast } from "$lib/stores/toast";
	import { exportLog, type LogType, type ExportFormat } from "$lib/utils/export-logs";

	let activeTab = $state<DashboardTab>("all");
	let timeRange = $state<TimeRange>("all");
	let showExportMenu = $state(false);

	const TIME_RANGES: { value: TimeRange; label: string }[] = [
		{ value: "today", label: "Today" },
		{ value: "7d", label: "7d" },
		{ value: "30d", label: "30d" },
		{ value: "all", label: "All Time" },
	];

	const TABS: { value: DashboardTab; label: string }[] = [
		{ value: "all", label: "All Activities" },
		{ value: "grinding", label: "⚔️ Grinding" },
		{ value: "hunting", label: "🏹 Hunting" },
		{ value: "crafting", label: "🍳 Crafting" },
	];

	async function handleExport(logType: LogType, format: ExportFormat) {
		showExportMenu = false;
		try {
			const result = await exportLog(logType, format);
			if (result.success) {
				showToast(`Exported ${result.count} ${logType} sessions as ${format.toUpperCase()}`, "success");
			} else if (result.count === 0) {
				showToast(`No ${logType} sessions to export`, "info");
			}
		} catch (e) {
			showToast(`Export failed: ${e}`, "error");
		}
	}
</script>

<div class="space-y-2">
	<!-- Sticky filter bar: tabs + time range + export -->
	<div class="sticky top-0 z-10 bg-surface-lowest/95 backdrop-blur-sm -mx-2 px-2 py-1">
		<!-- Activity Tabs -->
		<div class="flex items-center gap-1 border-b border-outline-variant/10 mb-1">
			{#each TABS as tab_item}
				<button
					onclick={() => activeTab = tab_item.value}
					class="pb-2 px-2 text-[11px] font-headline font-medium transition-colors relative
						{activeTab === tab_item.value
							? 'obsidian-pill-active'
							: 'obsidian-pill'}"
				>
					{tab_item.label}
				</button>
			{/each}

			<!-- Export button (right-aligned) -->
			<div class="ml-auto relative">
				<button
					onclick={() => showExportMenu = !showExportMenu}
					class="px-2 py-0.5 text-[10px] font-headline font-bold uppercase tracking-wider text-[#00e3fd] [text-shadow:0_0_8px_rgba(0,227,253,0.5)] hover:text-[#bdf4ff] transition-colors"
					title="Export logs"
				>
					📥 Export
				</button>

				{#if showExportMenu}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="absolute right-0 top-full mt-1 glass-dropdown p-2 rounded-sm z-20 min-w-[140px]"
						onmouseleave={() => showExportMenu = false}
					>
						<p class="obsidian-header mb-1">Export Logs</p>
						{#each [
							{ type: "grinding" as LogType, label: "⚔️ Grinding" },
							{ type: "crafting" as LogType, label: "🍳 Crafting" },
							{ type: "hunting" as LogType, label: "🏹 Hunting" },
						] as item}
							<div class="flex items-center justify-between gap-2 py-1">
								<span class="text-[10px] text-on-surface">{item.label}</span>
								<div class="flex gap-1">
									<button
										onclick={() => handleExport(item.type, "csv")}
										class="px-1.5 py-0.5 text-[8px] font-bold text-secondary-container hover:bg-surface-high rounded-sm transition-colors"
									>CSV</button>
									<button
										onclick={() => handleExport(item.type, "json")}
										class="px-1.5 py-0.5 text-[8px] font-bold text-primary hover:bg-surface-high rounded-sm transition-colors"
									>JSON</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<!-- Time Range Pills -->
		<div class="flex items-center gap-1">
			<span class="text-[9px] text-outline-hud uppercase tracking-wider mr-1 font-label">Range:</span>
			{#each TIME_RANGES as range}
				<button
					onclick={() => timeRange = range.value}
					class="px-3 py-0.5 text-[10px] font-headline transition-colors
						{timeRange === range.value
							? 'obsidian-pill-active text-[10px]'
							: 'obsidian-pill text-[10px]'}"
				>
					{range.label}
				</button>
			{/each}
		</div>
	</div>

	<!-- Dashboard Panel (renders all charts for the active tab) -->
	{#key activeTab + timeRange}
		<DashboardPanel tab={activeTab} {timeRange} />
	{/key}
</div>
