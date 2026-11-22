import { optimizeCoverFile } from "./utils/coverImages";

const configuredApiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").trim();
const isLoopbackApi = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(
  configuredApiBaseUrl,
);
const useDevelopmentProxy = import.meta.env.DEV && !configuredApiBaseUrl;
const sameOriginSetting = import.meta.env.VITE_USE_SAME_ORIGIN_API;
const useSameOriginApi = sameOriginSetting === "true"
  || (sameOriginSetting !== "false" && (!configuredApiBaseUrl || import.meta.env.PROD));
// Cloudflare quick tunnels expose the local Vite server. Keep API calls same-origin
// so Vite's /api proxy forwards them without a browser CORS preflight.
const isCloudflareTunnel = typeof window !== "undefined"
  && window.location.hostname.toLowerCase().endsWith(".trycloudflare.com");
const API_BASE_URL = useSameOriginApi || isCloudflareTunnel || isLoopbackApi || useDevelopmentProxy
  ? ""
  : configuredApiBaseUrl.replace(/\/+$/, "");

const TOKEN_KEY = "novelhub_web_token";
const COOKIE_SESSION_MARKER = "cookie-session";
const DEVICE_ID_KEY = "novelhub_web_device_id";
let guestLoginPromise = null;
let csrfToken = "";

export { API_BASE_URL };

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, COOKIE_SESSION_MARKER);
  else clearToken();
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  csrfToken = "";
}

export async function migrateLegacySession() {
  const stored = localStorage.getItem(TOKEN_KEY) || "";
  if (!stored || stored === COOKIE_SESSION_MARKER) return;
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/web/session`, {
      method: "POST",
      credentials: "include",
      headers: {
        Authorization: `Bearer ${stored}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    if (!response.ok) return;
    const result = await response.json();
    if (!result?.cookie_session || !result?.csrf_token) return;
    csrfToken = result.csrf_token;
    localStorage.setItem(TOKEN_KEY, COOKIE_SESSION_MARKER);
  } catch {
    // Keep the legacy session for this offline launch and retry next time.
  }
}

export async function initializeWebSession() {
  await migrateLegacySession();
  try {
    const result = await request("/api/auth/csrf");
    if (typeof result?.csrf_token === "string") csrfToken = result.csrf_token;
  } catch {
    // A temporary API outage should not prevent the app from opening as a guest.
  }
}

export function resolveAssetUrl(path) {
  const raw = String(path || "").trim();
  if (!raw) return "";
  if (raw.startsWith("data:") || raw.startsWith("blob:")) return raw;
  if (raw.startsWith("//")) return `${window.location.protocol}${raw}`;

  const normalized = raw.replace(/\\/g, "/");
  if (/^https?:\/\//i.test(normalized)) {
    try {
      const url = new URL(normalized);
      if (["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname.toLowerCase())) {
        const localPath = `${url.pathname}${url.search}${url.hash}`;
        return API_BASE_URL ? `${API_BASE_URL}${localPath}` : localPath;
      }
    } catch {
      return normalized;
    }
    return normalized;
  }

  if (normalized.includes("story_card_images/") || normalized.includes("\\uploads\\")) {
    const filename = normalized.split("/").filter(Boolean).pop();
    return filename ? `${API_BASE_URL}/uploads/${encodeURIComponent(filename)}` : "";
  }
  if (normalized.startsWith("uploads/")) return `${API_BASE_URL}/${normalized}`;
  if (normalized.startsWith("/uploads/") || normalized.startsWith("/api/")) {
    return `${API_BASE_URL}${normalized}`;
  }
  if (/^[A-Za-z]:\//.test(normalized) || (!normalized.includes("/") && /\.[a-z0-9]{2,5}$/i.test(normalized))) {
    const filename = normalized.split("/").filter(Boolean).pop();
    return filename ? `${API_BASE_URL}/uploads/${encodeURIComponent(filename)}` : "";
  }
  const publicPath = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return `${API_BASE_URL}${publicPath}`;
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }
  const storedToken = getToken();
  const token = storedToken === COOKIE_SESSION_MARKER ? "" : storedToken;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (csrfToken && !["GET", "HEAD", "OPTIONS"].includes((options.method || "GET").toUpperCase())) {
    headers["X-CSRF-Token"] = csrfToken;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers,
  });

  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    let responseText = "";
    try {
      responseText = await res.text();
    } catch {
      // Keep the status-based error when the response body cannot be read.
    }
    if (responseText) {
      try {
        const data = JSON.parse(responseText);
        const detail = data.detail || data.message;
        if (detail) {
          msg = Array.isArray(detail)
            ? detail.map((item) => item.msg || JSON.stringify(item)).join(", ")
            : (typeof detail === "string" ? detail : JSON.stringify(detail));
        } else {
          msg = responseText;
        }
      } catch {
        msg = responseText;
      }
    } else if (res.status >= 500) {
      msg = `Server error (${res.status}). Check the backend logs.`;
    }
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try {
    const data = JSON.parse(text);
    if (typeof data?.csrf_token === "string") csrfToken = data.csrf_token;
    return data;
  } catch {
    return text;
  }
}

