// ============== Static Data (loaded from JSON) ==============

export type StageCategory = "normal" | "boss";

export interface WeeklyTaskStage {
	stage: number;
	category: StageCategory;
	apRequired: number;
	dpRequired: number;
}

export interface WeeklyTaskDefinition {
	id: string;
	name: string;
	description: string;
	icon: string;
	stages: WeeklyTaskStage[];
}

export interface WeeklyTasksData {
	version: number;
	tasks: WeeklyTaskDefinition[];
}

// ============== User Progress (persisted) ==============

export interface WeeklyTaskProgress {
	taskId: string;
	highestStageCleared: number;
	completedThisWeek: boolean;
	firstClearStages: number[];
	weekStartIso: string;
}

export interface WeeklyTaskProgressData {
	tasks: WeeklyTaskProgress[];
	lastResetCheck: string;
}
