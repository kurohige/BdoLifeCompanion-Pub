<!--
	Gold-styled toggle switch used across Settings (bold text, always on top,
	background animation, etc.). For the smaller cyan/primary toggles in the
	Notifications section, use inline markup — the two visual scales are
	deliberately different.
-->
<script lang="ts">
	interface Props {
		checked: boolean;
		onchange: (value: boolean) => void;
		title?: string;
	}

	let { checked, onchange, title }: Props = $props();
</script>

<button
	onclick={() => onchange(!checked)}
	{title}
	type="button"
	role="switch"
	aria-checked={checked}
	class="relative w-9 h-5 rounded-full transition-colors flex-shrink-0 {checked ? 'bg-[var(--gold-glow)]' : 'bg-secondary border border-outline-variant/30'}"
>
	<div class="absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-foreground transition-transform {checked ? 'translate-x-[18px]' : ''}"></div>
</button>
