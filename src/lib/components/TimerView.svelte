<script lang="ts">
	import {
		timerStore,
		timerDisplay,
		timerProgress,
		setTimerMinutes,
		setTimerSeconds,
		setTimerPreset,
		startTimer,
		pauseTimer,
		resumeTimer,
		stopTimer,
		resetTimer,
	} from "$lib/stores";

	// Preset times (in minutes)
	const presets = [1, 3, 5, 10, 15, 30];

	// Handle input changes
	function handleMinutesChange(e: Event) {
		const target = e.target as HTMLInputElement;
		const value = parseInt(target.value, 10);
		if (!isNaN(value)) {
			setTimerMinutes(value);
		}
	}

	function handleSecondsChange(e: Event) {
		const target = e.target as HTMLInputElement;
		const value = parseInt(target.value, 10);
		if (!isNaN(value)) {
			setTimerSeconds(value);
		}
	}

	// Play visual alert when timer hits 0
	$effect(() => {
		if ($timerStore.remainingSeconds === 0 && !$timerStore.isRunning && !$timerStore.isPaused) {
			const timerDisplay = document.getElementById("timer-display");
			if (timerDisplay && timerDisplay.classList.contains("timer-alert")) {
				// Already alerting
			}
		}
	});

	// Derived values
	const isTimerSet = $derived($timerStore.minutes > 0 || $timerStore.seconds > 0 || $timerStore.remainingSeconds > 0);
</script>

<style>
	:global(.timer-alert) {
		animation: flash 0.5s ease-in-out 6;
	}

	@keyframes flash {
		0%,
		100% {
			background-color: hsl(var(--card));
		}
		50% {
			background-color: hsl(var(--destructive));
		}
	}

	.progress-ring {
		transform: rotate(-90deg);
	}

	.progress-ring-circle {
		transition: stroke-dashoffset 0.3s ease;
	}
</style>

<div class="space-y-6">
	<h2 class="text-xl font-bold neon-text-cyan">Crafting Timer</h2>

	<!-- Timer Display -->
	<div
		id="timer-display"
		class="relative flex flex-col items-center justify-center p-8 border-2 border-primary rounded-lg bg-card neon-glow-purple"
	>
		<!-- Progress Ring -->
		<svg class="progress-ring w-48 h-48" viewBox="0 0 120 120">
			<!-- Background circle -->
			<circle
				cx="60"
				cy="60"
				r="54"
				fill="none"
				stroke="hsl(var(--muted))"
				stroke-width="8"
			/>
			<!-- Progress circle -->
			<circle
				class="progress-ring-circle"
				cx="60"
				cy="60"
				r="54"
				fill="none"
				stroke="#c77dff"
				stroke-width="8"
				stroke-linecap="round"
				stroke-dasharray={339.292}
				stroke-dashoffset={339.292 - (339.292 * $timerProgress) / 100}
			/>
		</svg>

		<!-- Time Display (centered in ring) -->
		<div class="absolute inset-0 flex items-center justify-center">
			<span
				class="text-5xl font-mono font-bold {$timerStore.remainingSeconds === 0 && $timerStore.isRunning
					? 'text-destructive'
					: 'neon-text-cyan'}"
			>
				{$timerDisplay}
			</span>
		</div>
	</div>

	<!-- Time Input (when not running) -->
	{#if !$timerStore.isRunning && !$timerStore.isPaused}
		<div class="flex items-center justify-center gap-4">
			<div class="flex flex-col items-center">
				<label for="minutes" class="text-xs text-muted-foreground mb-1">Minutes</label>
				<input
					id="minutes"
					type="number"
					min="0"
					max="99"
					value={$timerStore.minutes}
					onchange={handleMinutesChange}
					class="w-16 text-center bg-input text-foreground border border-border rounded px-2 py-2 text-lg font-mono focus:outline-none focus:ring-2 focus:ring-primary"
				/>
			</div>
			<span class="text-2xl font-bold text-muted-foreground mt-5">:</span>
			<div class="flex flex-col items-center">
				<label for="seconds" class="text-xs text-muted-foreground mb-1">Seconds</label>
				<input
					id="seconds"
					type="number"
					min="0"
					max="59"
					value={$timerStore.seconds}
					onchange={handleSecondsChange}
					class="w-16 text-center bg-input text-foreground border border-border rounded px-2 py-2 text-lg font-mono focus:outline-none focus:ring-2 focus:ring-primary"
				/>
			</div>
		</div>

		<!-- Presets -->
		<div class="flex flex-wrap justify-center gap-2">
			{#each presets as preset}
				<button
					onclick={() => setTimerPreset(preset)}
					class="px-3 py-1 text-sm bg-secondary text-secondary-foreground rounded hover:bg-primary hover:text-primary-foreground transition-colors"
				>
					{preset}m
				</button>
			{/each}
		</div>
	{/if}

	<!-- Controls -->
	<div class="flex justify-center gap-3">
		{#if !$timerStore.isRunning && !$timerStore.isPaused}
			<button
				onclick={startTimer}
				disabled={!isTimerSet}
				class="px-6 py-2 bg-accent text-accent-foreground font-bold rounded-lg hover:opacity-80 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
			>
				Start
			</button>
		{:else if $timerStore.isRunning}
			<button
				onclick={pauseTimer}
				class="px-6 py-2 bg-primary text-primary-foreground font-bold rounded-lg hover:opacity-80 transition-opacity"
			>
				Pause
			</button>
			<button
				onclick={stopTimer}
				class="px-6 py-2 bg-destructive text-destructive-foreground font-bold rounded-lg hover:opacity-80 transition-opacity"
			>
				Stop
			</button>
		{:else if $timerStore.isPaused}
			<button
				onclick={resumeTimer}
				class="px-6 py-2 bg-accent text-accent-foreground font-bold rounded-lg hover:opacity-80 transition-opacity"
			>
				Resume
			</button>
			<button
				onclick={resetTimer}
				class="px-6 py-2 bg-secondary text-secondary-foreground font-bold rounded-lg hover:opacity-80 transition-opacity"
			>
				Reset
			</button>
			<button
				onclick={stopTimer}
				class="px-6 py-2 bg-destructive text-destructive-foreground font-bold rounded-lg hover:opacity-80 transition-opacity"
			>
				Stop
			</button>
		{/if}
	</div>

	<!-- Status -->
	<div class="text-center text-sm text-muted-foreground">
		{#if $timerStore.isRunning}
			<span class="text-accent">Timer running...</span>
		{:else if $timerStore.isPaused}
			<span class="text-primary">Timer paused</span>
		{:else if $timerStore.remainingSeconds === 0 && ($timerStore.minutes > 0 || $timerStore.seconds > 0)}
			<span>Ready to start</span>
		{:else}
			<span>Set a time to begin</span>
		{/if}
	</div>
</div>
