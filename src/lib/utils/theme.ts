import type { AppTheme } from "$lib/services/persistence";

export function applyTheme(themeId: AppTheme): void {
	const html = document.documentElement;
	html.classList.remove("theme-light");
	if (themeId === "light") {
		html.classList.add("theme-light");
	}
}
