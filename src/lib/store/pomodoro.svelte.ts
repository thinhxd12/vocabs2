import { browser } from '$app/env';
import { page } from '$app/state';

export type PomodoroMode = 'focus' | 'shortbreak' | 'longbreak';

/** One row of `pomodoro_table`: a day and the focus minutes recorded on it. */
export type PomodoroRow = {
	date: string;
	time: number;
};

type MinutesKey = 'focusMinutes' | 'shortbreakMinutes' | 'longbreakMinutes';

export const MODE_LABEL: Record<PomodoroMode, string> = {
	focus: 'Focus',
	shortbreak: 'Short break',
	longbreak: 'Long break'
};

/** Ambient track per mode, served from `static/sounds`. */
const MODE_SOUND: Record<PomodoroMode, string> = {
	focus: '/sounds/mp3_focus.ogg',
	shortbreak: '/sounds/mp3_shortbreak.ogg',
	longbreak: '/sounds/mp3_longbreak.ogg'
};

const SETTINGS_KEY = 'pomodoro:settings';

const MIN_MINUTES = 1;
const MAX_MINUTES = 180;
const MIN_INTERVALS = 1;
const MAX_INTERVALS = 24;

/**
 * Migrated from the old `layoutstore`. The timer lives at module scope so the
 * layout's worker can keep it in step while the reader moves between routes.
 */
export const pomodoro = $state({
	mode: 'focus' as PomodoroMode,
	/** Old defaults: 7 / 2 / 15, long break every 3 focus sessions. */
	focusMinutes: 7,
	shortbreakMinutes: 2,
	longbreakMinutes: 15,
	intervals: 3,
	currentInterval: 1,
	secondsRemaining: 7 * 60,
	isPaused: true,
	isMuted: false,
	/** True between the end of a focus session and the end of its break. */
	isFocusDone: false,
	/** Whether the current session has started, so edits don't rewrite it. */
	started: false,
	/** The duration this session was started with, for accurate reporting. */
	sessionMinutes: 7,
	endTimestamp: 0,
	/** Last timestamp posted by the shared timer worker. */
	currentTimestamp: 0,
	ambient: '/sounds/mp3_break.ogg',
	ambientPaused: true,
	/** Bumped on every start so the page replays the cue even if the track is unchanged. */
	soundToken: 0
});

type CompletionHandler = (completed: PomodoroMode, minutes: number) => void;

let completionHandler: CompletionHandler | null = null;

/** Registers the page's recorder; returns the matching teardown. */
export function setCompletionHandler(handler: CompletionHandler) {
	completionHandler = handler;

	return () => {
		if (completionHandler === handler) completionHandler = null;
	};
}

function minutesKey(mode: PomodoroMode): MinutesKey {
	return mode === 'focus'
		? 'focusMinutes'
		: mode === 'shortbreak'
			? 'shortbreakMinutes'
			: 'longbreakMinutes';
}

export function minutesFor(mode: PomodoroMode): number {
	return pomodoro[minutesKey(mode)];
}

export function secondsFor(mode: PomodoroMode): number {
	return minutesFor(mode) * 60;
}

/** The worker's last tick, or the browser clock before the first tick. */
function now(): number {
	return pomodoro.currentTimestamp || Date.now();
}

/** Starts (or re-anchors) the countdown from the current remaining seconds. */
export function startTimer() {
	if (pomodoro.secondsRemaining <= 0) {
		pomodoro.secondsRemaining = secondsFor(pomodoro.mode);
	}

	// Capture the length this session actually runs for; editing the setting
	// mid-session must not rewrite what gets reported.
	if (!pomodoro.started) {
		pomodoro.sessionMinutes = Math.max(
			1,
			Math.round(pomodoro.secondsRemaining / 60)
		);
	}

	// Starting or resuming a session also cues that mode's sound. The page
	// element plays it; there is no separate chime to ring repeatedly.
	pomodoro.ambient = MODE_SOUND[pomodoro.mode];
	pomodoro.ambientPaused = false;
	pomodoro.soundToken += 1;

	pomodoro.endTimestamp = now() + pomodoro.secondsRemaining * 1000;
	pomodoro.isPaused = false;
	pomodoro.started = true;
}

export function pauseTimer() {
	if (!pomodoro.isPaused) {
		pomodoro.secondsRemaining = Math.max(
			0,
			Math.round((pomodoro.endTimestamp - now()) / 1000)
		);
	}

	pomodoro.isPaused = true;
	pomodoro.endTimestamp = 0;
	pomodoro.ambientPaused = true;
}

export function toggleTimer() {
	pomodoro.isPaused ? startTimer() : pauseTimer();
}

/** Switches mode and starts the new session, as the old mode buttons did. */
export function setMode(mode: PomodoroMode) {
	pomodoro.mode = mode;
	pomodoro.secondsRemaining = secondsFor(mode);
	pomodoro.started = false;
	startTimer();
}

/**
 * The old `endTimer`: focus rolls into a break, a break rolls into focus, and
 * the focus counter only advances once the break has finished.
 */
