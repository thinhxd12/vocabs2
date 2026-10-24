/**
 * Unsaved note drafts for the highlight reader.
 *
 * The note saves on blur and at the start of every jump between highlights, but
 * both can lose the race against a route change or a closed tab. A draft is
 * kept on each keystroke instead, so coming back — to the page or to the same
 * highlight later — brings the unfinished text back rather than the last saved
 * version.
 *
 * localStorage, not a cookie: a note easily outgrows the 4 KB cookie budget and
 * the server never needs to read the draft.
 */
const PREFIX = 'highlight-note:';

/** A draft older than this no longer describes what the reader was doing. */
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;

type Draft = { text: string; savedAt: number };

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Storage can be blocked outright, e.g. private mode with cookies denied.
    return null;
  }
}

function drop(key: string) {
  try {
    store()?.removeItem(key);
  } catch {
    // Nothing left to recover from a store that will not answer.
  }
}

/**
 * The draft for this highlight, or null when there is nothing to restore. A
 * draft written against different saved text, or one that has gone stale, is
 * discarded rather than allowed to shadow the note the database holds.
 */
export function readNoteDraft(id: string, savedNote: string): string | null {
  const key = PREFIX + id;
  const storage = store();
  if (!storage) return null;

  try {
    const raw = storage.getItem(key);
    if (!raw) return null;

    const draft = JSON.parse(raw) as Partial<Draft> | null;

    if (
      !draft ||
      typeof draft.text !== 'string' ||
      typeof draft.savedAt !== 'number' ||
      draft.text === savedNote ||
      Date.now() - draft.savedAt >= MAX_AGE
    ) {
      storage.removeItem(key);
      return null;
    }

    return draft.text;
  } catch {
    // Unreadable JSON: treat it as no draft and clear it on the next write.
    return null;
  }
}

export function writeNoteDraft(id: string, text: string, savedNote: string) {
  const key = PREFIX + id;
  const storage = store();
  if (!storage) return;

  // Typed back to the saved text: there is nothing left to keep.
  if (text === savedNote) {
    drop(key);
    return;
  }

  try {
    storage.setItem(key, JSON.stringify({ text, savedAt: Date.now() } as Draft));
  } catch {
    // Quota or a locked store; losing the extra copy is not worth an error.
  }
}

export function clearNoteDraft(id: string) {
  drop(PREFIX + id);
}
