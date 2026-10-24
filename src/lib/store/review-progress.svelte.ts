/**
 * `/fsrs`'s place in the batch, for the navbar's sunrise tile.
 *
 * The reviewer writes it from its own `learned`/`total`; the tile only reads it
 * on `/fsrs`, so a stale value left behind on another route is never painted.
 */
export const reviewProgress = $state({
	learned: 0,
	total: 0
});
