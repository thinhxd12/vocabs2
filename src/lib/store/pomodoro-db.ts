import type { SupabaseClient } from '@supabase/supabase-js';
import { setCompletionHandler, todayISO } from './pomodoro.svelte.ts';

/** Adds finished focus minutes to the local day's row in `pomodoro_table`. */
export async function addFocusTime(supabase: SupabaseClient, minutes: number) {
	if (!Number.isFinite(minutes) || minutes <= 0) return;

	// Read the day at completion time so a session that crosses midnight is
	// filed under the day it actually ended.
	const day = todayISO();

	const { data: row } = await supabase
		.from('pomodoro_table')
		.select('date, time')
		.eq('date', day)
		.maybeSingle();

	if (row) {
		await supabase
			.from('pomodoro_table')
			.update({ time: Number(row.time) + minutes })
			.eq('date', day);
	} else {
		await supabase.from('pomodoro_table').insert({ date: day, time: minutes });
	}
}

/**
 * Records focus sessions wherever the reader is: the timer is global, so a
 * session can finish while another route is on screen.
 */
export function registerFocusRecorder(supabase: SupabaseClient) {
	return setCompletionHandler((completed, minutes) => {
		if (completed === 'focus') void addFocusTime(supabase, minutes);
	});
}
