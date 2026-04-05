/**
 * Timer store - shared countdown timer state for crafting and mini mode.
 * Provides start/pause/resume/stop/reset controls with a 1-second tick interval.
 */

import { writable, derived, get } from "svelte/store";
import { playTimerAlert } from "$lib/utils/audio";

export interface TimerState {
	minutes: number;
	seconds: number;
	remainingSeconds: number;
	isRunning: boolean;
	isPaused: boolean;
	totalSeconds: number;
}

const DEFAULT_STATE: TimerState = {
	minutes: 5,
	seconds: 0,
	remainingSeconds: 0,
	isRunning: false,
	isPaused: false,
	totalSeconds: 300,
};

/** Main timer store holding current timer state */
export const timerStore = writable<TimerState>(DEFAULT_STATE);

let intervalId: ReturnType<typeof setInterval> | null = null;

/** Formatted "MM:SS" display string for the current timer */
export const timerDisplay = derived(timerStore, ($timer) => {
	const totalSecs = $timer.isRunning || $timer.isPaused
		? $timer.remainingSeconds
		: $timer.minutes * 60 + $timer.seconds;
	const mins = Math.floor(totalSecs / 60);
	const secs = totalSecs % 60;
	return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
});

/** Timer progress as a percentage (0-100) */
export const timerProgress = derived(timerStore, ($timer) => {
	if ($timer.totalSeconds === 0) return 0;
	return (($timer.totalSeconds - $timer.remainingSeconds) / $timer.totalSeconds) * 100;
});

/** Whether the timer is currently running or paused */
export const isTimerActive = derived(timerStore, ($timer) => {
	return $timer.isRunning || $timer.isPaused;
});

/** Set the minutes input (0-99), updating totalSeconds accordingly */
export function setTimerMinutes(value: number) {
	timerStore.update((s) => {
		const newMinutes = Math.max(0, Math.min(99, value));
		return {
			...s,
			minutes: newMinutes,
			totalSeconds: newMinutes * 60 + s.seconds,
			remainingSeconds: s.isRunning ? s.remainingSeconds : newMinutes * 60 + s.seconds,
		};
	});
}

/** Set the seconds input (0-59), updating totalSeconds accordingly */
export function setTimerSeconds(value: number) {
	timerStore.update((s) => {
		const newSeconds = Math.max(0, Math.min(59, value));
		return {
			...s,
			seconds: newSeconds,
			totalSeconds: s.minutes * 60 + newSeconds,
			remainingSeconds: s.isRunning ? s.remainingSeconds : s.minutes * 60 + newSeconds,
		};
	});
}

/** Set a preset duration in minutes (ignored while running) */
export function setTimerPreset(mins: number) {
	timerStore.update((s) => {
		if (s.isRunning) return s;
		return {
			...s,
			minutes: mins,
			seconds: 0,
			totalSeconds: mins * 60,
			remainingSeconds: mins * 60,
		};
	});
}

/** Start the countdown timer, initializing from inputs if needed */
export function startTimer() {
	const state = get(timerStore);

	if (state.remainingSeconds === 0) {
		timerStore.update((s) => ({
			...s,
			remainingSeconds: s.minutes * 60 + s.seconds,
			totalSeconds: s.minutes * 60 + s.seconds,
		}));
	}

	const current = get(timerStore);
	if (current.remainingSeconds <= 0) return;

	timerStore.update((s) => ({ ...s, isRunning: true, isPaused: false }));

	intervalId = setInterval(() => {
		try {
			timerStore.update((s) => {
				if (s.remainingSeconds > 0) {
					return { ...s, remainingSeconds: s.remainingSeconds - 1 };
				} else {
					stopTimer();
					playTimerAlert();
					return s;
				}
			});
		} catch (err) {
			console.error("Timer tick error:", err);
		}
	}, 1000);
}

/** Pause the timer, preserving remaining time */
export function pauseTimer() {
	if (intervalId) {
		clearInterval(intervalId);
		intervalId = null;
	}
	timerStore.update((s) => ({ ...s, isPaused: true, isRunning: false }));
}

/** Resume a paused timer */
export function resumeTimer() {
	startTimer();
}

/** Stop the timer and reset remaining time to 0 */
export function stopTimer() {
	if (intervalId) {
		clearInterval(intervalId);
		intervalId = null;
	}
	timerStore.update((s) => ({
		...s,
		isRunning: false,
		isPaused: false,
		remainingSeconds: 0,
	}));
}

/** Reset the timer to the configured minutes/seconds without starting */
export function resetTimer() {
	stopTimer();
	timerStore.update((s) => ({
		...s,
		remainingSeconds: s.minutes * 60 + s.seconds,
		totalSeconds: s.minutes * 60 + s.seconds,
	}));
}

/** Clean up the interval on app unmount to prevent leaks */
export function cleanupTimer() {
	if (intervalId) {
		clearInterval(intervalId);
		intervalId = null;
	}
}
