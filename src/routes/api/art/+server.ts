import { json } from '@sveltejs/kit';
import { getDailyArt } from '#lib/server/dailyart.ts';
import type { RequestHandler } from './$types';

/**
 * The next painting in the DailyArt walk. `?start` reads The Idyll, the first
 * painting of every visit; without it the walk continues from the last page
 * read. Each call advances the server's pointer, so the answer is never cached.
 */
export const GET: RequestHandler = async ({ fetch, setHeaders, url }) => {
	setHeaders({ 'cache-control': 'no-store' });
	return json(await getDailyArt(fetch, { start: url.searchParams.has('start') }));
};
