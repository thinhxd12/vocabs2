<script lang="ts">
	import './layout.css';
	import { PUBLIC_SUPABASE_URL } from '$app/env/public';
	import favicon from '#lib/assets/favicon.svg';
	import { invalidate } from '$app/navigation';
	import { onMount } from 'svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
	let { supabase, sessionExpiresAt } = $derived(data);

	// Warm the connection to Supabase before the first auth/DB request so the
	// TLS + HTTP/2 handshake overlaps with HTML parsing instead of blocking it.
	const supabaseOrigin = new URL(PUBLIC_SUPABASE_URL).origin;

	onMount(() => {
		const { data } = supabase.auth.onAuthStateChange((_event, session) => {
			if ((session?.expires_at ?? null) !== sessionExpiresAt) {
				invalidate('supabase:auth');
			}
		});

		return () => data.subscription.unsubscribe();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="preconnect" href={supabaseOrigin} crossorigin="anonymous" />
	<link rel="dns-prefetch" href={supabaseOrigin} />
</svelte:head>

{@render children()}
