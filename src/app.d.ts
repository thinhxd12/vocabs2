import type { AuthError, JwtPayload, SupabaseClient } from '@supabase/supabase-js';
import 'unplugin-icons/types/svelte';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			supabase: SupabaseClient;
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
