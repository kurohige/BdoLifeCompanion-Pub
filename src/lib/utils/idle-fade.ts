/**
 * Svelte action for the overlay idle rule (spec 8d): after `delay` ms with no
 * pointer activity the node gets the `widget-idle` class — the widget fades to
 * 55% and its window controls hide (CSS lives with each widget). Any pointer
 * contact restores it.
 */
export function idleFade(node: HTMLElement, { delay = 10_000 }: { delay?: number } = {}) {
	let timer: ReturnType<typeof setTimeout> | null = null;

	function goIdle() {
		node.classList.add("widget-idle");
	}
	function wake() {
		node.classList.remove("widget-idle");
		if (timer) clearTimeout(timer);
		timer = setTimeout(goIdle, delay);
	}

	const events = ["pointermove", "pointerdown", "pointerenter"] as const;
	for (const ev of events) node.addEventListener(ev, wake, { passive: true });
	wake();

	return {
		destroy() {
			if (timer) clearTimeout(timer);
			for (const ev of events) node.removeEventListener(ev, wake);
		},
	};
}
