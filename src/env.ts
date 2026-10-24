import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	PUBLIC_SUPABASE_URL: {
		public: true,
		description: 'Your Supabase project URL'
	},
	PUBLIC_SUPABASE_ANON_KEY: {
		public: true,
		description: 'Your Supabase anon/publishable key'
	},
	LOGIN_EMAIL: {
		description: 'The email address used for password-only sign in (server-only, never sent to the browser)'
	},
	SECRET_FIRECRAWL_KEY: {
		description: 'Firecrawl API key for the Goodreads book lookup on /highlights',
		// Optional: without it the lookup is skipped and the page keeps its
		// hand-lettered cover.
		schema: (value: string | undefined) => value
	}
});
