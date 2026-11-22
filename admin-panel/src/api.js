
const configuredApiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").trim();
const useSameOriginApi = import.meta.env.VITE_USE_SAME_ORIGIN_API === "true";
// Cloudflare quick tunnels expose the local Vite server. Keep API calls same-origin
// so Vite's /api proxy forwards them without a browser CORS preflight.
const isCloudflareTunnel = typeof window !== "undefined"
  && window.location.hostname.toLowerCase().endsWith(".trycloudflare.com");
const API_BASE_URL = (useSameOriginApi || isCloudflareTunnel ? "" : configuredApiBaseUrl || (import.meta.env.DEV
  ? ""
  : "https://novel-v7.vercel.app")).replace(/\/+$/, "");
const ADMIN_TOKEN_KEY = "novel_admin_token";
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export function getAdminToken() {
  return window.localStorage.getItem(ADMIN_TOKEN_KEY) || "";
}

export function setAdminToken(token) {
  if (!token) {
    window.localStorage.removeItem(ADMIN_TOKEN_KEY);
    return;
  }
  window.localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken() {
  window.localStorage.removeItem(ADMIN_TOKEN_KEY);
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getAdminToken();
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  const isFormData = options.body instanceof FormData;
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...headers,
      },
    });
  } catch (e) {
    throw new Error(
      `Failed to reach backend at ${API_BASE_URL}. Check VITE_API_BASE_URL and that the FastAPI backend is running. (${e?.message || e})`
    );
  }

  if (!response.ok) {
    if (response.status === 401) {
      clearAdminToken();
    }
    const text = await response.text();
    throw new Error(text || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

export function loginAdmin(payload) {
  return request("/api/admin/login", { method: "POST", body: JSON.stringify(payload) });
}

export function getAdminSession() {
  // Validate the stored admin token using the backend's session endpoint.
  return request("/api/admin/session", { method: "POST", body: "{}" });
}

export function getContentVersion() {
  return request("/api/content/version");
}

export function listStoryImages() {
  return request("/api/story-images");
}

async function optimizeUploadedImage(file) {
  if (!file?.type?.startsWith("image/") || file.type === "image/svg+xml") return file;
  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("This image could not be opened for optimization."));
      image.src = source;
    });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image optimization is not available in this browser.");
    let scale = Math.min(1, 1800 / image.naturalWidth, 1800 / image.naturalHeight);
    let optimized = null;
    const qualities = [0.82, 0.72, 0.62, 0.52];
    for (let attempt = 0; attempt < 10 && !optimized; attempt += 1) {
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of qualities) {
        const webp = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
        if (webp?.type === "image/webp" && webp.size <= MAX_UPLOAD_BYTES) {
          optimized = webp;
          break;
        }
      }
      scale *= 0.8;
    }
    if (!optimized) {
      if (file.size <= MAX_UPLOAD_BYTES) return file;
      throw new Error("This image could not be compressed enough to upload.");
    }
    if (file.size <= MAX_UPLOAD_BYTES && optimized.size >= file.size) return file;
    const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([optimized], `${baseName}.webp`, { type: "image/webp", lastModified: Date.now() });
  } finally {
    URL.revokeObjectURL(source);
  }
}

async function uploadImageTo(file, path) {
  const optimizedFile = await optimizeUploadedImage(file);
  const body = new FormData();
  body.append("file", optimizedFile);
  return request(path, { method: "POST", body });
}

export function uploadImage(file) {
  return uploadImageTo(file, "/api/upload-image");
}

export function uploadTagCoverImage(file) {
  return uploadImageTo(file, "/api/admin/tags/upload-cover");
}

export function getAdminBootstrap() {
  return request("/api/admin/bootstrap");
}

export function getAdminSupportRequests() {
  return request("/api/admin/support-requests");
}

export function createCategory(payload) {
  return request("/api/admin/categories", { method: "POST", body: JSON.stringify(payload) });
}

