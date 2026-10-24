/**
 * Dictionary lookup behind the review screen's translate button.
 *
 * Server-only (`$lib/server`): the upstream endpoints are happiest with a real
 * user agent, and funnelling the read through our own route keeps the response
 * cacheable. Reusable from any `load`/action without an HTTP round-trip.
 *
 * The Minh dictionary is queried first because it groups senses by part of
 * speech; Google Translate is the fallback when it returns nothing. Both are
 * asked at once — a word the dictionary does not know used to pay for the
 * dictionary *and then* Google in sequence, which is what made the button feel
 * slow — and the dictionary's answer still wins whenever it has one.
 */

/** One dictionary sense: a part of speech and its translations. */
export type Translation = {
	partOfSpeech: string;
	translation: string[];
};

const WIKI_ENDPOINT = 'https://dict.minhqnd.com/api/v1/lookup';
const GOOGLE_ENDPOINT = 'https://clients5.google.com/translate_a/t';

/** An upstream that has not answered by now is treated as unavailable, so a
 *  hung request can never hold the translate button open. */
const UPSTREAM_TIMEOUT_MS = 4_000;

/** How long Google's answer waits for a slower dictionary before it is used.
 *  A dictionary hit usually lands first; this only decides the case where it
 *  is late, so a word it does not know is not held up by it. */
const DICTIONARY_GRACE_MS = 350;

/** Answers kept per server instance. A word's translations do not change, so
 *  entries never expire; the cap keeps a long-lived instance bounded. */
const CACHE_LIMIT = 500;

/** Raw shape of a Minh dictionary sense. */
type WikiMeaning = { pos?: string | null; definition?: string | null };

/**
 * Answers already looked up, keyed by lower-cased term. The *promise* is
 * cached, so a prefetch racing a click — or two cards showing the same word —
 * share one pair of upstream requests instead of starting their own.
 */
const cache = new Map<string, Promise<Translation[]>>();

/**
 * Looks a word up and returns dictionary-style groups.
 *
 * @param word    the term to translate
 * @param fetchFn pass the calling event's `fetch` where there is one, so the
 *                request is handled by the framework
 */
export async function getTranslation(
	word: string,
	fetchFn: typeof fetch = fetch
): Promise<Translation[]> {
	const term = word.trim();
	if (!term) return [];

	const key = term.toLowerCase();
	const cached = cache.get(key);
	if (cached) return cached;

	const pending = lookup(term, fetchFn);
	cache.set(key, pending);

	// Drop the oldest answer once the cache is full. Promises still in flight
	// are included, so the map can never grow past the cap either.
	if (cache.size > CACHE_LIMIT) {
		const oldest = cache.keys().next().value;
		if (oldest !== undefined) cache.delete(oldest);
	}

	try {
		return await pending;
	} catch {
		// A failed lookup must not be remembered: the next request can retry.
		if (cache.get(key) === pending) cache.delete(key);
		return [];
	}
}

/**
 * The form a term takes everywhere: trimmed, lower-cased, one word. Anything
 * that is not a single word — empty, too long, punctuation, several words —
 * becomes `''`, so junk never reaches the dictionary or `memories_table`.
 */