function completeSession() {
	const completed = pomodoro.mode;

	if (completed === 'focus') {
		const long = pomodoro.currentInterval >= pomodoro.intervals;
		const next: PomodoroMode = long ? 'longbreak' : 'shortbreak';

		pomodoro.isFocusDone = true;
		completionHandler?.(completed, pomodoro.sessionMinutes);

		pomodoro.mode = next;
		pomodoro.secondsRemaining = secondsFor(next);
		pomodoro.started = false;
		startTimer();
		return;
	}

	if (pomodoro.isFocusDone) {
		pomodoro.currentInterval =
			pomodoro.currentInterval + 1 > pomodoro.intervals
				? 1
				: pomodoro.currentInterval + 1;
		pomodoro.isFocusDone = false;
	}

	pomodoro.mode = 'focus';
	pomodoro.secondsRemaining = secondsFor('focus');
	pomodoro.started = false;

	// The old page only auto-started the next focus when it was on screen.
	if (page.url.pathname === '/pomodoro') {
		startTimer();
	} else {
		pomodoro.isPaused = true;
		pomodoro.endTimestamp = 0;
		pomodoro.ambientPaused = true;
	}
}

/** Re-reads the worker's clock and completes the session at zero. */
export function syncTimer(timestamp = now()) {
	if (pomodoro.isPaused) return;

	const msLeft = pomodoro.endTimestamp - timestamp;
	pomodoro.secondsRemaining = Math.max(0, Math.round(msLeft / 1000));

	if (msLeft <= 0) completeSession();
}

export function toggleMute() {
	pomodoro.isMuted = !pomodoro.isMuted;

	// Muting silences the current track; unmuting while a session is running
	// brings it back instead of leaving the timer silent until the next mode.
	if (pomodoro.isMuted) {
		pomodoro.ambientPaused = true;
	} else if (!pomodoro.isPaused) {
		pomodoro.ambientPaused = false;
		pomodoro.soundToken += 1;
	}
}

export function setMinutes(mode: PomodoroMode, value: number) {
	if (!Number.isFinite(value)) return;

	const minutes = Math.min(
		MAX_MINUTES,
		Math.max(MIN_MINUTES, Math.round(value))
	);
	pomodoro[minutesKey(mode)] = minutes;

	// An idle session follows the new duration; a running one keeps its time.
	if (pomodoro.mode === mode && !pomodoro.started) {
		pomodoro.secondsRemaining = minutes * 60;
	}
}

export function setIntervals(value: number) {
	if (!Number.isFinite(value)) return;

	pomodoro.intervals = Math.min(
		MAX_INTERVALS,
		Math.max(MIN_INTERVALS, Math.round(value))
	);
	pomodoro.currentInterval = Math.min(
		pomodoro.currentInterval,
		pomodoro.intervals
	);
}

export function setCurrentInterval(value: number) {
	if (!Number.isFinite(value)) return;

	pomodoro.currentInterval = Math.min(
		pomodoro.intervals,
		Math.max(1, Math.round(value))
	);
}

/** Share of the session left, 0 → 100; the artwork's colour drains with it. */
export function remainingPercent(): number {
	const total = Math.max(1, secondsFor(pomodoro.mode));
	return Math.min(
		100,
		Math.max(0, Math.round((pomodoro.secondsRemaining / total) * 100))
	);
}

export function padWithZeroes(value: number): string {
	return String(Math.trunc(Math.abs(value))).padStart(2, '0');
}

export function secondsToMinutes(seconds: number): number {
	return Math.floor(seconds / 60);
}

export function formatTimerString(seconds: number): string {
	const safe = Math.max(0, Math.trunc(seconds));
	return `${padWithZeroes(Math.floor(safe / 60))}:${padWithZeroes(safe % 60)}`;
}

/** `hh:mm` from a row's recorded minutes, matching the old report. */
export function formatClock(minutes: number): string {
	const safe = Math.max(0, Math.round(minutes));
	return `${padWithZeroes(Math.floor(safe / 60))}:${padWithZeroes(safe % 60)}`;
}

export function formatDuration(minutes: number): string {
	const safe = Math.max(0, Math.round(minutes));
	const hours = Math.floor(safe / 60);
	const rest = safe % 60;

	if (hours === 0) return `${rest} min`;
	if (rest === 0) return `${hours} h`;
	return `${hours} h ${rest} min`;
}

/** The browser's own calendar day, shaped `YYYY-MM-DD`. */
export function todayISO(date = new Date()): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

type StoredSettings = {
	focusMinutes: number;
	shortbreakMinutes: number;
	longbreakMinutes: number;
	intervals: number;
};

export function restoreSettings() {
	if (!browser) return;

	try {
		const raw = localStorage.getItem(SETTINGS_KEY);
		if (!raw) return;

		const parsed = JSON.parse(raw) as Partial<StoredSettings>;
		setMinutes('focus', Number(parsed.focusMinutes));
		setMinutes('shortbreak', Number(parsed.shortbreakMinutes));
		setMinutes('longbreak', Number(parsed.longbreakMinutes));
		setIntervals(Number(parsed.intervals));
	} catch {
		// A corrupt or unavailable store just means the defaults stay.
	}
}

export function saveSettings(settings: StoredSettings) {
	if (!browser) return;

	try {
		localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
	} catch {
		// Private mode can refuse writes; the timer still works without them.
	}
}
