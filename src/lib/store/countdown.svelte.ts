import { browser } from '$app/env';
import cloverIcon from '#lib/assets/images/2617511.png';
import { addToast } from '#lib/store/toast.svelte.ts';

/**
 * The navbar's quick timer: six minutes, started with one click.
 *
 * Held at module scope, like the pomodoro, so it keeps counting while the
 * reader moves between routes. The layout's worker heartbeat calls
 * `syncCountdown` every second with the wall clock; the countdown never owns an
 * interval, so a throttled tab cannot make it drift.
 */
export const QUICK_TIMER_MINUTES = 6;
const DURATION_SECONDS = QUICK_TIMER_MINUTES * 60;

/** Where the wall-clock end survives a reload; the old store lost it. */
const STORAGE_KEY = 'quick-timer:end';

export const countdown = $state({
	/** Wall-clock end, 0 while idle. */
	endTimestamp: 0,
	/** Whole seconds left, for the navbar's readout. */
	secondsRemaining: DURATION_SECONDS
});

/**
 * Resumes the timer a reload interrupted. Called after hydration so the server
 * and the first client render agree on the idle alarm; an end that has already
 * passed is dropped rather than ringing late.
 */
export function restoreCountdown() {
	if (!browser || countdown.endTimestamp) return;

	try {
		const end = Number(localStorage.getItem(STORAGE_KEY));
		if (!Number.isFinite(end) || end <= Date.now()) {
			localStorage.removeItem(STORAGE_KEY);
			return;
		}

		countdown.endTimestamp = end;
		countdown.secondsRemaining = Math.ceil((end - Date.now()) / 1000);
	} catch {
		// Storage unavailable: the timer simply starts from scratch.
	}
}

function rememberEnd(end: number) {
	if (!browser) return;

	try {
		if (end) localStorage.setItem(STORAGE_KEY, String(end));
		else localStorage.removeItem(STORAGE_KEY);
	} catch {
		// A refused write only costs the timer its reload protection.
	}
}

/**
 * Starts the six minutes. Permission is requested here rather than at zero:
 * the click is a user gesture, and a prompt that appears when the timer ends
 * would be refused without one.
 */
export function startCountdown() {
	countdown.endTimestamp = Date.now() + DURATION_SECONDS * 1000;
	countdown.secondsRemaining = DURATION_SECONDS;
	rememberEnd(countdown.endTimestamp);
	void ensureNotificationPermission();
}

export function stopCountdown() {
	countdown.endTimestamp = 0;
	countdown.secondsRemaining = DURATION_SECONDS;
	rememberEnd(0);
}

/** Re-reads the worker's clock, and rings once the wall clock passes zero. */
export function syncCountdown(timestamp = Date.now()) {
	if (!countdown.endTimestamp) return;

	const msLeft = countdown.endTimestamp - timestamp;
	countdown.secondsRemaining = Math.max(0, Math.ceil(msLeft / 1000));

	if (msLeft > 0) return;

	// Clear the timer before notifying: a late tick must not ring twice.
	countdown.endTimestamp = 0;
	countdown.secondsRemaining = 0;
	rememberEnd(0);
	notifyTimeUp();
}

async function ensureNotificationPermission() {
	if (!browser || !('Notification' in window)) return;
	if (Notification.permission !== 'default') return;

	try {
		await Notification.requestPermission();
	} catch {
		// Dismissed prompts and embedded browsers can both reject. The toast
		// at the end of the countdown still tells the reader it is over.
	}
}

function notifyTimeUp() {
	if (
		!browser ||
		!('Notification' in window) ||
		Notification.permission !== 'granted'
	) {
		timeUpToast();
		return;
	}

	try {
		const notification = new Notification('Time is up', {
			body: `${QUICK_TIMER_MINUTES} minutes are over. Close this to return to the app.`,
			icon: cloverIcon,
			tag: 'quick-timer',
			// Windows otherwise slides the toast away after a few seconds; this
			// keeps it on screen until the reader dismisses it.
			requireInteraction: true
		});

		// Dismissing (or clicking) the toast hands the window back: the reader
		// lands on whichever page the app is showing, not a new destination.
		notification.onclose = focusApp;
		notification.onclick = () => {
			focusApp();
			notification.close();
		};
	} catch {
		// Some platforms only allow notifications from a service worker.
		timeUpToast();
	}
}

function focusApp() {
	if (!browser) return;

	try {
		window.focus();
	} catch {
		// Browsers may refuse programmatic focus without a gesture; the toast
		// has still done its job of telling the reader the timer is over.
	}
}

function timeUpToast() {
	addToast({
		type: 'info',
		title: 'Time is up',
		message: `${QUICK_TIMER_MINUTES} minutes are over.`
	});
}
