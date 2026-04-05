<script lang="ts">
	import { Chart, BarController, BarElement, LinearScale, CategoryScale, Tooltip } from "chart.js";
	import { ACTIVITY_COLORS, ACTIVITY_LABELS, CHART_COLORS, formatSilverShort } from "$lib/constants/chart-theme";
	import type { ActivityBreakdown, SpotBreakdown, DashboardTab, ActivityType } from "$lib/stores/dashboard";

	Chart.register(BarController, BarElement, LinearScale, CategoryScale, Tooltip);

	interface Props {
		activityData?: ActivityBreakdown[];
		spotData?: SpotBreakdown[];
		tab: DashboardTab;
	}

	let { activityData, spotData, tab }: Props = $props();

	let canvas: HTMLCanvasElement | undefined = $state();
	let chart: Chart | null = null;

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
				type: "bar",
				data: {
					labels: filtered.map((a) => ACTIVITY_LABELS[a.activity]),
					datasets: [{
						data: filtered.map((a) => a.silverPerHour),
						backgroundColor: filtered.map((a) => ACTIVITY_COLORS[a.activity] + "4D"),
						borderColor: filtered.map((a) => ACTIVITY_COLORS[a.activity]),
						borderWidth: 1,
						borderRadius: 4,
					}],
				},
				options: barOptions(),
			});
		} else if (spotData) {
			if (spotData.length === 0) return;
			const color = ACTIVITY_COLORS[tab as ActivityType] ?? "#00E5FF";

			chart = new Chart(ctx, {
				type: "bar",
				data: {
					labels: spotData.map((s) => s.name.length > 18 ? s.name.slice(0, 16) + "..." : s.name),
					datasets: [{
						data: spotData.map((s) => s.silverPerHour),
						backgroundColor: spotData.map((_, i) => color + Math.round(80 - i * 8).toString(16).padStart(2, "0")),
						borderColor: color,
						borderWidth: 1,
						borderRadius: 4,
					}],
				},
				options: barOptions(),
			});
		}

		return () => {
			if (chart) {
				chart.destroy();
				chart = null;
			}
		};
	});

	function barOptions(): Record<string, unknown> {
		return {
			responsive: true,
			maintainAspectRatio: false,
			indexAxis: "y" as const,
			animation: { duration: 800, easing: "easeOutCubic" as const },
			plugins: {
				legend: { display: false },
				tooltip: {
					backgroundColor: CHART_COLORS.tooltipBg,
					borderColor: CHART_COLORS.tooltipBorder,
					borderWidth: 1,
					titleColor: CHART_COLORS.tooltipText,
					bodyColor: CHART_COLORS.tooltipText,
					callbacks: { label: (ctx: { parsed: { x: number } }) => `${formatSilverShort(ctx.parsed.x)}/hr` },
				},
			},
			scales: {
				x: { grid: { color: CHART_COLORS.gridLines }, ticks: { color: CHART_COLORS.tickLabels, font: { size: 9 }, callback: (v: number | string) => formatSilverShort(Number(v)) } },
				y: { grid: { display: false }, ticks: { color: CHART_COLORS.tickLabels, font: { size: 10 } } },
			},
		};
	}
</script>

<div class="w-full h-[150px]">
	<canvas bind:this={canvas}></canvas>
</div>
