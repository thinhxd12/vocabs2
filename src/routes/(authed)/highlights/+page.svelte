<script lang="ts">
  import { enhance } from "$app/forms";
  import { format } from "date-fns";
  import { onDestroy, onMount } from "svelte";
  import { quadInOut } from "svelte/easing";
  import { Spring, Tween } from "svelte/motion";
  import { SvelteMap } from "svelte/reactivity";
  import { innerHeight, innerWidth } from "svelte/reactivity/window";
  import Container from "#lib/components/Container.svelte";
  import HighlightPage from "#lib/components/HighlightPage.svelte";
  import Modal from "#lib/components/Modal.svelte";
  import StarRating from "#lib/components/StarRating.svelte";
  import {
    clearNoteDraft,
    readNoteDraft,
    writeNoteDraft,
  } from "#lib/note-draft.ts";
  import { safeHighlightHtml } from "#lib/sanitize.ts";
  import type { BookDetail, BookPageContent, Highlight } from "#lib/types.ts";
  import IconBookmarkSimple from "~icons/ph/bookmark-simple";
  import IconCheck from "~icons/ph/check";
  import IconSpinner from "~icons/svg-spinners/ring-resize";
  import IconX from "~icons/ph/x";
  import MaterialSymbolsTranslateRounded from "~icons/material-symbols/translate-rounded";
  import MaterialSymbolsContentCopyOutlineRounded from "~icons/material-symbols/content-copy-outline-rounded";
  import MaterialSymbolsShuffleRounded from "~icons/material-symbols/shuffle-rounded";
  import MaterialSymbolsEditSquareOutlineRounded from "~icons/material-symbols/edit-square-outline-rounded";
  import MaterialSymbolsDatabaseUploadOutlineRounded from "~icons/material-symbols/database-upload-outline-rounded";
  import MaterialSymbolsDeleteForeverOutlineRounded from "~icons/material-symbols/delete-forever-outline-rounded";
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const RATIO = 1.61803398875;
  const FIELDS =
    "id, authors, bookTile, content, dateOfCreation, like, location, page, type, note";

  const PANEL =
    "flex min-h-0 max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-[2px] bg-white text-black shadow-2xl";
  const HEADER =
    "flex h-48 shrink-0 items-center justify-between gap-8 bg-black pr-8 pl-16 text-white";
  const CLOSE =
    "flex size-36 shrink-0 cursor-pointer items-center justify-center rounded-2 text-slate-200 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-300";
  const FIELD =
    "w-full rounded-2 border border-slate-300 bg-white px-12 py-8 text-14 text-black outline-hidden transition-colors placeholder:text-black/50 focus-visible:border-emerald-600 focus-visible:ring-1 focus-visible:ring-emerald-600/30";
  const LABEL = "mb-6 block text-12 font-medium text-black/70";

  // Seeded from the server load, then owned locally while the reader flips
  // through highlights; `update()` after a form action does not replace it.
  // svelte-ignore state_referenced_locally
  let highlight = $state<Highlight | null>(data.highlight);
  let bookInfo = $state<BookDetail | null>(null);
  const infoCache = new SvelteMap<string, BookDetail | null>();

  let likeBookmark = $state(false);
  /** Blocks keys while the cover or a page is mid-animation. */
  let keyPressed = $state(false);
  let busy = $state(false);

  const tweenCover = new Spring(0, { stiffness: 0.06, damping: 0.4 });
  const tweenRibbon = new Tween(21, { duration: 150, easing: quadInOut });

  let flipCover = $state(false);
  let currentPage = $state(0);
  let flipPages = $state<BookPageContent[]>([]);

  let showEdit = $state(false);
  let showInsert = $state(false);
  let showDelete = $state(false);
  let showNote = $state(false);
  let expandDesc = $state(false);
  let isSubmitting = $state(false);
  let deleting = $state(false);
  let highlightEdit = $state<Highlight | null>(null);
  let recent = $state<Highlight[]>([]);
  let noteContent = $state("");
  /** The note as the database last confirmed it; drafts are measured against
   *  this rather than the optimistic value, so a failed save keeps its draft. */
  let noteBase = $state("");
  let showTranslated = $state(false);
  let translatedContent = $state("");

  let flipTimeout: ReturnType<typeof setTimeout> | undefined;
  let flagTimeout: ReturnType<typeof setTimeout> | undefined;
  let resetTimeout: ReturnType<typeof setTimeout> | undefined;
  let measureEl: HTMLDivElement | undefined;

  const modalOpen = $derived(showEdit || showInsert || showDelete);

  /* The book keeps its golden-ratio proportions and shrinks to fit whichever
     side of the viewport runs out first. */
  const pageWidth = $derived.by(() => {
    const viewportHeight = innerHeight.current ?? 800;
    const viewportWidth = innerWidth.current ?? 1200;
    const byHeight = Math.round(RATIO * Math.max(220, viewportHeight - 160));
    const byWidth = Math.max(320, Math.round(viewportWidth - 32));
    const width = Math.min(byHeight, byWidth);
    return width % 2 === 0 ? width : width - 1;
  });
  const pageHeight = $derived(Math.round(pageWidth / RATIO));
  const textWidth = $derived(pageWidth / 2 - 12 - 112);
  const textHeight = $derived(pageHeight - 24 - 96);

  /* The edit and import dialogs take the open book's footprint, but keep a
     usable minimum on phones where that footprint is a short landscape. */
  const dialogWidth = $derived(Math.max(320, pageWidth));
  const dialogHeight = $derived(
    Math.min(Math.max(360, pageHeight), (innerHeight.current ?? 800) - 48),
  );

  const likes = $derived(highlight?.like ?? 0);
  const noteDirty = $derived(
    !!highlight && noteContent !== (highlight.note ?? ""),
  );

  function prettyStamp(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : format(date, "p cccc, yyyy-MM-dd");
  }

  function ribbonFontSize(value: number) {
    const digits = String(Math.max(0, value)).length;
    return Math.max(14, 27 - (digits - 1) * 4);
  }

  // === Book pagination ===================================================
  /**
   * Measures a chunk of the highlight in the offscreen node the page keeps on
   * `<body>`; the page is split by words so each chunk fits one printed side.
   */
  function measureHeight(markup: string, width: number, firstPage = false) {
    if (!measureEl) {
      measureEl = document.createElement("div");
      measureEl.setAttribute("aria-hidden", "true");
      measureEl.style.position = "absolute";
      measureEl.style.visibility = "hidden";
      measureEl.style.left = "-9999px";
      measureEl.style.top = "0";
      measureEl.style.pointerEvents = "none";
      document.body.appendChild(measureEl);
    }

    measureEl.className = firstPage
      ? "highlightContent highlightContentFirstPage"
      : "highlightContent";
    measureEl.innerHTML = safeHighlightHtml(markup);
    measureEl.style.width = `${width}px`;
    return measureEl.clientHeight;
  }

  function splitIntoBlocks(text: string) {
    const words = text.trim().split(/\s+/);
    const maxHeight = Math.max(60, textHeight);
    const maxWidth = Math.max(60, textWidth);
    const blocks: string[] = [];

    for (const word of words) {
      if (blocks.length === 0) {
        blocks.push(word);
        continue;
      }

      const candidate = `${blocks[blocks.length - 1]} ${word}`;
      const fits =
        measureHeight(candidate, maxWidth, blocks.length === 1) < maxHeight;

      if (fits) blocks[blocks.length - 1] = candidate;
      else blocks.push(word);
    }

    // Two sides per sheet: an odd tail gets a blank verso.
    if (blocks.length % 2 !== 0) blocks.push("");

    return blocks;
  }

  function setBookContent(content: string) {
    const blocks = splitIntoBlocks(content);

    flipPages = blocks.reduce<BookPageContent[]>((pages, block, index) => {
      if (index % 2 === 0) {
        pages.push({
          id: 1 + index / 2,
          front: block,
          back: blocks[index + 1] ?? "",
          flip: false,
        });
      }
      return pages;
    }, []);
  }

  // === Data ==============================================================
  async function loadBookInfo(row: Highlight) {
    const author = (row.authors ?? "").split(";")[0].trim();
    const key = `${row.bookTile}::${author}`;

    if (infoCache.has(key)) {
      bookInfo = infoCache.get(key) ?? null;
      return;
    }

    bookInfo = null;

    try {
      const params = new URLSearchParams({ query: row.bookTile, author });
      const response = await fetch(`/api/bookinfo?${params}`);

      if (!response.ok) {
        infoCache.set(key, null);
        return;
      }

      const info = (await response.json()) as BookDetail | null;
      infoCache.set(key, info);
      if (highlight?.id === row.id) bookInfo = info;
    } catch {
      infoCache.set(key, null);
    }
  }

  function applyHighlight(row: Highlight) {
    highlight = row;
    noteBase = row.note ?? "";
    const draft = readNoteDraft(row.id, noteBase);
    noteContent = draft ?? noteBase;
    likeBookmark = false;
    showTranslated = false;
    translatedContent = "";
    currentPage = 0;
    setBookContent(row.content ?? "");
    void loadBookInfo(row);
  }

  /** Keeps the unfinished note across route changes, reloads and closed tabs. */
  function rememberNoteDraft(event: Event) {
    const id = highlight?.id;
    if (!id) return;

    writeNoteDraft(
      id,
      (event.currentTarget as HTMLTextAreaElement).value,
      noteBase,
    );
  }

  async function remember(id: string) {
    const supabase = data.supabase;
    if (!supabase) return;

    const { data: rows } = await supabase
      .from("dashboard_table")
      .select("user")
      .limit(1);

    const owner = rows?.[0]?.user;
    if (!owner) return;

    await supabase
      .from("dashboard_table")
      .update({ currentHighlightId: id })
      .eq("user", owner);
  }

  async function saveNote() {
    const supabase = data.supabase;
    const current = highlight;

    if (!supabase || !current || noteContent === current.note) return false;

    const previous = current.note;
    // Snapshot the text being written: the reader may type on while the
    // request is in flight, and what comes back describes `next`, not the
    // textarea's newest value.
    const next = noteContent;
    highlight = { ...current, note: next };

    const { error } = await supabase
      .from("bookmark_table")
      .update({ note: next })
      .eq("id", current.id);

    if (error) {
      // Keep the unsaved text: the editor still holds it, the row does not.
      // Only the highlight still on screen may be reverted.
      if (highlight?.id === current.id)
        highlight = { ...current, note: previous };
      return false;
    }

    const stillHere = highlight?.id === current.id;
    if (stillHere) noteBase = next;

    // The database holds this text now, so the draft has done its job — unless
    // more was typed while the write was in flight.
    if (stillHere && noteContent !== next) {
      writeNoteDraft(current.id, noteContent, next);
    } else {
      clearNoteDraft(current.id);
    }

    return true;
  }

  // === Book motion =======================================================
  function openBook() {
    if (!highlight) return;

    flipCover = true;
    tweenCover.target = -180;

    if (likes > 0) {
      setTimeout(() => {
        tweenRibbon.target = likeBookmark ? 580 : 480;
      }, 250);
    }
  }

  function closeBook(next: Highlight) {
    keyPressed = true;
    tweenRibbon.target = 21;

    const anyFlipped = flipPages.some((page) => page.flip);

    if (anyFlipped) {
      flipPages.forEach((page, index) => {
        setTimeout(
          () => {
            page.flip = false;
          },
          (flipPages.length - index - 1) * 150,
        );
      });

      flipTimeout = setTimeout(() => {
        tweenCover.target = 0;
        flipCover = false;
      }, flipPages.length * 150);

      resetTimeout = setTimeout(
        () => {
          applyHighlight(next);
          keyPressed = false;
        },
        flipPages.length * 150 + 300,
      );
    } else {
      tweenCover.target = 0;
      flipCover = false;

      flipTimeout = setTimeout(() => {
        applyHighlight(next);
        keyPressed = false;
      }, 300);
    }
  }

  function flipPage(id: number) {
    keyPressed = true;
    tweenRibbon.target = 21;
    currentPage = id;

    const page = flipPages[id - 1];
    if (page) page.flip = !page.flip;

    flipTimeout = setTimeout(() => {
      keyPressed = false;
    }, 400);

    if (flipCover && highlight && likes > 0) {
      flagTimeout = setTimeout(() => {
        tweenRibbon.target = likeBookmark ? 580 : 480;
      }, 400);
    }
  }

  // === Navigation ========================================================
  async function navigate(direction: 1 | -1) {
    if (!highlight) return;

    const supabase = data.supabase;
    if (!supabase) return;

    showNote = false;
    void saveNote();
    busy = true;

    const query = supabase.from("bookmark_table").select(FIELDS);
    const { data: rows } =
      direction > 0
        ? await query
            .order("id", { ascending: true })
            .gt("id", highlight.id)
            .limit(1)
        : await query
            .order("id", { ascending: false })
            .lt("id", highlight.id)
            .limit(1);

    if (!rows?.length) {
      // Wrap around: past the last highlight comes the first one.
      const { data: wrapped } = await supabase
        .from("bookmark_table")
        .select(FIELDS)
        .order("id", { ascending: direction > 0 })
        .limit(1);

      busy = false;

      if (wrapped?.length) {
        const row = wrapped[0] as Highlight;
        closeBook(row);
        void remember(row.id);
      }
      return;
    }

    busy = false;
    const row = rows[0] as Highlight;
    closeBook(row);
    void remember(row.id);
  }

  async function randomBookmark() {
    if (!highlight) return;

    const supabase = data.supabase;
    if (!supabase) return;

    showNote = false;
    void saveNote();
    busy = true;

    const { data: rows } = await supabase.rpc("get_random_bookmark");
    busy = false;

    if (!Array.isArray(rows) || rows.length === 0) return;

    const row = rows[0] as Highlight;
    closeBook(row);
    void remember(row.id);
  }

  async function toggleLike() {
    if (!highlight) return;

    const supabase = data.supabase;
    const nextLiked = !likeBookmark;
    const nextLike = Math.max(0, highlight.like + (nextLiked ? 1 : -1));

    likeBookmark = nextLiked;
    highlight = { ...highlight, like: nextLike };
    tweenRibbon.target = nextLike === 0 ? 21 : nextLiked ? 580 : 480;

    if (!supabase) return;

    await supabase
      .from("bookmark_table")
      .update({ like: nextLike })
      .eq("id", highlight.id);
  }

  function copyHighlight() {
    if (!highlight) return;

    // A blocked clipboard is not worth interrupting the reader for.
    void navigator.clipboard
      .writeText(
        `Break down this quote, after that give me a clear, everyday example of what this looks like in practice today: ${highlight.content}`,
      )
      .catch(() => {});
  }

  async function translateHighlight() {
    if (!highlight) return;

    if (!translatedContent) {
      busy = true;
      try {
        const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=vi&q=${encodeURIComponent(highlight.content)}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error("translate failed");

        const payload = (await response.json()) as unknown;
        const first = Array.isArray(payload) ? payload[0] : null;
        const text = Array.isArray(first) ? first[0] : first;

        if (typeof text !== "string" || text.length === 0)
          throw new Error("empty");

        translatedContent = text;
      } catch {
        busy = false;
        return;
      }
      busy = false;
    }

    // Close the cover, swap the language, then let the reader open it again.
    tweenRibbon.target = 21;
    tweenCover.target = 0;
    flipCover = false;

    flipTimeout = setTimeout(() => {
      showTranslated = !showTranslated;
      setBookContent(showTranslated ? translatedContent : highlight!.content);
      currentPage = 0;
      keyPressed = false;
    }, 300);
  }

  async function deleteHighlight() {
    if (!highlight) return;

    const supabase = data.supabase;
    if (!supabase) return;

    deleting = true;
    const { error } = await supabase
      .from("bookmark_table")
      .delete()
      .eq("id", highlight.id);
    deleting = false;

    if (error) return;

    clearNoteDraft(highlight.id);
    showDelete = false;

    const { count } = await supabase
      .from("bookmark_table")
      .select("id", { count: "exact", head: true });

    if (!count) {
      // Nothing left to read: fall back to the import card.
      highlight = null;
      flipCover = false;
      currentPage = 0;
      tweenCover.target = 0;
      return;
    }

    await navigate(1);
  }

  // === Dialogs ===========================================================
  async function openInsert() {
    isSubmitting = false;
    showInsert = true;
    await refreshRecent();
  }

  async function refreshRecent() {
    const supabase = data.supabase;
    if (!supabase) return;

    const { data: rows } = await supabase
      .from("bookmark_table")
      .select(FIELDS)
      .order("id", { ascending: false })
      .limit(9);

    recent = (rows ?? []) as Highlight[];
  }

  function openEdit() {
    if (!highlight) return;
    void saveNote();
    highlightEdit = { ...highlight };
    isSubmitting = false;
    showEdit = true;
  }

  // === Keyboard ==========================================================
  function onKeyDown(event: KeyboardEvent) {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      target.closest('input, textarea, select, [contenteditable="true"]')
    ) {
      return;
    }

    if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
    if (modalOpen || !highlight) return;
    if (keyPressed) {
      event.preventDefault();
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      if (!flipCover) openBook();
      else if (currentPage === 0) flipPage(1);
      else if (currentPage >= flipPages.length) {
        if (flipPages[currentPage - 1]?.flip) void navigate(1);
        else flipPage(currentPage);
      } else if (flipPages[currentPage - 1]?.flip) flipPage(currentPage + 1);
      else flipPage(currentPage);
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (!flipCover) return;
      if (currentPage === 0) void navigate(-1);
      else if (currentPage === 1) {
        if (flipPages[0]?.flip) flipPage(1);
        else void navigate(-1);
      } else if (flipPages[currentPage - 1]?.flip) flipPage(currentPage);
      else flipPage(currentPage - 1);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (flipCover) void toggleLike();
    }
  }

  // === Lifecycle =========================================================
  onMount(() => {
    if (!highlight) return;
    applyHighlight(highlight);
  });

  onDestroy(() => {
    clearTimeout(flipTimeout);
    clearTimeout(flagTimeout);
    clearTimeout(resetTimeout);
    measureEl?.remove();
    measureEl = undefined;
    void saveNote();
  });