export function normalizeWord(raw: string | null | undefined): string {
	const word = (raw ?? '').trim().toLowerCase();
	if (!word || word.length > 64) return '';
	return /^[a-z]+(?:['-][a-z]+)*$/.test(word) ? word : '';
}

/**
 * Asks both sources at once, then collects the dictionary's answer first: a
 * word the dictionary knows is returned the moment it arrives, without waiting
 * for Google, while a word it does not know has Google's answer already in
 * flight rather than paying for a second round trip.
 *
 * A source that fails (timeout, network error) is ignored as long as the other
 * answered.
 */
async function lookup(term: string, fetchFn: typeof fetch): Promise<Translation[]> {
	// Both outcomes are converted to values up front: returning the dictionary
	// answer early must not leave Google's later rejection unhandled.
	const wiki = lookupWiki(term, fetchFn).then(
		(value) => ({ ok: true as const, value }),
		(error: unknown) => ({ ok: false as const, error })
	);
	const google = lookupGoogle(term, fetchFn).then(
		(value) => ({ ok: true as const, value }),
		(error: unknown) => ({ ok: false as const, error })
	);

	const winner = await Promise.race([
		answerOf(wiki),
		answerOf(google).then(async (answer) => {
			// A dictionary answer is worth a short wait — it is grouped by part
			// of speech — but not an open-ended one.
			if (answer) await delay(DICTIONARY_GRACE_MS);
			return answer;
		})
	]);

	if (winner) return winner;

	// Neither source produced a non-empty answer within the race. Collect both
	// outcomes to tell an empty result from a failure.
	const [wikiOutcome, googleOutcome] = await Promise.all([wiki, google]);
	if (wikiOutcome.ok && wikiOutcome.value.length) return wikiOutcome.value;
	if (googleOutcome.ok) return googleOutcome.value;

	// The dictionary answered with nothing and Google failed: an empty list is
	// the honest answer. Only a failure from both is an error worth retrying.
	if (wikiOutcome.ok) return wikiOutcome.value;
	throw wikiOutcome.error;
}

/** A source's answer, or `null` when it failed or found nothing. */
function answerOf(
	source: Promise<{ ok: true; value: Translation[] } | { ok: false; error: unknown }>
): Promise<Translation[] | null> {
	return source.then((outcome) => (outcome.ok && outcome.value.length ? outcome.value : null));
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Queries the Minh dictionary, grouping senses under their part of speech. */
async function lookupWiki(term: string, fetchFn: typeof fetch): Promise<Translation[]> {
	const target = new URL(WIKI_ENDPOINT);
	target.searchParams.set('word', term);
	target.searchParams.set('lang', 'en');
	target.searchParams.set('def_lang', 'vi');

	const response = await fetchFn(target, {
		headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' },
		signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
	});

	// A word the dictionary does not carry is a 404 with `exists: false`: an
	// empty answer, not an outage, so Google still gets its turn.
	if (response.status === 404) {
		const body = (await response.json().catch(() => null)) as { exists?: boolean } | null;
		if (body?.exists === false) return [];
		throw new Error('Dictionary answered 404');
	}

	if (!response.ok) throw new Error(`Dictionary answered ${response.status}`);

	const data: { results?: { meanings?: WikiMeaning[] }[] } = await response.json();

	return groupMeanings(data.results?.[0]?.meanings);
}

/** Dictionary senses → one group per part of speech, empty definitions dropped. */
function groupMeanings(meanings: WikiMeaning[] | undefined): Translation[] {
	if (!Array.isArray(meanings)) return [];

	const grouped = meanings.reduce<Record<string, Translation>>((acc, meaning) => {
		const definition = meaning.definition?.trim();
		if (!definition) return acc;

		const pos = meaning.pos?.trim() || 'Translation';
		if (acc[pos]) {
			acc[pos].translation.push(definition);
		} else {
			acc[pos] = { partOfSpeech: pos, translation: [definition] };
		}
		return acc;
	}, {});

	return Object.values(grouped);
}

/** Falls back to Google Translate for a single, ungrouped translation. */
async function lookupGoogle(term: string, fetchFn: typeof fetch): Promise<Translation[]> {
	const target = new URL(GOOGLE_ENDPOINT);
	target.searchParams.set('client', 'dict-chrome-ex');
	target.searchParams.set('sl', 'auto');
	target.searchParams.set('tl', 'vi');
	target.searchParams.set('q', term);

	const response = await fetchFn(target, {
		headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' },
		signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
	});

	if (!response.ok) throw new Error(`Translate answered ${response.status}`);

	const translation = normalize(await response.json());
	return translation.length ? [{ partOfSpeech: 'Translation', translation }] : [];
}

/**
 * The dictionary endpoint answers with one entry per query term, each of the
 * form `[translation, sourceLanguage]` — every element after the first is
 * metadata, so only index 0 is text. A bare string is also accepted.
 */
function normalize(data: unknown): string[] {
	const entries = Array.isArray(data) ? data : [data];

	return entries
		.map((entry) => (Array.isArray(entry) ? entry[0] : entry))
		.filter((text): text is string => typeof text === 'string' && text.length > 0);
}
