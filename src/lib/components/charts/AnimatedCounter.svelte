<script lang="ts">
	interface Props {
		value: number;
		duration?: number;
		format?: (n: number) => string;
	}

	let { value, duration = 1000, format = (n: number) => n.toLocaleString() }: Props = $props();

	let displayValue = $state(0);
	let animationId: number | null = null;

	$effect(() => {
		const target = value;
		const start = displayValue;
		const diff = target - start;
		if (diff === 0) return;

		const startTime = performance.now();
		if (animationId) cancelAnimationFrame(animationId);

		function animate(now: number) {
			const elapsed = now - startTime;
			const progress = Math.min(elapsed / duration, 1);
			// Ease-out cubic
			const eased = 1 - Math.pow(1 - progress, 3);
			displayValue = Math.round(start + diff * eased);

			if (progress < 1) {
				animationId = requestAnimationFrame(animate);
			} else {
				displayValue = target;
				animationId = null;
			}
		}

		animationId = requestAnimationFrame(animate);

		return () => {
			if (animationId) {
				cancelAnimationFrame(animationId);
				animationId = null;
			}
		};
	});
</script>

<span>{format(displayValue)}</span>
