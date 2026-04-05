/**
 * Shared audio utilities for timer alerts.
 * Uses the Web Audio API to generate a short beep tone.
 */

/**
 * Play a short 880Hz sine-wave beep for timer completion alerts.
 * Silently fails if Web Audio API is unavailable (e.g., during SSR).
 */
export function playTimerAlert(): void {
	try {
		const audioContext = new AudioContext();
		const oscillator = audioContext.createOscillator();
		const gainNode = audioContext.createGain();

		oscillator.connect(gainNode);
		gainNode.connect(audioContext.destination);

		oscillator.frequency.value = 880;
		oscillator.type = "sine";
		gainNode.gain.value = 0.3;

		oscillator.start();
		setTimeout(() => {
			oscillator.stop();
			audioContext.close();
		}, 500);
	} catch {
		// Audio not available (SSR or restricted environment)
	}
}

/**
 * Play a two-tone descending alert for boss spawn warnings.
 * 660Hz → 440Hz, each 300ms, to distinguish from the timer beep (880Hz).
 */
export function playBossAlert(): void {
	try {
		const audioContext = new AudioContext();
		const gainNode = audioContext.createGain();
		gainNode.connect(audioContext.destination);
		gainNode.gain.value = 0.3;

		const osc1 = audioContext.createOscillator();
		osc1.connect(gainNode);
		osc1.frequency.value = 660;
		osc1.type = "sine";

		const osc2 = audioContext.createOscillator();
		osc2.connect(gainNode);
		osc2.frequency.value = 440;
		osc2.type = "sine";

		const now = audioContext.currentTime;
		osc1.start(now);
		osc1.stop(now + 0.3);
		osc2.start(now + 0.3);
		osc2.stop(now + 0.6);

		setTimeout(() => {
			audioContext.close();
		}, 700);
	} catch {
		// Audio not available (SSR or restricted environment)
	}
}
