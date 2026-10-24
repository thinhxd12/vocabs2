import { getTranslation } from '#lib/server/translate.ts';
import type { RequestHandler } from './$types';

/**
 * Thin HTTP adapter over `getTranslation`: `[{ partOfSpeech, translation }, …]`.
 *
 * A word's translations never change, so a hit is cached hard. An empty answer
 * is cached only briefly: it is usually a word the dictionary does not carry,
 * but it can also be an upstream blip, and that must not stick for a day.
 */
export const GET: RequestHandler = async ({ url, fetch, setHeaders }) => {
	const word = (url.searchParams.get('word') ?? '').trim().slice(0, 100);
	if (!word) return Response.json([], { status: 400 });

	// Prefetches and clicks for the same word share one upstream lookup.
	const translations = await getTranslation(word, fetch);

	setHeaders({
		'cache-control': translations.length
			? 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400'
			: 'public, max-age=300'
	});

	return Response.json(translations);
};
