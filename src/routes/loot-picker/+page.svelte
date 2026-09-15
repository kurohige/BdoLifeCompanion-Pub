<!--
	Loot OCR — region picker route.

	Opens as a separate fullscreen, frameless, transparent Tauri window. On mount
	it asks Rust to capture the screen (the window is invisible at that instant,
	so the capture only sees the actual desktop), then renders the frozen frame
	and lets the user drag a rectangle. On mouseup we emit `loot-picker-commit`
	with the region (normalized 0..1) and close. ESC / right-click emits
	`loot-picker-cancel`. Either way the spawner promise resolves cleanly.
-->
<script lang="ts">
	import { onMount } from "svelte";
	import { invoke } from "@tauri-apps/api/core";
	import { emit } from "@tauri-apps/api/event";
	import { getCurrentWindow } from "@tauri-apps/api/window";

	interface CapturedFramePayload {
		pngBase64: string;
		width: number;
		height: number;
		monitorId: string;
	}

	interface Point {
		x: number;
		y: number;
	}

	let frame = $state<{ url: string; monitorId: string } | null>(null);
	let loadError = $state<string | null>(null);
	let dragStart = $state<Point | null>(null);
	let dragEnd = $state<Point | null>(null);

	const MIN_REGION_PX = 8;

	const rect = $derived.by(() => {
		if (!dragStart || !dragEnd) return null;
		const x = Math.min(dragStart.x, dragEnd.x);
		const y = Math.min(dragStart.y, dragEnd.y);
		const w = Math.abs(dragEnd.x - dragStart.x);
		const h = Math.abs(dragEnd.y - dragStart.y);
		return { x, y, w, h };
	});

	onMount(() => {
		// Defer the capture by one frame so the transparent window has actually
		// painted before xcap snapshots the screen — otherwise we might catch a
		// half-rendered window background and "burn it into" the picker frame.
		requestAnimationFrame(async () => {
			try {
				const payload = await invoke<CapturedFramePayload>("loot_capture_full_screen", {
					monitorId: null,
				});
				frame = {
					url: `data:image/png;base64,${payload.pngBase64}`,
					monitorId: payload.monitorId,
				};
			} catch (e) {
				console.error("Failed to capture frame:", e);
				loadError = e instanceof Error ? e.message : String(e);
				// Surface for ~1s so user sees the error, then bail.
				setTimeout(() => {
					void cancel();
				}, 1200);
			}
		});
	});

	$effect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				void cancel();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	});

	function onMouseDown(e: MouseEvent) {
		if (e.button !== 0) return;
		dragStart = { x: e.clientX, y: e.clientY };
		dragEnd = { x: e.clientX, y: e.clientY };
	}

	function onMouseMove(e: MouseEvent) {
		if (!dragStart) return;
		dragEnd = { x: e.clientX, y: e.clientY };
	}

	async function onMouseUp() {
		if (!frame || !dragStart || !dragEnd) {
			dragStart = null;
			dragEnd = null;
			return;
		}
		const r = rect;
		if (!r || r.w < MIN_REGION_PX || r.h < MIN_REGION_PX) {
			// Too small to count as an intentional drag — let the user try again.
			dragStart = null;
			dragEnd = null;
			return;
		}

		const region = {
			x: r.x / window.innerWidth,
			y: r.y / window.innerHeight,
			w: r.w / window.innerWidth,
			h: r.h / window.innerHeight,
			monitorId: frame.monitorId,
		};
		await emit("loot-picker-commit", region);
		await getCurrentWindow().close();
	}

	function onContextMenu(e: MouseEvent) {
		e.preventDefault();
		void cancel();
	}

	async function cancel() {
		await emit("loot-picker-cancel");
		try {
			await getCurrentWindow().close();
		} catch {
			// Already closed.
		}
	}
</script>

{#if loadError}
	<div class="error-toast">Capture failed: {loadError}</div>
{:else if frame}
	<!-- The frame image fills the viewport at object-fit:fill so screen pixel
	     coords map 1:1 to viewport pixel coords. -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="picker"
		role="application"
		onmousedown={onMouseDown}
		onmousemove={onMouseMove}
		onmouseup={onMouseUp}
		oncontextmenu={onContextMenu}
	>
		<img src={frame.url} alt="" class="frame" draggable="false" />

		{#if !rect}
			<!-- No active drag — flat dim across the whole frame -->
			<div class="dim"></div>
		{:else}
			<!-- During drag, dim everything OUTSIDE the rect via the box-shadow trick -->
			<div
				class="cutout"
				style="left: {rect.x}px; top: {rect.y}px; width: {rect.w}px; height: {rect.h}px;"
			>
				<div class="scanline"></div>
			</div>
		{/if}

		<div class="hint" class:hint-hidden={rect !== null}>
			<span class="hint-label">PICK OCR REGION</span>
			<span class="hint-sub">Drag a rectangle &middot; ESC or right-click to cancel</span>
		</div>
	</div>
{/if}

<style>
	:global(html),
	:global(body) {
		background: transparent !important;
		margin: 0;
		padding: 0;
		overflow: hidden;
		cursor: crosshair;
		user-select: none;
	}

	.picker {
		position: fixed;
		inset: 0;
		cursor: crosshair;
	}

	.frame {
		position: absolute;
		inset: 0;
		width: 100vw;
		height: 100vh;
		object-fit: fill;
		pointer-events: none;
		user-select: none;
	}

	.dim {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.45);
		pointer-events: none;
	}

	.cutout {
		position: absolute;
		box-shadow:
			0 0 0 9999px rgba(0, 0, 0, 0.55),
			inset 0 0 0 1.5px #00e3fd,
			0 0 14px rgba(189, 244, 255, 0.6);
		pointer-events: none;
		overflow: hidden;
	}

	.scanline {
		position: absolute;
		left: 0;
		right: 0;
		height: 2px;
		background: linear-gradient(
			90deg,
			transparent 0%,
			#00e3fd 50%,
			transparent 100%
		);
		opacity: 0.85;
		animation: scanline 1.6s linear infinite;
	}

	@keyframes scanline {
		0% {
			top: 0;
		}
		100% {
			top: 100%;
		}
	}

	.hint {
		position: fixed;
		top: 18px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 8px 16px;
		background: rgba(14, 14, 14, 0.78);
		backdrop-filter: blur(6px);
		box-shadow:
			0 0 0 1px rgba(189, 244, 255, 0.25),
			0 0 20px rgba(0, 0, 0, 0.5);
		border-radius: 2px;
		pointer-events: none;
		transition: opacity 200ms ease;
	}

	.hint-hidden {
		opacity: 0;
	}

	.hint-label {
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		font-weight: 700;
		font-size: 11px;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: #bdf4ff;
	}

	.hint-sub {
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		font-size: 9px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: #cfc2d4;
	}

	.error-toast {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		padding: 14px 24px;
		background: rgba(20, 0, 0, 0.85);
		color: #ffb4ab;
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		font-size: 12px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		box-shadow: 0 0 0 1px rgba(255, 180, 171, 0.35);
		border-radius: 2px;
	}
</style>
