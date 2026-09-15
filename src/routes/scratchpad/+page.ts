// The detached scratchpad opens as a separate Tauri WebviewWindow at runtime
// via `new WebviewWindow('scratchpad', { url: '/scratchpad' })`. Same deal as
// the loot picker: adapter-static only emits HTML for prerendered routes, and
// the root layout sets ssr=false globally, so override both here. All Tauri
// APIs are used inside onMount (client-only).
export const prerender = true;
export const ssr = true;
