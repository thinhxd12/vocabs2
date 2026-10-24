import { error, fail } from '@sveltejs/kit';
import { format } from 'date-fns';
import { v7 as uuidv7 } from 'uuid';
import type { Actions, PageServerLoad } from './$types';

/** `YYYY-MM-DD`; anything else falls back to today. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A day as the browser's `<input type="date">` and Postgres `date` both spell it. */
export type DiaryEntry = {
	id: string;
	date: string;
	text: string;
};

/** `YYYY-MM-DD` for a `Date`, read in the server's own zone. */
function isoDate(value: Date) {
	return format(value, 'yyyy-MM-dd');
}

export const load: PageServerLoad = async ({ url, locals: { supabase } }) => {
	const today = isoDate(new Date());
	const requested = url.searchParams.get('date') ?? '';
	// No date in the URL means the reader just arrived: show today, and let the
	// client nudge this to its own local day if the server sits in another zone.
	const isDefault = !ISO_DATE.test(requested);
	// A hand-typed future date is pulled back to today; diaries only look back.
	const date = isDefault || requested > today ? today : requested;

	// Both reads are independent, so fire them together: one round trip instead
	// of two keeps picking a day in the calendar feeling immediate.
	//
	// - every day that already has an entry, ascending, which the page turns
	//   into a calendar that marks those days so the reader can open one rather
	//   than paging through them;
	// - the newest row for the day being edited (duplicates are rare).
	const [datedResult, entryResult] = await Promise.all([
		supabase
			.from('diary_table')
			.select('date')
			.order('date', { ascending: true }),
		supabase
			.from('diary_table')
			.select('id, date, text')
			.eq('date', date)
			.order('id', { ascending: false })
			.limit(1)
	]);

	if (datedResult.error) {
		error(500, 'Could not load the diary.');
	}

	if (entryResult.error) {
		error(500, 'Could not load this entry.');
	}

	// `date` has no unique constraint, so collapse it to one marker per day.
	const dates = [...new Set((datedResult.data ?? []).map((row) => row.date as string))];
	const rows = entryResult.data;

	return {
		entry: (rows?.[0] ?? null) as DiaryEntry | null,
		date,
		isDefault,
		today,
		// Ascending and deduped: the page marks these days in its calendar.
		dates
	};
};

export const actions: Actions = {
	/** Creates the entry for a day, or overwrites the one already there. */
	save: async ({ request, locals: { supabase } }) => {
		const form = await request.formData();
		const date = String(form.get('date') ?? '').trim();
		const text = String(form.get('text') ?? '').trim();
		const state = { scope: 'save', error: '', field: '' };

		if (!ISO_DATE.test(date)) {
			return fail(400, { ...state, error: 'Pick a valid date.', field: 'date' });
		}

		if (date > isoDate(new Date())) {
			return fail(400, { ...state, error: 'A diary cannot look into the future.', field: 'date' });
		}

		if (text.length === 0) {
			return fail(400, { ...state, error: 'Write something before saving.', field: 'text' });
		}

		if (text.length > 20000) {
			return fail(400, { ...state, error: 'That entry is too long to save.', field: 'text' });
		}

		// `date` is not unique, so update the newest row for the day when there
		// is one and insert otherwise. `id` is a v7 uuid like the rest of the
		// schema, so the table's PK needs no database default.
		const { data: existing, error: readError } = await supabase
			.from('diary_table')
			.select('id')
			.eq('date', date)
			.order('id', { ascending: false })
			.limit(1);

		if (readError) {
			return fail(500, { ...state, error: 'Could not load the entry.' });
		}

		const current = existing?.[0];
		const { error: writeError } = current
			? await supabase.from('diary_table').update({ text }).eq('id', current.id)
			: await supabase.from('diary_table').insert({ id: uuidv7(), date, text });

		if (writeError) {
			return fail(500, { ...state, error: 'Could not save the entry.' });
		}

		return state;
	},

	/** Removes every row stored for a day, so the day goes back to blank. */
	delete: async ({ request, locals: { supabase } }) => {
		const form = await request.formData();
		const date = String(form.get('date') ?? '').trim();
		const state = { scope: 'delete', error: '', field: '' };

		if (!ISO_DATE.test(date)) {
			return fail(400, { ...state, error: 'Pick a valid date.', field: 'date' });
		}

		const { error: deleteError } = await supabase
			.from('diary_table')
			.delete()
			.eq('date', date);

		if (deleteError) {
			return fail(500, { ...state, error: 'Could not delete the entry.' });
		}

		return state;
	}
};
