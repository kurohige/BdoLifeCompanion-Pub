// The note editor opens as a separate Tauri WebviewWindow at runtime via
// `new WebviewWindow('note-editor', { url: '/note' })`. adapter-static only
// emits HTML for routes that are explicitly prerendered, and prerendering
// requires SSR — the root +layout.ts sets ssr=false globally, so both are
// overridden here. Listing the route in svelte.config.js `entries` is NOT
// enough on its own: without this file the build succeeds and silently emits
// nothing, and the window 404s in production only (dev serves it fine).
// The page only uses Tauri APIs inside onMount (client-only).
export const prerender = true;
export const ssr = true;
