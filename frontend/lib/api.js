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
  const value = rawUrl.trim();
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
      return parsed.toString();
    }
    if (parsed.protocol === "http:") {
      parsed.protocol = "https:";
      return parsed.toString();
    }
    return parsed.toString();
  }
  catch {
    // Safety fallback: if parsing fails but URL is clearly http and not local, still force https.
    if (/^http:\/\//i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(url)) {
      return url.replace(/^http:\/\//i, "https://");
    }
    return url;
  }
}

function buildApiUrl(path) {
  const safePath = path.startsWith("/") ? path : `/${path}`;
  const normalizedPath = safePath.startsWith("/api/v1/") || safePath === "/api/v1"
    ? safePath
    : safePath.startsWith("/api/")
      ? safePath
      : `/api/v1${safePath}`;
  const combined = `${API_BASE_URL}${normalizedPath}`;

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

  const response = await fetch(buildApiUrl(path), {
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
  const fallback = { site_name: "Wingsaga", logo_url: "" };

  if (typeof window !== "undefined") {
    const cached = localStorage.getItem("site_settings");
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        localStorage.removeItem("site_settings");
      }
    }
  }

  try {
    const data = await apiRequest("/discovery/site-settings");
    const normalized = {
      site_name: data?.site_name || "Wingsaga",
      logo_url: data?.logo_url || "",
    };
    if (typeof window !== "undefined") {
      localStorage.setItem("site_settings", JSON.stringify(normalized));
    }
    return normalized;
  } catch {
    return fallback;
  }
}
