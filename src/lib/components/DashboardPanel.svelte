<script lang="ts">
	import AnimatedCounter from "./charts/AnimatedCounter.svelte";
	import ProfitChart from "./charts/ProfitChart.svelte";
	import SilverHourChart from "./charts/SilverHourChart.svelte";
	import BreakdownChart from "./charts/BreakdownChart.svelte";
	import TopItemsChart from "./charts/TopItemsChart.svelte";
	import CumulativeChart from "./charts/CumulativeChart.svelte";
	import {
		getDashboardSummary,
		getActivityBreakdown,
		getProfitOverTime,
		getTopItems,
		getRecentSessions,
		getSpotBreakdown,
		getCumulativeSilver,
		grindingLogStore,
		huntingLogStore,
		craftingLogStore,
		type DashboardTab,
		type TimeRange,
		type ActivityType,
	} from "$lib/stores";
	import { formatDuration } from "$lib/utils/format";
	import { formatSilverShort, ACTIVITY_COLORS, ACTIVITY_LABELS, ACTIVITY_ICONS } from "$lib/constants/chart-theme";

	interface Props {
		tab: DashboardTab;
		timeRange: TimeRange;
	}

	let { tab, timeRange }: Props = $props();

	let showLog = $state(false);

	// Force reactivity on log store changes
	const _g = $derived($grindingLogStore);
	const _h = $derived($huntingLogStore);
	const _c = $derived($craftingLogStore);

	// Compute all dashboard data reactively
	const summary = $derived.by(() => {
		_g; _h; _c; // Track dependencies
		return getDashboardSummary(timeRange, tab);
	});

	const activityBreakdown = $derived.by(() => {
		_g; _h; _c;
		return getActivityBreakdown(timeRange);
	});

	const profitData = $derived.by(() => {
		_g; _h; _c;
		return getProfitOverTime(timeRange, tab);
	});

	const topItems = $derived.by(() => {
		_g; _h; _c;
		return getTopItems(timeRange, tab);
	});

	const recentSessions = $derived.by(() => {
		_g; _h; _c;
		return getRecentSessions(tab, 5);
	});

	const spotBreakdown = $derived.by(() => {
		if (tab === "all") return [];
		_g; _h; _c;
		return getSpotBreakdown(timeRange, tab as ActivityType);
	});

	const cumulativeData = $derived.by(() => {
		_g; _h; _c;
		return getCumulativeSilver(timeRange, tab);
	});

	const hasData = $derived(summary.totalSessions > 0);

	function formatDelta(value: number, formatter: (n: number) => string): string {
		if (value === 0) return "";
		return (value > 0 ? "+" : "") + formatter(value);
	}
</script>

