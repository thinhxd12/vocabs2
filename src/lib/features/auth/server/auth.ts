import { LOGIN_EMAIL } from '$app/env/private';
import { redirect } from '@sveltejs/kit';
import type { Cookies } from '@sveltejs/kit';
import { clearSession, hasSessionMarker, startSession } from './session.ts';

/**
 * Signs the single account in. Returns the message to show under the password
 * field, or `null` on success — the route owns the HTTP response.
 */
export async function signIn(locals: App.Locals, cookies: Cookies, password: string) {
	if (!password) {
		return 'Please enter your password.';
	}

	const { error } = await locals.supabase.auth.signInWithPassword({
		email: LOGIN_EMAIL,
		password
	});

	if (error) {
		return 'Invalid password.';
	}

	// A successful login is good for one week, then the password is required again.
	startSession(cookies);
	return null;
}

/** Revokes the Supabase session and drops the marker, so the next request is signed out. */
export async function signOut(locals: App.Locals, cookies: Cookies) {
	await locals.supabase.auth.signOut();
	clearSession(cookies);
}

/** Everything under `(authed)` calls this first: no validated JWT, no page. */
export async function requireSession(locals: App.Locals, cookies: Cookies) {
	const { claims } = await locals.safeGetClaims();

	if (!claims) {
		redirect(303, '/login');
	}

	// Sessions created before the one-week limit existed get their clock started
	// now, so they expire a week from this request instead of being cut short.
	if (!hasSessionMarker(cookies)) {
		startSession(cookies);
	}
}
