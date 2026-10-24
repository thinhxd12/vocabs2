import { signOut } from '#lib/features/auth/server/auth.ts';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, cookies }) => {
	await signOut(locals, cookies);
	redirect(303, '/login');
};
