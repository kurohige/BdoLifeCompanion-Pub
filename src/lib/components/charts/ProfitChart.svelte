<script lang="ts">
	import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip, Legend } from "chart.js";
	import { ACTIVITY_COLORS, ACTIVITY_LABELS, CHART_COLORS, createGradient, formatSilverShort } from "$lib/constants/chart-theme";
	import type { ProfitDataPoint, ActivityType, DashboardTab } from "$lib/stores/dashboard";

	Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip, Legend);

	interface Props {
		data: ProfitDataPoint[];
		tab: DashboardTab;
	}

	let { data, tab }: Props = $props();

	let canvas: HTMLCanvasElement | undefined = $state();
	let chart: Chart | null = null;

	$effect(() => {
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		// Destroy previous chart
		if (chart) {
			chart.destroy();
			chart = null;
		}

		// Aggregate daily totals
		if (tab === "all") {
			// Multi-line: one dataset per activity
			const activities: ActivityType[] = ["grinding", "hunting", "crafting"];
			const allDates = [...new Set(data.map((d) => d.date))].sort();

			if (allDates.length === 0) return;

			const dailyByActivity: Record<string, Record<string, number>> = {};
			for (const a of activities) dailyByActivity[a] = {};
			for (const p of data) {
				dailyByActivity[p.activity][p.date] = (dailyByActivity[p.activity][p.date] ?? 0) + p.silver;
			}

			const datasets = activities.map((a) => ({
				label: ACTIVITY_LABELS[a],
				data: allDates.map((d) => dailyByActivity[a][d] ?? 0),
				borderColor: ACTIVITY_COLORS[a],
				backgroundColor: "transparent",
				borderWidth: 2,
				pointRadius: 3,
				pointBackgroundColor: ACTIVITY_COLORS[a],
				pointBorderColor: ACTIVITY_COLORS[a],
				tension: 0.3,
				fill: false,
			}));

			chart = new Chart(ctx, {
				type: "line",
				data: { labels: allDates, datasets },
				options: chartOptions(),
			});
		} else {
			// Single line with gradient fill
			const color = ACTIVITY_COLORS[tab];
			const allDates = [...new Set(data.map((d) => d.date))].sort();

			if (allDates.length === 0) return;

			const daily: Record<string, number> = {};
			for (const p of data) {
				daily[p.date] = (daily[p.date] ?? 0) + p.silver;
			}

			const gradient = createGradient(ctx, color, canvas.height || 200);

			chart = new Chart(ctx, {
				type: "line",
				data: {
					labels: allDates,
					datasets: [{
						label: ACTIVITY_LABELS[tab],
						data: allDates.map((d) => daily[d] ?? 0),
						borderColor: color,
						backgroundColor: gradient,
						borderWidth: 2,
						pointRadius: 3,
						pointBackgroundColor: color,
						pointBorderColor: color,
						tension: 0.3,
						fill: true,
					}],
				},
				options: chartOptions(),
			});
		}

		return () => {
			if (chart) {
				chart.destroy();
				chart = null;
			}
		};
	});

	function chartOptions(): Record<string, unknown> {
		return {
			responsive: true,
			maintainAspectRatio: false,
			animation: { duration: 1000, easing: "easeOutCubic" as const },
			plugins: {
				legend: { display: tab === "all", labels: { color: CHART_COLORS.tickLabels, font: { size: 10 } } },
				tooltip: {
					backgroundColor: CHART_COLORS.tooltipBg,
					borderColor: CHART_COLORS.tooltipBorder,
					borderWidth: 1,
					titleColor: CHART_COLORS.tooltipText,
					bodyColor: CHART_COLORS.tooltipText,
					titleFont: { size: 11 },
					bodyFont: { size: 10 },
					callbacks: { label: (ctx: { parsed: { y: number }; dataset: { label?: string } }) => `${ctx.dataset.label}: ${formatSilverShort(ctx.parsed.y)}` },
				},
			},
			scales: {
				x: { grid: { color: CHART_COLORS.gridLines }, ticks: { color: CHART_COLORS.tickLabels, font: { size: 9 }, maxRotation: 45 } },
				y: { grid: { color: CHART_COLORS.gridLines }, ticks: { color: CHART_COLORS.tickLabels, font: { size: 9 }, callback: (v: number | string) => formatSilverShort(Number(v)) } },
			},
		};
	}
</script>

<div class="w-full h-[180px]">
	<canvas bind:this={canvas}></canvas>
</div>
