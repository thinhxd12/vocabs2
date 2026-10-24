/**
 * The app's single heartbeat.
 *
 * A dedicated worker keeps ticking while the tab is in the background, where
 * main-thread intervals get throttled (sometimes to once a minute). Every
 * message carries `Date.now()` rather than a counter, so a delayed tick never
 * pushes a countdown off the wall clock — it just arrives late and corrects.
 */

type TimerMessage = { action?: 'START' | 'STOP' };

/** `self` is typed as a Window in the DOM lib; narrow it to what we use. */
const scope = self as unknown as {
	onmessage: ((event: MessageEvent<TimerMessage>) => void) | null;
	postMessage: (message: unknown) => void;
};

let intervalId: ReturnType<typeof setInterval> | undefined;

scope.onmessage = (event) => {
	const action = event.data?.action;

	if (action === 'START') {
		// Guard so a repeated START can't stack intervals.
		if (intervalId !== undefined) return;

		scope.postMessage({ timestamp: Date.now() });
		intervalId = setInterval(() => {
			scope.postMessage({ timestamp: Date.now() });
		}, 1000);
		return;
	}

	if (action === 'STOP') {
		clearInterval(intervalId);
		intervalId = undefined;
	}
};
