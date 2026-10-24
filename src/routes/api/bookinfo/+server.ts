import { json } from '@sveltejs/kit';
import { load } from 'cheerio';
import { getHtml } from '#lib/server/firecrawl.ts';
import type { BookDetail } from '#lib/types.ts';
import type { RequestHandler } from './$types';

const GOODREADS = 'https://www.goodreads.com';

/** One row of a Goodreads search result, before the detail page is read. */
type Candidate = {
	index: number;
	bookId: string;
	title: string;
	authors: string[];
	numberOfRatings: number;
};

/**
 * The old `/server/getbookinfo` route: Goodreads is searched by title, then the
 * detail page is parsed for the cover, rating, blurb, etc. Goodreads blocks
 * plain requests, so the pages come through Firecrawl.
 */
function buildSearchUrl(query: string) {
	const params = new URLSearchParams({
		utf8: '✓',
		q: query,
		search_type: 'books'
	});

	return `${GOODREADS}/search?${params}`;
}

function normalize(value: string) {
	return value
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

/**
 * Goodreads renders counts as "1.3 million ratings" for screen readers and as
 * "1.3m ratings" visually. Both abbreviate, so parse the unit instead of
 * dropping the letters.
 */
function parseCount(value: string): number {
	const match = value.toLowerCase().match(/([\d.,]+)\s*(million|thousand|m|k)?\s*ratings/);
	if (!match) return 0;

	const amount = Number(match[1].replace(/,/g, ''));
	if (!Number.isFinite(amount)) return 0;

	switch (match[2]) {
		case 'million':
		case 'm':
			return Math.round(amount * 1_000_000);
		case 'thousand':
		case 'k':
			return Math.round(amount * 1_000);
		default:
			return Math.round(amount);
	}
}

/**
 * Goodreads returns close matches (summaries, study guides, other editions) in
 * relevance order. Rank them by title and author so the actual book wins.
 */
function scoreCandidate(candidate: Candidate, query: string, author: string) {
	const title = normalize(candidate.title);
	const wantedTitle = normalize(query);
	const titleBase = title.split(':')[0].trim();

	let score = 0;

	if (title === wantedTitle || titleBase === wantedTitle) score += 100;
	else if (title.startsWith(`${wantedTitle} `)) score += 60;
	else if (title.includes(wantedTitle)) score += 20;

	if (author.length > 0) {
		const wantedAuthor = normalize(author);
		const lastName = wantedAuthor.split(' ').pop() ?? '';
		const candidateAuthor = normalize(candidate.authors.join(' '));

		if (candidateAuthor.includes(wantedAuthor)) score += 50;
		else if (lastName.length > 2 && candidateAuthor.includes(lastName)) score += 30;
	}

	return score;
}

async function searchGoodreads(query: string, author: string): Promise<BookDetail | null> {
	const html = await getHtml(buildSearchUrl(query));

	const $ = load(html);
	const candidates: Candidate[] = [];

	$('div.Book').each((index, element) => {
		const $book = $(element);
		const link = $book
			.find('[data-testid="book-item-title"] a, .Text__title3 a, .BookTitle')
			.first();

		const href = link.attr('href') ?? $book.find('.BookCard__stretchedLink').attr('href') ?? '';
		const bookId = href.match(/\/book\/show\/(\d+)/)?.[1];
		if (!bookId) return;

		const title =
			link.text().replace(/\s+/g, ' ').trim() ||
			$book.find('.BookCard__stretchedLink').attr('aria-label')?.trim() ||
			'';

		const authors = $book
			.find(
				'[data-testid="book-item-contributors"] .ContributorLink__name, .BookAuthors .ContributorLink__name'
			)
			.map((_, name) => $(name).text().replace(/\s+/g, ' ').trim())
			.get()
			.filter(Boolean);

		if (authors.length === 0) {
			const authorText = $book
				.find('.BookAuthors, [data-testid="book-item-contributors"]')
				.first()
				.text()
				.replace(/^by\s+/i, '')
				.replace(/\s+/g, ' ')
				.trim();
			if (authorText) authors.push(authorText);
		}

		const stats =
			$book.find('.BookStats .u-sr-only').first().text() ||
			$book.find('.BookStats__counts').first().text();

		candidates.push({
			index,
			bookId,
			title,
			authors,
			numberOfRatings: parseCount(stats)
		});
	});

	if (candidates.length === 0) return null;

	candidates.sort(
		(a, b) =>
			scoreCandidate(b, query, author) - scoreCandidate(a, query, author) ||
			b.numberOfRatings - a.numberOfRatings ||
			a.index - b.index
	);

	return parseBookDetails(await getHtml(`${GOODREADS}/book/show/${candidates[0].bookId}`));
}

function parseBookDetails(html: string): BookDetail {
	const $ = load(html);

	const detail: BookDetail = {
		title: null,
		authors: [],
		coverImage: null,
		rating: null,
		numberOfRatings: null,
		numberOfReviews: null,
		series: null,
		genres: [],
		description: null,
		firstPublished: null,
		numberOfPages: null
	};

	const titleSection = $('.BookPageTitleSection__title');
	detail.title =
		$('[data-testid="bookTitle"]').first().text().trim() ||
		titleSection.find('h1').first().text().trim() ||
		null;

	const series = titleSection.find('h3.Text__italic a').first().text().replace(/\s+/g, ' ').trim();
	if (series) detail.series = series;

	// Prefer the name element: `.ContributorLink` also contains the role, e.g.
	// "(Editor)", which does not belong in the author list.
	$('.ContributorLinksList .ContributorLink__name').each((_, element) => {
		const name = $(element).text().replace(/\s+/g, ' ').trim();
		if (name) detail.authors.push(name);
	});

	if (detail.authors.length === 0) {
		$('.ContributorLinksList .ContributorLink').each((_, element) => {
			const name = $(element).text().replace(/\s+/g, ' ').trim();
			if (name) detail.authors.push(name);
		});
	}

	detail.rating = $('.RatingStatistics__rating').first().text().trim() || null;

	const ratingsAndReviews = $('.RatingStatistics__meta').first().text().trim();
	detail.numberOfRatings =
		ratingsAndReviews.match(/(\d+(?:,\d+)*)\s+ratings/)?.[1]?.replace(/,/g, '') ?? null;
	detail.numberOfReviews =
		ratingsAndReviews.match(/(\d+(?:,\d+)*)\s+reviews/)?.[1]?.replace(/,/g, '') ?? null;

	detail.coverImage =
		$('.BookCover__image img.ResponsiveImage').first().attr('src') ??
		$('.BookCover__image img').first().attr('src') ??
		null;

	$('.BookPageMetadataSection__genres .Button__labelItem').each((_, element) => {
		const genre = $(element).text().replace(/\s+/g, ' ').trim();
		if (genre && !/^(\.\.\.|…)more$/.test(genre)) detail.genres.push(genre);
	});

	const description =
		$('.BookPageMetadataSection__description .TruncatedContent__text').first().text().trim() ||
		$('[data-testid="description"] .TruncatedContent__text').first().text().trim();
	if (description) detail.description = description;

	const pagesFormat = $('p[data-testid="pagesFormat"]').first().text().trim();
	detail.numberOfPages = pagesFormat.match(/(\d+)\s*pages/)?.[1] ?? null;

	const publicationInfo = $('p[data-testid="publicationInfo"]').first().text().trim();
	detail.firstPublished =
		publicationInfo.match(/First published\s+(.+)/)?.[1]?.trim() ?? null;

	return detail;
}

export const GET: RequestHandler = async ({ url, setHeaders }) => {
	// `query` is the old route's parameter; `title` keeps older bookmarks of
	// this page working.
	const query = (url.searchParams.get('query') ?? url.searchParams.get('title') ?? '').trim();
	const author = (url.searchParams.get('author') ?? '').trim();

	if (query.length === 0) return json(null);

	try {
		const detail = await searchGoodreads(query, author);

		if (!detail) return json(null);

		// A catalogue record barely changes; a day of browser caching is enough.
		setHeaders({ 'cache-control': 'public, max-age=86400' });

		return json(detail);
	} catch (error) {
		console.error('[bookinfo] lookup failed', error);
		return json(null);
	}
};
