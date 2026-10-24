import { error, fail } from '@sveltejs/kit';
import { getDashboard, setCurrentLocation } from '#lib/server/dashboard.ts';
import { fetchWeather } from '#lib/server/weather.ts';
import type { Actions, PageServerLoad } from './$types';

/**
 * `/weather` reads the saved locations from the dashboard row, picks the one
 * marked as current and asks Open-Meteo for its weather while rendering. The
 * page therefore arrives complete, with no client fetch on mount.
 */
export const load: PageServerLoad = async ({ locals, fetch, depends }) => {
	// The navbar refreshes `app:weather` every quarter of an hour; let that
	// also bring the page's own current conditions up to date.
	depends('app:weather');

	const { record, error: queryError } = await getDashboard(locals);

	if (queryError) {
		error(500, 'Could not load the weather settings.');
	}

	const locations = record?.locations ?? [];
	const current =
		locations.find((location) => location.id === record?.currentLocationId) ??
		locations[0] ??
		null;

	const weather = current
		? await fetchWeather(fetch, current, record?.currentForecastModel ?? 'ecmwf_ifs')
		: null;

	return {
		locations,
		currentId: current?.id ?? '',
		weather
	};
};

export const actions: Actions = {
	/**
	 * Switches the current location and answers with that place's forecast.
	 *
	 * The write and the Open-Meteo lookup run at the same time and the weather
	 * rides back on the action response, so the page repaints as soon as this
	 * request lands. Making the page reload fetch it afterwards would serialise
	 * the two slowest steps (a database write, then a two-second upstream call)
	 * and leave the old place on screen in between.
	 */
	selectLocation: async ({ request, locals, fetch }) => {
		const id = String((await request.formData()).get('id') ?? '').trim();

		const { record, error: readError } = await getDashboard(locals);

		if (readError) {
			return fail(500, { error: 'Could not load the saved locations.' });
		}

		if (!record) {
			return fail(404, { error: 'No dashboard record to update.' });
		}

		const location = record.locations?.find((item) => item.id === id);

		if (!location) {
			return fail(400, { error: 'That location no longer exists.' });
		}

		// Start the upstream call first: the database write finishes long before
		// it, so both are paid once instead of one after the other.
		const weather = fetchWeather(
			fetch,
			location,
			record.currentForecastModel ?? 'ecmwf_ifs'
		);
		const writeError = await setCurrentLocation(locals, id);

		if (writeError) {
			return fail(500, { error: writeError });
		}

		return { currentId: id, weather: await weather };
	}
};
