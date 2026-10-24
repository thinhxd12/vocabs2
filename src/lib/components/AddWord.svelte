<script lang="ts">
  import { enhance } from "$app/forms";
  import { invalidate } from "$app/navigation";
  import { format } from "date-fns";
  import Modal from "#lib/components/Modal.svelte";
  import { addToast } from "#lib/store/toast.svelte.ts";
  import IconMagnifyingGlass from "~icons/ph/magnifying-glass";
  import IconSpinner from "~icons/svg-spinners/ring-resize";
  import IconX from "~icons/ph/x";

  interface Props {
    /** Two-way: the review toolbar opens this dialog. */
    showModal?: boolean;
  }

  let { showModal = $bindable(false) }: Props = $props();

  type Translation = { partOfSpeech: string; translation: string[] };

  /** The endpoint's answer: what the word means and whether it is already one
   *  of the account's cards. */
  type WordCheck = {
    word: string;
    translations: Translation[];
    existing: { word: string; created_at: string } | null;
  };

  let query = $state("");
  let checking = $state(false);
  let adding = $state(false);
  let check = $state<WordCheck | null>(null);
  /** Inline problem: a duplicate, or the lookup being unavailable. */
  let message = $state("");

  /** Discards a lookup that lands after a newer one, or after the dialog closed. */
  let lookupId = 0;

  /** The add button only lights when the review list does not already hold the
   *  word. The action re-checks that server-side. */
  const canAdd = $derived(!!check && !check.existing);

  const FIELD =
    "h-40 min-w-0 flex-1 rounded-8 border border-white/10 bg-white/5 px-12 text-sm text-white outline-hidden transition-colors duration-200 placeholder:text-slate-500 focus-visible:border-emerald-400/60 focus-visible:ring-1 focus-visible:ring-emerald-400/40 motion-reduce:transition-none";

  const CHECK_BTN =
    "inline-flex h-40 shrink-0 cursor-pointer touch-manipulation items-center justify-center gap-6 rounded-8 border border-white/10 bg-white/5 px-12 text-12 font-semibold text-slate-200 transition-colors duration-200 hover:bg-white/10 hover:text-white disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 motion-reduce:transition-none";

  const NOTICE =
    "rounded-8 border px-12 py-8 text-11.5 leading-snug";

  function reset() {
    lookupId += 1;
    query = "";
    check = null;
    checking = false;
    adding = false;
    message = "";
  }

  function addedLabel(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : format(date, "d MMM yyyy");
  }

  async function lookup(event: SubmitEvent) {
    event.preventDefault();

    const word = query.trim();
    if (!word) {
      message = "Type a word first.";
      return;
    }

    const id = ++lookupId;
    checking = true;
    message = "";
    check = null;

    try {
      const response = await fetch(
        `/api/word?word=${encodeURIComponent(word)}`,
      );
      const body = (await response.json().catch(() => null)) as
        | WordCheck
        | { error?: string }
        | null;

      if (id !== lookupId) return;

      if (!response.ok || !body || !("translations" in body)) {
        message =
          (body as { error?: string } | null)?.error ??
          "Could not look that word up. Please try again.";
        return;
      }

      check = body;
      query = body.word;
    } catch {
      if (id === lookupId) {
        message = "Could not look that word up. Please try again.";
      }
    } finally {
      if (id === lookupId) checking = false;
    }
  }
</script>

