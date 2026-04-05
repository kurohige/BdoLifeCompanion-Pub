<script lang="ts">
	import "../app.css";
	import { onMount } from "svelte";

	// Enable dark mode by default
	onMount(() => {
		document.documentElement.classList.add("dark");
	});
</script>

<div class="min-h-screen dark">
	<slot />
</div>