export function updateCategory(id, payload) {
  return request(`/api/admin/categories/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}

export function deleteCategory(id) {
  return request(`/api/admin/categories/${id}`, { method: "DELETE" });
}

export function createBook(payload) {
  return request("/api/admin/books", { method: "POST", body: JSON.stringify(payload) });
}

export function updateBook(id, payload) {
  return request(`/api/admin/books/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}

export function deleteBook(id) {
  return request(`/api/admin/books/${id}`, { method: "DELETE" });
}

export function createNotification(payload) {
  return request("/api/admin/notifications", {
    method: "POST",
    body: JSON.stringify({
      tab_name: payload.tab ?? payload.tab_name ?? "activity",
      title: payload.title ?? "",
      message: payload.message ?? "",
      created_at: payload.created_at ?? "Now",
      sort_order: payload.sort_order ?? 999,
    }),
  });
}

export function updateNotification(id, payload) {
  return request(`/api/admin/notifications/${id}`, {
    method: "PUT",
    body: JSON.stringify({
      tab_name: payload.tab ?? payload.tab_name,
      title: payload.title,
      message: payload.message,
      created_at: payload.created_at,
      sort_order: payload.sort_order,
    }),
  });
}

export function deleteNotification(id) {
  return request(`/api/admin/notifications/${id}`, { method: "DELETE" });
}

export function createMenuItem(payload) {
  return request("/api/admin/menu-items", {
    method: "POST",
    body: JSON.stringify({
      section_name: payload.section ?? payload.section_name ?? "General",
      section_order: payload.section_order ?? 1,
      label: payload.label ?? "",
      icon_name: payload.icon ?? payload.icon_name ?? "menu",
      route_name: payload.route ?? payload.route_name ?? "/",
      sort_order: payload.sort_order ?? 999,
    }),
  });
}

export function updateMenuItem(id, payload) {
  return request(`/api/admin/menu-items/${id}`, {
    method: "PUT",
    body: JSON.stringify({
      section_name: payload.section ?? payload.section_name,
      section_order: payload.section_order,
      label: payload.label,
      icon_name: payload.icon ?? payload.icon_name,
      route_name: payload.route ?? payload.route_name,
      sort_order: payload.sort_order,
    }),
  });
}

export function deleteMenuItem(id) {
  return request(`/api/admin/menu-items/${id}`, { method: "DELETE" });
}

export function updateWriteScreen(payload) {
  return request("/api/admin/write-screen", {
    method: "PUT",
    body: JSON.stringify({
      manage_tabs: Array.isArray(payload.manage_tabs)
        ? payload.manage_tabs.join(",")
        : payload.manage_tabs,
      story_tabs: Array.isArray(payload.story_tabs)
        ? payload.story_tabs.join(",")
        : payload.story_tabs,
      filter_label: payload.filter_label,
      sort_label: payload.sort_label,
      empty_title: payload.empty_title,
      empty_cta: payload.empty_cta,
    }),
  });
}

export function updateProfile(payload) {
  return request("/api/admin/profile", { method: "PUT", body: JSON.stringify(payload) });
}

export function createReadingList(payload) {
  return request("/api/admin/reading-lists", { method: "POST", body: JSON.stringify(payload) });
}

export function updateReadingList(id, payload) {
  return request(`/api/admin/reading-lists/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}

export function deleteReadingList(id) {
  return request(`/api/admin/reading-lists/${id}`, { method: "DELETE" });
}

export function createAchievement(payload) {
  const progress = Number(payload.progress ?? 0);
  const total = Number(payload.total ?? 0);
  return request("/api/admin/achievements", {
    method: "POST",
    body: JSON.stringify({
      group_name: payload.group_name ?? "Lifetime Words Published",
      group_order: payload.group_order ?? 2,
      title: payload.title ?? "",
      subtitle: payload.subtitle ?? "",
      progress_label: `${progress}/${total}`,
      badge_value: String(total || 0),
      style: payload.style ?? "ink",
      sort_order: payload.sort_order ?? 999,
    }),
  });
}

export function updateAchievement(id, payload) {
  const progress = Number(payload.progress ?? 0);
  const total = Number(payload.total ?? 0);
  return request(`/api/admin/achievements/${id}`, {
    method: "PUT",
    body: JSON.stringify({
      group_name: payload.group_name,
      group_order: payload.group_order,
      title: payload.title,
      subtitle: payload.subtitle,
      progress_label: `${progress}/${total}`,
      badge_value: String(total || payload.badge_value || 0),
      style: payload.style,
      sort_order: payload.sort_order,
    }),
  });
}

export function deleteAchievement(id) {
  return request(`/api/admin/achievements/${id}`, { method: "DELETE" });
}

export function updateSupportRequest(id, payload) {
  return request(`/api/admin/support-requests/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export { ADMIN_TOKEN_KEY, API_BASE_URL };


export function listAdminUsers() {
  return request("/api/admin/users");
}

export function fetchUserActivity(userId) {
  return request(`/api/users/${userId}/activity`);
}


export function banUser(id) {
  return request(`/api/admin/users/${id}/ban`, { method: "POST", body: "{}" });
}

export function unbanUser(id) {
  return request(`/api/admin/users/${id}/unban`, { method: "POST", body: "{}" });
}

export function deleteAdminUser(id) {
  return request(`/api/admin/users/${id}`, { method: "DELETE" });
}

export function suspendUser(id, days = 7) {
  return request(`/api/admin/users/${id}/suspend`, {
    method: "POST",
    body: JSON.stringify({ days: Number(days) || 7 }),
  });
}

export function restoreUser(id) {
  return request(`/api/admin/users/${id}/restore`, { method: "POST", body: "{}" });
}

export function setAuthorActive(id, active = true) {
  return request(`/api/admin/users/${id}/author-active`, {
    method: "POST",
    body: JSON.stringify({ active: !!active }),
  });
}

export function unsuspendUser(id) {
  return request(`/api/admin/users/${id}/unsuspend`, { method: "POST", body: "{}" });
}

export function activateUser(id) {
  return request(`/api/admin/users/${id}/activate`, { method: "POST", body: "{}" });
}


export function listAdminTags() {
  return request("/api/admin/tags");
}

export function createAdminTag(payload) {
  return request("/api/admin/tags", { method: "POST", body: JSON.stringify(payload) });
}

export function updateAdminTag(id, payload) {
  return request(`/api/admin/tags/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}

export function deleteAdminTag(id) {
  return request(`/api/admin/tags/${id}`, { method: "DELETE" });
}

export function listStoryReports() {
  return request("/api/admin/reports");
}


export function republishStory(bookId) {
  return request(`/api/admin/books/${bookId}/republish`, { method: "POST", body: "{}" });
}


export function createAdminChapter(bookId, payload) {
  return request(`/api/admin/books/${bookId}/chapters`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listAdminChapters(bookId) {
  return request(`/api/admin/books/${bookId}/chapters`);
}


export function listAdminAuthors() {
  return request("/api/admin/authors");
}

export function getAdminStats() {
  return request("/api/admin/stats");
}

export function listAdminReviews(limit = 100) {
  return request(`/api/admin/reviews?limit=${limit}`);
}

export function deleteAdminReview(id) {
  return request(`/api/admin/reviews/${id}`, { method: "DELETE" });
}

export function listChatConversations() {
  return request("/api/admin/chat/conversations");
}

export function getChatConversation(userId) {
  return request(`/api/admin/chat/conversations/${userId}`);
}

export function sendChatReply(userId, message) {
  return request(`/api/admin/chat/conversations/${userId}`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

// --- Home slider sections (story card rails on Discover home) ---
export function listHomeSections() {
  return request("/api/admin/home-sections");
}

export function listHomeHeroImages() {
  return request("/api/admin/home-hero-images");
}

export function createHomeHeroImage(payload) {
  return request("/api/admin/home-hero-images", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateHomeHeroImage(id, payload) {
  return request(`/api/admin/home-hero-images/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteHomeHeroImage(id) {
  return request(`/api/admin/home-hero-images/${id}`, { method: "DELETE" });
}

export function createHomeSection(payload) {
  return request("/api/admin/home-sections", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateHomeSection(id, payload) {
  return request(`/api/admin/home-sections/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteHomeSection(id) {
  return request(`/api/admin/home-sections/${id}`, { method: "DELETE" });
}

export function assignBooksToHomeSection(section_key, book_ids) {
  return request("/api/admin/home-sections/assign-books", {
    method: "POST",
    body: JSON.stringify({ section_key, book_ids }),
  });
}

export function listHomeSectionBooks(section_key) {
  return request(`/api/admin/home-sections/${encodeURIComponent(section_key)}/books`);
}
