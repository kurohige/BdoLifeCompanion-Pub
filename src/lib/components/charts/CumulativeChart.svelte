<script lang="ts">
	import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip, Legend } from "chart.js";
	import { ACTIVITY_COLORS, ACTIVITY_LABELS, CHART_COLORS, createGradient, formatSilverShort } from "$lib/constants/chart-theme";
	import type { ActivityType, DashboardTab } from "$lib/stores/dashboard";

	Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip, Legend);

	interface Props {
		data: Record<ActivityType, { date: string; cumulative: number }[]>;
		tab: DashboardTab;
	}

	let { data, tab }: Props = $props();

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

		if (tab === "all") {
			// Multi-line: all activities
			const allDates = new Set<string>();
			for (const activity of ["grinding", "hunting", "crafting"] as ActivityType[]) {
				for (const p of data[activity]) allDates.add(p.date);
			}
			const dates = [...allDates].sort();
			if (dates.length === 0) return;

			const datasets = (["grinding", "hunting", "crafting"] as ActivityType[])
				.filter((a) => data[a].length > 0)
				.map((a) => {
					const cumMap = new Map(data[a].map((p) => [p.date, p.cumulative]));
					// Forward-fill missing dates
					let last = 0;
					const values = dates.map((d) => {
						if (cumMap.has(d)) last = cumMap.get(d)!;
						return last;
					});

					return {
						label: ACTIVITY_LABELS[a],
						data: values,
						borderColor: ACTIVITY_COLORS[a],
						backgroundColor: "transparent",
						borderWidth: 2,
						pointRadius: 2,
						pointBackgroundColor: ACTIVITY_COLORS[a],
						tension: 0.3,
						fill: false,
					};
				});

			chart = new Chart(ctx, {
				type: "line",
				data: { labels: dates, datasets },
				options: lineOptions(true),
			});
		} else {
			// Single activity
			const activity = tab as ActivityType;
			const points = data[activity];
			if (points.length === 0) return;
			const color = ACTIVITY_COLORS[activity];
			const gradient = createGradient(ctx, color, canvas.height || 180);

			chart = new Chart(ctx, {
				type: "line",
				data: {
					labels: points.map((p) => p.date),
					datasets: [{
						label: ACTIVITY_LABELS[activity],
						data: points.map((p) => p.cumulative),
						borderColor: color,
						backgroundColor: gradient,
						borderWidth: 2,
						pointRadius: 2,
						pointBackgroundColor: color,
						tension: 0.3,
						fill: true,
					}],
				},
				options: lineOptions(false),
			});
		}

		return () => {
			if (chart) {
				chart.destroy();
				chart = null;
			}
		};
	});

	function lineOptions(showLegend: boolean): Record<string, unknown> {
		return {
			responsive: true,
			maintainAspectRatio: false,
			animation: { duration: 1200, easing: "easeOutCubic" as const },
			plugins: {
				legend: { display: showLegend, labels: { color: CHART_COLORS.tickLabels, font: { size: 10 } } },
				tooltip: {
					backgroundColor: CHART_COLORS.tooltipBg,
					borderColor: CHART_COLORS.tooltipBorder,
					borderWidth: 1,
					titleColor: CHART_COLORS.tooltipText,
					bodyColor: CHART_COLORS.tooltipText,
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
