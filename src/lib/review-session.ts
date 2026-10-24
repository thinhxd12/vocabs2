/**
 * The review session — the batch the reader is part-way through — remembered
 * across visits to other pages.
 *
 * A batch is built once (twelve cards, say) and then graded one card at a time.
 * Rebuilding it on the next visit does *not* give the same batch back: the cards
 * already answered have been scheduled forward and left the queue, so a fresh
 * build is shifted by however many were answered, and the reader who was at 3/12
 * is handed a different 12 cards at 0/12.
 *
 * So the batch's *remaining* cards ride in a cookie. The page's server load
 * rebuilds the same batch from those ids — same cards, same order, previews
 * measured against the new request's clock — and the reader resumes at the
 * progress they had reached. The client writes the cookie the moment a card is
 * turned, so the optimistic turn and the stored session agree; the server only
 * reads it (and clears it when a batch is started over).
 *
 * The value is deliberately plain ASCII — `v1.<graded>.<total>.<id>.<id>…` —
 * with no JSON and no percent-encoding: SvelteKit's `cookies.get` hands back the
 * raw string, while `cookies.set` encodes what it is given, and this cookie is
 * written by the browser as well. One unencoded format reads the same from both
 * ends.
 */
export const SESSION_COOKIE = 'fsrs_session';

/**
 * How long an unfinished batch is remembered. Its steps are minutes, not days,
 * so a day is generous — and an old batch is not resurrected tomorrow.
 */
export const SESSION_MAX_AGE = 60 * 60 * 24;

export type ReviewSession = {
	/** Cards graded so far — the progress the batch already made. */
	graded: number;
	/** The batch's size when it was built. */
	total: number;
	/** Cards still to grade, in the batch's order. */
	ids: string[];
};

const VERSION = 'v1';
/** Ids are uuids, so `.` is safe as the delimiter. */
const SEPARATOR = '.';
/** Anything URL- and separator-safe: uuid v7 today, a legacy id tomorrow. */
const ID = /^[A-Za-z0-9_-]+$/;
/** The largest batch `?n=` accepts; a longer cookie is not one of ours. */
const MAX_IDS = 99;

export function encodeSession({ graded, total, ids }: ReviewSession): string {
	return [VERSION, graded, total, ...ids].join(SEPARATOR);
}

/**
 * The session a cookie holds, or `null` for anything that is not one of ours —
 * a stale format, a tampered value, a cookie from another app on the same host.
 * A bad cookie must read as "no session" so the page simply builds a fresh
 * batch instead of trusting it.
 */
export function decodeSession(raw: string | undefined): ReviewSession | null {
	if (!raw) return null;

	const [version, gradedText, totalText, ...ids] = raw.split(SEPARATOR);
	if (version !== VERSION) return null;

	const graded = Number(gradedText);
	const total = Number(totalText);

	if (!Number.isInteger(graded) || graded < 0 || graded > MAX_IDS) return null;
	if (!Number.isInteger(total) || total < graded || total > MAX_IDS) return null;
	if (ids.length > MAX_IDS) return null;
	if (!ids.every((id) => ID.test(id))) return null;

	return { graded, total: Math.max(total, graded + ids.length), ids };
}
