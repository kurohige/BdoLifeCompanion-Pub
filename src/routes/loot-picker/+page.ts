// The picker is opened as a separate Tauri WebviewWindow at runtime via
// `new WebviewWindow('loot-picker', { url: '/loot-picker' })`. adapter-static
// only emits index.html for routes that are explicitly prerendered, and
// prerendering requires SSR — the root +layout.ts sets ssr=false globally,
// so we override it on just this route. The page only uses Tauri APIs inside
// onMount (client-only), so importing them at SSR time is safe.
export const prerender = true;
export const ssr = true;
