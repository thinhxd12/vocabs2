import type { OpenMeteoResponse, WeatherLocation } from '#lib/weather/types.ts';

/**
 * Open-Meteo lookups for `/weather`.
 *
 * The two upstream calls (forecast and air quality) are made from the server:
 * that keeps the browser off a third-party origin, lets the API keyless
 * endpoints be called with a real user agent, and means the page arrives with
 * its weather already rendered.
 */

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';

/** Give up rather than hold the page render on a slow upstream. */
const TIMEOUT_MS = 8_000;

/** The fields the forecast endpoint is asked for. */
const CURRENT_FIELDS = [
	'temperature_2m',
	'relative_humidity_2m',
	'apparent_temperature',
	'precipitation',
	'weather_code',
	'wind_speed_10m',
	'wind_direction_10m',
	'wind_gusts_10m',
	'visibility',
	'pressure_msl',
	'dew_point_2m',
	'cloud_cover',
	'rain',
	'showers',
	'snowfall',
	'snow_depth',
	'is_day'
].join(',');

const HOURLY_FIELDS = [
	'temperature_2m',
	'apparent_temperature',
	'precipitation_probability',
	'weather_code',
	'wind_speed_10m',
	'is_day'
].join(',');

const DAILY_FIELDS = [
	'weather_code',
	'temperature_2m_max',
	'temperature_2m_min',
	'apparent_temperature_max',
	'apparent_temperature_min',
	'precipitation_probability_max',
	'sunrise',
	'sunset',
	'uv_index_max'
].join(',');

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = Record<string, any>;

/** Reads one endpoint, failing loudly so the caller can drop the whole load. */
async function getJson(fetchFn: typeof globalThis.fetch, url: string): Promise<Json> {
	const response = await fetchFn(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });

	if (!response.ok) {
		throw new Error(`Open-Meteo responded ${response.status} for ${url}`);
	}

	return (await response.json()) as Json;
}

/** Helps `Array.from` turn whatever came back (possibly nothing) into a list. */
function list(value: unknown): any[] {
	return Array.isArray(value) ? value : [];
}

function numbers(value: unknown): number[] {
	return list(value).map((item) => Number(item ?? 0));
}

function strings(value: unknown): string[] {
	return list(value).map((item) => String(item ?? ''));
}

/**
 * Fetches the current conditions, the next 12 hours and the 7-day outlook for
 * one saved location. Returns `null` when Open-Meteo cannot be reached or
 * answers with something unusable — the page then shows its "unavailable"
 * state instead of failing the whole render.
 *
 * Answers are cached for a few minutes (see {@link fetchWeather}) so the
 * layout's navbar and a page that both ask for the same place share one call.
 */
