<script lang="ts">
	import {
		weeklyTasksDataStore,
		weeklyTasksProgressStore,
		setHighestStage,
		toggleCompletedThisWeek,
		markFirstClear,
		unmarkFirstClear,
		tickStore,
		formatCountdown,
	} from "$lib/stores";
	import type { WeeklyTaskDefinition, WeeklyTaskProgress } from "$lib/models/weekly-tasks";
	import { getNextWeeklyReset } from "$lib/utils/reset";

	// Weekly reset countdown (Sunday 00:00 UTC)
	let weeklyResetMs = $derived(getNextWeeklyReset(new Date($tickStore)).getTime() - $tickStore);

	let progressMap = $derived(
		new Map($weeklyTasksProgressStore.map((p) => [p.taskId, p]))
	);

	const EMPTY_PROGRESS: WeeklyTaskProgress = {
		taskId: "",
		highestStageCleared: 0,
		completedThisWeek: false,
		firstClearStages: [],
		weekStartIso: "",
	};

	function getProgress(taskId: string): WeeklyTaskProgress {
		return progressMap.get(taskId) ?? EMPTY_PROGRESS;
	}

	// Collapsible sections per task
	let showApDp = $state<Record<string, boolean>>({});
	let showFirstClear = $state<Record<string, boolean>>({});

	function toggleApDp(taskId: string) {
		showApDp = { ...showApDp, [taskId]: !showApDp[taskId] };
	}

	function toggleFirstClearSection(taskId: string) {
		showFirstClear = { ...showFirstClear, [taskId]: !showFirstClear[taskId] };
	}

	function handleStageChange(taskId: string, value: string) {
		const n = parseInt(value || "0", 10);
		if (!isNaN(n)) setHighestStage(taskId, n);
	}

	function incrementStage(task: WeeklyTaskDefinition) {
		const p = getProgress(task.id);
		if (p.highestStageCleared < task.stages.length) {
			setHighestStage(task.id, p.highestStageCleared + 1);
		}
	}

	function decrementStage(task: WeeklyTaskDefinition) {
		const p = getProgress(task.id);
		if (p.highestStageCleared > 0) {
			setHighestStage(task.id, p.highestStageCleared - 1);
		}
	}

	function toggleFirstClear(taskId: string, stage: number) {
		const p = getProgress(taskId);
		if (p.firstClearStages.includes(stage)) {
			unmarkFirstClear(taskId, stage);
		} else {
			markFirstClear(taskId, stage);
		}
	}
</script>

