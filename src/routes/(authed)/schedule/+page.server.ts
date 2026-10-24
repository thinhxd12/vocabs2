import { error, fail, redirect } from '@sveltejs/kit';
import { isValid, parseISO } from 'date-fns';
import { v7 as uuidv7 } from 'uuid';
import { readerToday, readBlock, slotDate } from '#lib/server/schedule.ts';
import type { Actions, PageServerLoad } from './$types';

/** Rows of `progress_table` shown per page. */
const PAGE_SIZE = 5;

/** Rows one "Create schedule" lays down: one slot a day, six days. */
const SEED_ROWS = 6;

/** A day holds a single slot, so a day's rows are its whole schedule. */
const SLOTS_PER_DAY = 1;

/** `YYYY-MM-DD`, the shape both the column and `<input type="date">` use. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type ProgressRow = {
	id: string;
	start_date: string;
	end_date: string;
};

/** One `schedule_table` row as the edit form sees it. */
export type ScheduleSlot = {
	id: string;
	/** The day the slot covers, or `null` while the column has no value. */
	date: string | null;
	count: number;
};

/** Today's slots, with the counts around them. */
export type SchedulePanel = {
	slots: ScheduleSlot[];
	/** Rows in the table. */
	total: number;
	/** The reader's own date, so the card can name the day it is working on. */
	today: string;
	/** Reviews counted into each dated day, keyed `YYYY-MM-DD`. */
	counts: Record<string, number>;
};

export const load: PageServerLoad = async ({ url, locals }) => {
	const { supabase } = locals;

	const requested = Number(url.searchParams.get('page'));
	const page = Number.isInteger(requested) && requested > 0 ? requested : 1;

	// Pages are measured back from the end of the table, so the window can't be
	// worked out until the row count is known. The count is head-only, so this
	// costs one header round-trip and transfers no rows.
	const { count, error: countError } = await supabase
		.from('progress_table')
		.select('id', { head: true, count: 'exact' });

	if (countError) {
		error(500, 'Could not load progress.');
	}

	const total = count ?? 0;
	const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

	// A stale or hand-typed link can point past the end. Normalise it to the
	// real last page rather than rendering an empty list under a page count
	// that disagrees with it.
	if (page > pageCount) {
		const target = new URL(url);
		target.searchParams.set('page', String(pageCount));
		redirect(307, `${target.pathname}${target.search}`);
	}

	// The window runs from the last page backwards, so page 1 is the newest
	// slice and the final page is the oldest. The short page is therefore the
	// one at the top of the table: with 8 rows and a page size of 5, page 1
	// shows 3 rows while the last page shows a full 5.
	//
	// `id` is the primary key (a v7 uuid), so ordering by it ascends through
	// time and the fixed `range()` windows tile the table with no row shown
	// twice or skipped.
	const from = (pageCount - page) * PAGE_SIZE;
	const to = from + PAGE_SIZE - 1;

	const { data, error: queryError } = await supabase
		.from('progress_table')
		.select('id, start_date, end_date')
		.order('id', { ascending: true })
		.range(from, to);

	if (queryError) {
		error(500, 'Could not load progress.');
	}

	return {
		rows: (data ?? []) as ProgressRow[],
		page,
		pageCount,
		pageSize: PAGE_SIZE,
		offset: from,
		total,
		schedule: await loadSchedule(locals)
	};
};

/**
 * The slots the edit form works on: today's, and only today's — plus the count
 * of every dated day, for the calendar.
 *
 * `schedule_table.date` is a plain day, and the day that counts is the reader's,
 * so "today" is resolved in the zone their browser reported rather than the
 * server's — otherwise a reader east of the server would find their own day's
 * rows missing.
 *
 * Rows come back in `id` order (a v7 uuid, so insertion order), which is the
 * order the reviewer counts them in. Stored values are normalised here:
 * `numeric` arrives as a string, and a timestamp-shaped `date` is cut down to
 * the `YYYY-MM-DD` an `<input type="date">` accepts.
 */
