<script lang="ts">
	import { openUrl } from "@tauri-apps/plugin-opener";
	import { appVersionStore } from "$lib/stores";
	import { m } from "$lib/paraglide/messages";

	async function openGitHub() {
		try { await openUrl("https://github.com/kurohige/BdoLifeCompanion-Pub"); } catch { /* */ }
	}

	async function openIssues() {
		try { await openUrl("https://github.com/kurohige/BdoLifeCompanion-Pub/issues"); } catch { /* */ }
	}
</script>

<div class="space-y-4 p-1">
	<!-- App Branding -->
	<div class="paper-card rounded p-4 text-center space-y-3">
		<div class="flex justify-center">
			<img src="/logo.png" alt="BDO Life Companion" class="w-14 h-14 object-contain" />
		</div>
		<div>
			<h1 class="text-lg font-headline font-bold text-foreground tracking-wider">BDO LIFE COMPANION</h1>
			<p class="text-[12.5px] font-mono text-muted-foreground mt-1">v{$appVersionStore} — <span class="text-foreground font-semibold">by jhidalgo_dev</span></p>
		</div>
		<p class="text-[12px] text-muted-foreground leading-relaxed max-w-[300px] mx-auto">
			{m.about_app_description()}
		</p>
	</div>

	<!-- Safety Statement -->
	<div class="paper-card rounded p-3 space-y-1.5">
		<h3 class="text-[12px] font-headline font-bold text-primary uppercase tracking-wider">{m.about_safety_header()}</h3>
		<div class="text-[12px] text-muted-foreground space-y-1">
			<p class="flex items-center gap-1.5"><span class="text-[#6fc28a]">&#10003;</span> {m.about_safety_no_memory()}</p>
			<p class="flex items-center gap-1.5"><span class="text-[#6fc28a]">&#10003;</span> {m.about_safety_no_automation()}</p>
			<p class="flex items-center gap-1.5"><span class="text-[#6fc28a]">&#10003;</span> {m.about_safety_no_capture()}</p>
			<p class="flex items-center gap-1.5"><span class="text-[#6fc28a]">&#10003;</span> {m.about_safety_no_process_enum()}</p>
			<p class="flex items-center gap-1.5"><span class="text-[#6fc28a]">&#10003;</span> {m.about_safety_no_data_collect()}</p>
			<p class="flex items-center gap-1.5"><span class="text-[#6fc28a]">&#10003;</span> {m.about_safety_local()}</p>
		</div>
		<p class="text-[12px] text-muted-foreground italic pt-1 border-t border-outline-variant/20 mt-2">
			{m.about_safety_ocr_note()}
		</p>
	</div>

	<!-- Special Thanks -->
	<div class="paper-card rounded p-3">
		<p class="text-[12.5px] text-foreground">{m.about_thanks()}</p>
	</div>

	<!-- Links -->
	<div class="paper-card rounded p-3 space-y-2">
		<h3 class="text-[12px] font-headline font-bold text-primary uppercase tracking-wider">{m.about_links_header()}</h3>
		<div class="space-y-1.5">
			<button onclick={openGitHub} class="w-full text-left px-2 py-1.5 rounded text-[12.5px] text-foreground hover:bg-white/5 transition-colors flex items-center gap-2">
				<span class="text-muted-foreground">&#128187;</span>
				<span>{m.about_link_source()}</span>
				<span class="text-[12px] text-muted-foreground ml-auto">GitHub</span>
			</button>
			<button onclick={openIssues} class="w-full text-left px-2 py-1.5 rounded text-[12.5px] text-foreground hover:bg-white/5 transition-colors flex items-center gap-2">
				<span class="text-muted-foreground">&#128030;</span>
				<span>{m.about_link_report_bug()}</span>
				<span class="text-[12px] text-muted-foreground ml-auto">Issues</span>
			</button>
		</div>
	</div>

</div>
