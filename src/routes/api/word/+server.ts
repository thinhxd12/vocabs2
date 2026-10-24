import { getTranslation, normalizeWord } from '#lib/server/translate.ts';
import type { RequestHandler } from './$types';

/**
 * Lookup behind the review screen's "add a word" panel.
 *
 * One request answers what the reader needs before pressing add: the word's
 * meanings, from the same translate feature the review card uses, and whether
 * `memories_table` already holds it. The insert action repeats the duplicate
 * check server-side; this endpoint exists so the panel can say "already saved"
 * before anything is pressed.
 */
export const GET: RequestHandler = async ({ url, locals, fetch, setHeaders }) => {
	const { claims } = await locals.safeGetClaims();
	if (!claims) {
		return Response.json({ error: 'Sign in to look up a word.' }, { status: 401 });
	}

	const word = normalizeWord(url.searchParams.get('word'));
	if (!word) {
		return Response.json(
			{ error: 'Use a single word — letters, hyphens or an apostrophe.' },
			{ status: 400 }
		);
	}

	// The translation and the review list are independent, so neither waits for
	// the other. A translation outage is not an error: the word can still be
	// saved, it is just shown without meanings.
	const [translations, existing] = await Promise.all([
		getTranslation(word, fetch).catch(() => []),
		locals.supabase.from('memories_table').select('word, created_at').ilike('word', word).limit(1)
	]);

	if (existing.error) {
		return Response.json(
			{ error: 'Could not check your review list. Please try again.' },
			{ status: 500 }
		);
	}

	// The answer depends on the signed-in account's own list, so nothing about
	// it may be reused by a shared cache.
	setHeaders({ 'cache-control': 'no-store' });

	return Response.json({
		word,
		translations,
		existing: existing.data?.[0] ?? null
	});
};