async function loadSchedule(locals: App.Locals): Promise<SchedulePanel> {
	const today = await readerToday(locals);
	const { block, error: blockError } = await readBlock(locals);

	if (blockError) {
		error(500, 'Could not load the schedule.');
	}

	const dated = block.map((row) => ({ row, date: slotDate(row) })).filter((slot) => slot.date);

	const counts: Record<string, number> = {};
	for (const { row, date } of dated) counts[date] = Number(row.count) || 0;

	return {
		slots: dated
			.filter(({ date }) => date === today)
			.slice(0, SLOTS_PER_DAY)
			.map(({ row, date }) => ({
				id: row.id,
				date,
				count: Number(row.count) || 0
			})),
		total: block.length,
		today,
		counts
	};
}

export const actions: Actions = {
	/**
	 * Replaces the schedule with a fresh block of slots: six rows, one a day for
	 * six days, with no date and no count. The rows already in the table go
	 * first — `id` is what the reviewer counts a day by, so leaving them behind
	 * would keep the old block in play. Which day a slot belongs to is set
	 * later: the editor only ever shows the rows already dated today.
	 */
	create: async ({ locals: { supabase } }) => {
		// RLS scopes both writes to the account. `not id is null` is the widest
		// filter the client accepts: it matches every row the account can see.
		const { error: clearError } = await supabase
			.from('schedule_table')
			.delete()
			.not('id', 'is', null);

		if (clearError) {
			return fail(500, {
				scope: 'create',
				error: 'Could not clear the old schedule.'
			});
		}

		// The reviewer reads a day's slots in `id` order, so each row is given a
		// v7 uuid — time-ordered, so the block keeps the order it was laid down
		// in even if the table has no default of its own.
		const rows = Array.from({ length: SEED_ROWS }, () => ({
			id: uuidv7(),
			date: null,
			count: 0
		}));

		const { error: insertError } = await supabase.from('schedule_table').insert(rows);

		if (insertError) {
			return fail(500, { scope: 'create', error: 'Could not create the schedule.' });
		}

		return { scope: 'create', error: '' };
	},

	/**
	 * Saves the slots on screen — today's rows: the day each one covers and the
	 * reviews it holds. `id`, `date` and `count` arrive as parallel lists in
	 * slot order, since every field appears once per row.
	 */
	edit: async ({ request, locals: { supabase } }) => {
		const submitted = await request.formData();
		const ids = submitted.getAll('id').map((value) => String(value).trim());
		const dates = submitted.getAll('date').map((value) => String(value).trim());
		const counts = submitted.getAll('count').map((value) => String(value).trim());
		const state = { scope: 'edit', error: '', field: '' };
		const slots = ids.length;

		// The three lists are written row by row, so they have to line up, and a
		// day holds a single slot.
		if (
			slots < 1 ||
			slots > SLOTS_PER_DAY ||
			dates.length !== slots ||
			counts.length !== slots
		) {
			return fail(400, { ...state, error: 'Send the slots together.' });
		}

		if (ids.some((id) => id.length === 0)) {
			return fail(400, { ...state, error: 'Those slots are no longer available.' });
		}

		const badDate = dates.findIndex((date) => !ISO_DATE.test(date) || !isValid(parseISO(date)));

		if (badDate !== -1) {
			return fail(400, { ...state, error: 'Pick a date for each slot.', field: `date-${badDate}` });
		}

		// A count is a whole number of reviews; how many a slot takes is the
		// reviewer's business, so no ceiling is imposed here.
		const badCount = counts.findIndex((count) => !/^\d+$/.test(count));

		if (badCount !== -1) {
			return fail(400, {
				...state,
				error: 'Counts are whole numbers, zero or more.',
				field: `count-${badCount}`
			});
		}

		// Every row goes at once. `select` makes a write that RLS filtered out —
		// or a slot someone else has since removed — come back empty rather than
		// silently succeed.
		const writes = await Promise.all(
			ids.map((id, slot) =>
				supabase
					.from('schedule_table')
					.update({ date: dates[slot], count: Number(counts[slot]) })
					.eq('id', id)
					.select('id')
			)
		);

		if (writes.some(({ error: writeError }) => writeError)) {
			return fail(500, { ...state, error: 'Could not save the schedule.' });
		}

		if (writes.some(({ data }) => (data ?? []).length === 0)) {
			return fail(404, { ...state, error: 'That slot no longer exists.' });
		}

		return { ...state };
	}
};
