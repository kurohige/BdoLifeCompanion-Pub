import { writable, get } from "svelte/store";
import { invoke } from "@tauri-apps/api/core";
import type {
	WeeklyTasksData,
	WeeklyTaskProgress,
	WeeklyTaskProgressData,
} from "$lib/models/weekly-tasks";
import { getCurrentWeekStartIso } from "$lib/utils/reset";

// ============== Static Data ==============

export const weeklyTasksDataStore = writable<WeeklyTasksData | null>(null);
export const weeklyTasksDataLoadingStore = writable<boolean>(true);

export async function loadWeeklyTasksData(): Promise<void> {
	weeklyTasksDataLoadingStore.set(true);
	try {
		const res = await fetch("/data/weekly-tasks/weekly-tasks.json");
		const data: WeeklyTasksData = await res.json();
		weeklyTasksDataStore.set(data);
	} catch (error) {
		console.error("Failed to load weekly tasks data:", error);
	} finally {
		weeklyTasksDataLoadingStore.set(false);
	}
}

// ============== Progress ==============

export const weeklyTasksProgressStore = writable<WeeklyTaskProgress[]>([]);
export const weeklyTasksProgressLoadingStore = writable<boolean>(true);


export async function loadWeeklyTasksProgress(): Promise<void> {
	weeklyTasksProgressLoadingStore.set(true);
	try {
		const data = await invoke<WeeklyTaskProgressData>("load_weekly_tasks");
		const currentWeek = getCurrentWeekStartIso();
		let needsSave = false;

		const updated = data.tasks.map((t) => {
			if (t.weekStartIso !== currentWeek) {
				needsSave = true;
				return {
					...t,
					highestStageCleared: 0,
					completedThisWeek: false,
					weekStartIso: currentWeek,
				};
			}
			return t;
		});

		weeklyTasksProgressStore.set(updated);
		if (needsSave) await saveWeeklyTasksProgress();
	} catch (error) {
		console.error("Failed to load weekly tasks progress:", error);
		weeklyTasksProgressStore.set([]);
	} finally {
		weeklyTasksProgressLoadingStore.set(false);
	}
}

async function saveWeeklyTasksProgress(): Promise<void> {
	try {
		const tasks = get(weeklyTasksProgressStore);
		await invoke("save_weekly_tasks", {
			data: { tasks, lastResetCheck: new Date().toISOString() },
		});
	} catch (error) {
		console.error("Failed to save weekly tasks progress:", error);
	}
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
function debouncedSaveWeeklyTasks(): void {
	if (saveTimeout) clearTimeout(saveTimeout);
	saveTimeout = setTimeout(() => saveWeeklyTasksProgress(), 500);
}

// ============== Mutations ==============

function createDefaultProgress(taskId: string): WeeklyTaskProgress {
	return {
		taskId,
		highestStageCleared: 0,
		completedThisWeek: false,
		firstClearStages: [],
		weekStartIso: getCurrentWeekStartIso(),
	};
}

function updateTaskProgress(
	taskId: string,
	updater: (p: WeeklyTaskProgress) => WeeklyTaskProgress,
): void {
	weeklyTasksProgressStore.update((tasks) => {
		const idx = tasks.findIndex((t) => t.taskId === taskId);
		if (idx >= 0) {
			const updated = [...tasks];
			updated[idx] = updater(tasks[idx]);
			return updated;
		}
		return [...tasks, updater(createDefaultProgress(taskId))];
	});
	debouncedSaveWeeklyTasks();
}

export function setHighestStage(taskId: string, stage: number): void {
	updateTaskProgress(taskId, (p) => ({
		...p,
		highestStageCleared: Math.max(0, stage),
	}));
}

export function toggleCompletedThisWeek(taskId: string): void {
	updateTaskProgress(taskId, (p) => ({
		...p,
		completedThisWeek: !p.completedThisWeek,
	}));
}

export function markFirstClear(taskId: string, stage: number): void {
	updateTaskProgress(taskId, (p) => ({
		...p,
		firstClearStages: p.firstClearStages.includes(stage)
			? p.firstClearStages
			: [...p.firstClearStages, stage].sort((a, b) => a - b),
	}));
}

export function unmarkFirstClear(taskId: string, stage: number): void {
	updateTaskProgress(taskId, (p) => ({
		...p,
		firstClearStages: p.firstClearStages.filter((s) => s !== stage),
	}));
}
