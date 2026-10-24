import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$app/env/public';
import { createBrowserClient, createServerClient, isBrowser } from '@supabase/ssr';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ fetch, data, depends }) => {
	depends('supabase:auth');

	const supabase = isBrowser()
		? createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
				global: { fetch }
			})
		: createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
				global: { fetch },
				cookies: {
					getAll() {
						return data.cookies;
					}
				}
			});

	/**
	 * This layout only needs the session's expiry to schedule the client-side
	 * redirect, so it reads the stored session locally. `getSession()` decodes
	 * the cookie without a network round-trip, unlike `getClaims()`, which has
	 * to ask the Auth server for a project that signs JWTs with a symmetric key
	 * (the authoritative, server-validated check lives in the `(authed)` layout).
	 */
	const {
		data: { session }
	} = await supabase.auth.getSession();

	return {
		supabase,
		// Unix seconds, mirroring `session.expires_at`; null when signed out.
		sessionExpiresAt: session?.expires_at ?? null
	};
};
