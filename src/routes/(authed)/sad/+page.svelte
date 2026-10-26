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

  /** The white slab is the button itself: one 44px tap target, 2px corners. */
  const ADD =
    "flex w-full cursor-pointer touch-manipulation items-center gap-10 rounded-2 border border-slate-200 bg-white p-8 text-left transition-colors duration-200 outline-offset-2 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-emerald-600 active:bg-slate-100 motion-reduce:transition-none";

  const DELETE =
    "inline-flex size-32 shrink-0 touch-manipulation items-center justify-center rounded-full text-black/50 transition-colors duration-200 outline-offset-2 hover:bg-red-50 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-emerald-600 active:bg-red-100 motion-reduce:transition-none";
</script>

<svelte:head>
  <title>sad days</title>
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
    class="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2 border border-slate-200 bg-white text-black"
  >
    <form method="POST" action="?/add" use:enhance class="m-8 shrink-0">
      <button type="submit" class={ADD}>
        <span
          class="flex size-28 shrink-0 items-center justify-center rounded-2 bg-emerald-600 text-white"
        >
          <IconPlus class="size-14" aria-hidden="true" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block font-rubik text-12 font-semibold text-black">
            Mark today
          </span>
          <span class="block font-rubik text-10 leading-tight text-black/60">
            Log the moment you are in
          </span>
        </span>
      </button>
    </form>

    {#if errorMsg}
      <p
        role="alert"
        class="shrink-0 px-12 pb-8 font-rubik text-11 text-red-600"
      >
        {errorMsg}
      </p>
    {/if}

    {#if data.rows.length === 0}
      <!-- The empty card keeps the add button where it was, so the first click
           does not move the page under the pointer. -->
      <div
        class="flex flex-1 flex-col items-center justify-center gap-4 border-t border-slate-200 px-16 py-40 text-center"
      >
        <IconSmileySad class="size-24 text-black/50" aria-hidden="true" />
        <p class="font-serif text-14 text-black/60 italic">
          No sad days marked yet.
        </p>
      </div>
    {:else}
      <div
        class="grid shrink-0 grid-cols-[minmax(0,1fr)_auto_32px] items-center gap-8 border-t border-slate-200 py-6 pr-8 pl-12"
      >
        <span
          class="font-rubik text-10 font-semibold tracking-[0.18em] text-black/60 uppercase"
        >
          Date
        </span>
        <span
          class="font-rubik text-10 font-semibold tracking-[0.18em] text-black/60 uppercase"
        >
          Time
        </span>
        <span class="sr-only">Delete</span>
      </div>

      <ol class="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        {#each data.rows as row (row.created_at)}
          <li
            class="grid grid-cols-[minmax(0,1fr)_auto_32px] items-center gap-8 border-l-2 border-transparent py-4 pr-8 pl-10 transition-colors duration-150 not-last:border-b not-last:border-slate-200 hover:border-l-red-400 hover:bg-slate-50 motion-reduce:transition-none"
          >
            <span
              class="font-rubik text-12 font-500 text-black tabular-nums"
            >
              {row.date}
            </span>
            <span class="font-rubik text-11 text-black/60 tabular-nums">
              {row.time}
            </span>

            <form method="POST" action="?/delete" use:enhance>
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
      <div class="shrink-0 border-t border-slate-200 bg-slate-50 px-8 py-6">
        <Pagination
          page={data.page}
          pageCount={data.pageCount}
          siblings={0}
          morph={false}
          tone="light"
          label="Sad days pages"
          onchange={goToPage}
        />
      </div>
    {/if}
  </div>
</Container>
