import { dev } from '$app/env';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Cookies } from '@sveltejs/kit';

/**
 * How long a single login stays valid before the password is required again.
 * Supabase's own auth cookies are long-lived (and renewed on every token
 * refresh), so we cap the session ourselves with a separate marker cookie.
 */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // one week, in seconds

/**
 * The marker cookie must outlive the session window. If its `maxAge` matched
 * `SESSION_MAX_AGE`, the browser would delete it at the very moment the session
 * expires, so `isSessionExpired()` would read `undefined` (→ `NaN`) and never
 * trigger `endExpiredSession()` — leaving the long-lived Supabase auth cookies
 * intact. The buffer lets the hook still see the marker and cut the session.
 */
const MARKER_MAX_AGE = SESSION_MAX_AGE + 60 * 60; // session window + 1h buffer

/** Records when the current login began. */
const STARTED_AT_COOKIE = 'session_started_at';

const COOKIE_OPTIONS = {
	path: '/',
	httpOnly: true,
	sameSite: 'lax',
	secure: !dev
} as const;

/** Begins a fresh, week-long session (called right after a successful login). */
export function startSession(cookies: Cookies) {
	cookies.set(STARTED_AT_COOKIE, Date.now().toString(), {
		...COOKIE_OPTIONS,
		maxAge: MARKER_MAX_AGE
	});
}

/**
 * The wall-clock time (ms since epoch) at which the current login began, or
 * `null` when the request carries no valid marker.
 */
function getSessionStartedAt(cookies: Cookies) {
	const startedAt = Number(cookies.get(STARTED_AT_COOKIE));
	return Number.isFinite(startedAt) && startedAt > 0 ? startedAt : null;
}

/** Whether the current request carries a session-start marker. */
export function hasSessionMarker(cookies: Cookies) {
	return getSessionStartedAt(cookies) !== null;
}

/**
 * The absolute wall-clock time (ms since epoch) at which the current session
 * expires, or `null` when there is no marker. Exposed to the client so it can
 * schedule its own redirect — the server can only enforce the limit when a
 * request actually reaches it.
 */
export function getSessionExpiresAt(cookies: Cookies) {
	const startedAt = getSessionStartedAt(cookies);
	return startedAt === null ? null : startedAt + SESSION_MAX_AGE * 1000;
}

/** A marked session is expired once it is older than `SESSION_MAX_AGE`. */
export function isSessionExpired(cookies: Cookies) {
	const startedAt = getSessionStartedAt(cookies);
	return startedAt !== null && Date.now() - startedAt >= SESSION_MAX_AGE * 1000;
}

/**
 * Drops the marker cookie together with every Supabase auth cookie
 * (`sb-<ref>-auth-token`, including its `.0`, `.1`, … chunks) so the next
 * request is treated as signed out.
 */
export function clearSession(cookies: Cookies) {
	cookies.delete(STARTED_AT_COOKIE, COOKIE_OPTIONS);

	for (const { name } of cookies.getAll()) {
		if (name.includes('-auth-token')) {
			cookies.delete(name, COOKIE_OPTIONS);
		}
	}
}

/**
 * Ends a login that has outlived `SESSION_MAX_AGE`: revokes the Supabase
 * session, then clears the auth cookies so the user must sign in again.
 */
export async function endExpiredSession(cookies: Cookies, supabase: SupabaseClient) {
	if (!isSessionExpired(cookies)) return;

	try {
		await supabase.auth.signOut();
	} catch {
		// Network hiccups shouldn't trap the user in an expired session.
	}

	clearSession(cookies);
}
