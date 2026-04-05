<script lang="ts">
	import { Chart, DoughnutController, ArcElement, Tooltip, Legend } from "chart.js";
	import { ACTIVITY_COLORS, ACTIVITY_LABELS, CHART_COLORS, formatSilverShort } from "$lib/constants/chart-theme";
	import type { ActivityBreakdown, SpotBreakdown, DashboardTab, ActivityType } from "$lib/stores/dashboard";

	Chart.register(DoughnutController, ArcElement, Tooltip, Legend);

	interface Props {
		activityData?: ActivityBreakdown[];
		spotData?: SpotBreakdown[];
		tab: DashboardTab;
		centerLabel?: string;
	}

	let { activityData, spotData, tab, centerLabel = "" }: Props = $props();

	let canvas: HTMLCanvasElement | undefined = $state();
	let chart: Chart | null = null;

	// Palette for spot-level doughnut segments
	const SPOT_PALETTE = ["#00E5FF", "#00FF9D", "#C77DFF", "#FF6B6B", "#FFD93D", "#6BCB77", "#4D96FF", "#FF922B"];

	$effect(() => {
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		if (chart) {
			chart.destroy();
			chart = null;
		}

		if (tab === "all" && activityData) {
			const filtered = activityData.filter((a) => a.sessions > 0);
			if (filtered.length === 0) return;

			chart = new Chart(ctx, {
				type: "doughnut",
				data: {
					labels: filtered.map((a) => ACTIVITY_LABELS[a.activity]),
					datasets: [{
						data: filtered.map((a) => a.silver),
						backgroundColor: filtered.map((a) => ACTIVITY_COLORS[a.activity] + "B3"),
						borderColor: filtered.map((a) => ACTIVITY_COLORS[a.activity]),
						borderWidth: 2,
						spacing: 3,
					}],
				},
				options: doughnutOptions(),
			});
		} else if (spotData) {
			const filtered = spotData.filter((s) => s.sessions > 0);
			if (filtered.length === 0) return;

			chart = new Chart(ctx, {
				type: "doughnut",
				data: {
					labels: filtered.map((s) => s.name.length > 16 ? s.name.slice(0, 14) + "..." : s.name),
					datasets: [{
						data: filtered.map((s) => s.durationSeconds),
						backgroundColor: filtered.map((_, i) => SPOT_PALETTE[i % SPOT_PALETTE.length] + "B3"),
						borderColor: filtered.map((_, i) => SPOT_PALETTE[i % SPOT_PALETTE.length]),
						borderWidth: 2,
						spacing: 3,
					}],
				},
				options: doughnutOptions(),
			});
		}

		return () => {
			if (chart) {
				chart.destroy();
				chart = null;
			}
		};
	});

	function doughnutOptions(): Record<string, unknown> {
		return {
			responsive: true,
			maintainAspectRatio: false,
			cutout: "60%",
			animation: { duration: 1000, easing: "easeOutCubic" as const },
			plugins: {
				legend: { display: true, position: "right" as const, labels: { color: CHART_COLORS.tickLabels, font: { size: 9 }, boxWidth: 10, padding: 6 } },
				tooltip: {
					backgroundColor: CHART_COLORS.tooltipBg,
					borderColor: CHART_COLORS.tooltipBorder,
					borderWidth: 1,
					titleColor: CHART_COLORS.tooltipText,
					bodyColor: CHART_COLORS.tooltipText,
					callbacks: {
						label: (ctx: { label?: string; parsed: number; dataset: { data: number[] } }) => {
							const total = ctx.dataset.data.reduce((a: number, b: number) => a + b, 0);
							const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : "0";
							return `${ctx.label}: ${pct}% (${formatSilverShort(ctx.parsed)})`;
						},
					},
				},
			},
		};
	}
</script>

<div class="w-full h-[150px] relative">
	<canvas bind:this={canvas}></canvas>
	{#if centerLabel}
		<div class="absolute inset-0 flex items-center justify-center pointer-events-none">
			<span class="text-[10px] text-muted-foreground font-bold">{centerLabel}</span>
		</div>
	{/if}
</div>
