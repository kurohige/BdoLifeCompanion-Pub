/**
 * Toast notification store — manages ephemeral messages displayed to the user.
 */

import { writable } from "svelte/store";

export type ToastType = "success" | "error" | "info";

export interface Toast {
	id: string;
	message: string;
	type: ToastType;
	duration: number;
}

let nextId = 0;

/** Active toasts */
export const toastStore = writable<Toast[]>([]);

/** Show a toast notification */
export function showToast(
	message: string,
	type: ToastType = "info",
	duration: number = 3000,
): void {
	const id = `toast-${++nextId}`;
	const toast: Toast = { id, message, type, duration };
	toastStore.update((toasts) => [...toasts, toast]);

	setTimeout(() => {
		dismissToast(id);
	}, duration);
}

/** Dismiss a toast by ID */
export function dismissToast(id: string): void {
	toastStore.update((toasts) => toasts.filter((t) => t.id !== id));
}
