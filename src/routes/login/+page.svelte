<script lang="ts">
	import { enhance } from '$app/forms';
	import IconSpinner from '~icons/svg-spinners/ring-resize';
	import IconSpinnerStatic from '~icons/ph/circle-notch';
	import icescape from '#lib/assets/images/Icescape.jpg';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();

	let loading = $state(false);
	let dismissed = $state(false);

	const errorMsg = $derived(dismissed || loading ? '' : (form?.error ?? ''));

	/**
	 * Only auto-focus on devices with a physical pointer, so a mobile keyboard
	 * doesn't pop up (and shift the layout) the moment the page opens.
	 */
	function autofocus(node: HTMLInputElement) {
		if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
			node.focus({ preventScroll: true });
		}
	}
</script>

<svelte:head>
	<title>login</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div
	class="relative flex min-h-dvh items-start justify-start bg-slate-950 px-24 pt-84"
>
	<img
		src={icescape}
		alt=""
		aria-hidden="true"
		fetchpriority="high"
		decoding="async"
		class="absolute inset-0 h-full w-full object-cover"
	/>

	<form
		method="POST"
		use:enhance={() => {
			loading = true;
			return async ({ update }) => {
				await update();
				dismissed = false;
				loading = false;
			};
		}}
		aria-busy={loading}
		class="relative z-10 w-full max-w-xs"
	>
		<h1
			class="ml-12 text-36 font-thin tracking-tight text-white [text-shadow:0_2px_32px_rgba(0,0,0,0.75)]"
		>
			Login
		</h1>

		<label for="password" class="sr-only">Password</label>

		<div class="relative mt-8">
			<input
				{@attach autofocus}
				id="password"
				name="password"
				type="password"
				autocomplete="current-password"
				required
				placeholder="Password"
				oninput={() => (dismissed = true)}
				aria-invalid={errorMsg ? 'true' : undefined}
				aria-describedby={errorMsg ? 'password-error' : undefined}
				class="glass-dark w-full rounded-full border border-white/10 px-20 py-8 text-center text-16 shadow-[0_8px_32px_rgba(0,0,0,0.45)] transition-colors placeholder:text-slate-300 focus:outline-none motion-reduce:transition-none"
			/>

			{#if loading}
				<span
					aria-hidden="true"
					class="pointer-events-none absolute inset-y-0 right-16 flex items-center"
				>
					<!-- Self-animating circular spinner when motion is allowed… -->
					<IconSpinner
						class="size-20 text-slate-100/90 drop-shadow-[0_1px_6px_rgba(0,0,0,0.65)] motion-reduce:hidden"
					/>
					<!-- …static ring fallback when the user reduced motion. -->
					<IconSpinnerStatic
						class="hidden size-20 text-slate-100/90 drop-shadow-[0_1px_6px_rgba(0,0,0,0.65)] motion-reduce:block"
					/>
				</span>
			{/if}
		</div>

		{#if errorMsg}
			<p
				id="password-error"
				role="alert"
				class="mt-4 text-center text-14 font-medium text-red-500 [text-shadow:0_1px_12px_rgba(0,0,0,0.7)]"
			>
				{errorMsg}
			</p>
		{/if}

		<button type="submit" class="sr-only">Login</button>
	</form>
</div>