async function requestWeather(
	fetchFn: typeof globalThis.fetch,
	location: WeatherLocation,
	model: string,
	tempUnit: 'c' | 'f' = 'c'
): Promise<OpenMeteoResponse | null> {
	const forecastParams = new URLSearchParams({
		latitude: location.latitude,
		longitude: location.longitude,
		current: CURRENT_FIELDS,
		hourly: HOURLY_FIELDS,
		daily: DAILY_FIELDS,
		models: model || 'ecmwf_ifs',
		temperature_unit: tempUnit === 'c' ? 'celsius' : 'fahrenheit',
		timezone: 'auto',
		forecast_hours: '12',
		forecast_days: '7'
	});

	const airParams = new URLSearchParams({
		latitude: location.latitude,
		longitude: location.longitude,
		current: 'us_aqi,uv_index'
	});

	try {
		// The forecast is the page; air quality only adds AQI and UV. A failure
		// there must not turn the whole page into "Forecast unavailable".
		const [forecast, air] = await Promise.all([
			getJson(fetchFn, `${FORECAST_URL}?${forecastParams}`),
			getJson(fetchFn, `${AIR_QUALITY_URL}?${airParams}`).catch(() => null)
		]);

		const current = forecast.current ?? {};
		const hourly = forecast.hourly ?? {};
		const daily = forecast.daily ?? {};
		const quality = air?.current ?? {};

		return {
			latitude: Number(forecast.latitude ?? 0),
			longitude: Number(forecast.longitude ?? 0),
			timezone: String(forecast.timezone ?? 'UTC'),
			timezone_abbreviation: String(forecast.timezone_abbreviation ?? ''),
			utc_offset_seconds: Number(forecast.utc_offset_seconds ?? 0),
			current: {
				time: String(current.time ?? ''),
				temperature_2m: Number(current.temperature_2m ?? 0),
				relative_humidity_2m: Number(current.relative_humidity_2m ?? 0),
				apparent_temperature: Number(current.apparent_temperature ?? 0),
				precipitation: Number(current.precipitation ?? 0),
				weather_code: Number(current.weather_code ?? 0),
				wind_speed_10m: Number(current.wind_speed_10m ?? 0),
				wind_direction_10m: Number(current.wind_direction_10m ?? 0),
				wind_gusts_10m: Number(current.wind_gusts_10m ?? 0),
				visibility: Number(current.visibility ?? 0),
				pressure_msl: Number(current.pressure_msl ?? 0),
				dew_point_2m: Number(current.dew_point_2m ?? 0),
				cloud_cover: Number(current.cloud_cover ?? 0),
				rain: Number(current.rain ?? 0),
				showers: Number(current.showers ?? 0),
				snowfall: Number(current.snowfall ?? 0),
				snow_depth: Number(current.snow_depth ?? 0),
				is_day: Number(current.is_day ?? 0),
				us_aqi: Number(quality.us_aqi ?? 0),
				uv_index: Number(quality.uv_index ?? 0)
			},
			hourly: {
				time: strings(hourly.time),
				temperature_2m: numbers(hourly.temperature_2m),
				apparent_temperature: numbers(hourly.apparent_temperature),
				precipitation_probability: numbers(hourly.precipitation_probability),
				weather_code: numbers(hourly.weather_code),
				wind_speed_10m: numbers(hourly.wind_speed_10m),
				is_day: numbers(hourly.is_day)
			},
			daily: {
				time: strings(daily.time),
				weather_code: numbers(daily.weather_code),
				temperature_2m_max: numbers(daily.temperature_2m_max),
				temperature_2m_min: numbers(daily.temperature_2m_min),
				apparent_temperature_max: numbers(daily.apparent_temperature_max),
				apparent_temperature_min: numbers(daily.apparent_temperature_min),
				precipitation_probability_max: numbers(daily.precipitation_probability_max),
				sunrise: strings(daily.sunrise),
				sunset: strings(daily.sunset),
				uv_index_max: numbers(daily.uv_index_max)
			}
		};
	} catch {
		return null;
	}
}

/** How long a weather answer is reused; short enough to feel live. */
const CACHE_TTL = 5 * 60_000;

/** How long a failed lookup is remembered before trying upstream again. */
const FAILURE_TTL = 60_000;

/** Keep the per-instance cache bounded as the user tries different places. */
const CACHE_LIMIT = 24;

type WeatherEntry = {
	at: number;
	data: Promise<OpenMeteoResponse | null>;
	/** Set once the promise settles; `false` means "retry after a minute". */
	ok?: boolean;
};

const cache = new Map<string, WeatherEntry>();

/**
 * Weather for one place, memoised in module scope for five minutes. The
 * *promise* is cached, so the layout (navbar) and the weather page asking at
 * the same moment join one upstream request instead of racing each other.
 * Failures are remembered for a minute so an outage cannot put every page
 * behind an eight-second timeout, then retried.
 */
export function fetchWeather(
	fetchFn: typeof globalThis.fetch,
	location: WeatherLocation,
	model: string,
	tempUnit: 'c' | 'f' = 'c'
): Promise<OpenMeteoResponse | null> {
	const key = `${location.latitude},${location.longitude},${model},${tempUnit}`;
	const now = Date.now();
	const hit = cache.get(key);
	const ttl = hit?.ok === false ? FAILURE_TTL : CACHE_TTL;

	if (hit && now - hit.at < ttl) {
		return hit.data;
	}

	const entry: WeatherEntry = {
		at: now,
		data: requestWeather(fetchFn, location, model, tempUnit)
	};
	const data = entry.data;
	cache.set(key, entry);

	// Oldest insertion first; Map keeps that order.
	if (cache.size > CACHE_LIMIT) {
		const oldest = cache.keys().next().value;
		if (oldest !== undefined) cache.delete(oldest);
	}

	void data.then((result) => {
		if (cache.get(key) === entry) entry.ok = result !== null;
	});

	return data;
}
