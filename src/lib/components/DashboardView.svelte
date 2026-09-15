<script lang="ts">
	import DashboardPanel from "./DashboardPanel.svelte";
	import type { DashboardTab, TimeRange } from "$lib/stores";
	import { showToast } from "$lib/stores/toast";
	import { exportLog, type LogType, type ExportFormat } from "$lib/utils/export-logs";
	import { Button } from "$lib/components/ui";
	import { m } from "$lib/paraglide/messages";

	let activeTab = $state<DashboardTab>("all");
	let timeRange = $state<TimeRange>("all");
	let showExportMenu = $state(false);

	// Labels are thunks so they re-translate on locale change
	const TIME_RANGES: { value: TimeRange; label: () => string }[] = [
		{ value: "today", label: () => m.dashboard_range_today() },
		{ value: "7d", label: () => m.dashboard_range_7d() },
		{ value: "30d", label: () => m.dashboard_range_30d() },
		{ value: "all", label: () => m.dashboard_range_all() },
	];

	const TABS: { value: DashboardTab; label: () => string }[] = [
		{ value: "all", label: () => m.dashboard_tab_all() },
		{ value: "grinding", label: () => m.dashboard_tab_grinding() },
		{ value: "hunting", label: () => m.dashboard_tab_hunting() },
		{ value: "crafting", label: () => m.dashboard_tab_crafting() },
	];

	async function handleExport(logType: LogType, format: ExportFormat) {
		showExportMenu = false;
		try {
			const result = await exportLog(logType, format);
			if (result.success) {
				showToast(m.dashboard_toast_exported({ count: result.count, type: logType, format: format.toUpperCase() }), "success");
			} else if (result.count === 0) {
				showToast(m.dashboard_toast_no_sessions({ type: logType }), "info");
			}
		} catch (e) {
			showToast(m.dashboard_toast_failed({ error: String(e) }), "error");
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
					class="pb-2 px-2 text-[12.5px] font-headline font-medium transition-colors relative
						{activeTab === tab_item.value
							? 'tab-pill-active'
							: 'tab-pill'}"
				>
					{tab_item.label()}
				</button>
			{/each}

			<!-- Export button (right-aligned) -->
			<div class="ml-auto relative">
				<Button
					variant="ghost"
					size="sm"
					onclick={() => showExportMenu = !showExportMenu}
					title={m.dashboard_export_btn_title()}
				>
					{m.dashboard_export_btn()}
				</Button>

				{#if showExportMenu}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="absolute right-0 top-full mt-1 paper-dropdown p-2 rounded-sm z-20 min-w-[140px]"
						onmouseleave={() => showExportMenu = false}
					>
						<p class="eyebrow mb-1">{m.dashboard_export_logs_header()}</p>
						{#each [
							{ type: "grinding" as LogType, label: () => m.dashboard_export_grinding() },
							{ type: "crafting" as LogType, label: () => m.dashboard_export_crafting() },
							{ type: "hunting" as LogType, label: () => m.dashboard_export_hunting() },
						] as item}
							<div class="flex items-center justify-between gap-2 py-1">
								<span class="text-[12px] text-on-surface">{item.label()}</span>
								<div class="flex gap-1">
									<button
										onclick={() => handleExport(item.type, "csv")}
										class="px-1.5 py-0.5 text-[10.5px] font-bold text-secondary-container hover:bg-surface-high rounded-sm transition-colors"
									>CSV</button>
									<button
										onclick={() => handleExport(item.type, "json")}
										class="px-1.5 py-0.5 text-[10.5px] font-bold text-primary hover:bg-surface-high rounded-sm transition-colors"
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
			<span class="text-[12px] text-outline-hud uppercase tracking-wider mr-1 font-label">{m.dashboard_range_label()}</span>
			{#each TIME_RANGES as range}
				<button
					onclick={() => timeRange = range.value}
					class="px-3 py-0.5 text-[12px] font-headline transition-colors
						{timeRange === range.value
							? 'tab-pill-active text-[12px]'
							: 'tab-pill text-[12px]'}"
				>
					{range.label()}
				</button>
			{/each}
		</div>
	</div>

	<!-- Dashboard Panel (renders all charts for the active tab) -->
	{#key activeTab + timeRange}
		<DashboardPanel tab={activeTab} {timeRange} />
	{/key}
</div>
