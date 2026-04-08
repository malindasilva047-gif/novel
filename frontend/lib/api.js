const RAW_API_BASE_URL = String(process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000")
  .trim()
  .replace(/^['"]|['"]$/g, "");

function isLocalOrPrivateHost(hostname = "") {
  const host = String(hostname || "").toLowerCase();
  if (!host) return false;
  if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1") {
    return true;
  }
  if (/^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) {
    return true;
  }
  return false;
}

function normalizeApiBaseUrl(rawUrl) {
  const value = String(rawUrl || "").trim().replace(/\s+/g, "");
  if (!value) {
    return "http://localhost:8000";
  }
  const withProtocol = /^https?:\/\//i.test(value) ? value : `http://${value}`;
  const sanitized = withProtocol.replace(/\/api\/v1\/?$/, "").replace(/\/$/, "");

  try {
    const parsed = new URL(sanitized);
    if (isLocalOrPrivateHost(parsed.hostname)) {
      parsed.protocol = "http:";
      return parsed.toString().replace(/\/$/, "");
    }
    if (parsed.protocol === "http:") {
      parsed.protocol = "https:";
      return parsed.toString().replace(/\/$/, "");
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    // Safe fallback for malformed custom values
    return "http://localhost:8000";
  }
}

const API_BASE_URL = ensureSecureApiUrl(normalizeApiBaseUrl(RAW_API_BASE_URL));

function ensureSecureApiUrl(url) {
  try {
    const parsed = new URL(url);
    if (isLocalOrPrivateHost(parsed.hostname)) {
      parsed.protocol = "http:";
      const result = parsed.toString().replace(/\/$/, "");
      return result;
    }
    if (parsed.protocol === "http:") {
      parsed.protocol = "https:";
      const result = parsed.toString().replace(/\/$/, "");
      return result;
    }
    const result = parsed.toString().replace(/\/$/, "");
    return result;
  }
  catch {
    // Safety fallback: if parsing fails but URL is clearly http and not local, still force https.
    if (/^http:\/\//i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(url)) {
      return url.replace(/^http:\/\//i, "https://").replace(/\/$/, "");
    }
    return url.replace(/\/$/, "");
  }
}

function buildApiUrl(path) {
  const safePath = path.startsWith("/") ? path : `/${path}`;
  const normalizedPath = safePath.startsWith("/api/v1/") || safePath === "/api/v1"
    ? safePath
    : safePath.startsWith("/api/")
      ? safePath
      : `/api/v1${safePath}`;
  
  // Ensure API_BASE_URL has no trailing slash, path has leading slash
  const baseNoTrailingSlash = API_BASE_URL.replace(/\/$/, "");
  const combined = `${baseNoTrailingSlash}${normalizedPath}`;

  // Extra runtime guard for browser https pages.
  if (typeof window !== "undefined" && window.location.protocol === "https:" && /^http:\/\//i.test(combined)) {
    return combined.replace(/^http:\/\//i, "https://");
  }

  return ensureSecureApiUrl(combined);
}

function normalizeApiError(detail) {
  if (typeof detail === "string") {
    return detail;
  }

  // FastAPI validation errors are typically a list of objects.
  if (Array.isArray(detail)) {
    const first = detail[0];
    if (first && typeof first === "object") {
      const field = Array.isArray(first.loc) ? first.loc.join(".") : "field";
      const message = first.msg || "Invalid input";
      return `${field}: ${message}`;
    }
    return "Invalid request payload";
  }

  if (detail && typeof detail === "object") {
    return detail.message || "Request failed";
  }

  return "Request failed";
}

export async function apiRequest(path, { method = "GET", body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  const authToken = token || readToken();
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  let requestUrl = buildApiUrl(path);
  if (typeof window !== "undefined" && window.location.protocol === "https:" && /^http:\/\//i.test(requestUrl)) {
    requestUrl = requestUrl.replace(/^http:\/\//i, "https://");
  }

  const response = await fetch(requestUrl, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store"
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(normalizeApiError(data.detail));
    error.status = response.status;
    error.detail = data.detail;
    throw error;
  }
  return data;
}

export async function apiUpload(path, { file, fieldName = "image", token } = {}) {
  const headers = {};
  const authToken = token || readToken();
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const formData = new FormData();
  formData.append(fieldName, file);

  const response = await fetch(buildApiUrl(path), {
    method: "POST",
    headers,
    body: formData,
    cache: "no-store"
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(normalizeApiError(data.detail));
    error.status = response.status;
    error.detail = data.detail;
    throw error;
  }
  return data;
}

export function readToken() {
  if (typeof window === "undefined") {
    return "";
  }
  return localStorage.getItem("token") || "";
}

export function saveToken(token) {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.setItem("token", token);
}

export function clearToken() {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.removeItem("token");
}

export async function fetchSiteSettings() {
  const fallback = {
    site_name: "Bixbi",
    logo_url: "",
    dark_logo_url: "",
    light_logo_url: "",
    splash_image_url: "",
    contact_email: "support@bixbi.app",
    copyright_text: `Copyright ${new Date().getFullYear()} Bixbi. All rights reserved.`,
    primary_color: "#1278ff",
    secondary_color: "#35a0ff",
    login_config: {
      email_enabled: true,
      mobile_otp_enabled: true,
      facebook_enabled: false,
      google_enabled: true,
      apple_enabled: false,
    },
  };

  if (typeof window !== "undefined") {
    const cached = localStorage.getItem("site_settings");
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        const cachedAt = Number(parsed?._cachedAt || 0);
        if (cachedAt && Date.now() - cachedAt < 5 * 60 * 1000) {
          return parsed;
        }
        localStorage.removeItem("site_settings");
      } catch {
        localStorage.removeItem("site_settings");
      }
    }
  }

  try {
    const data = await apiRequest("/discovery/site-settings");
    const normalized = {
      site_name: data?.site_name || fallback.site_name,
      logo_url: data?.logo_url || "",
      dark_logo_url: data?.dark_logo_url || "",
      light_logo_url: data?.light_logo_url || "",
      splash_image_url: data?.splash_image_url || "",
      contact_email: data?.contact_email || fallback.contact_email,
      copyright_text: data?.copyright_text || fallback.copyright_text,
      primary_color: data?.primary_color || fallback.primary_color,
      secondary_color: data?.secondary_color || fallback.secondary_color,
      login_config: {
        ...fallback.login_config,
        ...(data?.login_config || {}),
      },
      _cachedAt: Date.now(),
    };
    if (typeof window !== "undefined") {
      localStorage.setItem("site_settings", JSON.stringify(normalized));
    }
    return normalized;
  } catch {
    return fallback;
  }
}

export function clearSiteSettingsCache() {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.removeItem("site_settings");
}

export async function trackUserActivity({
  postId,
  actionType,
  readTime = 0,
  scrollDepth = 0,
  token,
} = {}) {
  if (!postId || !actionType) {
    return null;
  }

  return apiRequest('/user-activity', {
    method: 'POST',
    token,
    body: {
      post_id: String(postId),
      action_type: String(actionType),
      read_time: Number(readTime) || 0,
      scroll_depth: Number(scrollDepth) || 0,
    },
  });
}
