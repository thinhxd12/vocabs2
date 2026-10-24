<script lang="ts">
  import { enhance } from "$app/forms";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import IconPlus from "~icons/ph/plus";
  import IconSmileySad from "~icons/ph/smiley-sad";
  import IconTrash from "~icons/ph/trash";
  import Container from "#lib/components/Container.svelte";
  import Pagination from "#lib/components/Pagination.svelte";
  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();

  const errorMsg = $derived(form?.error ?? "");

  /** The window on show, e.g. `1–9 of 30 days`. */
  const shown = $derived(
    data.total === 0
      ? "No days marked"
      : `${data.offset + 1}–${data.offset + data.rows.length} of ${data.total} days`,
  );

  /**
   * Paging moves `?page=`, so the URL stays the single source of truth: the
   * rows are re-read on the server for that window, and back/forward, reload
   * and sharing all keep working.
   */
  function goToPage(next: number) {
    const url = new URL(page.url.href);
    url.searchParams.set("page", String(next));
    goto(url, { reset: false });
  }

  /** Full-width dashed pill that adds the current moment. */
  const ADD =
    "inline-flex w-full touch-manipulation items-center justify-center gap-6 rounded-12 border border-dashed border-white/15 bg-white/5 px-12 py-10 font-rubik text-xs font-medium text-slate-300 transition-colors duration-200 outline-offset-2 hover:border-white/30 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-300 active:bg-white/15 motion-reduce:transition-none";

  const DELETE =
    "inline-flex size-32 shrink-0 touch-manipulation items-center justify-center rounded-full text-slate-500 transition-colors duration-200 outline-offset-2 hover:bg-red-500/15 hover:text-red-300 focus-visible:outline-2 focus-visible:outline-emerald-300 active:bg-red-500/25 motion-reduce:transition-none";
</script>

<svelte:head>
  <title>Sad days</title>
</svelte:head>

<!-- Nine rows fit a phone without scrolling; the list still grows to fill the
     screen, so the pager sits at the bottom even on a page with a row or two. -->
<Container class="gap-8 pt-0 pb-16">
  <header class="w-full shrink-0 px-4 pt-24 pb-4 text-center">
    <h1 class="font-serif text-26 leading-tight text-white">
      Sad <em class="text-slate-300">days</em>
    </h1>
    <p
      class="mt-4 font-rubik text-11 tracking-[0.08em] text-slate-400 uppercase tabular-nums"
    >
      {shown}
    </p>
  </header>

  <!-- Solid surface: a blurred card this tall repaints the whole backdrop on
       every scroll, which is what made the page feel heavy. -->
  <div
    class="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-16 border border-white/10 bg-slate-900"
  >
    <form method="POST" action="?/add" use:enhance class="shrink-0 p-8">
      <button type="submit" class={ADD}>
        <IconPlus class="size-16 shrink-0" aria-hidden="true" />
        Mark today
      </button>
    </form>

    {#if errorMsg}
      <p
        role="alert"
        class="shrink-0 px-12 pb-8 font-rubik text-11 text-red-400"
      >
        {errorMsg}
      </p>
    {/if}

    {#if data.rows.length === 0}
      <!-- The empty card keeps the add button where it was, so the first click
           does not move the page under the pointer. -->
      <div
        class="flex flex-1 flex-col items-center justify-center gap-4 border-t border-white/10 px-16 py-40 text-center"
      >
        <IconSmileySad class="size-24 text-slate-500" aria-hidden="true" />
        <p class="font-serif text-sm text-slate-400 italic">
          No sad days marked yet.
        </p>
      </div>
    {:else}
      <ol
        class="no-scrollbar min-h-0 flex-1 overflow-y-auto border-t border-white/10"
      >
        {#each data.rows as row (row.created_at)}
          <li
            class="flex items-center gap-12 px-12 py-4 transition-colors duration-150 not-last:border-b not-last:border-white/8 hover:bg-white/5 motion-reduce:transition-none"
          >
            <span class="font-rubik text-xs text-slate-200 tabular-nums">
              {row.date}
            </span>
            <span class="font-rubik text-11 text-slate-500 tabular-nums">
              {row.time}
            </span>

            <form method="POST" action="?/delete" use:enhance class="ml-auto">
              <input type="hidden" name="created_at" value={row.created_at} />
              <button
                type="submit"
                class={DELETE}
                aria-label="Delete {row.date}, {row.time}"
                title="Delete {row.date}"
              >
                <IconTrash class="size-16" aria-hidden="true" />
              </button>
            </form>
          </li>
        {/each}
      </ol>
    {/if}

    {#if data.pageCount > 1}
      <!-- The shared pager, with no sibling numbers: the reading column is
           narrow, and the full window plus the jump box would wrap. -->
      <div class="shrink-0 border-t border-white/10 px-8 py-6">
        <Pagination
          page={data.page}
          pageCount={data.pageCount}
          siblings={0}
          morph={false}
          label="Sad days pages"
          onchange={goToPage}
        />
      </div>
    {/if}
  </div>
</Container>
