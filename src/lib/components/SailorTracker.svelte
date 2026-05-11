<script lang="ts">
	import {
		sailorRosterStore,
		addSailor,
		updateSailor,
		removeSailor,
	} from "$lib/stores";
	import { SAILOR_SPEED_TABLE } from "$lib/models/bartering";
	import type { SailorStatus } from "$lib/models/bartering";
	import { m } from "$lib/paraglide/messages";

	// label is a thunk so it re-translates when locale changes
	const STATUS_OPTIONS: { value: SailorStatus; label: () => string }[] = [
		{ value: "below_average", label: () => m.bartering_sailors_status_below() },
		{ value: "average", label: () => m.bartering_sailors_status_avg() },
		{ value: "above_average", label: () => m.bartering_sailors_status_above() },
	];

	const STATUS_COLORS: Record<SailorStatus, string> = {
		below_average: "text-red-400",
		average: "text-yellow-400",
		above_average: "text-green-400",
	};

	// Add form state
	let newName = $state("");
	let newLevel = $state("1");
	let newSpeed = $state("");
	let newStatus = $state<SailorStatus>("average");
	let showAddForm = $state(false);

	// Editing state
	let editingId = $state<string | null>(null);

	// Summary stats (derived)
	let avgSpeed = $derived($sailorRosterStore.length > 0
		? $sailorRosterStore.reduce((s, r) => s + r.speed, 0) / $sailorRosterStore.length
		: 0);
	let bestSpeed = $derived($sailorRosterStore.length > 0
		? Math.max(...$sailorRosterStore.map((s) => s.speed))
		: 0);

	/** Project speed at level 10 based on current level, speed, and status */
	function projectSpeed(level: number, speed: number, status: SailorStatus): { likely: number; max: number } {
		if (level >= 10) return { likely: speed, max: speed };

		const remainingLevels = 10 - level;
		let likelyGain = 0;
		let maxGain = 0;

		for (let l = level; l < 10; l++) {
			const entry = SAILOR_SPEED_TABLE.find((e) => e.level === l + 1);
			if (!entry) continue;
			if (status === "above_average") {
				likelyGain += entry.maxRoll * 0.8;
				maxGain += entry.maxRoll;
			} else if (status === "average") {
				likelyGain += entry.medianRoll;
				maxGain += entry.maxRoll;
			} else {
				likelyGain += entry.medianRoll * 0.7;
				maxGain += entry.maxRoll;
			}
		}

		return {
			likely: Math.round((speed + likelyGain) * 100) / 100,
			max: Math.round((speed + maxGain) * 100) / 100,
		};
	}

	function handleAdd() {
		const name = newName.trim();
		const level = parseInt(newLevel, 10);
		const speed = parseFloat(newSpeed);
		if (!name || isNaN(level) || isNaN(speed)) return;

		addSailor(name, level, speed, newStatus);
		newName = "";
		newLevel = "1";
		newSpeed = "";
		newStatus = "average";
		showAddForm = false;
	}

	function handleLevelChange(id: string, value: string) {
		const level = parseInt(value, 10);
		if (!isNaN(level)) updateSailor(id, { level: Math.max(1, Math.min(10, level)) });
	}

	function handleSpeedChange(id: string, value: string) {
		const speed = parseFloat(value);
		if (!isNaN(speed)) updateSailor(id, { speed });
	}

	function handleStatusChange(id: string, value: string) {
		updateSailor(id, { status: value as SailorStatus });
	}
</script>

