import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$app/env/public';
import { endExpiredSession } from '#lib/features/auth/server/session.ts';
import { createServerClient } from '@supabase/ssr';
import type { Handle } from '@sveltejs/kit/hooks';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
		cookies: {
			getAll: () => event.cookies.getAll(),
			setAll: (cookiesToSet, headers) => {
				cookiesToSet.forEach(({ name, value, options }) => {
					event.cookies.set(name, value, { ...options, path: '/' });
				});
				if (Object.keys(headers).length > 0) {
					event.setHeaders(headers);
				}
			}
		}
	});

	/**
	 * Unlike `supabase.auth.getSession()`, which returns the session _without_
	 * validating the JWT, this function also asks the Supabase Auth server to
	 * validate the JWT before returning it, so the returned user can be trusted.
	 *
	 * The result is memoized for the request: several consumers (the auth
	 * layout, page loads) ask for the same claims, and there is no reason to
	 * validate the token more than once.
	 */
	let claims: ReturnType<App.Locals['safeGetClaims']> | undefined;
	event.locals.safeGetClaims = () => {
		claims ??= event.locals.supabase.auth.getClaims().then(({ data, error }) => {
			if (error || !data) {
				return { claims: null, error };
			}

			return { claims: data.claims, error: null };
		});

		return claims;
	};

	/**
	 * Logins are capped at one week. Enforcing this in the hook (before any
	 * load runs) clears the session for every route at once, so expired users
	 * land on the login page instead of bouncing between redirects.
	 */
	await endExpiredSession(event.cookies, event.locals.supabase);

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});
};
