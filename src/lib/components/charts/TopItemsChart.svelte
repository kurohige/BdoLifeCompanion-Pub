<script lang="ts">
	import { Chart, BarController, BarElement, LinearScale, CategoryScale, Tooltip } from "chart.js";
	import { GRADE_COLORS, CHART_COLORS } from "$lib/constants/chart-theme";
	import type { ItemAcquisition } from "$lib/stores/dashboard";

	Chart.register(BarController, BarElement, LinearScale, CategoryScale, Tooltip);

	interface Props {
		items: ItemAcquisition[];
	}

	let { items }: Props = $props();

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

		if (items.length === 0) return;

		const colors = items.map((item) => GRADE_COLORS[item.grade] ?? GRADE_COLORS.common);

		chart = new Chart(ctx, {
			type: "bar",
			data: {
				labels: items.map((i) => i.itemName.length > 22 ? i.itemName.slice(0, 20) + "..." : i.itemName),
				datasets: [{
					data: items.map((i) => i.totalCount),
					backgroundColor: colors.map((c) => c + "4D"),
					borderColor: colors,
					borderWidth: 1,
					borderRadius: 4,
				}],
			},
			options: {
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
						callbacks: { label: (ctx: { parsed: { x: number | null } }) => `Count: ${(ctx.parsed.x ?? 0).toLocaleString()}` },
					},
				},
				scales: {
					x: { grid: { color: CHART_COLORS.gridLines }, ticks: { color: CHART_COLORS.tickLabels, font: { size: 9 } } },
					y: { grid: { display: false }, ticks: { color: CHART_COLORS.tickLabels, font: { size: 9 } } },
				},
			},
		});

		return () => {
			if (chart) {
				chart.destroy();
				chart = null;
			}
		};
	});
</script>

<div class="w-full h-[180px]">
	<canvas bind:this={canvas}></canvas>
</div>
