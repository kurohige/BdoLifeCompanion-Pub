/**
 * Announcements store - manages remote announcements, caching, and carousel state
 */

import { writable, derived, get } from "svelte/store";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import type { AnnouncementsPayload, AnnouncementsCache, AnnouncementMessage } from "$lib/models/announcements.js";
import { ANNOUNCEMENTS_URL, ANNOUNCEMENTS_TOKEN, ANNOUNCEMENTS_POLL_INTERVAL_MS, DEFAULT_MESSAGE } from "$lib/constants/announcements.js";
import { settingsStore, updateSetting } from "./settings.js";

// ============== State ==============

export const announcementsStore = writable<AnnouncementsPayload | null>(null);
export const announcementsLoadingStore = writable<boolean>(false);
export const announcementsFetchErrorStore = writable<string | null>(null);

/** Current carousel card index */
export const currentCardIndexStore = writable<number>(0);

// ============== Derived ==============

/** Whether an update is available (remote version > current app version) */
export const updateAvailableStore = derived(announcementsStore, ($announcements) => {
	if (!$announcements?.latestVersion) return false;
	try {
		return compareVersions($announcements.latestVersion, _currentVersion) > 0;
	} catch {
		return false;
	}
});

/** Active messages: filtered by dismissals and expiry, with default fallback */
export const activeMessagesStore = derived(
	[announcementsStore, settingsStore],
	([$announcements, $settings]) => {
		const dismissed = $settings.dismissed_announcements ?? [];
		const now = new Date();

		let messages: AnnouncementMessage[] = [];

		if ($announcements?.messages) {
			messages = $announcements.messages.filter((msg) => {
				if (dismissed.includes(msg.id)) return false;
				if (msg.expiresAt && new Date(msg.expiresAt) < now) return false;
				return true;
			});
		}

		// Always include default message as fallback
		if (messages.length === 0) {
			messages = [DEFAULT_MESSAGE];
		}

		return messages;
	}
);

// ============== Internal State ==============

let _currentVersion = "0.0.0";
let _pollIntervalId: ReturnType<typeof setInterval> | null = null;

// ============== Version Comparison ==============

/**
 * Compare two semver version strings.
 * Returns: positive if a > b, negative if a < b, 0 if equal.
 */
export function compareVersions(a: string, b: string): number {
	const parseVersion = (v: string): number[] => {
		// Strip leading 'v' if present
		const cleaned = v.replace(/^v/, "").split("-")[0];
		return cleaned.split(".").map((n) => parseInt(n, 10) || 0);
	};

	const pa = parseVersion(a);
	const pb = parseVersion(b);
	const len = Math.max(pa.length, pb.length);

	for (let i = 0; i < len; i++) {
		const na = pa[i] ?? 0;
		const nb = pb[i] ?? 0;
		if (na !== nb) return na - nb;
	}
	return 0;
}

// ============== Actions ==============

/**
 * Initialize the announcements system.
 * Loads cache first for instant display, then fetches fresh data and starts polling.
 */
export async function initAnnouncements(): Promise<void> {
	// Get current app version
	try {
		_currentVersion = await getVersion();
	} catch {
		_currentVersion = "0.0.0";
	}

	// Load cache for instant display
	await loadAnnouncementsCache();

	// Fetch fresh data if URL is configured, then start polling
	if (ANNOUNCEMENTS_URL) {
		fetchAnnouncements();
		startAnnouncementPolling();
	}
}

/**
 * Start periodic announcement polling.
 */
export function startAnnouncementPolling(): void {
	if (_pollIntervalId) return;
	_pollIntervalId = setInterval(() => {
		fetchAnnouncements();
	}, ANNOUNCEMENTS_POLL_INTERVAL_MS);
}

/**
 * Stop periodic announcement polling.
 */
export function stopAnnouncementPolling(): void {
	if (_pollIntervalId) {
		clearInterval(_pollIntervalId);
		_pollIntervalId = null;
	}
}

/**
 * Fetch announcements from remote URL (non-blocking).
 * Passes bearer token if configured. Cleans up stale dismissed IDs.
 */
export async function fetchAnnouncements(): Promise<void> {
	if (!ANNOUNCEMENTS_URL) return;

	announcementsLoadingStore.set(true);
	announcementsFetchErrorStore.set(null);

	try {
		const responseBody = await invoke<string>("fetch_announcements", {
			url: ANNOUNCEMENTS_URL,
			token: ANNOUNCEMENTS_TOKEN || null,
		});
		const payload: AnnouncementsPayload = JSON.parse(responseBody);

		// Validate basic structure
		if (!payload.messages || !Array.isArray(payload.messages)) {
			throw new Error("Invalid announcements payload: missing messages array");
		}

		announcementsStore.set(payload);

		// Clean up dismissed IDs for messages no longer in the payload
		const activeIds = new Set(payload.messages.map((m) => m.id));
		const settings = get(settingsStore);
		const dismissed = settings.dismissed_announcements ?? [];
		const cleaned = dismissed.filter((id) => activeIds.has(id));
		if (cleaned.length !== dismissed.length) {
			updateSetting("dismissed_announcements", cleaned);
		}

		// Cache the successful response
		await saveAnnouncementsCache(payload);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error("Failed to fetch announcements:", message);
		announcementsFetchErrorStore.set(message);
		// Keep using cached data (already loaded)
	} finally {
		announcementsLoadingStore.set(false);
	}
}

/**
 * Load announcements from local cache.
 */
async function loadAnnouncementsCache(): Promise<void> {
	try {
		const cacheJson = await invoke<string>("load_announcements_cache");
		if (cacheJson) {
			const cache: AnnouncementsCache = JSON.parse(cacheJson);
			if (cache.payload) {
				announcementsStore.set(cache.payload);
			}
		}
	} catch {
		// No cache file yet — that's fine
	}
}

/**
 * Save announcements to local cache.
 */
async function saveAnnouncementsCache(payload: AnnouncementsPayload): Promise<void> {
	try {
		const cache: AnnouncementsCache = {
			fetchedAt: new Date().toISOString(),
			payload,
		};
		await invoke("save_announcements_cache", { data: JSON.stringify(cache) });
	} catch (error) {
		console.error("Failed to save announcements cache:", error);
	}
}

/**
 * Dismiss a message by ID. Persists to settings.
 */
export function dismissMessage(messageId: string): void {
	const settings = get(settingsStore);
	const dismissed = settings.dismissed_announcements ?? [];

	if (!dismissed.includes(messageId)) {
		updateSetting("dismissed_announcements", [...dismissed, messageId]);
	}

	// Reset carousel index to avoid out-of-bounds
	const active = get(activeMessagesStore);
	const currentIndex = get(currentCardIndexStore);
	if (currentIndex >= active.length) {
		currentCardIndexStore.set(0);
	}
}

/**
 * Advance carousel to next card.
 */
export function nextCard(): void {
	const messages = get(activeMessagesStore);
	if (messages.length <= 1) return;

	currentCardIndexStore.update((i) => (i + 1) % messages.length);
}

/**
 * Get the download URL for the latest version.
 */
export function getDownloadUrl(): string | null {
	const payload = get(announcementsStore);
	return payload?.downloadUrl ?? null;
}
