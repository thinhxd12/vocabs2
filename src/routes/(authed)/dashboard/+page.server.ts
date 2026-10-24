import { error, fail } from '@sveltejs/kit';
import { isValid, parseISO } from 'date-fns';
import { v7 as uuidv7 } from 'uuid';
import {
	getDashboard,
	invalidateDashboard,
	type DashboardLocation,
	type DashboardProgress
} from '#lib/server/dashboard.ts';
import type { Actions, PageServerLoad } from './$types';

export type { DashboardLocation, DashboardProgress, DashboardRecord } from '#lib/server/dashboard.ts';

// Models the dashboard accepts, mirroring `modelList` in the page component.
const FORECAST_MODELS = new Set([
	'icon_seamless',
	'gfs_seamless',
	'ecmwf_ifs',
	'ukmo_seamless',
	'kma_seamless',
	'jma_seamless',
	'metno_seamless',
	'gem_seamless',
	'cma_grapes_global',
	'knmi_seamless',
	'dmi_seamless'
]);

export const load: PageServerLoad = async ({ locals }) => {
	const { record, error: queryError } = await getDashboard(locals);

	if (queryError) {
		error(500, 'Could not load dashboard data.');
	}

	return { record };
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Appends one entry to the `progress` jsonb array. The array lives inside the
 * single RLS-scoped dashboard row, so we read it, push, then write it back.
 * A second entry for the same date replaces the first, keeping the chart's
 * yearly axis free of duplicates.
 */
export const actions: Actions = {
	addProgress: async ({ request, locals }) => {
		const formData = await request.formData();
		const date = String(formData.get('date') ?? '').trim();
		const countRaw = String(formData.get('count') ?? '').trim();
		const count = Number(countRaw);

		// Echoed back so the form keeps what the user typed when it fails.
		// `field` tells the client which input the message belongs to.
		const state = {
			scope: 'progress',
			error: '',
			field: '',
			date,
			count: countRaw
		};

		if (!ISO_DATE.test(date) || !isValid(parseISO(date))) {
			return fail(400, { ...state, error: 'Pick a valid date.', field: 'date' });
		}

		if (countRaw === '' || !Number.isFinite(count) || count < 0) {
			return fail(400, {
				...state,
				error: 'Count must be 0 or more.',
				field: 'count'
			});
		}

		const { data: row, error: readError } = await locals.supabase
			.from('dashboard_table')
			.select('user, progress')
			.maybeSingle();

		if (readError) {
			return fail(500, { ...state, error: 'Could not load progress.' });
		}

		if (!row) {
			return fail(404, { ...state, error: 'No dashboard record to update.' });
		}

		const existing = Array.isArray(row.progress) ? (row.progress as DashboardProgress[]) : [];
		const next = [
			...existing.filter((entry) => entry.date !== date),
			{ id: uuidv7(), date, count: String(count) }
		].sort((a, b) => a.date.localeCompare(b.date));

		const { error: writeError } = await locals.supabase
			.from('dashboard_table')
			.update({ progress: next })
			.eq('user', row.user);

		if (writeError) {
			return fail(500, { ...state, error: 'Could not save the entry.' });
		}

		await invalidateDashboard(locals);

		// Empty date/count clears the fields for a follow-up entry.
		return { scope: 'progress', error: '', field: '', date: '', count: '' };
	},

	/**
	 * Stores the chosen forecast model on the RLS-scoped dashboard row.
	 */
	setForecastModel: async ({ request, locals }) => {
		const formData = await request.formData();
		const model = String(formData.get('model') ?? '').trim();
		const state = { scope: 'model', error: '', field: '' };

		if (!FORECAST_MODELS.has(model)) {
			return fail(400, { ...state, error: 'Unknown forecast model.' });
		}

		const { data: row, error: readError } = await locals.supabase
			.from('dashboard_table')
			.select('user')
			.maybeSingle();

		if (readError) {
			return fail(500, { ...state, error: 'Could not load the dashboard record.' });
		}

		if (!row) {
			return fail(404, { ...state, error: 'No dashboard record to update.' });
		}

		const { error: writeError } = await locals.supabase
			.from('dashboard_table')
			.update({ currentForecastModel: model })
			.eq('user', row.user);

		if (writeError) {
			return fail(500, { ...state, error: 'Could not save the forecast model.' });
		}

		await invalidateDashboard(locals);

		return { ...state };
	},

	/**
	 * Marks one stored location as the current one. The id must still exist in
	 * the `locations` array, which also guards against stale clicks.
	 */
	selectLocation: async ({ request, locals }) => {
		const formData = await request.formData();
		const id = String(formData.get('id') ?? '').trim();
		const state = { scope: 'locations', error: '', field: '' };

		const { data: row, error: readError } = await locals.supabase
			.from('dashboard_table')
			.select('user, locations')
			.maybeSingle();

		if (readError) {
			return fail(500, { ...state, error: 'Could not load locations.' });
		}

		if (!row) {
			return fail(404, { ...state, error: 'No dashboard record to update.' });
		}

		const existing = Array.isArray(row.locations)
			? (row.locations as DashboardLocation[])
			: [];

		if (!existing.some((location) => location.id === id)) {
			return fail(400, { ...state, error: 'That location no longer exists.' });
		}

		const { error: writeError } = await locals.supabase
			.from('dashboard_table')
			.update({ currentLocationId: id })
			.eq('user', row.user);

		if (writeError) {
			return fail(500, { ...state, error: 'Could not set the current location.' });
		}

		await invalidateDashboard(locals);

		return { ...state };
	},

	/**
	 * Appends a new location to the `locations` jsonb array.
	 */
	addLocation: async ({ request, locals }) => {
		const formData = await request.formData();
		const name = String(formData.get('name') ?? '').trim();
		const latitude = Number(String(formData.get('latitude') ?? '').trim());
		const longitude = Number(String(formData.get('longitude') ?? '').trim());
		const state = { scope: 'locations', error: '', field: '' };

		if (name.length === 0) {
			return fail(400, { ...state, error: 'Enter a location name.', field: 'name' });
		}

		if (name.length > 80) {
			return fail(400, { ...state, error: 'Name is too long.', field: 'name' });
		}

		if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
			return fail(400, {
				...state,
				error: 'Latitude must be between -90 and 90.',
				field: 'latitude'
			});
		}

		if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
			return fail(400, {
				...state,
				error: 'Longitude must be between -180 and 180.',
				field: 'longitude'
			});
		}

		const { data: row, error: readError } = await locals.supabase
			.from('dashboard_table')
			.select('user, locations')
			.maybeSingle();

		if (readError) {
			return fail(500, { ...state, error: 'Could not load locations.' });
		}

		if (!row) {
			return fail(404, { ...state, error: 'No dashboard record to update.' });
		}

		const existing = Array.isArray(row.locations)
			? (row.locations as DashboardLocation[])
			: [];

		const next = [
			...existing,
			{
				id: uuidv7(),
				name,
				latitude: String(latitude),
				longitude: String(longitude)
			}
		];

		const { error: writeError } = await locals.supabase
			.from('dashboard_table')
			.update({ locations: next })
			.eq('user', row.user);

		if (writeError) {
			return fail(500, { ...state, error: 'Could not save the location.' });
		}

		await invalidateDashboard(locals);

		return { ...state };
	},

	/**
	 * Removes a location and clears the current pointer if it referenced the
	 * removed row, so the UI never points at a deleted location.
	 */
	deleteLocation: async ({ request, locals }) => {
		const formData = await request.formData();
		const id = String(formData.get('id') ?? '').trim();
		const state = { scope: 'locations', error: '', field: '' };
		const { data: row, error: readError } = await locals.supabase
			.from('dashboard_table')
			.select('user, locations, currentLocationId')
			.maybeSingle();

		if (readError) {
			return fail(500, { ...state, error: 'Could not load locations.' });
		}

		if (!row) {
			return fail(404, { ...state, error: 'No dashboard record to update.' });
		}

		const existing = Array.isArray(row.locations)
			? (row.locations as DashboardLocation[])
			: [];
		const next = existing.filter((location) => location.id !== id);

		if (next.length === existing.length) {
			return fail(400, { ...state, error: 'That location no longer exists.' });
		}

		const update: {
			locations: DashboardLocation[];
			currentLocationId?: null;
		} = { locations: next };

		if (row.currentLocationId === id) update.currentLocationId = null;

		const { error: writeError } = await locals.supabase
			.from('dashboard_table')
			.update(update)
			.eq('user', row.user);

		if (writeError) {
			return fail(500, { ...state, error: 'Could not delete the location.' });
		}

		await invalidateDashboard(locals);

		return { ...state };
	}
};
