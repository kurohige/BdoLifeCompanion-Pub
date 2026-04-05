/**
 * Announcement system data models
 */

export interface AnnouncementMessage {
	/** Unique message ID (for tracking dismissals) */
	id: string;
	/** Message type for styling */
	type: "info" | "update" | "event" | "warning";
	/** Short title */
	title: string;
	/** Message body (plain text) */
	body: string;
	/** ISO date string — message hidden after this date */
	expiresAt?: string;
}

export interface AnnouncementsPayload {
	/** Latest available version string (e.g., "2.1.0") */
	latestVersion: string;
	/** URL where users can download the latest version */
	downloadUrl: string;
	/** Array of active broadcast messages */
	messages: AnnouncementMessage[];
}

export interface AnnouncementsCache {
	/** When the cache was last updated (ISO date) */
	fetchedAt: string;
	/** The full payload from the remote */
	payload: AnnouncementsPayload;
}
