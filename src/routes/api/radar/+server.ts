import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Same-origin CORS endpoint for the national radar mosaic.
 *
 * The frames are published by Hymetnet over plain HTTP, so a page served over
 * HTTPS cannot load them directly (mixed content), and a canvas/WebGL texture
 * needs an image the browser is allowed to read. Fetching the frame here and
 * streaming it back from our own origin solves both problems: the browser only
 * ever talks to `/api/radar`.
 *
 * `/api/radar?t=202610211130` returns the 11:30 UTC frame. Only the timestamp
 * is accepted — never a free-form URL — so the route cannot be used as an open
 * proxy.
 */

const UPSTREAM = 'http://hymetnet.gov.vn/dataout_web/COM';

/** `YYYYMMDDHHmm`, the only thing callers may specify. */
const TIME = /^\d{12}$/;

/** How long an archived frame may be cached. Frames never change once written. */
const CACHE_SECONDS = 86_400;

const CORS = {
	'access-control-allow-origin': '*',
	'access-control-allow-methods': 'GET, HEAD, OPTIONS',
	'cross-origin-resource-policy': 'cross-origin'
} as const;

/** Rejects impossible dates instead of asking upstream for them. */
function isRealStamp(stamp: string): boolean {
	const year = Number(stamp.slice(0, 4));
	const month = Number(stamp.slice(4, 6));
	const day = Number(stamp.slice(6, 8));
	const hour = Number(stamp.slice(8, 10));
	const minute = Number(stamp.slice(10, 12));
	const date = new Date(Date.UTC(year, month - 1, day, hour, minute));

	return (
		date.getUTCFullYear() === year &&
		date.getUTCMonth() === month - 1 &&
		date.getUTCDate() === day &&
		date.getUTCHours() === hour &&
		date.getUTCMinutes() === minute
	);
}

function frameUrl(url: URL): string {
	const stamp = url.searchParams.get('t') ?? '';

	if (!TIME.test(stamp) || !isRealStamp(stamp)) {
		error(400, 'Expected "t" as a UTC timestamp in YYYYMMDDHHmm form');
	}

	const folder = stamp.slice(0, 8);
	return `${UPSTREAM}/${folder}/COM_${stamp}_CMAX00.png`;
}

async function loadFrame(fetchFn: typeof globalThis.fetch, target: string): Promise<Response> {
	let upstream: Response;
	try {
		upstream = await fetchFn(target, {
			headers: {
				accept: 'image/png,image/*;q=0.8',
				// The archive occasionally answers a bare client with an error page.
				'user-agent': 'Mozilla/5.0 (compatible; sv-weather-radar/1.0)'
			},
			signal: AbortSignal.timeout(8_000)
		});
	} catch {
		return errorResponse(504, 'The radar server did not answer in time');
	}

	const type = upstream.headers.get('content-type') ?? '';
	if (!upstream.ok || !upstream.body || !type.startsWith('image/')) {
		// Consume the body so the connection can be reused by the runtime.
		await upstream.body?.cancel();
		return errorResponse(502, 'The radar frame is not available');
	}

	return new Response(upstream.body, {
		status: 200,
		headers: {
			...CORS,
			'content-type': type,
			'cache-control': `public, max-age=${CACHE_SECONDS}, immutable`,
			'x-content-type-options': 'nosniff'
		}
	});
}

/** `error()` cannot be used in a `try`/`catch` helper, so build the response. */
function errorResponse(status: number, message: string): Response {
	return new Response(message, {
		status,
		headers: { ...CORS, 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
	});
}

export const GET: RequestHandler = ({ url, fetch }) => loadFrame(fetch, frameUrl(url));

export const HEAD: RequestHandler = async ({ url, fetch }) => {
	const response = await loadFrame(fetch, frameUrl(url));
	await response.body?.cancel();
	return new Response(null, { status: response.status, headers: response.headers });
};

export const OPTIONS: RequestHandler = () =>
	new Response(null, { status: 204, headers: CORS });