export function getBootstrap() {
  return request("/api/bootstrap");
}

export function getHomeHeroImages() {
  return request("/api/home-hero-images", { cache: "no-store" });
}

export function getPublicLandingStats() {
  return request("/api/public/stats", { cache: "no-store" });
}

export function getPublicReviews() {
  return request("/api/public/reviews");
}

export function getContentVersion() {
  return request("/api/content/version", {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
  });
}

export function getRecommendations() {
  return request("/api/recommendations", { cache: "no-store" });
}

export function getStoryRecommendations(bookId) {
  const query = new URLSearchParams({ book_id: String(bookId), limit: "12" });
  return request(`/api/recommendations?${query.toString()}`, { cache: "no-store" });
}

export function getSearchHistory(scope = "") {
  const query = scope ? `?scope=${encodeURIComponent(scope)}` : "";
  return request(`/api/me/search-history${query}`);
}

export function saveSearchHistory(term, scope) {
  return request("/api/me/search-history", {
    method: "POST",
    body: JSON.stringify({ term, scope }),
  });
}

export function getMe() {
  return request("/api/me");
}

export function getMyReviews() {
  return request("/api/me/reviews");
}

export function getMyReadingStats() {
  return request("/api/me/reading-stats");
}

export function updateMe(payload) {
  return request("/api/me", { method: "PUT", body: JSON.stringify(payload) });
}

export function getMyPreferences() {
  return request("/api/me/preferences");
}

export function updateMyPreferences(payload) {
  return request("/api/me/preferences", { method: "PUT", body: JSON.stringify(payload) });
}

export function getNotifications() {
  return request("/api/notifications");
}

export function getAdminNotifications() {
  return request("/api/notifications/admin");
}

