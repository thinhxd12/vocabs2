import { error, fail } from '@sveltejs/kit';
import { parseKindleEntries, readKindleClipping } from '@darylserrano/kindle-clippings';
import { v7 as uuidv7 } from 'uuid';
import type { Highlight } from '#lib/types.ts';
import type { Actions, PageServerLoad } from './$types';

const FIELDS = 'id, authors, bookTile, content, dateOfCreation, like, location, page, type, note';

/** Talks to the same columns the old page did; a missing row is not an error. */
export const load: PageServerLoad = async ({ locals }) => {
	// The dashboard remembers the highlight the reader last opened. It is a
	// convenience, not the source of truth: a stale id falls through to the
	// newest bookmark instead of blanking the page.
	const { data: dashboards } = await locals.supabase
		.from('dashboard_table')
		.select('currentHighlightId')
		.limit(1);

	const currentId =
		(dashboards?.[0]?.currentHighlightId as string | null | undefined) ?? null;

	if (currentId) {
		const { data } = await locals.supabase
			.from('bookmark_table')
			.select(FIELDS)
			.eq('id', currentId)
			.maybeSingle();

		if (data) return { highlight: data as Highlight };
	}

	const { data, error: queryError } = await locals.supabase
		.from('bookmark_table')
		.select(FIELDS)
		.order('id', { ascending: false })
		.limit(1);

	if (queryError) {
		error(500, 'Could not load your highlights.');
	}

	return { highlight: (data?.[0] as Highlight | undefined) ?? null };
};

export const actions: Actions = {
	/** Saves the corrections made in the edit dialog. */
	editBookmark: async ({ request, locals }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '').trim();
		const bookTile = String(form.get('bookTile') ?? '').trim();
		const authors = String(form.get('authors') ?? '').trim();
		const dateOfCreation = String(form.get('dateOfCreation') ?? '').trim();
		const content = String(form.get('content') ?? '').trim();
		const like = Number(form.get('like'));

		const state = { scope: 'edit', error: '', message: '' };

		if (!id || !bookTile || !authors || !dateOfCreation || !content) {
			return fail(422, { ...state, error: 'Every field needs a value.' });
		}

		if (!Number.isFinite(like) || like < 0) {
			return fail(422, { ...state, error: 'Likes must be zero or more.' });
		}

		const { error: writeError } = await locals.supabase
			.from('bookmark_table')
			.update({ bookTile, authors, dateOfCreation, content, like })
			.eq('id', id);

		if (writeError) {
			return fail(500, { ...state, error: 'Could not save the highlight.' });
		}

		return { ...state, message: 'Highlight saved.' };
	},

	/** Parses a pasted Kindle `My Clippings.txt` and stores its highlights. */
	insertBookmark: async ({ request, locals }) => {
		const form = await request.formData();
		const content = String(form.get('content') ?? '');
		const state = { scope: 'insert', error: '', message: '' };

		if (content.trim().length === 0) {
			return fail(422, { ...state, error: 'Paste your Kindle clippings first.' });
		}

		// A whole year of clippings fits well under this; anything larger is not
		// a clippings file and should not be parsed on a worker-less request.
		if (content.length > 2_000_000) {
			return fail(413, { ...state, error: 'That clippings file is too large.' });
		}

		let entries: ReturnType<typeof parseKindleEntries>;

		try {
			entries = parseKindleEntries(readKindleClipping(content));
		} catch {
			return fail(422, { ...state, error: 'That text is not Kindle clippings.' });
		}

		if (entries.length === 0) {
			return fail(422, { ...state, error: 'No highlights found in that text.' });
		}

		const rows = entries.map((entry) => ({
			authors: entry.authors,
			bookTile: entry.bookTile,
			page: entry.page,
			location: entry.location,
			dateOfCreation: entry.dateOfCreation,
			content: entry.content,
			type: entry.type,
			id: uuidv7()
		}));

		const { error: writeError } = await locals.supabase
			.from('bookmark_table')
			.insert(rows);

		if (writeError) {
			return fail(500, { ...state, error: 'Could not import the highlights.' });
		}

		return {
			...state,
			message: `Imported ${rows.length} highlight${rows.length === 1 ? '' : 's'}.`
		};
	}
};
