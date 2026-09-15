/**
 * Shared guards for windows that persist their own position.
 *
 * Three windows save bounds and restore them on the next open: the main window
 * (`+page.svelte`), the detached scratchpad and the note editor. All three can
 * strand themselves off-screen the same two ways, and `setPosition` accepts
 * off-screen coordinates without complaint, so nothing throws — the window is
 * simply invisible and the user has no way to get it back.
 *
 *  1. **The minimize sentinel.** Windows reports a minimized window at
 *     `-32000, -32000`, and minimizing fires `onMoved`/`onResized`. A debounced
 *     bounds capture therefore persists the sentinel as if it were a real
 *     position. Guard the *save* with `isMinimized()`.
 *  2. **A monitor that is no longer there.** Bounds saved on a second display
 *     stay valid in settings after it is unplugged. Guard the *restore* with
 *     `positionIsOnScreen()`.
 *
 * This module is deliberately only these helpers. The three window modules stay
 * separate — they differ in their destroy handlers, which is the difference that
 * matters, and a shared window factory would hide it.
 */

import { availableMonitors } from "@tauri-apps/api/window";

/**
 * Slack around a monitor's edges, in physical px.
 *
 * `EDGE_SLACK` tolerates a window whose saved top-left sits slightly above or
 * left of the monitor origin (a maximized or snapped window often does).
 * `MIN_VISIBLE` requires at least that much of the window's top-left corner to
 * fall inside the monitor, so a window parked one pixel inside the right edge
 * does not count as reachable.
 */
const EDGE_SLACK = 64;
const MIN_VISIBLE = 40;

/**
 * How much of the window has to land on a monitor for it to count as reachable,
 * when the caller knows the window's physical size. A title bar the user can
 * grab is the real requirement, so this is deliberately small.
 */
const MIN_OVERLAP_W = 120;
const MIN_OVERLAP_H = 80;

/**
 * Is this saved position (PHYSICAL px) somewhere the user can actually reach?
 *
 * Pass `w`/`h` — also physical, as `innerSize()` reports them — and the check
 * becomes an overlap test: a real slice of the window must fall inside a single
 * monitor. Without them it degrades to a top-left corner test, which misses a
 * window hanging off the right or bottom edge of an otherwise-valid display.
 *
 * Returns `false` when the monitor list cannot be read, so callers fall back to
 * their default placement rather than trusting an unverifiable position.
 */
export async function positionIsOnScreen(
	x: number,
	y: number,
	w?: number,
	h?: number,
): Promise<boolean> {
	try {
		const monitors = await availableMonitors();
		if (typeof w === "number" && typeof h === "number" && w > 0 && h > 0) {
			return monitors.some((m) => {
				const overlapW =
					Math.min(x + w, m.position.x + m.size.width) - Math.max(x, m.position.x);
				const overlapH =
					Math.min(y + h, m.position.y + m.size.height) - Math.max(y, m.position.y);
				return (
					overlapW >= Math.min(MIN_OVERLAP_W, w) && overlapH >= Math.min(MIN_OVERLAP_H, h)
				);
			});
		}
		return monitors.some(
			(m) =>
				x >= m.position.x - EDGE_SLACK &&
				y >= m.position.y - EDGE_SLACK &&
				x < m.position.x + m.size.width - MIN_VISIBLE &&
				y < m.position.y + m.size.height - MIN_VISIBLE,
		);
	} catch {
		return false;
	}
}
