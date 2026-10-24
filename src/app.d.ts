import type { AuthError, JwtPayload, SupabaseClient } from '@supabase/supabase-js';
import 'unplugin-icons/types/svelte';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			supabase: SupabaseClient;
			/** The reader's IANA zone, as their browser last reported it in the
			 *  `timezone` cookie. `null` until that browser has reported one. */
			timeZone: string | null;
			safeGetClaims: () => Promise<{
				claims: JwtPayload | null;
				error: AuthError | null;
			}>;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
