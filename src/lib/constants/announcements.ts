/**
 * Announcements system constants
 */

import type { AnnouncementMessage } from "$lib/models/announcements.js";

/** Announcements API endpoint */
export const ANNOUNCEMENTS_URL = "";

/** Bearer token for announcements API auth */
export const ANNOUNCEMENTS_TOKEN = "";

/** Interval between scheduled announcement polls (2 hours) */
export const ANNOUNCEMENTS_POLL_INTERVAL_MS = 7_200_000;

/** Default message shown when no remote announcements are available */
export const DEFAULT_MESSAGE: AnnouncementMessage = {
	id: "__default_beta_thanks",
	type: "event",
	title: "Welcome!",
	body: "Thank you for testing the app!",
};

/** Interval between carousel rotations (ms) */
export const CAROUSEL_INTERVAL_MS = 6000;

/** Duration of the 3D cube flip animation (ms) */
export const CAROUSEL_FLIP_DURATION_MS = 600;
