/** Guest users may open only the first N chapters of a story. Set to 0 = must sign in to read. */
export const GUEST_CHAPTER_LIMIT = 0;

/** Module-level flag kept in sync by App so leaf components (e.g. BookCard) can gate without prop drilling. */
let _guestSession = true;

export function setGuestSession(isGuest) {
  _guestSession = Boolean(isGuest);
}

export function isGuestSession() {
  return _guestSession;
}

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

/**
 * Paths guests may open without signing in (browse-only).
 * Everything else should redirect to /login with returnTo.
 */
export function guestCanAccessPath(pathname = "") {
  const path = String(pathname || "/").split("?")[0] || "/";
  if (path === "/" || path === "/discover" || path === "/login") return true;
  if (path.startsWith("/genres/")) return true;
  if (path.startsWith("/tags/")) return true;
  if (path.startsWith("/authors/")) return true;
  if (path === "/audiobooks" || path === "/contests" || path === "/community" || path === "/subscription") return true;
  // Story detail (synopsis / cover) is viewable; reading chapters is not.
  if (/^\/stories\/\d+$/.test(path)) return true;
  if (/^\/stories\/\d+\/reviews$/.test(path)) return true;
  // Public legal / help
  if (path === "/account/help" || path === "/account/contact") return true;
  if (path === "/account/terms" || path === "/account/privacy" || path === "/account/cookies") return true;
  return false;
}
