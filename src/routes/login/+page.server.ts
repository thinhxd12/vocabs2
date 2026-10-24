import { signIn } from '#lib/features/auth/server/auth.ts';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { safeGetClaims } }) => {
	const { claims } = await safeGetClaims();

	if (claims) {
		redirect(303, '/vocabs');
	}

	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies, locals }) => {
		const formData = await request.formData();
		const password = formData.get('password')?.toString() ?? '';

		const error = await signIn(locals, cookies, password);

		if (error) {
			return fail(400, { error });
		}

		redirect(303, '/vocabs');
	}
};
