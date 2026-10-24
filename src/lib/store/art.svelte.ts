import { DEFAULT_ART } from '#lib/art.ts';
import { addToast } from '#lib/store/toast.svelte.ts';
import type { ArtImage } from '#lib/types.ts';

/**
 * The `/art` walk, always in the same order: the built-in painting, then The
 * Idyll, then a random painting from there. Every visit starts over, so the
 * page opens on the same picture, and going back within a visit is instant.
 */
export const art = $state<{ image: ArtImage; loading: boolean; hasPrevious: boolean }>({
	image: DEFAULT_ART,
	loading: false,
	hasPrevious: false
});

const history: ArtImage[] = [];
let index = 0;
/** Bumped by every visit, so a request from the last one cannot land here. */
let generation = 0;

async function step(direction: 1 | -1) {
	const target = index + direction;

	if (target >= 0 && target < history.length) {
		index = target;
		art.image = history[index];
		art.hasPrevious = index > 0;
		return;
	}

	if (direction < 0 || art.loading) return;

	// The first painting of a visit is always The Idyll; the server then walks
	// on through a random "also on DailyArt" link from the page it just read.
	const endpoint = history.length === 0 ? '/api/art?start' : '/api/art';

	const from = index;
	const visit = generation;
	art.loading = true;
	try {
		const response = await fetch(endpoint);
		if (!response.ok) throw new Error(`/api/art answered ${response.status}`);

		const image = (await response.json()) as ArtImage;
		if (visit !== generation) return;

		history.push(image);

		// The reader may have walked back while the request was in flight; only
		// follow the answer if they are still standing where they were.
		if (index === from) {
			index = history.length - 1;
			art.image = history[index];
			art.hasPrevious = index > 0;
		}
	} catch {
		// Offline or the magazine is down: the painting on the wall stays put.
		if (visit === generation) {
			addToast({
				type: 'error',
				title: 'Could not reach DailyArt',
				message: 'Showing the painting already on the wall.'
			});
		}
	} finally {
		// Only the visit that started the request may clear its spinner.
		if (visit === generation) art.loading = false;
	}
}

/** Opens the walk on the built-in painting, whatever was read last visit. */
export function showArt() {
	generation += 1;
	history.length = 0;
	index = 0;
	art.image = DEFAULT_ART;
	art.hasPrevious = false;
	art.loading = false;
}

export function nextArt() {
	void step(1);
}

export function prevArt() {
	void step(-1);
}
