import { SECRET_FIRECRAWL_KEY } from '$app/env/private';

/**
 * Fetches a page as HTML through Firecrawl, the renderer the old app used for
 * Goodreads (which blocks plain requests). `SECRET_FIRECRAWL_KEY` is optional;
 * without it the book lookup is skipped.
 */
const MAX_AGE_MS = 1000 * 60 * 60 * 48;

export async function getHtml(pageUrl: string): Promise<string> {
	if (!SECRET_FIRECRAWL_KEY) {
		throw new Error('SECRET_FIRECRAWL_KEY is not set');
	}

	const response = await fetch('https://api.firecrawl.dev/v2/scrape', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${SECRET_FIRECRAWL_KEY}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			url: pageUrl,
			onlyMainContent: false,
			maxAge: MAX_AGE_MS,
			parsers: ['pdf'],
			formats: ['html']
		})
	});

	if (response.status !== 200) {
		throw new Error(`Firecrawl responded with ${response.status}`);
	}

	const payload = (await response.json()) as { data?: { html?: unknown } };
	const html = payload.data?.html;

	if (typeof html !== 'string' || html.length === 0) {
		throw new Error(`Firecrawl returned no HTML for ${pageUrl}`);
	}

	return html;
}
