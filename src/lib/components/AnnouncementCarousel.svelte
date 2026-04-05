<script lang="ts">
	import { onDestroy } from "svelte";
	import {
		activeMessagesStore,
		currentCardIndexStore,
		nextCard,
		dismissMessage,
		updateAvailableStore,
		getDownloadUrl,
	} from "$lib/stores";
	import { CAROUSEL_INTERVAL_MS, CAROUSEL_FLIP_DURATION_MS, DEFAULT_MESSAGE } from "$lib/constants/announcements.js";
	import { openUrl } from "@tauri-apps/plugin-opener";
	import type { AnnouncementMessage } from "$lib/models/announcements.js";

	interface Props {
		compact?: boolean;
	}

	let { compact = false }: Props = $props();

	// Carousel rotation state
	let isFlipping = $state(false);
	let isResetting = $state(false);
	let isPaused = $state(false);
	let currentMessage = $derived($activeMessagesStore[$currentCardIndexStore] ?? $activeMessagesStore[0]);
	let nextMessage = $derived(() => {
		const msgs = $activeMessagesStore;
		if (msgs.length <= 1) return msgs[0];
		return msgs[($currentCardIndexStore + 1) % msgs.length];
	});

	// Compact marquee state — tracks whether marquee has finished scrolling
	let marqueeKey = $state(0);

	// Auto-rotation interval (full mode only)
	let intervalId: ReturnType<typeof setInterval> | null = null;

	function startInterval() {
		stopInterval();
		if ($activeMessagesStore.length <= 1) return;
		if (compact) return; // Compact uses marquee-driven rotation
		intervalId = setInterval(() => {
			if (!isPaused) {
				triggerFlip();
			}
		}, CAROUSEL_INTERVAL_MS);
	}

	function stopInterval() {
		if (intervalId) {
			clearInterval(intervalId);
			intervalId = null;
		}
	}

	function triggerFlip() {
		if (isFlipping || $activeMessagesStore.length <= 1) return;
		isFlipping = true;
		setTimeout(() => {
			// Disable transition so the reset to 0deg is instant (no reverse animation)
			isResetting = true;
			nextCard();
			isFlipping = false;
			marqueeKey++; // Restart marquee animation for the new message
			// Re-enable transition on the next frame
			requestAnimationFrame(() => {
				isResetting = false;
			});
		}, CAROUSEL_FLIP_DURATION_MS);
	}

	// Compact: when marquee animation ends, trigger flip (if multiple messages)
	function handleMarqueeEnd() {
		if (!compact || isPaused) return;
		if ($activeMessagesStore.length > 1) {
			triggerFlip();
		} else {
			// Single message — restart the marquee after a pause
			setTimeout(() => {
				marqueeKey++;
			}, 2000);
		}
	}

	// Start/restart interval when message count changes
	$effect(() => {
		const count = $activeMessagesStore.length;
		if (count > 1 && !compact) {
			startInterval();
		} else {
			stopInterval();
		}
		return () => stopInterval();
	});

	onDestroy(() => {
		stopInterval();
	});

	// Card type styling
	function getCardStyle(type: AnnouncementMessage["type"]): { border: string; color: string; icon: string } {
		switch (type) {
			case "update": return { border: "border-primary", color: "text-primary", icon: "⬆️" };
			case "info": return { border: "border-cyan", color: "text-cyan", icon: "ℹ️" };
			case "event": return { border: "border-accent", color: "text-accent", icon: "🎉" };
			case "warning": return { border: "border-destructive", color: "text-destructive", icon: "⚠️" };
		}
	}

	function getAccentColor(type: AnnouncementMessage["type"]): string {
		switch (type) {
			case "update": return "hsl(var(--primary))";
			case "info": return "hsl(var(--cyan))";
			case "event": return "hsl(var(--accent))";
			case "warning": return "hsl(var(--destructive))";
		}
	}

	function handleDismiss(msg: AnnouncementMessage) {
		if (msg.id === DEFAULT_MESSAGE.id) return;
		dismissMessage(msg.id);
	}

	async function handleDownload() {
		const url = getDownloadUrl();
		if (url) {
			try {
				await openUrl(url);
			} catch {
				// Silently fail
			}
		}
	}

	function handleMouseEnter() {
		isPaused = true;
	}

	function handleMouseLeave() {
		isPaused = false;
	}
