import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { safeGetClaims } }) => {
	const { claims } = await safeGetClaims();

	if (!claims) {
		redirect(303, '/login');
	}

	redirect(303, '/vocabs');
};
