const RAW_API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const API_BASE_URL = RAW_API_BASE_URL.replace(/\/api\/v1\/?$/, "").replace(/\/$/, "");

function buildApiUrl(path) {
  const safePath = path.startsWith("/") ? path : `/${path}`;
  const normalizedPath = safePath.startsWith("/api/v1/") || safePath === "/api/v1"
    ? safePath
    : safePath.startsWith("/api/")
      ? safePath
      : `/api/v1${safePath}`;
  return `${API_BASE_URL}${normalizedPath}`;
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
