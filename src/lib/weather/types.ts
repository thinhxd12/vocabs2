/** A saved place in `dashboard_table.locations`. */
export type WeatherLocation = {
	id: string;
	name: string;
	latitude: string;
	longitude: string;
};

/** The arguments of a weather lookup. Units are always metric (the app is). */
export type WeatherQueryParams = {
	latitude: string;
	longitude: string;
	tempUnit?: 'c' | 'f';
	model?: string;
};

/** One radar frame of the national radar timeline. */
export type RadarFrame = {
	time: string;
	path: string;
};

/**
 * The current conditions the navbar's weather tile shows. A trimmed copy of
 * {@link OpenMeteoResponse} so the authed layout does not ship hourly/daily
 * arrays to every page.
 */
export type NavWeather = {
	temperature: number;
	apparent: number;
	rain: number;
	showers: number;
	snowfall: number;
	weatherCode: number;
	isDay: number;
};

/** The trimmed Open-Meteo payload the page renders. */
export type OpenMeteoResponse = {
	latitude: number;
	longitude: number;
	timezone: string;
	timezone_abbreviation: string;
	utc_offset_seconds: number;
	current: {
		time: string;
		temperature_2m: number;
		relative_humidity_2m: number;
		apparent_temperature: number;
		precipitation: number;
		weather_code: number;
		wind_speed_10m: number;
		wind_direction_10m: number;
		wind_gusts_10m: number;
		visibility: number;
		pressure_msl: number;
		dew_point_2m: number;
		cloud_cover: number;
		rain: number;
		showers: number;
		snowfall: number;
		snow_depth: number;
		is_day: number;
		us_aqi: number;
		uv_index: number;
	};
	hourly: {
		time: string[];
		temperature_2m: number[];
		apparent_temperature: number[];
		precipitation_probability: number[];
		weather_code: number[];
		wind_speed_10m: number[];
		is_day: number[];
	};
	daily: {
		time: string[];
		weather_code: number[];
		temperature_2m_max: number[];
		temperature_2m_min: number[];
		apparent_temperature_max: number[];
		apparent_temperature_min: number[];
		precipitation_probability_max: number[];
		sunrise: string[];
		sunset: string[];
		uv_index_max: number[];
	};
};
