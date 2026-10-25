import { json } from '@sveltejs/kit';
import { load } from 'cheerio';
import type { RequestHandler } from './$types';

/**
 * Windows Spotlight behind `/api/spotlight`.
 *
 * Each image page ends with a "related posts" list, so the walk follows a random
 * one instead of crawling the index: one request per change. A visit's first
 * click sends `?start` and reads 28991 again, so the app always opens on the same
 * frame as the old route did.
 */

const SITE = 'https://windows10spotlight.com';
const START_INDEX = '28991';
const UPSTREAM_TIMEOUT_MS = 8_000;

/** The page read by the next request; `?start` rewinds it to the first image. */
let index = START_INDEX;

/** Shown until the upstream answers, and whenever it does not. */
const FALLBACK = {
	url: '',
	title: 'Stunning Icelandic region of volcanoes, beaches, and glaciers.',
	place: 'Snæfellsnes peninsula, Iceland'
};

export const GET: RequestHandler = async ({ fetch, setHeaders, url }) => {
	setHeaders({ 'cache-control': 'no-store' });

	const page = url.searchParams.has('start') ? START_INDEX : index;

	try {
		const response = await fetch(`${SITE}/images/${page}`, {
			headers: {
				accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
				'cache-control': 'no-cache',
				'user-agent': 'Mozilla/5.0 (compatible; svelte-opencode/1.0)'
			},
			signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
		});

		if (!response.ok) return json(FALLBACK);

		const $ = load(await response.text());
		const text = (selector: string) =>
			$(selector).first().text().replace(/\s+/g, ' ').trim();

		const href = $('.entry a').first().attr('href');
		const image = {
			url: href ? new URL(href, SITE).href : '',
			title: text('h1'),
			place: text('.date')
		};

		if (!image.url) return json(FALLBACK);

		// The next page comes from this one, so the walk never reads the index.
		const related = $('.relatedposts a').toArray();
		const picked = related[Math.floor(Math.random() * related.length)];
		const next = picked ? $(picked).attr('href')?.split('/').pop() : undefined;
		if (next) index = next;

		return json(image);
	} catch {
		return json(FALLBACK);
	}
};
