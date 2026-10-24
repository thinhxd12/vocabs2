/**
 * Account-scoped cache for the single `dashboard_table` row.
 *
 * This row holds settings that only change when the user edits them on
 * `/dashboard` (locations, forecast model, FSRS weights), so it is read from
 * the database once and then reused for every page and every action. The cache
 * has no expiry: it is refreshed only by `invalidateDashboard`, which the
 * dashboard actions call after a write.
 *
 * The map lives in module scope, so it is per server instance and survives
 * between requests (on serverless hosts, one cache per warm instance — the row
 * is still loaded just once per instance). Entries are keyed by the
 * authenticated user, so accounts never see each other's rows.
 *
 * What is cached is the *promise* of the row, so callers that ask at the same
 * moment — the authed layout and its page in one navigation, two navigations
 * that overlap — join one query rather than each starting their own. On the
 * browser side there is nothing to cache: the authed layout hands the row down
 * as `data.dashboard`, and that node is reused across navigations.
 */

export type DashboardLocation = {
	id: string;
	name: string;
	latitude: string;
	longitude: string;
};

export type DashboardProgress = {
	id: string;
	date: string;
	count: string;
};

export type DashboardRecord = {
	user: string;
	locations: DashboardLocation[] | null;
	progress: DashboardProgress[] | null;
	currentLocationId: string | null;
	currentForecastModel: string;
	fsrsparams: string | null;
	/** The reader's IANA zone, as last reported by their browser — the one the
	 *  server turns into their own calendar day (`#lib/server/time.ts`). `null`
	 *  until a browser has reported one. */
	timezone: string | null;
};

/**
 * The scalars of the row every page shares, as the authed layout hands them down
 * (`data.dashboard`, see `settingsOf`). The lists — `locations` and `progress` —
 * stay with `/dashboard`, the only page that renders them, so they are not
 * shipped with every route.
 */
export type DashboardSettings = Pick<
	DashboardRecord,
	'user' | 'fsrsparams' | 'timezone' | 'currentLocationId' | 'currentForecastModel'
>;

/** The shared slice of a row, for the layout to hand down. */
export function settingsOf(record: DashboardRecord): DashboardSettings {
	return {
		user: record.user,
		fsrsparams: record.fsrsparams,
		timezone: record.timezone,
		currentLocationId: record.currentLocationId,
		currentForecastModel: record.currentForecastModel
	};
}

/** Result of a cache read: the row (or `null`) and any query error. */
export type DashboardSnapshot = {
	record: DashboardRecord | null;
	error: unknown;
};

const COLUMNS = 'user, locations, progress, currentLocationId, currentForecastModel, fsrsparams';

/**
 * Cached rows, keyed by auth user id. The promise is cached rather than the row
 * so concurrent callers join one query; `null` is a cached "no row", so a
 * missing record is not re-queried on every request either.
 */
const cache = new Map<string, Promise<DashboardRecord | null>>();

/**
 * Per-request memo of the caller's id. `locals` is a fresh object each request,
 * so wrapping it in a WeakMap reuses the id (and the layout's `safeGetClaims`
 * call) for the whole request without leaking it to the next one.
 */
const userIds = new WeakMap<App.Locals, Promise<string | null>>();

function currentUserId(locals: App.Locals): Promise<string | null> {
	let pending = userIds.get(locals);
	if (!pending) {
		pending = locals.safeGetClaims().then(({ claims }) => claims?.sub ?? null);
		userIds.set(locals, pending);
	}
	return pending;
}

/**
 * Returns the dashboard row, loading it from the database on first use and
 * reusing it thereafter: one query per account per server instance, however many
 * loads and actions ask for it. A signed-out request (no user id) has no row.
 */
export async function getDashboard(locals: App.Locals): Promise<DashboardSnapshot> {
	const id = await currentUserId(locals);
	if (!id) return { record: null, error: null };

	let pending = cache.get(id);

	if (!pending) {
		pending = readDashboard(locals);
		cache.set(id, pending);
	}

	try {
		return { record: await pending, error: null };
	} catch (error) {
		// A failed read must not be remembered, so the next request can retry.
		if (cache.get(id) === pending) cache.delete(id);
		return { record: null, error };
	}
}

/**
 * The single read of the row. Throws so that `getDashboard` can tell a failure
 * (never cached) from an answer.
 *
 * `timezone` is asked for in a select of its own. It is the newest column on the
 * table, and a database that has not been given it yet would fail the whole read
 * — rather than just this column — if it were listed alongside the others. A
 * missing column costs nothing: the zone is simply absent.
 */
async function readDashboard(locals: App.Locals): Promise<DashboardRecord | null> {
	// RLS scopes these reads to the signed-in account, so no `user` filter is needed.
	const [row, zone] = await Promise.all([
		locals.supabase.from('dashboard_table').select(COLUMNS).maybeSingle(),
		locals.supabase.from('dashboard_table').select('timezone').maybeSingle()
	]);

	if (row.error) throw row.error;

	return row.data
		? ({ ...row.data, timezone: zone.data?.timezone ?? null } as DashboardRecord)
		: null;
}

/**
 * Drops the cached row so the next read re-queries. Call this after any write
 * to `dashboard_table` so the user's own edits show up immediately.
 */
export async function invalidateDashboard(locals: App.Locals) {
	const id = await currentUserId(locals);
	if (id) cache.delete(id);
}

/**
 * Switches the current place and keeps the cached row in step. The follow-up
 * loads (navbar and `/weather`) then read the already-known row instead of
 * paying for another query just to learn what this function already wrote.
 * Returns an error message, or `null` on success.
 */
export async function setCurrentLocation(locals: App.Locals, id: string): Promise<string | null> {
	const { record, error } = await getDashboard(locals);

	if (error) return 'Could not load the saved locations.';
	if (!record) return 'No dashboard record to update.';
	if (!record.locations?.some((location) => location.id === id)) {
		return 'That location no longer exists.';
	}

	const { error: writeError } = await locals.supabase
		.from('dashboard_table')
		.update({ currentLocationId: id })
		.eq('user', record.user);

	if (writeError) return 'Could not set the current location.';

	// Replace the cached promise with the row as it now stands. Nothing else in
	// the row changed, so there is no reason to read it back from the database.
	const userId = await currentUserId(locals);
	if (userId) cache.set(userId, Promise.resolve({ ...record, currentLocationId: id }));

	return null;
}