</script>

<svelte:head>
  <title>{highlight ? `📖 ${highlight.bookTile}` : "📖"}</title>
  <meta
    name="description"
    content="Read your saved book highlights as a flipping book."
  />
</svelte:head>

<Container fullscreen class="gap-0">
  {#if highlight}
    <div
      class="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden px-12 py-12"
    >
      <div class="book" style="width: {pageWidth}px; height: {pageHeight}px;">
        <!-- Closed cover; rotates around the spine when opened. -->
        <div
          class="flip flipCover"
          style="z-index: {tweenCover.current <= -90
            ? 4
            : 4 +
              flipPages.length}; transform: rotateY({tweenCover.current}deg);"
        >
          <div class="frontPage">
            <div
              class="frontCover"
              style="width: {pageWidth / 2}px; height: {pageHeight}px;"
            >
              {#if bookInfo?.coverImage}
                <img
                  src={bookInfo.coverImage}
                  alt="Cover of {highlight.bookTile}"
                  class="h-full w-full object-contain"
                  loading="lazy"
                />
              {:else}
                <div class="flex h-full w-full items-center p-[12%]">
                  <p
                    class="font-serif text-40 leading-[1.15] font-semibold text-[#d0c9c5]"
                  >
                    take a small step every day
                  </p>
                </div>
              {/if}
            </div>

            <button
              type="button"
              class="pageButton"
              aria-label="Open the book"
              onclick={openBook}
            ></button>
          </div>

          <div class="backPage">
            <div
              class="infoPage"
              style="width: {pageWidth / 2}px; height: {pageHeight}px;"
            >
              <div class="infoPageContent frontCoverPaper">
                <div class="info-scroll no-scrollbar">
                  {#if bookInfo?.coverImage}
                    <img
                      src={bookInfo.coverImage}
                      alt=""
                      class="h-2/5 object-contain"
                      style="filter: drop-shadow(0 2px 8px rgba(0,0,0,.2));"
                    />
                  {/if}

                  <p class="book-title">
                    {bookInfo?.title ?? highlight.bookTile}
                  </p>

                  <p class="book-authors">
                    {(bookInfo?.authors?.length
                      ? bookInfo.authors.join(", ")
                      : highlight.authors) ?? ""}
                  </p>

                  {#if bookInfo?.rating && bookInfo.numberOfRatings}
                    <div
                      class="mt-4 mb-8 flex items-center justify-center gap-8"
                    >
                      <StarRating
                        rating={Number(bookInfo.rating)}
                        size={16}
                        gap={4}
                      />
                      <span class="book-meta text-13">{bookInfo.rating}</span>
                    </div>
                    <p class="book-meta">
                      {Number(bookInfo.numberOfRatings).toLocaleString()} ratings
                    </p>
                  {/if}

                  {#if bookInfo?.description}
                    <div class="mt-8 w-full text-left">
                      <p class={["book-description", { clamped: !expandDesc }]}>
                        {bookInfo.description}
                      </p>
                      <button
                        type="button"
                        onclick={() => (expandDesc = !expandDesc)}
                        class="mt-4 float-right text-11 font-semibold text-[#1e1915]"
                      >
                        {expandDesc ? "Show less" : "Show more"}
                      </button>
                    </div>
                  {/if}

                  {#if bookInfo?.numberOfPages}
                    <p class="book-meta">
                      {bookInfo.numberOfPages} pages, Paperback
                    </p>
                  {/if}

                  {#if bookInfo?.firstPublished}
                    <p class="book-meta">
                      First published {bookInfo.firstPublished}
                    </p>
                  {/if}

                  <p class="book-meta">
                    Page {highlight.page}, bookmarked at {prettyStamp(
                      highlight.dateOfCreation,
                    )}
                  </p>
                </div>

                <div class="toolbar">
                  <button
                    type="button"
                    class="tool-btn"
                    aria-label={showTranslated
                      ? "Show the original highlight"
                      : "Translate the highlight"}
                    title={showTranslated ? "Original" : "Translate"}
                    onclick={translateHighlight}
                  >
                    <MaterialSymbolsTranslateRounded
                      class="size-15"
                      aria-hidden="true"
                    />
                  </button>

                  <button
                    type="button"
                    class="tool-btn"
                    aria-label="Copy the highlight"
                    title="Copy"
                    onclick={copyHighlight}
                  >
                    <MaterialSymbolsContentCopyOutlineRounded
                      class="size-15"
                      aria-hidden="true"
                    />
                  </button>

                  <button
                    type="button"
                    class="tool-btn"
                    aria-label="Random highlight"
                    title="Random"
                    onclick={randomBookmark}
                  >
                    <MaterialSymbolsShuffleRounded
                      class="size-15"
                      aria-hidden="true"
                    />
                  </button>

                  <button
                    type="button"
                    class="tool-btn"
                    aria-label="Edit the highlight"
                    title="Edit"
                    onclick={openEdit}
                  >
                    <MaterialSymbolsEditSquareOutlineRounded
                      class="size-15"
                      aria-hidden="true"
                    />
                  </button>

                  <button
                    type="button"
                    class="tool-btn"
                    aria-label="Import Kindle highlights"
                    title="Import"
                    onclick={openInsert}
                  >
                    <MaterialSymbolsDatabaseUploadOutlineRounded
                      class="size-15"
                      aria-hidden="true"
                    />
                  </button>

                  <button
                    type="button"
                    class="tool-btn tool-btn-danger"
                    aria-label="Delete the highlight"
                    title="Delete"
                    onclick={() => (showDelete = true)}
                  >
                    <MaterialSymbolsDeleteForeverOutlineRounded
                      class="size-15"
                      aria-hidden="true"
                    />
                  </button>
                </div>
              </div>
            </div>

            <button
              type="button"
              class="pageButton"
              aria-label="Previous highlight"
              onclick={() => navigate(-1)}
            ></button>
          </div>
        </div>

        <!-- Printed sheets: only mounted once the cover has swung aside. -->
        {#if tweenCover.current < -90}
          {#each flipPages as sheet (sheet.id)}
            <HighlightPage
              data={sheet}
              innerWidth={textWidth}
              innerHeight={textHeight}
              length={flipPages.length}
              handleFlip={flipPage}
            />
          {/each}
        {/if}

        <div class="backShadow" style="z-index: 1;"></div>

        {#if tweenCover.current < -170}
          <div class="frontShadow" style="z-index: 2;"></div>
        {/if}

        <div class="backCover" style="z-index: 3;">
          <div class="h-full w-full backCoverPaper"></div>
          <button
            type="button"
            class="pageButton"
            aria-label="Next highlight"
            disabled={keyPressed}
            onclick={() => navigate(1)}
          ></button>
        </div>

        <button
          type="button"
          class="ribbon {tweenRibbon.current > 150
            ? 'ribbonLong'
            : 'ribbonShort'}"
          aria-label={likeBookmark ? "Remove like" : "Like this highlight"}
          aria-pressed={likeBookmark}
          style="height: {tweenRibbon.current}px; {tweenRibbon.current > 21
            ? 'box-shadow: 1px 1px 3px rgba(0,0,0,0.6); z-index: 999;'
            : 'z-index: 3;'}"
          onclick={toggleLike}
        >
          {#if tweenRibbon.current > 240}
            <span
              class="ribbonContent"
              style="font-size: {ribbonFontSize(likes)}px;"
            >
              {likes > 0 ? likes : ""}
            </span>
          {/if}
          {#if tweenRibbon.current > 21}
            <span
              class="ribbonTail {tweenRibbon.current > 150
                ? 'ribbonTailLong'
                : 'ribbonTailShort'}"
            ></span>
          {/if}
        </button>
      </div>

      {#if busy}
        <div
          class="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <IconSpinner class="size-24 text-emerald-300" aria-hidden="true" />
          <span class="sr-only">Loading highlight</span>
        </div>
      {/if}
    </div>

    <!-- Sticky note, clipped to a tab until pulled out. -->
    <div
      class={["note-drawer", { ready: flipCover, open: flipCover && showNote }]}
    >
      <button
        type="button"
        class={["note-tape", { dirty: noteDirty }]}
        aria-label="Save note"
        title="Save note"
        onclick={() => void saveNote()}
      >
        <IconCheck class="size-12" aria-hidden="true" />
        <span>{noteDirty ? "Save" : "Saved"}</span>
      </button>

      <div class="note-page">
        <textarea
          name="note"
          aria-label="Note for this highlight"
          placeholder="Write a note…"
          bind:value={noteContent}
          oninput={rememberNoteDraft}
          onblur={saveNote}></textarea>
      </div>

      <button
        type="button"
        class="note-toggle"
        aria-label={showNote ? "Hide the note" : "Show the note"}
        aria-expanded={showNote}
        onclick={() => {
          showNote = !showNote;
          if (!showNote) void saveNote();
        }}
      >
        <span aria-hidden="true">{showNote ? "›" : "‹"}</span>
      </button>
    </div>
  {:else}
    <div class="flex min-h-0 flex-1 items-center justify-center px-16">
      <div
        class="flex w-full max-w-sm flex-col items-center gap-8 rounded-16 border border-white/10 bg-black/45 px-24 py-32 text-center backdrop-blur-md"
      >
        <IconBookmarkSimple
          class="size-28 text-emerald-300"
          aria-hidden="true"
        />
        <p class="text-14 font-semibold text-white">No highlights yet</p>
        <p class="max-w-[30ch] text-12 leading-relaxed text-slate-300">
          Import your Kindle clippings and they will be bound into a book here.
        </p>
        <button
          type="button"
          onclick={openInsert}
          class="mt-8 h-30 cursor-pointer rounded-2 bg-emerald-400 px-16 text-12 font-semibold text-slate-950 transition-colors hover:bg-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
        >
          Import highlights
        </button>
      </div>
    </div>
  {/if}
</Container>

<!-- === Edit ============================================================ -->
<Modal bind:showModal={showEdit} label="Edit highlight">
  <div class={PANEL} style="width: {dialogWidth}px; height: {dialogHeight}px;">
    <div class={HEADER}>
      <p class="truncate text-14 font-semibold">Edit highlight</p>
      <button
        type="button"
        onclick={() => (showEdit = false)}
        aria-label="Close"
        class={CLOSE}
      >
        <IconX class="size-16" aria-hidden="true" />
      </button>
    </div>

    {#if highlightEdit}
      <form
        method="post"
        action="?/editBookmark"
        class="grid min-h-0 flex-1 grid-cols-1 gap-x-24 gap-y-16 overflow-y-auto p-16 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:p-20"
        use:enhance={() => {
          isSubmitting = true;
          return async ({ result, update }) => {
            isSubmitting = false;

            if (result.type !== "success") return;

            const edited = highlightEdit;
            showEdit = false;
            await update({ reset: false });
            if (edited) closeBook(edited);
          };
        }}
      >
        <input type="hidden" name="id" value={highlightEdit.id} />

        <div class="flex min-h-0 flex-col gap-16">
          <label class="block">
            <span class={LABEL}>Book title</span>
            <input
              type="text"
              name="bookTile"
              autocomplete="off"
              class={FIELD}
              bind:value={highlightEdit.bookTile}
            />
          </label>

          <label class="block">
            <span class={LABEL}>Authors</span>
            <input
              type="text"
              name="authors"
              autocomplete="off"
              class={FIELD}
              bind:value={highlightEdit.authors}
            />
          </label>

          <label class="block">
            <span class={LABEL}>Date of creation</span>
            <input
              type="text"
              name="dateOfCreation"
              autocomplete="off"
              class={FIELD}
              bind:value={highlightEdit.dateOfCreation}
            />
          </label>

          <label class="block">
            <span class={LABEL}>Likes</span>
            <input
              type="number"
              name="like"
              min="0"
              class={FIELD}
              bind:value={highlightEdit.like}
            />
          </label>
        </div>

        <div class="flex min-h-0 flex-col gap-8">
          <div class="flex flex-wrap items-center gap-6">
            <span class="mr-4 text-12 font-medium text-black/70">Content</span>
            {#each [{ label: "Open paragraph", tag: "<p>" }, { label: "Close paragraph", tag: "</p>" }, { label: "Open quote", tag: "<cite>" }, { label: "Close quote", tag: "</cite>" }] as helper (helper.label)}
              <button
                type="button"
                class="h-28 cursor-pointer rounded-2 border border-slate-300 bg-slate-50 px-8 font-mono text-10 text-black/70 transition-colors hover:bg-slate-100 hover:text-black"
                aria-label="Copy {helper.label} tag"
                onclick={() =>
                  navigator.clipboard.writeText(helper.tag).catch(() => {})}
              >
                {helper.tag}
              </button>
            {/each}
          </div>
          <textarea
            name="content"
            spellcheck="false"
            class="book-field min-h-180 flex-1 resize-none"
            bind:value={highlightEdit.content}></textarea>
        </div>

        <div class="flex items-center gap-8 sm:col-span-2">
          <button
            type="submit"
            disabled={isSubmitting}
            class="h-30 cursor-pointer rounded-2 bg-emerald-600 px-16 text-12 font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          >
            {isSubmitting ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            class="h-30 cursor-pointer rounded-2 px-12 text-12 font-medium text-black/70 transition-colors hover:bg-slate-100 hover:text-black"
            onclick={() => (showEdit = false)}
          >
            Cancel
          </button>
        </div>
      </form>
    {/if}
  </div>
</Modal>

<!-- === Import ========================================================== -->
<Modal bind:showModal={showInsert} label="Import Kindle highlights">
  <div class={PANEL} style="width: {dialogWidth}px; height: {dialogHeight}px;">
    <div class={HEADER}>
      <p class="truncate text-14 font-semibold">Import highlights</p>
      <button
        type="button"
        onclick={() => (showInsert = false)}
        aria-label="Close"
        class={CLOSE}
      >
        <IconX class="size-16" aria-hidden="true" />
      </button>
    </div>

    <div
      class="grid min-h-0 flex-1 grid-cols-1 gap-20 overflow-y-auto p-16 sm:grid-cols-2 sm:gap-24 sm:p-20"
    >
      <form
        method="post"
        action="?/insertBookmark"
        class="flex min-h-0 flex-col gap-12"
        use:enhance={() => {
          isSubmitting = true;
          return async ({ result, update }) => {
            isSubmitting = false;

            if (result.type !== "success") return;

            await update();
            await refreshRecent();

            // Importing from the empty state should reveal the new book.
            if (!highlight) {
              const supabase = data.supabase;
              if (supabase) {
                const { data: rows } = await supabase
                  .from("bookmark_table")
                  .select(FIELDS)
                  .order("id", { ascending: false })
                  .limit(1);

                if (rows?.[0]) applyHighlight(rows[0] as Highlight);
              }
            }
          };
        }}
      >
        <label class="flex min-h-0 flex-1 flex-col">
          <span class={LABEL}>Kindle clippings</span>
          <textarea
            name="content"
            required
            spellcheck="false"
            placeholder="Paste the contents of My Clippings.txt"
            class="{FIELD} min-h-160 flex-1 resize-none font-mono text-11 leading-relaxed"
          ></textarea>
        </label>

        <div class="flex items-center gap-8">
          <button
            type="submit"
            disabled={isSubmitting}
            class="h-30 rounded-2 bg-emerald-600 px-16 text-12 font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          >
            {isSubmitting ? "Importing…" : "Import"}
          </button>
          <button
            type="button"
            class="h-30 cursor-pointer rounded-2 px-12 text-12 font-medium text-black/70 transition-colors hover:bg-slate-100 hover:text-black"
            onclick={() => (showInsert = false)}
          >
            Cancel
          </button>
        </div>
      </form>

      <div class="flex min-h-0 flex-col border-slate-200 sm:border-l sm:pl-24">
        {#if recent.length > 0}
          <p
            class="mb-8 text-10 font-semibold tracking-[0.18em] text-black/60 uppercase"
          >
            Latest highlights
          </p>
          <div
            class="min-h-0 flex-1 overflow-auto rounded-2 border border-slate-300"
          >
            <table class="w-full text-left text-11">
              <thead class="bg-slate-50 text-black/60">
                <tr>
                  <th scope="col" class="px-10 py-6 font-medium">Book</th>
                  <th scope="col" class="px-10 py-6 font-medium">Added</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200">
                {#each recent as item (item.id)}
                  <tr class="text-black/80">
                    <td class="max-w-160 truncate px-10 py-6"
                      >{item.bookTile}</td
                    >
                    <td class="px-10 py-6 whitespace-nowrap tabular-nums">
                      {prettyStamp(item.dateOfCreation)}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else}
          <div
            class="flex flex-1 items-center justify-center rounded-2 border border-dashed border-slate-300 px-16 text-center"
          >
            <p class="max-w-[24ch] text-11 leading-relaxed text-black/60">
              Imported highlights will be listed here.
            </p>
          </div>
        {/if}
      </div>
    </div>
  </div>
</Modal>

<!-- === Delete ========================================================== -->
<Modal bind:showModal={showDelete} label="Delete highlight">
  <div
    class="w-[min(94vw,22rem)] overflow-hidden rounded-[2px] bg-white text-black shadow-2xl"
  >
    <div class={HEADER}>
      <p class="truncate text-14 font-semibold">Delete highlight</p>
      <button
        type="button"
        onclick={() => (showDelete = false)}
        aria-label="Close"
        class={CLOSE}
      >
        <IconX class="size-16" aria-hidden="true" />
      </button>
    </div>
    <div class="p-20">
      <p class="text-14 leading-relaxed text-black/70">
        “{highlight?.bookTile ?? ""}” will be removed from your book. This
        cannot be undone.
      </p>
      <div class="mt-16 flex items-center justify-end gap-8">
        <button
          type="button"
          class="h-30 cursor-pointer rounded-2 px-12 text-12 font-medium text-black/70 transition-colors hover:bg-slate-100 hover:text-black"
          onclick={() => (showDelete = false)}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={deleting}
          class="h-30 rounded-2 bg-red-600 px-16 text-12 font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
          onclick={deleteHighlight}
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  </div>
</Modal>

<svelte:window onkeydown={onKeyDown} />

<style lang="postcss">
  .book {
    perspective: 6000px;
    position: relative;
    display: flex;
    justify-content: center;
  }

  .flip {
    transform-style: preserve-3d;
    position: absolute;
    bottom: 12px;
    top: 12px;
  }

  .flipCover {
    bottom: 0;
    top: 0;
  }

  .frontPage {
    position: absolute;
    user-select: text;
    top: 0;
    left: 0;
    z-index: 0;
    backface-visibility: hidden;
    box-shadow: 2px 0 2px rgba(0, 0, 0, 0.45);
  }

  .backPage {
    position: absolute;
    user-select: text;
    backface-visibility: hidden;
    top: 0;
    left: 0;
    z-index: 1;
    transform: rotateY(180deg);
    box-shadow: -2px 0 2px rgba(0, 0, 0, 0.45);
  }

  .flipCover .frontPage {
    border-top-right-radius: 3px;
    border-bottom-right-radius: 3px;
    overflow: hidden;
  }

  .flipCover .backPage {
    border-top-left-radius: 3px;
    border-bottom-left-radius: 3px;
    overflow: hidden;
  }

  .frontCoverPaper {
    background: linear-gradient(
      to right,
      #efebe5 0%,
      #efebe5 90%,
      #e9e4dc 97%,
      #d2cdc3 100%
    );
  }

  .backCoverPaper {
    background: linear-gradient(
      to right,
      #d2cdc3 0%,
      #e9e4dc 3%,
      #efebe5 10%,
      #efebe5 100%
    );
  }

  .backShadow {
    position: absolute;
    height: 100%;
    width: 50%;
    top: 0;
    right: 0;
    box-shadow: -1px 9px 18px rgba(0, 0, 0, 0.8);
  }

  .frontShadow {
    position: absolute;
    height: 100%;
    width: 50%;
    top: 0;
    left: 0;
    box-shadow: 1px 9px 18px rgba(0, 0, 0, 0.8);
  }

  .frontCover {
    position: relative;
    background: #0a0905;
  }

  .infoPage {
    background: #0a0905;
    padding: 12px 0 12px 12px;
  }

  .infoPageContent {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .frontCover::after {
    content: "";
    position: absolute;
    top: 0;
    left: 9px;
    bottom: 0;
    width: 2px;
    background: rgba(81, 81, 81, 0.3);
    box-shadow: 1px 0 3px rgba(255, 255, 255, 0.1);
  }

  .backCover {
    position: absolute;
    height: 100%;
    width: 50%;
    top: 0;
    right: 0;
    background: #0a0905;
    border-top-right-radius: 3px;
    border-bottom-right-radius: 3px;
    padding: 12px 12px 12px 0;
  }

  .pageButton {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 60px;
    cursor: pointer;
  }

  .pageButton:disabled {
    cursor: not-allowed;
  }

  .frontPage .pageButton {
    right: 0;
  }

  .backPage .pageButton {
    left: 0;
  }

  .flipCover .backPage .pageButton {
    top: 12px;
    bottom: 12px;
    left: 12px;
  }

  .backCover .pageButton {
    top: 12px;
    bottom: 12px;
    right: 12px;
  }

  /* Info page type */
  .info-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 18px 28px;
    text-align: center;
  }

  .book-title {
    margin-top: 12px;
    font-family: "Bookerly", serif;
    font-size: 18px;
    line-height: 1.4;
    font-weight: 700;
    color: #1e1915;
  }

  .book-authors {
    margin: 4px 0 8px;
    font-family: "Bookerly", serif;
    font-size: 14px;
    line-height: 1.3;
    font-weight: 400;
    color: #1e1915;
  }

  .book-meta {
    font-family: "Proxima Nova", sans-serif;
    font-size: 12px;
    line-height: 1.4;
    color: #4f4f4d;
  }

  .book-description {
    font-family: "Proxima Nova", sans-serif;
    font-size: 13px;
    line-height: 1.4;
    color: #1e1915;
  }

  .clamped {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 2px;
    padding: 4px 6px 8px;
  }

  .tool-btn {
    display: flex;
    width: 32px;
    height: 32px;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    color: #4f4f4d;
    transition:
      color 150ms,
      background-color 150ms;
  }

  .tool-btn:hover {
    color: #1e1915;
    background: rgba(0, 0, 0, 0.06);
  }

  .tool-btn-danger:hover {
    color: #b91c1c;
    background: rgba(185, 28, 28, 0.08);
  }

  .tool-btn:focus-visible {
    outline: 2px solid #047857;
    outline-offset: 1px;
  }

  /* Ribbon */
  .ribbon {
    position: relative;
    top: -9px;
    left: 21px;
    width: 36px;
    user-select: none;
    border-top-left-radius: 3px;
  }

  .ribbonContent {
    font-family: "Bookerly", serif;
    color: #fff;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    user-select: none;
  }

  .ribbon::before {
    content: "";
    position: absolute;
    height: 9px;
    width: 6px;
    right: -6px;
    top: 0;
    z-index: 1;
    border-bottom: 9px solid #600909;
    border-right: 6px solid transparent;
  }

  .ribbonShort {
    background: #a90909;
  }

  .ribbonLong {
    background: linear-gradient(
      180deg,
      rgb(169, 9, 9) 0%,
      rgb(229, 33, 28) 20%,
      rgb(164, 5, 2) 40%,
      rgb(229, 10, 0) 100%
    );
  }

  .ribbonTail {
    position: absolute;
    bottom: -21px;
    left: 0;
    width: 0;
    height: 0;
    z-index: inherit;
    border-left: 18px solid transparent;
    border-right: 18px solid transparent;
  }

  .ribbonTailLong {
    border-top: 21px solid #e40900;
  }

  .ribbonTailShort {
    border-top: 21px solid #a90909;
  }

  /* Note drawer */
  .note-drawer {
    position: absolute;
    top: 40px;
    bottom: 16px;
    right: 0;
    z-index: 30;
    width: min(300px, 82vw);
    transform: translateX(100%);
    transition: transform 300ms ease-in-out;
  }

  .note-drawer.ready {
    transform: translateX(calc(100% - 26px));
  }

  .note-drawer.open {
    transform: translateX(0);
  }

  .note-page {
    position: relative;
    height: 100%;
    overflow: hidden;
    border: 1px solid #e0e0e0;
    border-right: 0;
    border-radius: 3px 0 0 3px;
    background-color: #fff;
    box-shadow:
      -6px 0 14px rgba(0, 0, 0, 0.35),
      0 4px 8px rgba(0, 0, 0, 0.5);
  }

  .note-page::before {
    content: "";
    position: absolute;
    inset: 0;
    background-image: repeating-linear-gradient(#d3d3d3 0.5px, transparent 1px);
    opacity: 0.2;
    pointer-events: none;
  }

  /* Folded paper edge so the peeking strip reads as a page, not a panel. */
  .note-page::after {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 12px;
    background: linear-gradient(
      to right,
      rgba(0, 0, 0, 0.09),
      rgba(0, 0, 0, 0.02) 55%,
      transparent
    );
    pointer-events: none;
  }

  .note-tape {
    position: absolute;
    top: -18px;
    left: 50%;
    z-index: 4;
    display: flex;
    width: 120px;
    height: 35px;
    align-items: center;
    justify-content: center;
    gap: 3px;
    cursor: pointer;
    transform: translateX(-50%) rotate(3deg);
    background-color: rgba(108, 212, 255, 0.82);
    box-shadow: 0 -3px 3px rgba(0, 0, 0, 0.3);
    color: rgba(8, 47, 66, 0.55);
    font-family: "Proxima Nova", sans-serif;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    transition:
      background-color 150ms,
      color 150ms,
      box-shadow 150ms,
      transform 150ms;
  }

  .note-tape:hover {
    background-color: rgba(126, 222, 255, 0.95);
    color: rgba(8, 47, 66, 0.85);
    box-shadow: 0 -3px 4px rgba(0, 0, 0, 0.35);
  }

  .note-tape:active {
    transform: translateX(-50%) rotate(3deg) translateY(2px);
    box-shadow: 0 0 2px rgba(0, 0, 0, 0.25);
  }

  .note-tape:focus-visible {
    outline: 2px solid #047857;
    outline-offset: 2px;
  }

  .note-tape.dirty {
    color: rgba(8, 47, 66, 0.85);
    box-shadow:
      0 -3px 3px rgba(0, 0, 0, 0.3),
      0 0 0 1px rgba(255, 255, 255, 0.35) inset;
  }

  .note-page textarea {
    position: relative;
    width: 100%;
    height: 100%;
    padding: 30px 14px 16px 30px;
    font-family: "Comic Sans MS", cursive, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    color: #333;
    outline: none;
    resize: none;
    background: transparent;
  }

  .note-page textarea::placeholder {
    color: rgba(30, 25, 21, 0.3);
  }

  .note-toggle {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: 3;
    display: flex;
    width: 26px;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border-radius: 6px 0 0 6px;
    color: rgba(30, 25, 21, 0.3);
    font-size: 14px;
    line-height: 1;
    transition:
      color 150ms,
      background-color 150ms;
  }

  .note-toggle:hover {
    color: rgba(30, 25, 21, 0.7);
    background-color: rgba(0, 0, 0, 0.04);
  }

  .note-toggle:focus-visible {
    outline: 2px solid #047857;
    outline-offset: -2px;
  }

  /* Content editor imitates a printed page so the highlight reads the way it
     will once bound into the book. */
  .book-field {
    width: 100%;
    padding: 22px 24px;
    border: 1px solid rgba(0, 0, 0, 0.14);
    border-radius: 4px;
    background: linear-gradient(to right, #f3efe9 0%, #fbf9f5 5%, #fbf9f5 100%);
    box-shadow:
      inset 0 1px 2px rgba(0, 0, 0, 0.07),
      0 1px 0 rgba(255, 255, 255, 0.35);
    color: #1e1915;
    font-family: "Bookerly", serif;
    font-size: 14px;
    line-height: 1.7;
    outline: none;
    caret-color: #1e1915;
    transition:
      border-color 150ms,
      box-shadow 150ms;
  }

  .book-field::placeholder {
    color: rgba(30, 25, 21, 0.35);
  }

  .book-field::selection,
  .note-page textarea::selection {
    background-color: #fef135;
    color: #1e1915;
  }

  .book-field:focus-visible {
    border-color: #047857;
    box-shadow: 0 0 0 2px rgba(4, 120, 87, 0.28);
  }

  @media (prefers-reduced-motion: reduce) {
    .note-drawer {
      transition: none;
    }
  }
</style>
