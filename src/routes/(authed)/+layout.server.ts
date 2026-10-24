import { getDashboard, settingsOf } from '#lib/server/dashboard.ts';
import { getTodaySchedule } from '#lib/server/schedule.ts';
import { requireSession } from '#lib/features/auth/server/auth.ts';
import { getSessionExpiresAt } from '#lib/features/auth/server/session.ts';
import { fetchWeather } from '#lib/server/weather.ts';
import type { NavWeather } from '#lib/weather/types.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ cookies, locals, depends, fetch }) => {
	await requireSession(locals, cookies);

	// The account's settings row is read here — once — and handed down as
	// `data.dashboard`: every authed page, and every component under it, reads
	// that one copy instead of asking for the row again. Layout data is reused by
	// the client, so moving between pages does not fetch it a second time, and
	// `getDashboard` (see `#lib/server/dashboard.ts`) keeps it to a single query
	// on the server. A successful write on `/dashboard` refreshes it along with
	// everything else.
	//
	// `depends` names the copy, so it can also be pulled up to date on demand —
	// `invalidate('app:dashboard')` from anywhere.
	depends('app:dashboard');

	// The navbar's calendar tile reads the day's schedule counter from the same
	// pass (`#lib/server/schedule.ts`). `app:schedule` lets an action that moved
	// the counter pull this copy up to date — `bumpSchedule` after a batch's last
	// card, a schedule edit, the midnight check in `NavBar.svelte`.
	depends('app:schedule');

	// The navbar's weather tile is refreshed by `app:weather` (NavBar pulls it
	// up to date every quarter of an hour), so a tab left open does not show
	// yesterday's sky.
	depends('app:weather');

	// The navbar's memories tile is refreshed by `app:memories` — the add-word
	// dialog pulls it up to date after an insert.
	depends('app:memories');

	const [{ record }, schedule, { count: memories }] = await Promise.all([
		getDashboard(locals),
		getTodaySchedule(locals),
		// The navbar's digit tile: how many rows `memories_table` holds.
		locals.supabase.from('memories_table').select('*', { count: 'exact', head: true })
	]);

	// The tile shows the current place's sky, so the layout needs one weather
	// lookup. `fetchWeather` caches the answer (and its in-flight promise), so
	// `/weather`, which asks for the same place, shares it instead of paying
	// for a second upstream call.
	const locations = record?.locations ?? [];
	const current =
		locations.find((location) => location.id === record?.currentLocationId) ??
		locations[0] ??
		null;

	const weather = current
		? await fetchWeather(fetch, current, record?.currentForecastModel ?? 'ecmwf_ifs')
		: null;

	const navWeather: NavWeather | null = weather
		? {
				temperature: Math.round(weather.current.temperature_2m),
				apparent: Math.round(weather.current.apparent_temperature),
				rain: weather.current.rain,
				showers: weather.current.showers,
				snowfall: weather.current.snowfall,
				weatherCode: weather.current.weather_code,
				isDay: weather.current.is_day
			}
		: null;

	return {
		authorized: true,
		// Lets the layout schedule the redirect the moment the session lapses,
		// instead of waiting for the next request (e.g. a manual refresh). With
		// no sibling `+layout.ts`, this flows straight to `+layout.svelte`.
		sessionExpiresAt: getSessionExpiresAt(cookies),
		dashboard: record ? settingsOf(record) : null,
		schedule,
		memories: memories ?? 0,
		// Named apart from `/weather`'s own `weather` (the full forecast): page
		// data and layout data merge, and the page's copy would shadow this one.
		navWeather
	};
};