export function guestLogin() {
  if (guestLoginPromise) return guestLoginPromise;
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = `web-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  guestLoginPromise = request("/api/auth/guest", {
    method: "POST",
    headers: { "X-Auth-Mode": "cookie" },
    body: JSON.stringify({ device_id: deviceId }),
  }).finally(() => {
    guestLoginPromise = null;
  });
  return guestLoginPromise;
}

export function revokeCurrentSession() {
  return request("/api/auth/logout", { method: "POST", body: "{}" });
}

export function emailLogin(email, password, display_name = "") {
  return request("/api/auth/email", {
    method: "POST",
    body: JSON.stringify({
      email,
      display_name: display_name || email.split("@")[0],
      password: password || undefined,
    }),
  });
}

export function getBook(id) {
  return request(`/api/books/${id}`);
}

/** Chapters include full content from this list endpoint */
export function getBookChapters(storyId) {
  return request(`/api/write/stories/${storyId}/chapters`);
}

export function recordChapterView(storyId, chapterNumber) {
  return request(`/api/books/${storyId}/chapters/${chapterNumber}/view`, { method: "POST" });
}

export function getWriterAnalytics(period = "30d") {
  const query = new URLSearchParams({ period });
  return request(`/api/write/analytics?${query}`);
}

export async function getChapter(storyId, chapterId) {
  const res = await getBookChapters(storyId);
  const items = res?.items || [];
  const found = items.find((c) => String(c.id) === String(chapterId));
  if (!found) throw new Error("Chapter not found");
  return found;
}

export function getBookReviews(bookId) {
  return request(`/api/books/${bookId}/reviews`);
}

export function postBookReview(bookId, payload) {
  return request(`/api/books/${bookId}/reviews`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getLibrary() {
  return request("/api/library");
}

function emitLibraryEvent(name, detail) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
}

export async function saveLibraryProgress(payload) {
  const result = await request("/api/library", { method: "POST", body: JSON.stringify(payload) });
  emitLibraryEvent("novelhub:library-progress-changed", payload);
  return result;
}

export function updateLibraryEntry(entryId, payload) {
  return request(`/api/library/${entryId}`, { method: "PUT", body: JSON.stringify(payload) });
}

export function deleteLibraryEntry(entryId) {
  return request(`/api/library/${entryId}`, { method: "DELETE" });
}

export function getReadingLists() {
  return request("/api/reading-lists");
}

export async function addReadingListItem(listId, bookId) {
  const result = await request(`/api/reading-lists/${listId}/items`, {
    method: "POST",
    body: JSON.stringify({ book_id: Number(bookId) }),
  });
  emitLibraryEvent("novelhub:reading-lists-changed", { listId, bookId });
  return result;
}

/** Ensure a default list exists, then add the book */
export async function addToReadingList(bookId) {
  const lists = await getReadingLists();
  const items = lists?.items || lists || [];
  const defaultList = items.find((item) => ["currently reading", "reading list"].includes(String(item?.name || "").trim().toLowerCase()));
  let listId = defaultList?.id;
  if (!listId) {
    const created = await request("/api/reading-lists", {
      method: "POST",
      body: JSON.stringify({ name: "Currently Reading", story_count: 0, sort_order: 0 }),
    });
    listId = created?.id;
  }
  if (!listId) throw new Error("Could not create reading list");
  return addReadingListItem(listId, bookId);
}

export function likeBook(bookId) {
  return request(`/api/books/${bookId}/like`, { method: "POST", body: "{}" });
}

export function unlikeBook(bookId) {
  return request(`/api/books/${bookId}/like`, { method: "DELETE" });
}

export function getBookLike(bookId) {
  return request(`/api/books/${bookId}/like`);
}

/** Toggle like: POST if not liked, DELETE if liked. Pass currentlyLiked when known. */
export async function toggleBookLike(bookId, currentlyLiked = null) {
  if (currentlyLiked === true) {
    return unlikeBook(bookId);
  }
  if (currentlyLiked === false) {
    return likeBook(bookId);
  }
  // Unknown state: try POST; if fails (already liked), DELETE
  try {
    return await likeBook(bookId);
  } catch (e) {
    const msg = String(e.message || e);
    if (/already|409|400|exist/i.test(msg)) {
      return unlikeBook(bookId);
    }
    // fallback: attempt unlike then like
    try {
      await unlikeBook(bookId);
      return { liked: false };
    } catch {
      throw e;
    }
  }
}

export function getMyStories() {
  return request("/api/write/stories");
}

export function searchStories(q, genre) {
  const params = new URLSearchParams();
  if (q) params.set("query", q);
  if (genre) params.set("genre", genre);
  return request(`/api/search?${params.toString()}`);
}

export function searchUsers(query) {
  const params = new URLSearchParams();
  if (query) params.set("query", query);
  return request(`/api/users/search?${params.toString()}`);
}

export function getAuthorBooks(authorId) {
  return request(`/api/users/${authorId}/stories`);
}

export function getUserProfile(userId) {
  return request(`/api/users/${userId}`);
}

export function getUserReadingLists(userId) {
  return request(`/api/users/${userId}/reading-lists`);
}

export function getUserReviews(userId) {
  return request(`/api/users/${userId}/reviews`);
}

export function getTags(query = "") {
  const suffix = query ? `?q=${encodeURIComponent(query)}` : "";
  return request(`/api/tags${suffix}`, { cache: "no-store" }).catch(() => ({ items: [] }));
}

export function getWriterTagSuggestions(query) {
  const params = new URLSearchParams({ q: query });
  return request(`/api/write/tag-options?${params.toString()}`, { cache: "no-store" });
}

export function getGenres() {
  return request("/api/genres", { cache: "no-store" });
}

export function getGenreStoryCounts() {
  return request("/api/genres/counts", { cache: "no-store" });
}

export function getPublicGenreCovers() {
  return request("/api/public/genre-covers", { cache: "no-store" });
}

export function getGenreBooks(genre) {
  return request(`/api/genres/${encodeURIComponent(genre)}/books`, { cache: "no-store" });
}

export function getTagsForHub() {
  return request("/api/tags", { cache: "no-store" });
}

export async function getWriteStory(storyId) {
  const story = await request(`/api/write/stories/${storyId}`);
  let chapters = [];
  let chaptersError = null;
  try {
    const chRes = await request(`/api/write/stories/${storyId}/chapters`);
    chapters = chRes?.items || chRes?.chapters || (Array.isArray(chRes) ? chRes : []);
  } catch (error) {
    chaptersError = error;
  }
  return {
    ...(story && typeof story === "object" ? story : {}),
    story: story,
    chapters: Array.isArray(chapters) ? chapters : [],
    chaptersError,
  };
}

export function getStoryChapters(storyId) {
  return request(`/api/write/stories/${storyId}/chapters`);
}

export function createStory(payload = {}) {
  // Backend StoryCreateRequest requires: title, author, description, genre
  const body = {
    title: (payload.title || "Untitled Story").trim() || "Untitled Story",
    author: (payload.author || payload.display_name || "Author").trim() || "Author",
    description: payload.description != null ? String(payload.description) : "",
    genre: payload.genre != null ? String(payload.genre).trim() : "",
    cover_path: payload.cover_path || "",
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    content_warnings: payload.content_warnings || "",
    status_text: payload.status_text || "Draft",
    language: payload.language || "English",
    audience: payload.audience || "All Ages",
  };
  return request("/api/write/stories", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateStory(storyId, payload) {
  return request(`/api/write/stories/${storyId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteStory(storyId) {
  return request(`/api/write/stories/${storyId}`, { method: "DELETE" });
}

export function createChapter(storyId, payload = {}) {
  const body = {
    title: (payload.title || "Chapter 1").trim() || "Chapter 1",
    content: payload.content != null ? String(payload.content) : "",
    chapter_number: payload.chapter_number != null ? payload.chapter_number : null,
    notes: payload.notes || "",
    submission_status: payload.submission_status || payload.status_text || "draft",
    scheduled_for: payload.scheduled_for ?? null,
    story_id: payload.story_id != null ? Number(payload.story_id) : Number(storyId),
  };
  return request(`/api/write/stories/${storyId}/chapters`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateChapter(chapterId, payload) {
  return request(`/api/write/chapters/${chapterId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteChapter(chapterId) {
  return request(`/api/write/chapters/${chapterId}`, { method: "DELETE" });
}

export function getStoryChapterRevisions(chapterId) {
  return request(`/api/write/chapters/${chapterId}/revisions`);
}

export function restoreStoryChapterRevision(chapterId, revisionId) {
  return request(`/api/write/chapters/${chapterId}/revisions/${revisionId}/restore`, {
    method: "POST",
    body: "{}",
  });
}

export function reorderStoryChapters(storyId, chapterIds) {
  return request(`/api/write/stories/${storyId}/chapters/reorder`, {
    method: "POST",
    body: JSON.stringify({ chapter_ids: chapterIds }),
  });
}

export function submitAllChapters(storyId, payload = {}) {
  return request(`/api/write/stories/${storyId}/chapters/submit-all`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function emailAuth({ email, display_name = "", password = "", username = "", mode = "login" }) {
  return request("/api/auth/email", {
    method: "POST",
    headers: { "X-Auth-Mode": "cookie" },
    body: JSON.stringify({
      email,
      display_name: display_name || username || email.split("@")[0],
      password: password || undefined,
      mode,
      username: username || undefined,
    }),
  });
}

export function registerAccount(payload) {
  return request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function verifyEmail({ email, token }) {
  return request("/api/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ email, token }),
  });
}

export function resendEmailVerification(email) {
  return request("/api/auth/resend-verification", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function googleAuth({ id_token, access_token }) {
  return request("/api/auth/web/google", {
    method: "POST",
    headers: { "X-Auth-Mode": "cookie" },
    body: JSON.stringify({ id_token, access_token }),
  });
}

export function followAuthor(authorId) {
  return request(`/api/authors/${authorId}/follow`, { method: "POST", body: "{}" });
}

export function unfollowAuthor(authorId) {
  return request(`/api/authors/${authorId}/follow`, { method: "DELETE" });
}

export function getAuthorFollow(authorId) {
  return request(`/api/authors/${authorId}/follow`);
}

export function setAuthorNotifications(authorId, enabled) {
  return request(`/api/authors/${authorId}/notifications`, {
    method: "PUT",
    body: JSON.stringify({ enabled }),
  });
}

export function getUserWall(userId) {
  return request(`/api/users/${userId}/wall`);
}

export function postUserWall(userId, body) {
  return request(`/api/users/${userId}/wall`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export function likeWallPost(postId) {
  return request(`/api/wall/${postId}/like`, { method: "POST", body: "{}" });
}

export function commentWallPost(postId, body) {
  return request(`/api/wall/${postId}/comment`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export function deleteWallPost(postId) {
  return request(`/api/wall/${postId}`, { method: "DELETE" });
}

export function getActivityFeed(userId) {
  return request(`/api/users/${userId}/activity`);
}

export function getUserActivity(userId) {
  return request(`/api/users/${userId}/activity`);
}


export function getChapterComments(bookId, chapterNumber) {
  return request(`/api/books/${bookId}/chapters/${chapterNumber}/comments`);
}

export function postChapterComment(bookId, chapterNumber, { body, paragraph_index }) {
  return request(`/api/books/${bookId}/chapters/${chapterNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({ body, paragraph_index }),
  });
}

export function toggleChapterCommentLike(commentId) {
  return request(`/api/chapter-comments/${commentId}/like`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function getBookComments(bookId) {
  return request(`/api/books/${bookId}/comments`);
}

export function postBookComment(bookId, body) {
  return request(`/api/books/${bookId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export function getChapterReactions(bookId, chapterNumber) {
  return request(`/api/books/${bookId}/chapters/${chapterNumber}/reactions`).catch(() => ({
    counts: {},
    mine: [],
  }));
}

export function toggleChapterReaction(bookId, chapterNumber, label) {
  return request(`/api/books/${bookId}/chapters/${chapterNumber}/reactions`, {
    method: "POST",
    body: JSON.stringify({ label }),
  });
}


export function getContests() {
  return request("/api/contests");
}

export function getAudiobooks() {
  return request("/api/audiobooks");
}

export function adminListContests() {
  return request("/api/admin/contests");
}

export function adminCreateContest(payload) {
  return request("/api/admin/contests", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function adminDeleteContest(id) {
  return request(`/api/admin/contests/${id}`, { method: "DELETE" });
}

export function getPublicReadingLists() {
  return request("/api/public/reading-lists").catch(() => ({ items: [] }));
}

export function toggleReadingListFollow(listId) {
  return request(`/api/reading-lists/${listId}/follow`, {
    method: "POST",
    body: "{}",
  });
}

export function getReadingListFollow(listId) {
  return request(`/api/reading-lists/${listId}/follow`);
}

export function reportBook(bookId, reason) {
  return request(`/api/books/${bookId}/report`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function uploadWriteImage(file) {
  const storedToken = getToken();
  const token = storedToken === COOKIE_SESSION_MARKER ? "" : storedToken;
  const form = new FormData();
  form.append(
    "file",
    file.type === "image/webp" && file.size <= 2 * 1024 * 1024 ? file : await optimizeCoverFile(file),
  );
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
  const res = await fetch(`${API_BASE_URL}/api/write/upload-image`, {
    method: "POST",
    credentials: "include",
    headers,
    body: form,
  });
  if (!res.ok) {
    let msg = `Upload failed (${res.status})`;
    try {
      const j = await res.json();
      if (typeof j.detail === "string") msg = j.detail;
      else if (j.message) msg = j.message;
      else if (j.detail) msg = JSON.stringify(j.detail);
    } catch (_) {}
    throw new Error(msg);
  }
  return res.json();
}

export async function uploadProfileImage(file) {
  const storedToken = getToken();
  const token = storedToken === COOKIE_SESSION_MARKER ? "" : storedToken;
  const form = new FormData();
  form.append("file", await optimizeCoverFile(file));
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
  const res = await fetch(`${API_BASE_URL}/api/me/upload-image`, {
    method: "POST",
    credentials: "include",
    headers,
    body: form,
  });
  if (!res.ok) {
    let msg = `Upload failed (${res.status})`;
    try {
      const data = await res.json();
      msg = data.detail || data.message || msg;
    } catch {}
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return res.json();
}


export async function createReadingList({ name, description = "", story_count = 0, cover_path = "", sort_order = 999 }) {
  const result = await request("/api/reading-lists", {
    method: "POST",
    body: JSON.stringify({
      name: (name || "My List").trim() || "My List",
      description: String(description || "").trim(),
      story_count,
      cover_path: cover_path || "",
      sort_order,
    }),
  });
  emitLibraryEvent("novelhub:reading-lists-changed", { listId: result?.id });
  return result;
}

export async function deleteReadingList(listId) {
  const result = await request(`/api/reading-lists/${listId}`, { method: "DELETE" });
  emitLibraryEvent("novelhub:reading-lists-changed", { listId, deleted: true });
  return result;
}

export async function removeReadingListItem(listId, itemId) {
  const result = await request(`/api/reading-lists/${listId}/items/${itemId}`, { method: "DELETE" });
  emitLibraryEvent("novelhub:reading-lists-changed", { listId, itemId, removed: true });
  return result;
}

export function getReadingListDetail(listId) {
  return request(`/api/reading-lists/${listId}`);
}

export function getTagBooks(tagName, sort = "top") {
  const query = new URLSearchParams({ sort });
  return request(`/api/tags/${encodeURIComponent(tagName)}/books?${query}`).catch(() => ({ items: [] }));
}

export function getTagBooksForHub(tagName, sort = "top", { limit = 20, offset = 0 } = {}) {
  const query = new URLSearchParams({ sort, limit: String(limit), offset: String(offset) });
  return request(`/api/tags/${encodeURIComponent(tagName)}/books?${query}`, { cache: "no-store" });
}

export function getTagFollowStateWeb(tagName) {
  return request(`/api/tags/${encodeURIComponent(tagName)}/follow`);
}

export function followTagWeb(tagName) {
  return request(`/api/tags/${encodeURIComponent(tagName)}/follow`, {
    method: "POST",
    body: "{}",
  });
}

export function unfollowTagWeb(tagName) {
  return request(`/api/tags/${encodeURIComponent(tagName)}/follow`, {
    method: "DELETE",
  });
}

export function setTagNotifyWeb(tagName, notify) {
  return request(`/api/tags/${encodeURIComponent(tagName)}/notify`, {
    method: "POST",
    body: JSON.stringify({ notify }),
  });
}

/** Contact Us → backend support_requests (same as Flutter) */
export function createSupportRequest(payload) {
  return request("/api/support/requests", {
    method: "POST",
    body: JSON.stringify({
      email: payload.email,
      first_name: payload.first_name || payload.name || "Reader",
      issue: payload.issue || "general",
      subject: payload.subject || "Website contact",
      description: payload.description || payload.message || "",
      device_type: payload.device_type || "web",
      attachment_path: payload.attachment_path || "",
    }),
  });
}

export function getMySupportRequests() {
  return request("/api/support/requests");
}

export function getChatMessages() {
  return request("/api/chat/messages");
}

export function sendChatMessage(message) {
  return request("/api/chat/messages", {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}
