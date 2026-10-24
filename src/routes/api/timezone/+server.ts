import { getDashboard, invalidateDashboard } from '#lib/server/dashboard.ts';
import { localDate } from '#lib/server/time.ts';
import type { RequestHandler } from './$types';

/** Longer than any real IANA name, which keeps junk out of the column. */
const MAX_LENGTH = 64;

/** True when `Intl` can format in this zone, i.e. it is a name it knows. */
function isKnownTimeZone(value: unknown): value is string {
	if (typeof value !== 'string' || value.length === 0 || value.length > MAX_LENGTH) {
		return false;
	}

	try {
		new Intl.DateTimeFormat('en-GB', { timeZone: value });
		return true;
	} catch {
		return false;
	}
}

/** The slice of a PostgREST error this endpoint reads: the code, never the text. */
type WriteError = { code?: string } | null;

/**
 * True when the write failed only because the database has not been given the
 * `timezone` column yet.
 *
 * PostgREST names a column it cannot find in the payload as `PGRST204`, and one
 * it cannot find in a select or filter as `42703`. The payload here is just
 * `{ timezone }` and the only filter is `user`, which is an old column, so
 * either code means the same thing: there is nowhere to put the zone yet.
 *
 * `#lib/server/time.ts` already treats a zone that was never stored as "use the
 * server's day", the behaviour from before the column existed — so this is a
 * database that is one migration behind, not a request that failed. See
 * `readDashboard`, which is deliberately of the same mind about the read.
 */
function isMissingTimeZoneColumn(error: WriteError): boolean {
	return error?.code === 'PGRST204' || error?.code === '42703';
}

/**
 * Stores the browser's timezone against the account.
 *
 * Only the browser knows which zone the reader is in, and the server needs it to
 * work out the reader's own calendar day whenever it compares against a value in
 * Supabase that means a date — `schedule_table.date` today, other date columns
 * as they are added. It is the same idea as `fsrsparams`: one scalar the client
 * owns, kept on the account row for the server to read back.
 *
 * The layout posts this once per page load. An unchanged zone is not written
 * back, so the usual case costs one read and nothing else.
 *
 * Answers with `{ timezone, stored, date }`. `stored` is `false` when the zone could
 * not be written — a database without the column yet — which the caller can
 * ignore, since the app runs without a stored zone by using the server's day.
 * `date` is the reader's day in that zone, so the caller can tell whether the
 * page it just loaded was rendered for a different one.
 * A fault it *cannot* carry on past is still a 500.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = await request.json().catch(() => null);
	const timezone = (body as { timezone?: unknown } | null)?.timezone;

	if (!isKnownTimeZone(timezone)) {
		return Response.json({ error: 'Unknown timezone.' }, { status: 400 });
	}

	// The row is taken from the shared cache rather than queried here. This
	// endpoint runs once per page load, and the page that just loaded has already
	// pulled the record in — so the usual case costs no query at all.
	const { record } = await getDashboard(locals);

	if (!record) {
		return Response.json({ error: 'No dashboard record to update.' }, { status: 404 });
	}

	if (record.timezone === timezone) {
		return Response.json({ timezone, stored: true, date: localDate(timezone) });
	}

	const { error: writeError } = await locals.supabase
		.from('dashboard_table')
		.update({ timezone })
		.eq('user', record.user);

	if (writeError) {
		// Not every write error is this endpoint's failure. A schema that has no
		// `timezone` column cannot hold the zone, and never could: the reader's
		// day falls back to the server's (`#lib/server/time.ts`), which is how
		// every page worked before the column was added. Reporting that as a 500
		// would fail a page-load sync over a column that is simply not needed.
		if (isMissingTimeZoneColumn(writeError)) {
			return Response.json({ timezone, stored: false });
		}

		return Response.json({ error: 'Could not save the timezone.' }, { status: 500 });
	}

	// The account's cached row still carries the old zone.
	await invalidateDashboard(locals);

	return Response.json({ timezone, stored: true, date: localDate(timezone) });
};
