/**
 * The day's schedule counter — the one the reviewer moves and the navbar shows.
 *
 * `schedule_table` holds one slot per day of the current block. A slot starts
 * undated and is stamped with the reader's day once it reaches `DAY_CAP`
 * reviews, so "today's slot" is the oldest row already dated today, or, until
 * one is, the oldest undated row: the slot today's batches are counting into.
 *
 * Both `bumpSchedule` (`(authed)/fsrs/+page.server.ts`) and the navbar's tile
 * (`getTodaySchedule`) resolve the day this way, so the number on screen is
 * always the number a finished batch moves — never a second reading of the
 * table that could disagree with the reviewer.
 */

import { getDashboard } from '#lib/server/dashboard.ts';
import { localDate } from '#lib/server/time.ts';

/** Reviews a schedule row takes before it is stamped with the day it filled. */
export const DAY_CAP = 18;

/** One `schedule_table` row. `numeric` arrives from PostgREST as a string, so
 *  counts are widened here. */
export type ScheduleSlotRow = {
	id: string;
	/** The vocab window this slot covers; `progress_table.index` is written from
	 *  the block's first slot, so it has to be read with the rest. */
	index: number | string | null;
	date: string | null;
	count: number | string;
};

/** What the navbar shows for today. */
export type TodaySchedule = {
	/** The reader's day, `YYYY-MM-DD`. */
	date: string;
	/** The reviews already counted into today's slot; `null` when the block is
	 *  spent — every slot dated and full, none of them today. */
	count: number | null;
};

/** The reader's day: the zone their browser reported, or the one on their
 *  account when that browser has never reported one. */
export async function readerToday(locals: App.Locals) {
	if (locals.timeZone) return localDate(locals.timeZone);

	const { record } = await getDashboard(locals);
	return localDate(record?.timezone);
}

/** A slot's day as `YYYY-MM-DD`, whatever shape the column hands back. */
export function slotDate(slot: ScheduleSlotRow | undefined) {
	return slot?.date ? String(slot.date).slice(0, 10) : '';
}

/** A slot is filled once it is dated and has taken the day's full count. */
export function isFilled(slot: { date?: string | null; count: number | string }) {
	return Boolean(slot.date) && Number(slot.count) >= DAY_CAP;
}

/**
 * The slot today's batches count into: the oldest row dated today, or, until one
 * is, the oldest undated row. `id` is a v7 uuid, so the block is already in
 * insertion order — the order the reviewer counts it in.
 */
export function openSlot(block: ScheduleSlotRow[], today: string) {
	return block.find((slot) => !slot.date || slotDate(slot) === today);
}

/** The whole block, in counting order, as the reviewer reads it. */
export async function readBlock(locals: App.Locals) {
	const { data, error } = await locals.supabase
		.from('schedule_table')
		.select('id, index, date, count')
		.order('id', { ascending: true });

	return { block: (data ?? []) as ScheduleSlotRow[], error };
}

/**
 * Today's counter, for the navbar tile: how many reviews are already counted
 * into the slot today's batches move.
 *
 * Read on every layout load (`(authed)/+layout.server.ts`, under
 * `app:schedule`), so the tile catches up as soon as the loads re-run — the
 * `refreshAll()` after a batch's last card, `update()` after a schedule edit, or
 * the midnight check in `NavBar.svelte`. A read that fails answers zero rather
 * than failing the page: this is a readout, not a dependency of the page.
 */
export async function getTodaySchedule(locals: App.Locals): Promise<TodaySchedule> {
	const today = await readerToday(locals);
	const { block } = await readBlock(locals);
	const open = openSlot(block, today);

	// No open row because every slot is dated and full: the block is spent, so
	// the tile shows "N" rather than a zero it did not count.
	const spent = !open && block.length > 0 && block.every(isFilled);

	return { date: today, count: open ? Number(open.count) || 0 : spent ? null : 0 };
}
