<script lang="ts">
	import { openUrl } from "@tauri-apps/plugin-opener";
	import { appVersionStore } from "$lib/stores";

	async function openBMC() {
		try { await openUrl("https://buymeacoffee.com/jhidalgo_dev"); } catch { /* */ }
	}

	async function openGitHub() {
		try { await openUrl("https://github.com/kurohige/BdoLifeCompanion-Pub"); } catch { /* */ }
	}

	async function openIssues() {
		try { await openUrl("https://github.com/kurohige/BdoLifeCompanion-Pub/issues"); } catch { /* */ }
	}
</script>

<div class="space-y-4 p-1">
	<!-- App Branding -->
	<div class="glass-card rounded p-4 text-center space-y-3">
		<div class="flex justify-center">
			<img src="/logo.png" alt="BDO Life Companion" class="w-14 h-14 object-contain" />
		</div>
		<div>
			<h1 class="text-lg font-headline font-bold neon-text-cyan tracking-wider">BDO LIFE COMPANION</h1>
			<p class="text-[11px] font-mono text-muted-foreground mt-1">v{$appVersionStore} — <span class="text-foreground font-semibold">by jhidalgo_dev</span></p>
		</div>
		<p class="text-[10px] text-muted-foreground leading-relaxed max-w-[300px] mx-auto">
			A manual companion tool for Black Desert Online. Track crafting, grinding, bartering, boss timers, and more.
		</p>
	</div>

	<!-- Safety Statement -->
	<div class="glass-card rounded p-3 space-y-1.5">
		<h3 class="text-[10px] font-headline font-bold text-primary uppercase tracking-wider">Safety</h3>
		<div class="text-[10px] text-muted-foreground space-y-1">
			<p class="flex items-center gap-1.5"><span class="text-accent">&#10003;</span> No game memory reading or injection</p>
			<p class="flex items-center gap-1.5"><span class="text-accent">&#10003;</span> No automation, macros, or keystrokes</p>
			<p class="flex items-center gap-1.5"><span class="text-accent">&#10003;</span> No screen capture or OCR</p>
			<p class="flex items-center gap-1.5"><span class="text-accent">&#10003;</span> No personal data collection</p>
			<p class="flex items-center gap-1.5"><span class="text-accent">&#10003;</span> All data stored locally on your machine</p>
		</div>
	</div>

	<!-- Support -->
	<div class="glass-card rounded p-3 space-y-2">
		<h3 class="text-[10px] font-headline font-bold text-primary uppercase tracking-wider">Support</h3>
		<button
			onclick={openBMC}
			class="w-full py-2 rounded flex items-center justify-center gap-2 font-headline font-bold text-[12px] uppercase tracking-wider transition-all"
			style="background: #ffdd00; color: #000; box-shadow: 0 0 12px rgba(255, 221, 0, 0.3);"
		>
			<span class="text-[16px]">&#9749;</span>
			Buy Me a Coffee
		</button>
		<p class="text-[9px] text-muted-foreground text-center">If you find this tool useful, consider supporting development</p>
	</div>

	<!-- Links -->
	<div class="glass-card rounded p-3 space-y-2">
		<h3 class="text-[10px] font-headline font-bold text-primary uppercase tracking-wider">Links</h3>
		<div class="space-y-1.5">
			<button onclick={openGitHub} class="w-full text-left px-2 py-1.5 rounded text-[11px] text-foreground hover:bg-white/5 transition-colors flex items-center gap-2">
				<span class="text-muted-foreground">&#128187;</span>
				<span>Source Code</span>
				<span class="text-[9px] text-muted-foreground ml-auto">GitHub</span>
			</button>
			<button onclick={openIssues} class="w-full text-left px-2 py-1.5 rounded text-[11px] text-foreground hover:bg-white/5 transition-colors flex items-center gap-2">
				<span class="text-muted-foreground">&#128030;</span>
				<span>Report a Bug</span>
				<span class="text-[9px] text-muted-foreground ml-auto">Issues</span>
			</button>
		</div>
	</div>

</div>
