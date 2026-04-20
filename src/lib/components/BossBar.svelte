<script lang="ts">
	import {
		nextBossSpawn,
		previousBossSpawn,
		previousBossElapsed,
		formatCountdown,
		getBossNames,
	} from "$lib/stores";
	import { BOSSES } from "$lib/constants/boss-data";

	// Next upcoming boss
	const next = $derived($nextBossSpawn);

	const nextNames = $derived(next ? getBossNames(next.spawn, ", ") : "");
	const nextIsRare = $derived(
		next ? next.spawn.bosses.every((id) => BOSSES[id]?.isRare) : false,
	);

	// Most recent past spawn
	const prevNames = $derived(
		$previousBossSpawn ? getBossNames($previousBossSpawn.spawn, ", ") : "",
	);
</script>

<div class="h-9 glass-bossbar flex items-center px-3 gap-3 text-[11px] select-none">
	{#if next || $previousBossSpawn}
		<!-- Previous spawn (past, dim) — left -->
		{#if $previousBossSpawn}
			<div class="flex items-center gap-1.5 flex-shrink-0 opacity-60 min-w-0" title="Most recent spawn">
				<div class="flex -space-x-1 flex-shrink-0">
					{#each $previousBossSpawn.spawn.bosses.slice(0, 2) as bossId}
						{@const boss = BOSSES[bossId]}
						{#if boss}
							<img
								src={boss.image}
								alt={boss.name}
								class="w-6 h-6 rounded-full border border-outline-variant/20 object-cover grayscale-[50%]"
							/>
						{/if}
					{/each}
				</div>
				<span class="text-[10px] text-muted-foreground truncate max-w-[110px]">
					{prevNames}
				</span>
				<span class="font-mono text-[10px] text-muted-foreground flex-shrink-0">
					{$previousBossElapsed}
				</span>
			</div>
		{/if}

		<!-- Divider -->
		{#if $previousBossSpawn && next}
			<div class="border-l border-outline-variant/20 h-5 flex-shrink-0"></div>
		{/if}

		<!-- Next spawn — right (flex-1 to fill remaining space) -->
		{#if next}
			<div class="flex items-center gap-2 min-w-0 flex-1">
				<div class="flex -space-x-2 flex-shrink-0">
					{#each next.spawn.bosses.slice(0, 3) as bossId}
						{@const boss = BOSSES[bossId]}
						{#if boss}
							<img
								src={boss.image}
								alt={boss.name}
								class="w-8 h-8 rounded-full border border-outline-variant/30 object-cover {boss.isRare ? 'opacity-60 grayscale-[30%]' : 'brightness-110'}"
							/>
						{/if}
					{/each}
				</div>
				<span class="truncate text-foreground font-semibold min-w-0">
					{nextNames}
					{#if nextIsRare}<span class="text-muted-foreground font-normal">(rare)</span>{/if}
				</span>
				<span class="font-mono text-[13px] font-bold neon-text-cyan flex-shrink-0 ml-auto">
					{formatCountdown(next.remainingMs)}
				</span>
			</div>
		{/if}
	{:else}
		<span class="text-muted-foreground text-center w-full">All bosses hidden — enable in Settings</span>
	{/if}
</div>