<Modal bind:showModal label="Add a word" onclose={reset}>
  <div
    class="relative flex max-h-[min(84dvh,38rem)] w-[min(94vw,23.625rem)] max-w-378 flex-col overflow-hidden rounded-16 border border-white/10 bg-slate-900 text-slate-100 shadow-2xl"
  >
    <div
      class="flex h-48 shrink-0 items-center border-b border-white/10 bg-white/5 pr-48 pl-16"
    >
      <p class="truncate text-sm font-semibold text-white">Add a word</p>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto p-16">
      <form onsubmit={lookup} class="flex items-center gap-8">
        <label for="new-word" class="sr-only">English word</label>

        <input
          id="new-word"
          bind:value={query}
          placeholder="Type an English word"
          autocomplete="off"
          autocapitalize="none"
          spellcheck="false"
          maxlength="64"
          aria-describedby={message ? "word-error" : undefined}
          class={FIELD}
        />

        <!-- One spinner, and it belongs to the answer below: the button stays
             its own shape while the lookup runs rather than repeating the wait
             twice in the same panel. -->
        <button type="submit" disabled={checking} class={CHECK_BTN}>
          <IconMagnifyingGlass class="size-16" aria-hidden="true" />
          <span>Look up</span>
        </button>
      </form>

      <!-- The answer is announced, not just painted: a screen reader hears the
           duplicate or the meaning without moving focus. -->
      <div class="mt-12" aria-live="polite">
        {#if message}
          <p
            id="word-error"
            role="alert"
            class="{NOTICE} border-red-400/30 bg-red-500/10 text-red-200"
          >
            {message}
          </p>
        {/if}

        {#if checking}
          <p class="flex items-center gap-8 text-11.5 text-slate-400">
            <IconSpinner class="size-14" aria-hidden="true" />
            Looking it up…
          </p>
        {:else if check}
          <p class="text-lg leading-28 font-bold break-words text-white">
            {check.word}
          </p>

          {#if check.existing}
            <p
              class="{NOTICE} mt-8 border-amber-300/25 bg-amber-300/10 text-amber-100"
            >
              Already in your review list{check.existing.created_at
                ? ` — added ${addedLabel(check.existing.created_at)}`
                : ""}.
            </p>
          {/if}

          {#if check.translations.length > 0}
            <div class="mt-12 space-y-8">
              {#each check.translations as item, i (i)}
                <div>
                  <h3 class="text-12 font-extrabold italic text-white/90">
                    {item.partOfSpeech}
                  </h3>
                  {#each item.translation as line, j (j)}
                    <p class="pl-12 text-12 leading-snug text-slate-300">
                      {line}
                    </p>
                  {/each}
                </div>
              {/each}
            </div>
            {:else}
              <p class="mt-8 text-11.5 text-slate-400">
                No translation found.
              </p>
            {/if}
        {:else if !message}
          <p class="text-11.5 leading-relaxed text-slate-400">
            Look a word up to see its meaning, then add it to your reviews.
            Duplicates are refused.
          </p>
        {/if}
      </div>

      {#if canAdd && check}
        <form
          method="POST"
          action="?/addWord"
          class="mt-16"
          use:enhance={() => {
            adding = true;

            return async ({ result }) => {
              adding = false;

              if (result.type === "success") {
                // The navbar's memories tile counts `memories_table`; the new
                // row is already in it.
                void invalidate("app:memories").catch(() => {});
                addToast({
                  type: "success",
                  title: `“${check?.word ?? query}” added`,
                  message: "It joins a future review batch.",
                });
                showModal = false;
                return;
              }

              if (result.type === "failure") {
                const failure = result.data as
                  | { error?: string }
                  | undefined;
                message = failure?.error ?? "Could not add the word.";
                return;
              }

              if (result.type === "error") {
                message = result.error?.message ?? "Could not add the word.";
              }
            };
          }}
        >
          <input type="hidden" name="word" value={check.word} />

          <button
            type="submit"
            disabled={adding}
            class="h-40 w-full cursor-pointer touch-manipulation rounded-8 bg-emerald-300 text-sm font-semibold text-emerald-950 transition-colors duration-200 hover:bg-emerald-200 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 motion-reduce:transition-none"
          >
            {adding ? "Adding…" : "Add to reviews"}
          </button>
        </form>
      {/if}
    </div>

    <!-- Last in the panel and pinned to the corner. The dialog focuses its first
         focusable element, which is then the word field — the reader opens this
         to type, not to close it. -->
    <button
      type="button"
      onclick={() => (showModal = false)}
      aria-label="Close"
      class="absolute top-6 right-8 inline-flex size-36 shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-8 text-slate-400 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-300 motion-reduce:transition-none"
    >
      <IconX class="size-16" aria-hidden="true" />
    </button>
  </div>
</Modal>
