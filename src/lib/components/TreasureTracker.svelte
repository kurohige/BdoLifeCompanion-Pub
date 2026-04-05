<script lang="ts">
	import {
		treasureDataStore,
		treasureProgressStore,
		markPieceObtained,
		unmarkPieceObtained,
		setHoursSpent,
		type TreasureDefinition,
		type PieceProgress,
	} from "$lib/stores";

	// Build a Map<pieceId, PieceProgress> for O(1) lookups
	const progressMap = $derived(
		new Map($treasureProgressStore.map((p) => [p.pieceId, p]))
	);

	// Get progress for a piece (returns defaults if not tracked yet)
	function getPieceProgress(pieceId: string): PieceProgress {
		return progressMap.get(pieceId) ?? {
			pieceId,
			treasureId: "",
			hoursSpent: 0,
			obtained: false,
			obtainedDate: null,
		};
	}

	// Per-treasure stats
	function getTreasureStats(treasure: TreasureDefinition) {
		const total = treasure.pieces.length;
		let obtained = 0;
		let totalHours = 0;

		for (const piece of treasure.pieces) {
			const prog = getPieceProgress(piece.id);
			if (prog.obtained) obtained++;
			totalHours += prog.hoursSpent;
		}

		const avgHours = obtained > 0 ? totalHours / obtained : 0;
		const remaining = obtained > 0 ? avgHours * (total - obtained) : 0;
		const pct = total > 0 ? Math.round((obtained / total) * 100) : 0;

		return { total, obtained, totalHours, avgHours, remaining, pct };
	}

	// Overall stats across all treasures
	const overallStats = $derived(() => {
		if (!$treasureDataStore) return { total: 0, obtained: 0, totalHours: 0, avgHours: 0, remaining: 0 };

		let total = 0;
		let obtained = 0;
		let totalHours = 0;

		for (const treasure of $treasureDataStore.treasures) {
			for (const piece of treasure.pieces) {
				total++;
				const prog = getPieceProgress(piece.id);
				if (prog.obtained) obtained++;
				totalHours += prog.hoursSpent;
			}
		}

		const avgHours = obtained > 0 ? totalHours / obtained : 0;
		const remaining = obtained > 0 ? avgHours * (total - obtained) : 0;

		return { total, obtained, totalHours, avgHours, remaining };
	});

	// Expand/collapse state per treasure
	let expandedTreasures = $state<Set<string>>(new Set(["compass", "hp_potion", "mp_potion", "map", "merchant_ring"]));

	function toggleExpand(treasureId: string) {
		expandedTreasures = new Set(expandedTreasures);
		if (expandedTreasures.has(treasureId)) {
			expandedTreasures.delete(treasureId);
		} else {
			expandedTreasures.add(treasureId);
		}
	}

	// Handle toggling obtained
	function handleToggleObtained(pieceId: string, treasureId: string) {
		const prog = getPieceProgress(pieceId);
		if (prog.obtained) {
			if (confirm("Unmark this piece as obtained?")) {
				unmarkPieceObtained(pieceId, treasureId);
			}
		} else {
			markPieceObtained(pieceId, treasureId);
		}
	}

	// Handle hours change
	function handleHoursChange(pieceId: string, treasureId: string, value: string) {
		const hours = parseFloat(value);
		if (!isNaN(hours)) {
			setHoursSpent(pieceId, treasureId, hours);
		} else if (value === "") {
			setHoursSpent(pieceId, treasureId, 0);
		}
	}

	// Type badge styling
	function typeBadge(type: "grind" | "craft" | "exchange"): { label: string; classes: string } {
		switch (type) {
			case "grind":
				return { label: "Grind", classes: "bg-accent/20 text-accent" };
			case "craft":
				return { label: "Craft", classes: "bg-primary/20 text-primary" };
			case "exchange":
				return { label: "Exchange", classes: "bg-cyan/20 text-cyan" };
		}
	}
</script>

