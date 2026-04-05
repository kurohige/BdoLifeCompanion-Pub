<script lang="ts">
	import {
		nextBossSpawns,
		formatCountdown,
		type NextBossInfo,
	} from "$lib/stores";
	import { BOSSES, type BossId } from "$lib/constants/boss-data";

	interface Props {
		onhover?: (boss: BossId | null) => void;
	}

	let { onhover }: Props = $props();

	// Show up to 3 upcoming spawns
	const maxDisplay = 3;
</script>

<div class="flex flex-col gap-1 h-full">
	{#if $nextBossSpawns.length > 0}
		{@const next = $nextBossSpawns[0]}
		<!-- Primary: next boss -->
		<div
			class="flex items-center gap-1.5 flex-1 min-h-0"
			onmouseleave={() => onhover?.(null)}
			role="group"
		>
			<div class="flex -space-x-1.5 flex-shrink-0">
				{#each next.spawn.bosses as bossId}
					{@const boss = BOSSES[bossId]}
					<div
						class="w-7 h-7 rounded-full overflow-hidden border border-border bg-secondary cursor-pointer {boss.isRare ? 'opacity-50' : ''}"
						title={boss.name + (boss.isRare ? " (Rare)" : "")}
						onmouseenter={() => onhover?.(bossId)}
						role="img"
					>
						<img src={boss.image} alt={boss.name} class="w-full h-full object-cover" />
					</div>
				{/each}
			</div>
			<div class="min-w-0 flex-1">
				<div class="flex items-center gap-1">
					<span class="font-mono text-base font-bold neon-text-cyan">
						{formatCountdown(next.remainingMs)}
					</span>
				</div>
				<p class="text-[9px] text-muted-foreground truncate">
					{next.spawn.bosses.map((id) => BOSSES[id]?.name ?? id).join(" & ")}
					{#if next.spawn.bosses.some((id) => BOSSES[id]?.isRare)}
						<span class="text-primary italic">rare</span>
					{/if}
				</p>
			</div>
		</div>

		<!-- Secondary: next 2 upcoming -->
		{#if $nextBossSpawns.length > 1}
			<div class="flex gap-2">
				{#each $nextBossSpawns.slice(1, maxDisplay) as upcoming}
					<div
						class="flex items-center gap-1 text-[8px] text-muted-foreground cursor-default"
						onmouseleave={() => onhover?.(null)}
						role="group"
					>
						<div class="flex -space-x-1 flex-shrink-0">
							{#each upcoming.spawn.bosses.slice(0, 2) as bossId}
								{@const boss = BOSSES[bossId]}
								<div
									class="w-3.5 h-3.5 rounded-full overflow-hidden border border-border/50 bg-secondary cursor-pointer {boss.isRare ? 'opacity-40' : ''}"
									onmouseenter={() => onhover?.(bossId)}
									role="img"
								>
									<img src={boss.image} alt={boss.name} class="w-full h-full object-cover" />
								</div>
							{/each}
						</div>
						<span class="font-mono">{formatCountdown(upcoming.remainingMs)}</span>
					</div>
				{/each}
			</div>
		{/if}
	{:else}
		<span class="text-xs text-muted-foreground/50">No schedule</span>
	{/if}
</div>