<div class="space-y-3">
	<!-- Header + Add Button -->
	<div class="flex items-center justify-between">
		<h3 class="text-xs font-headline font-bold text-primary uppercase tracking-wider">{m.bartering_sailors_roster()}</h3>
		<button
			onclick={() => showAddForm = !showAddForm}
			class="px-2 py-0.5 text-[10px] font-bold rounded obsidian-cta"
		>
			{showAddForm ? m.bartering_sailors_cancel() : m.bartering_sailors_add()}
		</button>
	</div>

	<!-- Add Sailor Form -->
	{#if showAddForm}
		<div class="glass-card p-3 space-y-2">
			<div class="flex gap-2">
				<div class="flex-1">
					<span class="text-[10px] text-muted-foreground">{m.bartering_sailors_name()}</span>
					<input
						type="text"
						bind:value={newName}
						placeholder={m.bartering_sailors_name_placeholder()}
						class="glass-input text-[11px] px-2 py-1 w-full"
					/>
				</div>
				<div class="w-16">
					<span class="text-[10px] text-muted-foreground">{m.bartering_sailors_level()}</span>
					<input
						type="number"
						bind:value={newLevel}
						min="1" max="10"
						class="glass-input text-[11px] px-2 py-1 w-full no-spinner"
					/>
				</div>
				<div class="w-16">
					<span class="text-[10px] text-muted-foreground">{m.bartering_sailors_speed()}</span>
					<input
						type="number"
						bind:value={newSpeed}
						step="0.1" min="0"
						placeholder="0.0"
						class="glass-input text-[11px] px-2 py-1 w-full no-spinner"
					/>
				</div>
				<div class="w-24">
					<span class="text-[10px] text-muted-foreground">{m.bartering_sailors_status()}</span>
					<select bind:value={newStatus} class="glass-input text-[11px] px-1 py-1 w-full">
						{#each STATUS_OPTIONS as opt}
							<option value={opt.value}>{opt.label()}</option>
						{/each}
					</select>
				</div>
			</div>
			<div class="flex justify-end">
				<button
					onclick={handleAdd}
					disabled={!newName.trim() || !newSpeed}
					class="px-3 py-1 text-[11px] font-bold rounded obsidian-cta disabled:opacity-40 disabled:cursor-not-allowed"
				>
					{m.bartering_sailors_btn_add()}
				</button>
			</div>
		</div>
	{/if}

	<!-- Sailor Table -->
	{#if $sailorRosterStore.length === 0}
		<div class="text-center py-6">
			<p class="text-[32px] mb-1 opacity-30">&#9881;</p>
			<p class="text-[11px] text-muted-foreground">{m.bartering_sailors_empty_title()}</p>
			<p class="text-[10px] text-muted-foreground/60 mt-1">{m.bartering_sailors_empty_subtitle()}</p>
		</div>
	{:else}
		<div class="glass-card overflow-hidden">
			<!-- Table Header -->
			<div class="grid grid-cols-[1fr_50px_55px_70px_60px_55px_30px] gap-1 px-3 py-1.5 border-b border-outline-variant/10 text-[9px] text-muted-foreground uppercase tracking-wider">
				<span>{m.bartering_sailors_name()}</span>
				<span class="text-center">{m.bartering_sailors_level()}</span>
				<span class="text-center">{m.bartering_sailors_speed()}</span>
				<span class="text-center">{m.bartering_sailors_status()}</span>
				<span class="text-center">{m.bartering_sailors_col_likely()}</span>
				<span class="text-center">{m.bartering_sailors_col_max()}</span>
				<span></span>
			</div>

			<!-- Sailor Rows -->
			{#each $sailorRosterStore as sailor (sailor.id)}
				{@const proj = projectSpeed(sailor.level, sailor.speed, sailor.status)}
				<div class="grid grid-cols-[1fr_50px_55px_70px_60px_55px_30px] gap-1 px-3 py-1.5 items-center border-b border-outline-variant/5 hover:bg-white/[0.02] group">
					<!-- Name (editable on click) -->
					{#if editingId === sailor.id}
						<input
							type="text"
							value={sailor.name}
							onchange={(e) => updateSailor(sailor.id, { name: (e.target as HTMLInputElement).value })}
							onblur={() => editingId = null}
							class="glass-input text-[11px] px-1 py-0.5"
						/>
					{:else}
						<button
							type="button"
							class="text-[11px] text-foreground cursor-pointer hover:text-primary text-left bg-transparent border-0 p-0"
							onclick={() => editingId = sailor.id}
							title={m.bartering_sailors_edit_name()}
						>{sailor.name}</button>
					{/if}

					<!-- Level -->
					<input
						type="number"
						value={sailor.level}
						onchange={(e) => handleLevelChange(sailor.id, (e.target as HTMLInputElement).value)}
						min="1" max="10"
						class="glass-input text-[10px] font-mono px-1 py-0.5 w-full text-center no-spinner"
					/>

					<!-- Speed -->
					<input
						type="number"
						value={sailor.speed}
						onchange={(e) => handleSpeedChange(sailor.id, (e.target as HTMLInputElement).value)}
						step="0.1" min="0"
						class="glass-input text-[10px] font-mono px-1 py-0.5 w-full text-center no-spinner"
					/>

					<!-- Status -->
					<select
						value={sailor.status}
						onchange={(e) => handleStatusChange(sailor.id, (e.target as HTMLSelectElement).value)}
						class="glass-input text-[9px] px-0.5 py-0.5 w-full {STATUS_COLORS[sailor.status]}"
					>
						{#each STATUS_OPTIONS as opt}
							<option value={opt.value}>{opt.label()}</option>
						{/each}
					</select>

					<!-- Projected Likely -->
					<span class="text-[10px] font-mono text-center text-accent">{proj.likely.toFixed(1)}</span>

					<!-- Projected Max -->
					<span class="text-[10px] font-mono text-center text-foreground">{proj.max.toFixed(1)}</span>

					<!-- Delete -->
					<button
						onclick={() => removeSailor(sailor.id)}
						class="text-[10px] text-destructive/50 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity text-center"
						title={m.bartering_sailors_remove()}
					>&#10005;</button>
				</div>
			{/each}
		</div>

		<!-- Summary -->
		<div class="flex gap-4 text-[10px] text-muted-foreground px-1">
			<span>{m.bartering_sailors_summary_count()} <span class="text-foreground font-mono">{$sailorRosterStore.length}</span></span>
			<span>{m.bartering_sailors_summary_avg()} <span class="text-accent font-mono">{avgSpeed.toFixed(2)}</span></span>
			<span>{m.bartering_sailors_summary_best()} <span class="text-foreground font-mono">{bestSpeed.toFixed(1)}</span></span>
		</div>
	{/if}

	<!-- Speed Reference Table -->
	<div class="glass-card p-3">
		<h3 class="text-[10px] font-headline font-bold text-muted-foreground uppercase tracking-wider mb-2">{m.bartering_sailors_ref_title()}</h3>
		<div class="overflow-x-auto">
			<table class="w-full text-[9px]">
				<thead>
					<tr class="border-b border-outline-variant/10">
						<th class="text-left text-muted-foreground py-0.5">{m.bartering_sailors_level()}</th>
						<th class="text-center text-muted-foreground py-0.5">{m.bartering_sailors_ref_min()}</th>
						<th class="text-center text-muted-foreground py-0.5">{m.bartering_sailors_ref_median()}</th>
						<th class="text-center text-muted-foreground py-0.5">{m.bartering_sailors_ref_max()}</th>
						<th class="text-center text-muted-foreground py-0.5">{m.bartering_sailors_ref_roll_med()}</th>
						<th class="text-center text-muted-foreground py-0.5">{m.bartering_sailors_ref_roll_max()}</th>
					</tr>
				</thead>
				<tbody>
					{#each SAILOR_SPEED_TABLE as row}
						<tr class="border-b border-outline-variant/5">
							<td class="text-muted-foreground py-0.5">{m.bartering_sailors_ref_lv({ n: row.level })}</td>
							<td class="text-center font-mono text-foreground py-0.5">{row.min}</td>
							<td class="text-center font-mono text-accent py-0.5">{row.median}</td>
							<td class="text-center font-mono text-foreground py-0.5">{row.max}</td>
							<td class="text-center font-mono text-muted-foreground py-0.5">{row.medianRoll || "-"}</td>
							<td class="text-center font-mono text-muted-foreground py-0.5">{row.maxRoll || "-"}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</div>
