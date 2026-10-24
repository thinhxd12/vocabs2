/**
 * Calendar days, as the reader's own zone sees them.
 *
 * `schedule_table.date` is a plain day, and the only "today" that means anything
 * is the reader's: a server on UTC rolls the day over eight hours away from
 * someone in Tokyo, so the reviews they save would be counted against the wrong
 * day's rows. The reader's zone is reported by their browser and stored against
 * the account (see `/api/timezone`), then read back here.
 *
 * The zone is only ever an optimisation for the reader's convenience — a missing
 * or unrecognised one falls back to the server's, which is what every page did
 * before zones were stored at all.
 */

/** `YYYY-MM-DD`, the shape `schedule_table.date` holds. */
export function isoDate(value: Date) {
	const year = value.getFullYear();
	const month = String(value.getMonth() + 1).padStart(2, '0');
	const day = String(value.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/**
 * `YYYY-MM-DD` in `timeZone` — the reader's day for the moment `at` — falling
 * back to the server's zone when the account has not reported one yet, or has
 * reported one `Intl` does not know.
 *
 * The parts are assembled by hand rather than formatted with a locale, so the
 * output cannot drift into `DD/MM/YYYY` on some other runtime.
 */
export function localDate(timeZone: string | null | undefined, at: Date = new Date()) {
	if (!timeZone) return isoDate(at);

	try {
		const parts = new Intl.DateTimeFormat('en-GB', {
			timeZone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		}).formatToParts(at);

		const part = (type: string) => parts.find((candidate) => candidate.type === type)?.value ?? '';

		return `${part('year')}-${part('month')}-${part('day')}`;
	} catch {
		// `Intl` throws on a zone it does not recognise: the server's day stands.
		return isoDate(at);
	}
}
