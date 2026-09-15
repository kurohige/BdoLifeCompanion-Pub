<script lang="ts">
	// IBM Plex — bundled locally (offline app, no CDN fetches at runtime)
	import "@fontsource/ibm-plex-sans/400.css";
	import "@fontsource/ibm-plex-sans/500.css";
	import "@fontsource/ibm-plex-sans/600.css";
	import "@fontsource/ibm-plex-sans/700.css";
	import "@fontsource/ibm-plex-mono/400.css";
	import "@fontsource/ibm-plex-mono/500.css";
	import "@fontsource/ibm-plex-mono/600.css";
	import "../app.css";
</script>

<div class="min-h-screen">
	<slot />
</div>
