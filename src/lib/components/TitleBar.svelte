<script lang="ts">
	import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
	import { exit } from "@tauri-apps/plugin-process";
	import { setViewMode, appVersionStore } from "$lib/stores";

	const appWindow = getCurrentWindow();

	async function minimize() {
		await appWindow.minimize();
	}

	async function close() {
		try { await exit(0); } catch { await appWindow.close(); }
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
	class="titlebar"
>
	<!-- Logo + Title + Version -->
	<div class="flex items-center gap-2">
		<button
			onclick={handleMiniMode}
			class="titlebar-logo"
			title="Switch to mini mode"
		>
			<img src="/logo.png" alt="Mini mode" class="w-4 h-4 object-contain" />
		</button>
		<span class="text-[11px] font-bold tracking-[0.15em] font-headline pointer-events-none text-foreground">
			BDO LIFE COMPANION
		</span>
		<span class="text-[9px] font-mono pointer-events-none text-muted-foreground">
			v{$appVersionStore}
		</span>
	</div>

	<!-- Window Controls -->
	<div class="flex items-center gap-0.5 pointer-events-auto">
		<button onclick={handleMediumMode} class="titlebar-btn" title="Medium mode">
			<span class="text-[11px]">[+]</span>
		</button>
		<button onclick={handleMiniMode} class="titlebar-btn" title="Mini mode">
			<span class="text-[11px]">&#8862;</span>
		</button>
		<button onclick={minimize} class="titlebar-btn" title="Minimize">
			<span class="text-[11px]">&#9472;</span>
		</button>
		<button onclick={close} class="titlebar-btn titlebar-btn-close" title="Close">
			<span class="text-[11px]">&#10005;</span>
		</button>
	</div>
</header>

<style>
	.titlebar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		height: 32px;
		padding: 0 10px;
		background: rgba(14, 14, 14, 0.5);
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		border-bottom: 1px solid rgba(255, 238, 16, 0.08);
		user-select: none;
		cursor: move;
		z-index: 50;
	}

	.titlebar-logo {
		width: 22px;
		height: 22px;
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 238, 16, 0.08);
		border: 1px solid rgba(255, 238, 16, 0.15);
		cursor: pointer;
		transition: box-shadow 0.2s, border-color 0.2s;
	}
	.titlebar-logo:hover {
		border-color: rgba(255, 238, 16, 0.4);
		box-shadow: 0 0 8px rgba(255, 238, 16, 0.2);
	}

	.titlebar-btn {
		width: 24px;
		height: 22px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 3px;
		color: var(--outline-hud);
		cursor: pointer;
		transition: background 0.15s, color 0.15s, box-shadow 0.15s;
		border: none;
		padding: 0;
		background: transparent;
	}
	.titlebar-btn:hover {
		background: rgba(255, 238, 16, 0.1);
		color: #ffee10;
		box-shadow: 0 0 4px rgba(255, 238, 16, 0.2);
	}
	.titlebar-btn-close:hover {
		background: rgba(255, 60, 60, 0.15);
		color: #ff6b6b;
		box-shadow: 0 0 4px rgba(255, 60, 60, 0.2);
	}
</style>
