import { writable } from "svelte/store";
import { getVersion } from "@tauri-apps/api/app";

export const appVersionStore = writable<string>("...");

export async function initAppVersion(): Promise<void> {
	try {
		const v = await getVersion();
		appVersionStore.set(v);
	} catch {
		appVersionStore.set("unknown");
	}
}