<div class="space-y-3">
	<!-- Header -->
	<div class="flex items-center justify-between px-1">
		<h2 class="text-xs font-headline font-bold text-primary uppercase tracking-wider">Weekly Tasks</h2>
		<div class="flex items-center gap-2 text-[10px] text-muted-foreground">
			<span>Weekly Reset:</span>
			<span class="font-mono text-accent">{formatCountdown(weeklyResetMs)}</span>
		</div>
	</div>

	<!-- Task Cards -->
	{#if $weeklyTasksDataStore}
		{#each $weeklyTasksDataStore.tasks as task (task.id)}
			{@const progress = getProgress(task.id)}
			{@const pct = task.stages.length > 0 ? Math.round((progress.highestStageCleared / task.stages.length) * 100) : 0}
			<div class="glass-card rounded-lg p-3 space-y-2.5">
				<!-- Card Header -->
				<div class="flex items-center gap-2">
					<span class="text-lg">{task.icon}</span>
					<div class="flex-1">
						<h3 class="text-[13px] font-headline font-bold text-foreground">{task.name}</h3>
						<p class="text-[10px] text-muted-foreground">{task.description}</p>
					</div>
					<div class="flex items-center gap-2">
						<span class="text-[11px] font-mono font-bold {progress.highestStageCleared > 0 ? 'text-accent' : 'text-muted-foreground'}">
							{progress.highestStageCleared}/{task.stages.length}
						</span>
						<button
							onclick={() => toggleCompletedThisWeek(task.id)}
							class="w-6 h-6 flex items-center justify-center rounded border text-[12px] transition-colors
								{progress.completedThisWeek
									? 'bg-accent/20 border-accent/50 text-accent'
									: 'border-outline-variant/30 text-muted-foreground/40 hover:border-outline-variant/60'}"
							title={progress.completedThisWeek ? "Mark as incomplete" : "Mark as done for this week"}
						>
							{progress.completedThisWeek ? "✓" : ""}
						</button>
					</div>
				</div>

				<!-- Stage Progress Bar -->
				<div class="space-y-1">
					<div class="flex gap-[2px] h-3 rounded overflow-hidden">
						{#each task.stages as s (s.stage)}
							{@const cleared = s.stage <= progress.highestStageCleared}
							{@const isBoss = s.category === "boss"}
							{@const segClass = cleared
								? (isBoss ? "bg-yellow-500" : "bg-accent")
								: (isBoss ? "bg-yellow-500/15" : "bg-white/5")}
							<div
								class="flex-1 transition-colors relative group {segClass}"
								title="Stage {s.stage} ({s.category}) — AP {s.apRequired} / DP {s.dpRequired}"
							>
								{#if isBoss}
									<div class="absolute inset-0 flex items-center justify-center text-[7px] font-bold
										{cleared ? 'text-yellow-900' : 'text-yellow-500/50'}">B</div>
								{/if}
							</div>
						{/each}
					</div>
					<div class="flex items-center justify-between text-[9px] text-muted-foreground">
						<span>Stage 1</span>
						<span class="font-mono text-accent">{pct}%</span>
						<span>Stage {task.stages.length}</span>
					</div>
				</div>

				<!-- Stage Selector -->
				<div class="flex items-center gap-2">
					<span class="text-[10px] text-muted-foreground w-20 shrink-0">Highest Cleared</span>
					<button
						onclick={() => decrementStage(task)}
						disabled={progress.highestStageCleared <= 0}
						class="w-6 h-6 flex items-center justify-center text-[12px] glass-input rounded disabled:opacity-30 hover:bg-white/5"
					>-</button>
					<input
						type="number"
						value={progress.highestStageCleared}
						onchange={(e) => handleStageChange(task.id, (e.target as HTMLInputElement).value)}
						min="0"
						max={task.stages.length}
						class="glass-input text-[11px] px-2 py-1 w-14 text-center font-mono no-spinner"
					/>
					<button
						onclick={() => incrementStage(task)}
						disabled={progress.highestStageCleared >= task.stages.length}
						class="w-6 h-6 flex items-center justify-center text-[12px] glass-input rounded disabled:opacity-30 hover:bg-white/5"
					>+</button>
					<button
						onclick={() => setHighestStage(task.id, task.stages.length)}
						disabled={progress.highestStageCleared >= task.stages.length}
						class="px-2 py-0.5 text-[9px] font-mono glass-input rounded hover:bg-white/5 disabled:opacity-30"
					>MAX</button>
				</div>

				<!-- AP/DP Reference (collapsible) -->
				<div>
					<button
						onclick={() => toggleApDp(task.id)}
						class="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
					>
						<span class="text-[8px]">{showApDp[task.id] ? "▼" : "▶"}</span>
						<span class="font-headline font-bold uppercase tracking-wider">AP/DP Requirements</span>
					</button>
					{#if showApDp[task.id]}
						<div class="mt-1.5 overflow-hidden rounded border border-outline-variant/20">
							<table class="w-full text-[10px]">
								<thead>
									<tr class="bg-white/5">
										<th class="px-2 py-1 text-left text-muted-foreground font-medium">Stage</th>
										<th class="px-2 py-1 text-center text-muted-foreground font-medium">Type</th>
										<th class="px-2 py-1 text-center text-muted-foreground font-medium">AP</th>
										<th class="px-2 py-1 text-center text-muted-foreground font-medium">DP</th>
									</tr>
								</thead>
								<tbody>
									{#each task.stages as s (s.stage)}
										{@const cleared = s.stage <= progress.highestStageCleared}
										<tr class="border-t border-outline-variant/10
											{s.category === 'boss' ? 'bg-yellow-500/5' : ''}
											{cleared ? 'opacity-50' : ''}">
											<td class="px-2 py-0.5 font-mono">{s.stage}</td>
											<td class="px-2 py-0.5 text-center {s.category === 'boss' ? 'text-yellow-400 font-bold' : 'text-foreground/70'}">
												{s.category === "boss" ? "Boss" : "Normal"}
											</td>
											<td class="px-2 py-0.5 text-center font-mono">{s.apRequired}</td>
											<td class="px-2 py-0.5 text-center font-mono">{s.dpRequired}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</div>

				<!-- First Clear Tracker (collapsible) -->
				<div>
					<button
						onclick={() => toggleFirstClearSection(task.id)}
						class="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
					>
						<span class="text-[8px]">{showFirstClear[task.id] ? "▼" : "▶"}</span>
						<span class="font-headline font-bold uppercase tracking-wider">First Clear Rewards</span>
						<span class="text-[9px] font-mono text-accent ml-1">
							{progress.firstClearStages.length}/{task.stages.length}
						</span>
					</button>
					{#if showFirstClear[task.id]}
						<div class="mt-1.5 grid grid-cols-7 gap-1">
							{#each task.stages as s (s.stage)}
								{@const claimed = progress.firstClearStages.includes(s.stage)}
								<button
									onclick={() => toggleFirstClear(task.id, s.stage)}
									class="h-7 flex items-center justify-center rounded text-[10px] font-mono transition-colors border
										{claimed
											? 'bg-accent/20 border-accent/50 text-accent'
											: s.category === 'boss'
												? 'border-yellow-500/30 text-yellow-400/60 hover:border-yellow-500/60'
												: 'border-outline-variant/20 text-muted-foreground/50 hover:border-outline-variant/40'}"
									title="Stage {s.stage} ({s.category}) — {claimed ? 'First clear claimed' : 'Not claimed yet'}"
								>
									{s.stage}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		{/each}
	{:else}
		<div class="text-center py-8">
			<p class="text-[32px] mb-1 opacity-30">📋</p>
			<p class="text-[11px] text-muted-foreground">Loading weekly tasks...</p>
		</div>
	{/if}
</div>
