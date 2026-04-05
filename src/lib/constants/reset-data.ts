/**
 * Game reset timer definitions for BDO daily/weekly resets and war schedules
 */

export type ResetTimerId = "daily" | "weekly" | "nodewar" | "conquest";

export interface ResetTimerInfo {
	id: ResetTimerId;
	name: string;
	description: string;
	icon: string;
}

export const RESET_TIMERS: Record<ResetTimerId, ResetTimerInfo> = {
	daily: {
		id: "daily",
		name: "Daily Reset",
		description: "Quests, attendance, imperial delivery, guild",
		icon: "🔄",
	},
	weekly: {
		id: "weekly",
		name: "Weekly Reset",
		description: "Weekly quests and guild rewards",
		icon: "📅",
	},
	nodewar: {
		id: "nodewar",
		name: "Node War",
		description: "Sun-Fri node war battles",
		icon: "⚔️",
	},
	conquest: {
		id: "conquest",
		name: "Conquest War",
		description: "Saturday conquest war",
		icon: "🏰",
	},
};
