import { load } from 'cheerio';
import { DEFAULT_ART } from '#lib/art.ts';
import type { ArtImage } from '#lib/types.ts';

/**
 * DailyArt behind `/api/art` (`$lib/server`).
 *
 * The magazine has no feed: each painting's page ends with a few "also on
 * DailyArt" tiles. The first read of a visit is always The Idyll; after that
 * the walk follows a random tile from the page it just read, so the sequence
 * is The Idyll, then a random painting, then another, without crawling the
 * whole site.
 */

const START_URL = 'https://www.getdailyart.com/en/24707/mykola-pymonenko/the-idyll';

/** An upstream that has not answered by now is treated as unavailable. */
const UPSTREAM_TIMEOUT_MS = 8_000;

/** The page read by the next request; `/art` walks forward one link per call. */
let nextUrl = START_URL;

/**
 * Image URLs arrive as `src` or `srcset`; take the first candidate and make it
 * absolute, so a protocol-relative or root-relative one still loads here.
 */
function imageUrl(value: string | undefined, base: string): string {
	const first = value?.trim().split(/\s+/)[0]?.replace(/,$/, '');
	if (!first) return '';

	try {
		return new URL(first, base).href;
	} catch {
		return '';
	}
}

export async function getDailyArt(
	fetchFn: typeof fetch = fetch,
	{ start = false }: { start?: boolean } = {}
): Promise<ArtImage> {
	// `start` is sent by the first request of a visit: it reads The Idyll again
	// instead of continuing wherever the previous visit left the walk.
	const pageUrl = start ? START_URL : nextUrl;

	try {
		const response = await fetchFn(pageUrl, {
			headers: {
				accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
				'cache-control': 'no-cache',
				'user-agent': 'Mozilla/5.0 (compatible; svelte-opencode/1.0)'
			},
			signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
		});

		if (!response.ok) return DEFAULT_ART;

		const $ = load(await response.text());
		const text = (selector: string) =>
			$(selector).first().text().replace(/\s+/g, ' ').trim();

		const art: ArtImage = {
			mainImage: imageUrl($('.main-image img').attr('srcset'), pageUrl),
			shareDate: text('.main-description__share-date'),
			title: text('.main-description__title'),
			attr: text('.main-description__attr'),
			authorImage: imageUrl($('.main-description__author img').attr('src'), pageUrl),
			author: text('.main-description__author'),
			authorYears: text('.main-description__author-years'),
			// Paragraph text only: the caption is third-party markup, and the page
			// renders it as text rather than handing it to `{@html}`.
			content: $('.main-description__text-content p')
				.map((_, paragraph) => $(paragraph).text().replace(/\s+/g, ' ').trim())
				.get()
				.filter(Boolean)
		};

		if (!art.mainImage || !art.title) return DEFAULT_ART;

		const also = $('.also__item a').toArray();
		const picked = also[Math.floor(Math.random() * also.length)];
		const href = picked ? $(picked).attr('href') : undefined;
		if (href) {
			try {
				nextUrl = new URL(href, pageUrl).href;
			} catch {
				// Keep the current page as the next one rather than breaking the walk.
			}
		}

		return art;
	} catch {
		return DEFAULT_ART;
	}
}