<div class="space-y-3">
	{#if !$treasureDataStore}
		<div class="text-center py-6 text-muted-foreground text-[11px]">
			<p class="text-2xl mb-1">Loading...</p>
		</div>
	{:else}
		<!-- Overall Stats Bar -->
		<div class="grid grid-cols-4 gap-2">
			<div class="glass-stats p-2 text-center">
				<p class="text-lg font-bold neon-text-cyan">
					{overallStats().obtained}/{overallStats().total}
				</p>
				<p class="text-[9px] text-muted-foreground">Pieces</p>
			</div>
			<div class="glass-stats p-2 text-center">
				<p class="text-lg font-bold neon-text-purple">
					{overallStats().totalHours.toFixed(1)}h
				</p>
				<p class="text-[9px] text-muted-foreground">Total Hours</p>
			</div>
			<div class="glass-stats p-2 text-center">
				<p class="text-lg font-bold text-foreground">
					{overallStats().avgHours.toFixed(1)}h
				</p>
				<p class="text-[9px] text-muted-foreground">Avg / Piece</p>
			</div>
			<div class="glass-stats p-2 text-center">
				<p class="text-lg font-bold text-accent">
					~{overallStats().remaining.toFixed(0)}h
				</p>
				<p class="text-[9px] text-muted-foreground">Est. Left</p>
			</div>
		</div>

		<!-- Treasure Cards -->
		<div class="space-y-2 max-h-[400px] overflow-auto">
			{#each $treasureDataStore.treasures as treasure (treasure.id)}
				{@const stats = getTreasureStats(treasure)}
				{@const isExpanded = expandedTreasures.has(treasure.id)}
				{@const isComplete = stats.obtained === stats.total}

				<div class="glass-card rounded-lg overflow-hidden {isComplete ? 'border-accent/50' : ''}">
					<!-- Card Header -->
					<button
						onclick={() => toggleExpand(treasure.id)}
						class="w-full flex items-center gap-3 px-3 py-2 hover:bg-secondary/30 transition-colors text-left"
					>
						<!-- Expand/Collapse Icon -->
						<span class="text-[10px] text-muted-foreground transition-transform {isExpanded ? 'rotate-90' : ''}">
							▶
						</span>

						<!-- Treasure Name -->
						<span class="text-xs font-bold flex-1 truncate {isComplete ? 'text-accent' : 'text-foreground'}">
							{treasure.name}
						</span>

						<!-- Complete Badge -->
						{#if isComplete}
							<span class="px-1.5 py-0.5 text-[9px] font-bold bg-accent/20 text-accent rounded">
								Complete!
							</span>
						{/if}

						<!-- Progress Bar + Count -->
						<div class="flex items-center gap-2 flex-shrink-0">
							<div class="w-20 h-1.5 bg-secondary rounded-full overflow-hidden">
								<div
									class="h-full rounded-full transition-all {isComplete ? 'bg-accent' : 'bg-primary'}"
									style="width: {stats.pct}%"
								></div>
							</div>
							<span class="text-[10px] text-muted-foreground w-14 text-right">
								{stats.obtained}/{stats.total} ({stats.pct}%)
							</span>
						</div>
					</button>

					<!-- Expanded Piece List -->
					{#if isExpanded}
						<div class="border-t border-border">
							{#each treasure.pieces as piece (piece.id)}
								{@const prog = getPieceProgress(piece.id)}
								{@const badge = typeBadge(piece.type)}

								<div class="flex items-center gap-2 px-3 py-1.5 border-b border-border/50 last:border-b-0 {prog.obtained ? 'opacity-60' : ''}">
									<!-- Checkbox -->
									<button
										onclick={() => handleToggleObtained(piece.id, treasure.id)}
										class="w-4 h-4 flex items-center justify-center rounded border {prog.obtained ? 'bg-accent border-accent text-black' : 'border-border hover:border-primary'} transition-colors flex-shrink-0"
										title={prog.obtained ? "Unmark obtained" : "Mark as obtained"}
									>
										{#if prog.obtained}
											<svg viewBox="0 0 24 24" class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
												<polyline points="20 6 9 17 4 12"></polyline>
											</svg>
										{/if}
									</button>

									<!-- Piece Icon -->
									{#if piece.image}
										<img src={"/" + piece.image} alt="" class="w-6 h-6 object-contain flex-shrink-0" />
									{/if}

									<!-- Piece Name -->
									<span class="text-[11px] flex-1 min-w-0 truncate {prog.obtained ? 'line-through text-muted-foreground' : 'text-foreground'}">
										{piece.name}
									</span>

									<!-- Zone -->
									<span class="text-[9px] text-muted-foreground flex-shrink-0 w-28 truncate text-right" title={piece.zone}>
										{piece.zone}
									</span>

									<!-- Hours Input (grind pieces only) -->
									{#if piece.type === "grind"}
										<input
											type="number"
											step="0.5"
											min="0"
											value={prog.hoursSpent || ""}
											placeholder="0"
											oninput={(e) => handleHoursChange(piece.id, treasure.id, e.currentTarget.value)}
											class="w-14 bg-secondary text-foreground border border-border rounded px-1 py-0.5 text-[10px] font-mono text-center focus:outline-none focus:ring-1 focus:ring-primary no-spinner flex-shrink-0"
										/>
										<span class="text-[9px] text-muted-foreground flex-shrink-0">h</span>
									{:else}
										<span class="w-14 flex-shrink-0"></span>
										<span class="text-[9px] text-muted-foreground flex-shrink-0 w-1.5"></span>
									{/if}

									<!-- Type Badge -->
									<span class="px-1.5 py-0.5 text-[8px] font-bold rounded flex-shrink-0 {badge.classes}">
										{badge.label}
									</span>

									<!-- Obtained Date -->
									{#if prog.obtained && prog.obtainedDate}
										<span class="text-[8px] text-muted-foreground flex-shrink-0 w-16 text-right">
											{prog.obtainedDate}
										</span>
									{:else}
										<span class="w-16 flex-shrink-0"></span>
									{/if}
								</div>
							{/each}

							<!-- Card Footer Stats -->
							<div class="flex items-center justify-center gap-4 px-3 py-1.5 bg-secondary/30 text-[9px] text-muted-foreground">
								<span>{stats.totalHours.toFixed(1)}h total</span>
								<span class="text-border">|</span>
								<span>{stats.avgHours.toFixed(1)}h avg</span>
								{#if stats.obtained < stats.total && stats.obtained > 0}
									<span class="text-border">|</span>
									<span>~{stats.remaining.toFixed(0)}h est. left</span>
								{/if}
							</div>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<!-- Empty State (when no treasures loaded but not loading) -->
	{#if $treasureDataStore && $treasureDataStore.treasures.length === 0}
		<div class="text-center py-8 text-muted-foreground text-[11px]">
			<p class="text-2xl mb-1">💎</p>
			<p>No treasure data available</p>
		</div>
	{/if}
</div>
