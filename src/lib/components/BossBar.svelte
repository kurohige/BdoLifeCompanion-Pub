<script lang="ts">
	import {
		nextBossSpawns,
		formatCountdown,
	} from "$lib/stores";
	import { BOSSES } from "$lib/constants/boss-data";

	// Primary spawn (next up)
	const primary = $derived($nextBossSpawns[0] ?? null);
	// Secondary spawn (after that)
	const secondary = $derived($nextBossSpawns[1] ?? null);

	const primaryNames = $derived(
		primary
			? primary.spawn.bosses.map((id) => BOSSES[id]?.name ?? id).join(", ")
			: ""
	);
	const primaryIsRare = $derived(
		primary
			? primary.spawn.bosses.every((id) => BOSSES[id]?.isRare)
			: false
	);
	const secondaryNames = $derived(
		secondary
			? secondary.spawn.bosses.map((id) => BOSSES[id]?.name ?? id).join(", ")
			: ""
	);
	const secondaryIsRare = $derived(
		secondary
			? secondary.spawn.bosses.every((id) => BOSSES[id]?.isRare)
			: false
	);
</script>

<div class="h-7 glass-bossbar flex items-center px-2 gap-2 text-[11px] select-none">
	{#if primary}
		<!-- Primary spawn -->
		<div class="flex items-center gap-1.5 min-w-0 flex-1">
			<!-- Boss icons (overlapping if multiple) -->
			<div class="flex -space-x-1.5 flex-shrink-0">
				{#each primary.spawn.bosses.slice(0, 3) as bossId}
					{@const boss = BOSSES[bossId]}
					{#if boss}
						<img
							src={boss.image}
							alt={boss.name}
							class="w-6 h-6 rounded-full border border-border object-cover {boss.isRare ? 'opacity-50' : ''}"
						/>
					{/if}
				{/each}
			</div>
			<span class="truncate text-foreground font-semibold">
				{primaryNames}
				{#if primaryIsRare}<span class="text-muted-foreground font-normal">(rare)</span>{/if}
			</span>
			<span class="font-mono text-[12px] font-bold neon-text-cyan flex-shrink-0">
				{formatCountdown(primary.remainingMs)}
			</span>
		</div>

		<!-- Secondary spawn (if exists) -->
		{#if secondary}
			<div class="border-l border-border h-4"></div>
			<div class="flex items-center gap-1.5 flex-shrink-0">
				<div class="flex -space-x-1 flex-shrink-0">
					{#each secondary.spawn.bosses.slice(0, 2) as bossId}
						{@const boss = BOSSES[bossId]}
						{#if boss}
							<img
								src={boss.image}
								alt={boss.name}
								class="w-[18px] h-[18px] rounded-full border border-border object-cover opacity-60 {boss.isRare ? 'opacity-30' : ''}"
							/>
						{/if}
					{/each}
				</div>
				<span class="text-[10px] text-muted-foreground truncate max-w-[80px]">
					{secondaryNames}
					{#if secondaryIsRare}<span class="text-muted-foreground/60"> (rare)</span>{/if}
				</span>
				<span class="font-mono text-[10px] text-muted-foreground flex-shrink-0">
					{formatCountdown(secondary.remainingMs)}
				</span>
			</div>
		{/if}
	{:else}
		<span class="text-muted-foreground text-center w-full">No upcoming boss</span>
	{/if}
</div>