</script>

{#if compact}
	<!-- COMPACT MODE: Marquee ticker with 3D rotation between messages -->
	<div
		class="carousel-container carousel-compact"
		onmouseenter={handleMouseEnter}
		onmouseleave={handleMouseLeave}
		role="region"
		aria-label="Announcements"
	>
		<div class="carousel-scene">
			<div class="carousel-cube {isFlipping ? 'is-flipping' : ''} {isResetting ? 'no-transition' : ''}">
				<!-- Current face (front) -->
				{#if currentMessage}
					{@const style = getCardStyle(currentMessage.type)}
					<div class="carousel-face carousel-face-front">
						<div
							class="ticker-card border {style.border} rounded"
							style="--accent-color: {getAccentColor(currentMessage.type)}"
						>
							<div class="card-accent-bar" style="background: {getAccentColor(currentMessage.type)}"></div>
							<div class="ticker-track" class:ticker-paused={isPaused}>
								{#key marqueeKey}
									<span
										class="ticker-text"
										onanimationend={handleMarqueeEnd}
									>
										<span class="{style.color} text-[10px] font-bold">{style.icon} {currentMessage.title}</span>
										<span class="text-foreground/50 text-[10px] mx-1.5">—</span>
										<span class="text-foreground text-[11px]">{currentMessage.body}</span>
									</span>
								{/key}
							</div>
						</div>
					</div>
				{/if}

				<!-- Next face (bottom, rotates up) -->
				{#if $activeMessagesStore.length > 1}
					{@const next = nextMessage()}
					{#if next}
						{@const nextStyle = getCardStyle(next.type)}
						<div class="carousel-face carousel-face-bottom">
							<div
								class="ticker-card border {nextStyle.border} rounded"
								style="--accent-color: {getAccentColor(next.type)}"
							>
								<div class="card-accent-bar" style="background: {getAccentColor(next.type)}"></div>
								<div class="ticker-track">
									<span class="ticker-text ticker-paused">
										<span class="{nextStyle.color} text-[10px] font-bold">{nextStyle.icon} {next.title}</span>
										<span class="text-foreground/50 text-[10px] mx-1.5">—</span>
										<span class="text-foreground text-[11px]">{next.body}</span>
									</span>
								</div>
							</div>
						</div>
					{/if}
				{/if}
			</div>
		</div>
	</div>
{:else}
	<!-- FULL MODE: Static cards with 3D cube rotation on interval -->
	<div
		class="carousel-container carousel-full"
		onmouseenter={handleMouseEnter}
		onmouseleave={handleMouseLeave}
		role="region"
		aria-label="Announcements"
	>
		<div class="carousel-scene">
			<div class="carousel-cube {isFlipping ? 'is-flipping' : ''} {isResetting ? 'no-transition' : ''}">
				<!-- Current face (front) -->
				{#if currentMessage}
					{@const style = getCardStyle(currentMessage.type)}
					<div
						class="carousel-face carousel-face-front"
						style="--accent-color: {getAccentColor(currentMessage.type)}"
					>
						<div class="card-content glass-card border {style.border} rounded px-3 py-1.5">
							<div class="card-accent-bar" style="background: {getAccentColor(currentMessage.type)}"></div>
							<div class="flex items-start gap-1.5 flex-1 min-w-0">
								<span class="text-xs flex-shrink-0">{style.icon}</span>
								<div class="flex-1 min-w-0">
									<span class="{style.color} text-xs font-bold leading-tight block truncate">
										{currentMessage.title}
									</span>
									<span class="text-foreground/80 text-[11px] leading-tight block truncate">
										{currentMessage.body}
									</span>
									{#if currentMessage.type === "update" && $updateAvailableStore}
										<button
											onclick={handleDownload}
											class="mt-1 px-2 py-0.5 text-[9px] font-bold rounded border border-primary text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
										>
											Download
										</button>
									{/if}
								</div>
								{#if currentMessage.id !== DEFAULT_MESSAGE.id}
									<button
										onclick={() => handleDismiss(currentMessage)}
										class="text-foreground/30 hover:text-foreground/70 text-[10px] flex-shrink-0 transition-colors leading-none"
										title="Dismiss"
									>
										✕
									</button>
								{/if}
							</div>
						</div>
					</div>
				{/if}

				<!-- Next face (bottom, rotates up) -->
				{#if $activeMessagesStore.length > 1}
					{@const next = nextMessage()}
					{#if next}
						{@const nextStyle = getCardStyle(next.type)}
						<div
							class="carousel-face carousel-face-bottom"
							style="--accent-color: {getAccentColor(next.type)}"
						>
							<div class="card-content bg-card border {nextStyle.border} rounded px-3 py-1.5">
								<div class="card-accent-bar" style="background: {getAccentColor(next.type)}"></div>
								<div class="flex items-start gap-1.5 flex-1 min-w-0">
									<span class="text-xs flex-shrink-0">{nextStyle.icon}</span>
									<div class="flex-1 min-w-0">
										<span class="{nextStyle.color} text-xs font-bold leading-tight block truncate">
											{next.title}
										</span>
										<span class="text-foreground/80 text-[11px] leading-tight block truncate">
											{next.body}
										</span>
									</div>
									{#if next.id !== DEFAULT_MESSAGE.id}
										<button
											class="text-foreground/30 text-[10px] flex-shrink-0 leading-none"
											tabindex="-1"
										>
											✕
										</button>
									{/if}
								</div>
							</div>
						</div>
					{/if}
				{/if}
			</div>
		</div>

		<!-- Carousel indicators (only if multiple messages) -->
		{#if $activeMessagesStore.length > 1}
			<div class="flex justify-center gap-1 mt-0.5">
				{#each $activeMessagesStore as _, i}
					<div
						class="w-1 h-1 rounded-full transition-colors {i === $currentCardIndexStore ? 'bg-primary' : 'bg-muted'}"
					></div>
				{/each}
			</div>
		{/if}
	</div>
{/if}

<style>
	.carousel-container {
		width: 100%;
		overflow: hidden;
	}

	.carousel-full {
		--card-height: 44px;
	}

	.carousel-compact {
		--card-height: 22px;
	}

	.carousel-scene {
		perspective: 600px;
		height: var(--card-height);
		overflow: hidden;
	}

	.carousel-cube {
		width: 100%;
		height: 100%;
		position: relative;
		transform-style: preserve-3d;
		transition: transform 600ms cubic-bezier(0.4, 0, 0.2, 1);
	}

	.carousel-cube.is-flipping {
		transform: rotateX(-90deg);
	}

	.carousel-cube.no-transition {
		transition: none;
	}

	.carousel-face {
		position: absolute;
		width: 100%;
		height: var(--card-height);
		backface-visibility: hidden;
	}

	.carousel-face-front {
		transform: rotateX(0deg) translateZ(calc(var(--card-height) / 2));
	}

	.carousel-face-bottom {
		transform: rotateX(90deg) translateZ(calc(var(--card-height) / 2));
	}

	/* Full mode card content */
	.card-content {
		height: var(--card-height);
		display: flex;
		align-items: center;
		position: relative;
		overflow: hidden;
	}

	.card-accent-bar {
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 3px;
		border-radius: 4px 0 0 4px;
	}

	/* Compact ticker card */
	.ticker-card {
		height: var(--card-height);
		display: flex;
		align-items: center;
		position: relative;
		overflow: hidden;
		background: hsla(var(--card) / 0.5);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		padding: 0 6px 0 8px;
	}

	/* Marquee ticker track */
	.ticker-track {
		overflow: hidden;
		white-space: nowrap;
		width: 100%;
	}

	.ticker-text {
		display: inline-block;
		white-space: nowrap;
		padding-left: 100%;
		animation: marquee-scroll 8s linear forwards;
	}

	.ticker-paused .ticker-text,
	.ticker-text.ticker-paused {
		animation-play-state: paused;
	}

	@keyframes marquee-scroll {
		0% {
			transform: translateX(0);
		}
		100% {
			transform: translateX(-100%);
		}
	}
</style>