<div class="space-y-3">
	{#if !hasData}
		<!-- Empty State -->
		<div class="text-center py-10 text-muted-foreground">
			<p class="text-3xl mb-2">{tab === "all" ? "📊" : ACTIVITY_ICONS[tab as ActivityType] ?? "📊"}</p>
			<p class="text-sm font-medium">No data yet</p>
			<p class="text-[12px] mt-1">Start tracking {tab === "all" ? "activities" : tab} to see your analytics</p>
		</div>
	{:else}
		<!-- Summary Cards -->
		<div class="grid grid-cols-3 gap-2">
			<div class="paper-stats p-2 text-center">
				<p class="text-xl font-bold font-mono text-foreground">
					<AnimatedCounter value={summary.totalSessions} />
				</p>
				<p class="text-[12px] text-muted-foreground">Sessions</p>
				{#if summary.sessionsDelta !== 0}
					<p class="text-[10.5px] {summary.sessionsDelta > 0 ? 'text-primary' : 'text-destructive'}">
						{formatDelta(summary.sessionsDelta, (n) => n.toString())}
					</p>
				{/if}
			</div>
			<div class="paper-stats p-2 text-center">
				<p class="text-lg font-bold font-mono text-foreground">{formatDuration(summary.totalDurationSeconds)}</p>
				<p class="text-[12px] text-muted-foreground">Time</p>
				{#if summary.durationDelta !== 0}
					<p class="text-[10.5px] {summary.durationDelta > 0 ? 'text-primary' : 'text-destructive'}">
						{formatDelta(summary.durationDelta, (n) => formatDuration(Math.abs(n)))}
					</p>
				{/if}
			</div>
			<div class="paper-stats p-2 text-center">
				<p class="text-lg font-bold font-mono text-primary">
					<AnimatedCounter value={summary.totalSilver} format={formatSilverShort} />
				</p>
				<p class="text-[12px] text-muted-foreground">Silver</p>
				{#if summary.silverDelta !== 0}
					<p class="text-[10.5px] {summary.silverDelta > 0 ? 'text-primary' : 'text-destructive'}">
						{formatDelta(summary.silverDelta, formatSilverShort)}
					</p>
				{/if}
			</div>
		</div>

		<!-- Profit Over Time -->
		{#if profitData.length > 0}
			<div class="paper-card rounded p-2">
				<p class="text-[12.5px] text-foreground font-semibold mb-1">Profit Over Time</p>
				<ProfitChart data={profitData} {tab} />
			</div>
		{/if}

		<!-- Middle Row: Silver/Hour + Breakdown -->
		<div class="grid grid-cols-2 gap-2">
			<div class="paper-card rounded p-2">
				<p class="text-[12.5px] text-foreground font-semibold mb-1">
					{tab === "all" ? "Silver/Hr by Activity" : "Silver/Hr by Spot"}
				</p>
				{#if tab === "all"}
					<SilverHourChart activityData={activityBreakdown} {tab} />
				{:else}
					<SilverHourChart spotData={spotBreakdown} {tab} />
				{/if}
			</div>
			<div class="paper-card rounded p-2">
				<p class="text-[12.5px] text-foreground font-semibold mb-1">
					{tab === "all" ? "Activity Breakdown" : "Time by Spot"}
				</p>
				{#if tab === "all"}
					<BreakdownChart activityData={activityBreakdown} {tab} centerLabel={formatSilverShort(summary.totalSilver)} />
				{:else}
					<BreakdownChart spotData={spotBreakdown} {tab} centerLabel={`${summary.totalSessions} sessions`} />
				{/if}
			</div>
		</div>

		<!-- Top Items -->
		{#if topItems.length > 0}
			<div class="paper-card rounded p-2">
				<p class="text-[12.5px] text-foreground font-semibold mb-1">
					Top Items {tab !== "all" ? `from ${ACTIVITY_LABELS[tab as ActivityType]}` : "Acquired"}
				</p>
				<TopItemsChart items={topItems} />
			</div>
		{/if}

		<!-- Cumulative Silver -->
		{#if profitData.length > 0}
			<div class="paper-card rounded p-2">
				<p class="text-[12.5px] text-foreground font-semibold mb-1">Cumulative Silver</p>
				<CumulativeChart data={cumulativeData} {tab} />
			</div>
		{/if}

		<!-- Recent Sessions -->
		{#if recentSessions.length > 0}
			<div class="paper-card rounded p-2">
				<p class="text-[12.5px] text-foreground font-semibold mb-2">
					Recent {tab === "all" ? "Sessions" : ACTIVITY_LABELS[tab as ActivityType] + " Sessions"}
				</p>
				<div class="space-y-1">
					{#each recentSessions as session (session.id)}
						<div class="flex items-center gap-2 px-2 py-1 bg-secondary/30 rounded text-[12.5px]">
							<span class="flex-shrink-0">{session.icon}</span>
							<span class="truncate flex-1 text-foreground">{session.locationName}</span>
							{#if session.durationSeconds > 0}
								<span class="text-muted-foreground text-[12px]">{formatDuration(session.durationSeconds)}</span>
							{/if}
							{#if session.silver > 0}
								<span class="text-foreground font-mono text-[12px]">+{formatSilverShort(session.silver)}</span>
							{/if}
							<span class="text-muted-foreground text-[12px]">{session.timestamp.slice(5, 10)}</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Expandable Full Log -->
		<button
			onclick={() => showLog = !showLog}
			class="w-full text-center text-[12px] text-muted-foreground hover:text-foreground transition-colors py-1"
		>
			{showLog ? "▲ Hide" : "▼ View"} Full {tab === "all" ? "Session" : ACTIVITY_LABELS[tab as ActivityType]} Log
		</button>

		{#if showLog}
			<div class="max-h-[300px] overflow-auto space-y-1">
				{#each getRecentSessions(tab, 100) as session (session.id)}
					<div class="flex items-center gap-2 px-2 py-1 bg-secondary/20 rounded text-[12px]">
						<span>{session.icon}</span>
						<span class="truncate flex-1">{session.locationName}</span>
						{#if session.durationSeconds > 0}
							<span class="text-muted-foreground">{formatDuration(session.durationSeconds)}</span>
						{/if}
						{#if session.silver > 0}
							<span class="text-foreground font-mono">+{formatSilverShort(session.silver)}</span>
						{/if}
						<span class="text-muted-foreground text-[10.5px]">{session.timestamp.slice(0, 10)}</span>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>
