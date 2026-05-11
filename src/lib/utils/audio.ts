/**
 * Shared audio utilities for timer and boss alerts.
 *
 * Timer alert uses a Web Audio API synth tone — short, light, no asset.
 * Boss alert defaults to a two-tone synth beep, but the user can import
 * their own audio file (see `set_boss_alert_sound` in src-tauri/lib.rs);
 * when one is configured, we fetch the bytes once via Tauri IPC, wrap them
 * in a Blob URL, and cache it for the session so repeated alerts don't
 * round-trip through the backend.
 */

import { invoke } from "@tauri-apps/api/core";
import { get } from "svelte/store";
import { settingsStore } from "$lib/stores/settings";

/**
 * Play a short 880Hz sine-wave beep for timer completion alerts.
 * Silently fails if Web Audio API is unavailable (e.g., during SSR).
 */
export function playTimerAlert(): void {
	try {
		const audioContext = new AudioContext();
		const oscillator = audioContext.createOscillator();
		const gainNode = audioContext.createGain();

		oscillator.connect(gainNode);
		gainNode.connect(audioContext.destination);

		oscillator.frequency.value = 880;
		oscillator.type = "sine";
		gainNode.gain.value = 0.3;

		oscillator.start();
		setTimeout(() => {
			oscillator.stop();
			audioContext.close();
		}, 500);
	} catch {
		// Audio not available (SSR or restricted environment)
	}
}

/** Cached Blob URL for the user's custom boss alert sound. */
let cachedCustomUrl: string | null = null;
/** Filename the cached URL corresponds to. Invalidated when the setting changes. */
let cachedCustomName: string | null = null;

function mimeForExtension(name: string): string {
	const ext = name.split(".").pop()?.toLowerCase() ?? "";
	switch (ext) {
		case "wav":
			return "audio/wav";
		case "ogg":
			return "audio/ogg";
		case "m4a":
			return "audio/mp4";
		case "aac":
			return "audio/aac";
		case "flac":
			return "audio/flac";
		default:
			return "audio/mpeg";
	}
}

/**
 * Resolve the Blob URL for the configured custom boss sound, lazily loading
 * its bytes from disk via Tauri IPC the first time it's requested. Returns
 * null if no custom sound is configured or the file can't be read.
 */
async function getCustomBossSoundUrl(name: string): Promise<string | null> {
	if (!name) return null;
	if (cachedCustomName === name && cachedCustomUrl) return cachedCustomUrl;
	try {
		const bytes = await invoke<number[]>("load_boss_alert_sound", { name });
		if (cachedCustomUrl) URL.revokeObjectURL(cachedCustomUrl);
		const blob = new Blob([new Uint8Array(bytes)], { type: mimeForExtension(name) });
		cachedCustomUrl = URL.createObjectURL(blob);
		cachedCustomName = name;
		return cachedCustomUrl;
	} catch (e) {
		console.warn("Failed to load custom boss sound, falling back to default beep:", e);
		return null;
	}
}

/**
 * Drop the in-memory cache so the next playback re-reads from disk.
 * Called after the user imports a new sound file or clears the custom sound.
 */
export function invalidateCustomBossSoundCache(): void {
	if (cachedCustomUrl) URL.revokeObjectURL(cachedCustomUrl);
	cachedCustomUrl = null;
	cachedCustomName = null;
}

/**
 * Handle returned by `startBossAlertPreview` so callers can implement a
 * play/stop toggle. `stop()` is idempotent; `done` resolves either when the
 * clip finishes naturally or when `stop()` is invoked — whichever comes first.
 */
export interface BossAlertPreviewHandle {
	stop(): void;
	done: Promise<void>;
}

/**
 * Default two-tone descending alert (660Hz → 440Hz, each 300ms), exposed as
 * a stoppable handle. Real alert sites that don't care about stopping early
 * can just ignore the returned handle.
 */
function startDefaultBossBeepPreview(): BossAlertPreviewHandle {
	let stopped = false;
	let resolveDone: () => void = () => {};
	const done = new Promise<void>((r) => { resolveDone = r; });

	try {
		const audioContext = new AudioContext();
		const gainNode = audioContext.createGain();
		gainNode.connect(audioContext.destination);
		gainNode.gain.value = 0.3;

		const osc1 = audioContext.createOscillator();
		osc1.connect(gainNode);
		osc1.frequency.value = 660;
		osc1.type = "sine";

		const osc2 = audioContext.createOscillator();
		osc2.connect(gainNode);
		osc2.frequency.value = 440;
		osc2.type = "sine";

		const now = audioContext.currentTime;
		osc1.start(now);
		osc1.stop(now + 0.3);
		osc2.start(now + 0.3);
		osc2.stop(now + 0.6);

		const finishTimer = window.setTimeout(() => {
			if (stopped) return;
			stopped = true;
			audioContext.close().catch(() => {});
			resolveDone();
		}, 700);

		return {
			stop() {
				if (stopped) return;
				stopped = true;
				window.clearTimeout(finishTimer);
				try { osc1.stop(); } catch { /* already stopped */ }
				try { osc2.stop(); } catch { /* already stopped */ }
				audioContext.close().catch(() => {});
				resolveDone();
			},
			done,
		};
	} catch {
		resolveDone();
		return { stop() {}, done };
	}
}

/**
 * Start playing the configured boss alert and return a handle the caller can
 * use to stop it early (e.g. for a play/pause toggle in Settings). For custom
 * imported sounds this wraps an `HTMLAudioElement`; for the built-in beep it
 * wraps the synth `AudioContext`. Either way `done` resolves on natural
 * completion OR explicit stop.
 */
export async function startBossAlertPreview(): Promise<BossAlertPreviewHandle> {
	const name = get(settingsStore).boss_sound_custom_name;
	if (name) {
		const url = await getCustomBossSoundUrl(name);
		if (url) {
			try {
				const audio = new Audio(url);
				audio.volume = 0.7;
				let resolveDone: () => void = () => {};
				const done = new Promise<void>((r) => { resolveDone = r; });
				audio.addEventListener("ended", () => resolveDone());
				audio.addEventListener("error", () => resolveDone());
				await audio.play();
				return {
					stop() {
						audio.pause();
						audio.currentTime = 0;
						resolveDone();
					},
					done,
				};
			} catch (e) {
				console.warn("Failed to preview custom boss sound, falling back to default beep:", e);
			}
		}
	}
	return startDefaultBossBeepPreview();
}

/**
 * Play the configured boss spawn alert fire-and-forget. Used by the real-time
 * alert path; the returned handle is discarded since the alert always plays
 * to completion. Stoppable callers should use `startBossAlertPreview` directly.
 */
export async function playBossAlert(): Promise<void> {
	await startBossAlertPreview();
}
