/** Guest users may open only the first N chapters of a story. */
export const GUEST_CHAPTER_LIMIT = 2;

export function isGuestUser(user) {
  if (!user) return true;
  if (String(user.provider || "").toLowerCase() === "guest") return true;
  if (String(user.email || "").toLowerCase().includes("guest")) return true;
  return false;
}

/** chapters sorted; returns whether index (0-based) is free for guest */
export function isChapterAllowedForGuest(index) {
  return Number.isInteger(index) && index >= 0 && index < GUEST_CHAPTER_LIMIT;
}

export function getGuestChapterOrder(chapters) {
  return new Map(
    [...chapters]
      .sort((a, b) => {
        const byNumber = Number(a.chapter_number || 0) - Number(b.chapter_number || 0);
        return byNumber || String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
      })
      .map((chapter, index) => [String(chapter.id), index]),
  );
}
