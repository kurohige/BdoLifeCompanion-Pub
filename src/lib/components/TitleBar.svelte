<script lang="ts">
	import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
	import { exit } from "@tauri-apps/plugin-process";
	import { setViewMode } from "$lib/stores";

	const appWindow = getCurrentWindow();

	async function minimize() {
		await appWindow.minimize();
	}

	async function close() {
		try {
			await exit(0);
		} catch {
			await appWindow.close();
		}
	}

	async function startDrag(e: MouseEvent) {
		if (e.button === 0 && !(e.target as HTMLElement).closest('button')) {
			await appWindow.startDragging();
		}
	}

	async function handleMiniMode() {
		await appWindow.setMinSize(new LogicalSize(140, 40));
		await appWindow.setSize(new LogicalSize(400, 56));
		setViewMode("mini");
	}

	async function handleMediumMode() {
		await appWindow.setMinSize(new LogicalSize(140, 40));
		await appWindow.setSize(new LogicalSize(460, 150));
		setViewMode("medium");
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<header
	role="banner"
	onmousedown={startDrag}
	class="flex items-center justify-between w-full h-8 px-3 bg-surface-lowest/60 backdrop-blur-xl border-b border-outline-variant/20 select-none cursor-move z-50"
>
	<!-- Logo + Title -->
	<div class="flex items-center gap-2">
		<button
			onclick={handleMiniMode}
			class="w-5 h-5 bg-primary-container rounded-sm flex items-center justify-center hover:brightness-110 transition-all"
			title="Switch to mini mode"
		>
			<img src="/logo.png" alt="Mini mode" class="w-4 h-4 object-contain" />
		</button>
		<span class="text-[0.75rem] font-bold text-primary tracking-widest font-headline pointer-events-none">
			BDO LIFE COMPANION
		</span>
		<span class="text-[9px] text-outline-hud font-label tracking-wider pointer-events-none opacity-60">v2.1</span>
	</div>

	<!-- Window Controls -->
	<div class="flex items-center gap-1 pointer-events-auto">
		<button onclick={handleMediumMode}
			class="text-outline-hud hover:text-secondary transition-colors text-sm cursor-pointer p-0.5"
			title="Medium mode">
			<span class="text-[12px]">[+]</span>
		</button>
		<button onclick={handleMiniMode}
			class="text-outline-hud hover:text-secondary transition-colors text-sm cursor-pointer p-0.5"
			title="Mini mode">
			<span class="text-[12px]">⊟</span>
		</button>
		<button onclick={minimize}
			class="text-outline-hud hover:text-secondary transition-colors text-sm cursor-pointer p-0.5"
			title="Minimize">
			<span class="text-[12px]">━</span>
		</button>
		<button onclick={close}
			class="text-outline-hud hover:text-destructive transition-colors text-sm cursor-pointer p-0.5"
			title="Close">
			<span class="text-[12px]">✕</span>
		</button>
	</div>
</header>
