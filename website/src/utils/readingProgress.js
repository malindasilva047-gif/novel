const STORAGE_PREFIX = "novelhub_continue_reading_v1";

export function readingEntryTimestamp(entry) {
  const value = String(entry?.updated_at || entry?.last_read_at || entry?.last_reading_at || entry?.created_at || "").trim();
  if (!value) return 0;
  // Database timestamps are returned without a zone; treat those as UTC so
  // they compare consistently with the ISO UTC timestamps saved by the client.
  const normalized = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(value)
    ? value
    : `${value.replace(" ", "T")}Z`;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function getReadingProgressPercent(entry) {
  const storedProgress = entry.reading_progress_percent;
  if (storedProgress !== null && storedProgress !== undefined && Number.isFinite(Number(storedProgress))) {
    return Math.max(0, Math.min(100, Math.round(Number(storedProgress))));
  }
  const total = Number(entry.chapters || 0);
  if (!total) return 0;
  let read = Number(entry.chapters_read || 0);
  if (read <= 0) read = Math.max(0, Number(entry.last_chapter_number || 1) - 1);
  if (Number(entry.last_paragraph_index || 0) > 0) read += .5;
  return Math.round(Math.max(0, Math.min(1, read / total)) * 100);
}

function storageKey(userId) {
  return `${STORAGE_PREFIX}_${String(userId || "default")}`;
}

export function getLocalReadingEntries(userId) {
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey(userId)) || "{}");
    return value && typeof value === "object" && !Array.isArray(value)
      ? Object.values(value)
      : [];
  } catch {
    return [];
  }
}

export function saveLocalReadingProgress(userId, payload, book) {
  try {
    const key = storageKey(userId);
    const current = JSON.parse(window.localStorage.getItem(key) || "{}");
    current[String(payload.book_id)] = {
      ...payload,
      id: `local-${payload.book_id}`,
      book: {
        id: payload.book_id,
        title: book?.title || payload.title || "Story",
        author: book?.author_name || book?.author || payload.author || "Author",
        cover_path: book?.cover_path || payload.cover_path || "",
        author_user_id: book?.author_user_id || payload.author_user_id,
      },
      updated_at: new Date().toISOString(),
    };
    window.localStorage.setItem(key, JSON.stringify(current));
  } catch {
    // Storage can be disabled or full; the API remains the durable copy.
  }
}

export function removeLocalReadingProgress(userId, bookId) {
  try {
    const key = storageKey(userId);
    const current = JSON.parse(window.localStorage.getItem(key) || "{}");
    delete current[String(bookId)];
    window.localStorage.setItem(key, JSON.stringify(current));
  } catch {
    // Keep completion usable when browser storage is unavailable.
  }
}

export function mergeReadingEntries(serverEntries, localEntries) {
  const merged = [...serverEntries];
  for (const localEntry of localEntries) {
    const key = String(localEntry.book_id || localEntry.book?.id || localEntry.id).replace(/^local-/, "");
    const index = merged.findIndex((entry) =>
      String(entry.book_id || entry.book?.id || entry.id).replace(/^local-/, "") === key,
    );
    if (index < 0) {
      merged.push(localEntry);
      continue;
    }
    const localUpdated = readingEntryTimestamp(localEntry);
    const serverUpdated = readingEntryTimestamp(merged[index]);
    if (localUpdated > serverUpdated) merged[index] = localEntry;
  }
  return merged;
}
