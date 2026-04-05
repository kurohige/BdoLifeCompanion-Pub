<script lang="ts">
	import { fly, fade } from "svelte/transition";
	import { toastStore, dismissToast, type ToastType } from "$lib/stores/toast";

	function typeColor(type: ToastType): string {
		switch (type) {
			case "success": return "border-accent text-accent";
			case "error": return "border-destructive text-destructive";
			case "info": return "border-cyan text-cyan";
		}
	}
</script>

{#if $toastStore.length > 0}
	<div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-xs">
		{#each $toastStore as toast (toast.id)}
			<div
				in:fly={{ x: 200, duration: 250 }}
				out:fade={{ duration: 150 }}
				class="glass-toast border-l-4 {typeColor(toast.type)} rounded px-3 py-2 shadow-lg flex items-start gap-2"
			>
				<span class="text-xs flex-1">{toast.message}</span>
				<button
					onclick={() => dismissToast(toast.id)}
					class="text-muted-foreground hover:text-foreground text-xs leading-none"
				>
					✕
				</button>
			</div>
		{/each}
	</div>
{/if}
