<script lang="ts">
	import { onMount, onDestroy } from "svelte";

	let canvas: HTMLCanvasElement;
	let animationId: number;
	let resizeHandler: () => void;
	let resizeTimeout: ReturnType<typeof setTimeout>;

	onMount(() => {
		const ctx = canvas.getContext("2d")!;
		if (!ctx) return;

		let w = canvas.width = canvas.offsetWidth;
		let h = canvas.height = canvas.offsetHeight;
		let light = document.documentElement.classList.contains("theme-light");

		// Watch for theme changes
		const observer = new MutationObserver(() => {
			light = document.documentElement.classList.contains("theme-light");
		});
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

		const opts = {
			len: 18,
			count: 50,
			baseTime: 10,
			addedTime: 10,
			dieChance: 0.05,
			spawnChance: 1,
			sparkChance: 0.1,
			sparkDist: 10,
			sparkSize: 2,
			shadowToTimePropMult: 6,
			baseLightInputMultiplier: 0.01,
			addedLightInputMultiplier: 0.02,
			cx: w / 2,
			cy: h / 2,
			repaintAlpha: 0.04,
		};

		let tick = 0;
		const lines: Line[] = [];
		let dieX = w / 2 / opts.len;
		let dieY = h / 2 / opts.len;
		const baseRad = Math.PI * 2 / 6;

		function clearCanvas() {
			ctx.fillStyle = light ? "white" : "black";
			ctx.fillRect(0, 0, w, h);
		}

		clearCanvas();

		class Line {
			x = 0; y = 0; addedX = 0; addedY = 0;
			rad = 0; lightInputMultiplier = 0;
			hue = 0; sat = 0;
			cumulativeTime = 0;
			time = 0; targetTime = 0;

			constructor() { this.reset(); }

			reset() {
				this.x = 0; this.y = 0;
				this.addedX = 0; this.addedY = 0;
				this.rad = 0;
				this.lightInputMultiplier = opts.baseLightInputMultiplier + opts.addedLightInputMultiplier * Math.random();
				if (light) {
					this.hue = Math.random() < 0.6 ? 260 + tick * 0.02 : 200 + tick * 0.01;
					this.sat = 40;
				} else {
					this.hue = Math.random() < 0.6 ? 275 + tick * 0.02 : 186 + tick * 0.01;
					this.sat = 100;
				}
				this.cumulativeTime = 0;
				this.beginPhase();
			}

			beginPhase() {
				this.x += this.addedX;
				this.y += this.addedY;
				this.time = 0;
				this.targetTime = (opts.baseTime + opts.addedTime * Math.random()) | 0;
				this.rad += baseRad * (Math.random() < 0.5 ? 1 : -1);
				this.addedX = Math.cos(this.rad);
				this.addedY = Math.sin(this.rad);
				if (Math.random() < opts.dieChance || this.x > dieX || this.x < -dieX || this.y > dieY || this.y < -dieY)
					this.reset();
			}

			step() {
				++this.time;
				++this.cumulativeTime;
				if (this.time >= this.targetTime) this.beginPhase();

				const baseLight = light ? 35 : 50;
				const l = baseLight + 10 * Math.sin(this.cumulativeTime * this.lightInputMultiplier);
				const prop = this.time / this.targetTime;
				const wave = Math.sin(prop * Math.PI / 2);
				const x = this.addedX * wave;
				const y = this.addedY * wave;

				ctx.shadowBlur = prop * opts.shadowToTimePropMult;
				const color = `hsl(${this.hue},${this.sat}%,${l}%)`;
				ctx.fillStyle = ctx.shadowColor = color;
				ctx.fillRect(opts.cx + (this.x + x) * opts.len, opts.cy + (this.y + y) * opts.len, 2, 2);

				if (Math.random() < opts.sparkChance) {
					const sx = opts.cx + (this.x + x) * opts.len + Math.random() * opts.sparkDist * (Math.random() < 0.5 ? 1 : -1) - opts.sparkSize / 2;
					const sy = opts.cy + (this.y + y) * opts.len + Math.random() * opts.sparkDist * (Math.random() < 0.5 ? 1 : -1) - opts.sparkSize / 2;
					ctx.fillRect(sx, sy, opts.sparkSize, opts.sparkSize);
				}
			}
		}

		function loop() {
			animationId = requestAnimationFrame(loop);
			++tick;

			ctx.globalCompositeOperation = "source-over";
			ctx.shadowBlur = 0;
			ctx.fillStyle = (light ? "rgba(255,255,255," : "rgba(0,0,0,") + opts.repaintAlpha + ")";
			ctx.fillRect(0, 0, w, h);
			ctx.globalCompositeOperation = light ? "darken" : "lighter";

			if (lines.length < opts.count && Math.random() < opts.spawnChance)
				lines.push(new Line());

			for (const line of lines) line.step();
		}

		loop();

		resizeHandler = () => {
			clearTimeout(resizeTimeout);
			resizeTimeout = setTimeout(() => {
				w = canvas.width = canvas.offsetWidth;
				h = canvas.height = canvas.offsetHeight;
				clearCanvas();
				opts.cx = w / 2;
				opts.cy = h / 2;
				dieX = w / 2 / opts.len;
				dieY = h / 2 / opts.len;
			}, 150);
		};
		window.addEventListener("resize", resizeHandler);

		return () => { observer.disconnect(); };
	});

	onDestroy(() => {
		if (animationId) cancelAnimationFrame(animationId);
		if (resizeHandler) window.removeEventListener("resize", resizeHandler);
		clearTimeout(resizeTimeout);
	});
</script>

<canvas
	bind:this={canvas}
	class="hex-bg"
></canvas>

<style>
	.hex-bg {
		position: fixed;
		inset: 0;
		width: 100%;
		height: 100%;
		z-index: 0;
		pointer-events: none;
		opacity: 0.3;
	}
</style>
