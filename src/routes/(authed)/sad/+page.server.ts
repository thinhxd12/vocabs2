import { error, fail, redirect } from '@sveltejs/kit';
import { getDashboard } from '#lib/server/dashboard.ts';
import type { Actions, PageServerLoad } from './$types';

/** Rows of `saddays_table` shown per page. */
const PAGE_SIZE = 9;

/** One row: the moment it was marked, and that moment split for display. */
export type SadDay = {
	created_at: string;
	date: string;
	time: string;
};

/**
 * Formats `date` and `time` in the reader's stored zone — the one the schedule
 * already uses for its days — falling back to the server's. Built once per
 * request so every row is formatted with the same rules.
 */
function stamper(timeZone: string | null) {
	const options: Intl.DateTimeFormatOptions = {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: 'numeric',
		minute: '2-digit',
		hour12: true
	};

	try {
		return new Intl.DateTimeFormat('en-US', { ...options, timeZone: timeZone ?? undefined });
	} catch {
		// `Intl` throws on an unrecognised zone: the server's zone stands.
		return new Intl.DateTimeFormat('en-US', options);
	}
}

function part(parts: Intl.DateTimeFormatPart[], type: string) {
	return parts.find((candidate) => candidate.type === type)?.value ?? '';
}

export const load: PageServerLoad = async ({ url, locals }) => {
	const { supabase } = locals;

	const requested = Number(url.searchParams.get('page'));
	const page = Number.isInteger(requested) && requested > 0 ? requested : 1;

	// One round trip instead of a head-count followed by a window query: the
	// table holds one row per sad day, so reading it whole and slicing here is
	// cheaper than asking Postgres twice.
	// shortcut: past PostgREST's 1000-row cap the oldest rows stop paging; go
	// back to a count plus `range()` if the table ever grows that far.
	const [{ record }, read] = await Promise.all([
		getDashboard(locals),
		supabase
			.from('saddays_table')
			.select('created_at')
			.order('created_at', { ascending: false })
	]);

	if (read.error) {
		error(500, 'Could not load the sad days.');
	}

	const stamps: string[] = (read.data ?? []).map((row) => row.created_at);
	const total = stamps.length;

	// The short page is the first one, so every later page — the last included —
	// holds a full PAGE_SIZE. Page 1 still starts at the newest day.
	const head = total % PAGE_SIZE || PAGE_SIZE;
	const pageCount = total === 0 ? 1 : 1 + Math.ceil((total - head) / PAGE_SIZE);

	// A stale or hand-typed `?page=` past the end lands on the last page.
	if (page > pageCount) {
		const target = new URL(url);
		target.searchParams.set('page', String(pageCount));
		redirect(307, `${target.pathname}${target.search}`);
	}

	// Newest first: page 1 is the latest days, so a fresh row lands where the
	// reader is already looking. Each page then reads oldest → newest, so the
	// times run down the list the way a day runs.
	const size = page === 1 ? head : PAGE_SIZE;
	const offset = page === 1 ? 0 : head + (page - 2) * PAGE_SIZE;
	const format = stamper(locals.timeZone ?? record?.timezone ?? null);

	// Stamped here, in the reader's zone, so SSR and hydration agree and a
	// server on UTC cannot shift a late-evening row onto the next day.
	const rows: SadDay[] = stamps
		.slice(offset, offset + size)
		.reverse()
		.map((created_at) => {
			const at = new Date(created_at);
			if (Number.isNaN(at.getTime())) return { created_at, date: '', time: '' };

			const parts = format.formatToParts(at);
			return {
				created_at,
				date: `${part(parts, 'year')}-${part(parts, 'month')}-${part(parts, 'day')}`,
				time: `${part(parts, 'hour')}:${part(parts, 'minute')} ${part(parts, 'dayPeriod')}`
			};
		});

	return { rows, page, pageCount, total, offset };
};

export const actions: Actions = {
	/** One click, one row: the table's default supplies `created_at`. */
	add: async ({ locals }) => {
		const { error: writeError } = await locals.supabase.from('saddays_table').insert({});

		if (writeError) {
			return fail(500, { error: 'Could not add the day.' });
		}

		// The new row is the newest, so it lives on the first page.
		redirect(303, '/sad');
	},

	delete: async ({ request, locals }) => {
		const createdAt = String((await request.formData()).get('created_at') ?? '').trim();

		if (!createdAt) {
			return fail(400, { error: 'Pick a day to delete.' });
		}

		const { error: deleteError } = await locals.supabase
			.from('saddays_table')
			.delete()
			.eq('created_at', createdAt);

		if (deleteError) {
			return fail(500, { error: 'Could not delete that day.' });
		}

		return { error: '' };
	}
};
