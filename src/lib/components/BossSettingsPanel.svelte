<script lang="ts">
	import {
		settingsStore,
		toggleBossHidden,
		setHiddenBosses,
		setBossSoundEnabled,
		setBossAlertMinutes,
	} from "$lib/stores";
	import { BOSSES, type BossId } from "$lib/constants/boss-data";

	const ALL_BOSS_IDS = Object.keys(BOSSES) as BossId[];
	const regularBosses = ALL_BOSS_IDS.filter((id) => !BOSSES[id].isRare);
	const rareBosses = ALL_BOSS_IDS.filter((id) => BOSSES[id].isRare);

	function isHidden(id: BossId): boolean {
		return ($settingsStore.hidden_bosses ?? []).includes(id);
	}

	function showAll() {
		setHiddenBosses([]);
	}

	function hideAll() {
		setHiddenBosses([...ALL_BOSS_IDS]);
	}
</script>

<div class="space-y-3">
	<!-- Boss alert sound -->
	<div class="glass-card rounded p-2 space-y-2">
		<h3 class="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Boss Alerts</h3>
		<label class="flex items-center justify-between gap-2 cursor-pointer">
			<div class="min-w-0">
				<p class="text-[11px] font-semibold text-foreground">Play sound on boss spawn</p>
				<p class="text-[10px] text-muted-foreground">Audio alert when a boss is about to spawn.</p>
			</div>
			<input
				type="checkbox"
				checked={$settingsStore.boss_sound_enabled}
				onchange={(e) => setBossSoundEnabled((e.target as HTMLInputElement).checked)}
				class="settings-toggle flex-shrink-0"
			/>
		</label>

		{#if $settingsStore.boss_sound_enabled}
			<div class="flex items-center justify-between gap-2">
				<div class="min-w-0">
					<p class="text-[11px] font-semibold text-foreground">Alert minutes before spawn</p>
					<p class="text-[10px] text-muted-foreground">Play the sound when less than this many minutes remain.</p>
				</div>
				<input
					type="number"
					min="1"
					max="30"
					value={$settingsStore.boss_alert_minutes}
					oninput={(e) => {
						const v = parseInt((e.target as HTMLInputElement).value, 10);
						if (!isNaN(v)) setBossAlertMinutes(v);
					}}
					class="w-14 bg-input border border-border rounded px-1.5 py-0.5 text-[11px] text-center text-foreground no-spinner flex-shrink-0"
				/>
			</div>
		{/if}
	</div>

	<!-- Boss Visibility -->
	<div class="space-y-2">
		<div class="space-y-0.5">
			<h2 class="text-sm font-bold neon-text-cyan">Boss Visibility</h2>
			<p class="text-[10px] text-muted-foreground">
				Hide bosses you don't care about. They'll be filtered from the boss bar, mini, and medium views.
			</p>
		</div>
		<div class="flex gap-1.5">
			<button
				onclick={showAll}
				class="px-2 py-1 text-[10px] rounded border border-outline-variant/40 text-foreground hover:border-[var(--gold-glow)] hover:text-[var(--gold-glow)] transition-colors"
			>
				Show all
			</button>
			<button
				onclick={hideAll}
				class="px-2 py-1 text-[10px] rounded border border-outline-variant/40 text-muted-foreground hover:border-destructive hover:text-destructive transition-colors"
			>
				Hide all
			</button>
		</div>

		<!-- Regular bosses -->
		<div class="space-y-1.5 pt-1">
			<h3 class="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Regular</h3>
			<div class="grid grid-cols-2 gap-1.5">
				{#each regularBosses as id (id)}
					{@const boss = BOSSES[id]}
					{@const hidden = isHidden(id)}
					<button
						onclick={() => toggleBossHidden(id)}
						class="flex items-center gap-2 p-1.5 rounded border transition-all text-left
							{hidden
								? 'border-outline-variant/20 bg-secondary/20 opacity-50'
								: 'border-outline-variant/40 bg-secondary/40 hover:border-[var(--gold-glow)]'}"
						title={hidden ? "Hidden — click to show" : "Visible — click to hide"}
					>
						<img
							src={boss.image}
							alt={boss.name}
							class="w-7 h-7 rounded-full border border-outline-variant/30 object-cover {hidden ? 'grayscale' : ''}"
						/>
						<span class="flex-1 text-[11px] font-semibold text-foreground truncate">{boss.name}</span>
						<span
							class="w-7 h-4 rounded-full border flex items-center flex-shrink-0 {hidden ? 'bg-secondary border-outline-variant/30 justify-start' : 'bg-[var(--gold-glow)]/20 border-[var(--gold-glow)] justify-end'}"
						>
							<span
								class="w-3 h-3 rounded-full mx-0.5 {hidden ? 'bg-muted-foreground' : 'bg-[var(--gold-glow)]'}"
							></span>
						</span>
					</button>
				{/each}
			</div>
		</div>

		<!-- Rare bosses -->
		<div class="space-y-1.5">
			<h3 class="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Rare</h3>
			<div class="grid grid-cols-2 gap-1.5">
				{#each rareBosses as id (id)}
					{@const boss = BOSSES[id]}
					{@const hidden = isHidden(id)}
					<button
						onclick={() => toggleBossHidden(id)}
						class="flex items-center gap-2 p-1.5 rounded border transition-all text-left
							{hidden
								? 'border-outline-variant/20 bg-secondary/20 opacity-50'
								: 'border-outline-variant/40 bg-secondary/40 hover:border-[var(--gold-glow)]'}"
						title={hidden ? "Hidden — click to show" : "Visible — click to hide"}
					>
						<img
							src={boss.image}
							alt={boss.name}
							class="w-7 h-7 rounded-full border border-outline-variant/30 object-cover {hidden ? 'grayscale' : 'opacity-70'}"
						/>
						<span class="flex-1 text-[11px] font-semibold text-foreground/80 truncate">{boss.name}</span>
						<span
							class="w-7 h-4 rounded-full border flex items-center flex-shrink-0 {hidden ? 'bg-secondary border-outline-variant/30 justify-start' : 'bg-[var(--gold-glow)]/20 border-[var(--gold-glow)] justify-end'}"
						>
							<span
								class="w-3 h-3 rounded-full mx-0.5 {hidden ? 'bg-muted-foreground' : 'bg-[var(--gold-glow)]'}"
							></span>
						</span>
					</button>
				{/each}
			</div>
		</div>
	</div>
</div>
