// Tauri doesn't have a Node.js server to do proper SSR
// so we use adapter-static with a fallback to index.html to put the site in SPA mode
// See: https://svelte.dev/docs/kit/single-page-apps
// See: https://v2.tauri.app/start/frontend/sveltekit/ for more info
import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      fallback: "index.html",
    }),
    // The loot-picker, scratchpad and note routes are opened only via
    // `new WebviewWindow(...)`, not linked from any prerendered page, so
    // SvelteKit's crawler doesn't discover them. Listing them explicitly
    // forces the build to emit their index.html so the new Tauri windows
    // resolve. A window route that is not listed here 404s in production
    // only — dev serves it fine, which is how it gets missed.
    prerender: {
      entries: ["*", "/loot-picker", "/scratchpad", "/note"],
    },
  },
};

export default config;
