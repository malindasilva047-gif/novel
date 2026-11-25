/**
 * Responsive image helpers — no UI change, smaller payloads on mobile.
 */

const WIDTHS = [300, 600, 1200];

function toPath(pathOrUrl) {
  if (!pathOrUrl) return "";
  const raw = String(pathOrUrl).trim();
  if (!raw) return "";
  try {
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      const u = new URL(raw);
      return u.pathname;
    }
  } catch {
    /* ignore */
  }
  if (raw.startsWith("/uploads/") || raw.startsWith("/api/media/")) {
    return raw.split("?")[0];
  }
  // bare filename stored in some rows
  if (!raw.includes("/") && /\.(jpe?g|png|webp|gif|avif)$/i.test(raw)) {
    return `/uploads/${raw}`;
  }
  return "";
}

export function variantUrl(pathOrUrl, width, fmt = "webp") {
  const src = toPath(pathOrUrl);
  if (!src) return pathOrUrl || "";
  if (src.startsWith("/api/media/")) {
    const snapped = [320, 640, 960, 1280].reduce((best, w) =>
      Math.abs(w - width) < Math.abs(best - width) ? w : best
    , 640);
    return `${src}?width=${snapped}`;
  }
  return `/api/img?src=${encodeURIComponent(src)}&w=${width}&fmt=${fmt}`;
}

export function buildSrcSet(pathOrUrl, fmt = "webp") {
  const src = toPath(pathOrUrl);
  if (!src) return undefined;
  return WIDTHS.map((w) => `${variantUrl(pathOrUrl, w, fmt)} ${w}w`).join(", ");
}

export const COVER_SIZES =
  "(max-width: 480px) 140px, (max-width: 900px) 180px, 220px";
