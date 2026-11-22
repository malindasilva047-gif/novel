import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { resolveAssetUrl } from "../api";

const CANONICAL_ORIGIN = "https://wingsaga.com";

function setMeta(attribute, key, content) {
  let element = document.head.querySelector(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.append(element);
  }
  if (content) element.setAttribute("content", content);
  else element.remove();
}

export function usePageMeta({
  title,
  description,
  image = "",
  type = "website",
  canonicalPath,
  noIndex = false,
  structuredData,
}) {
  const location = useLocation();
  const structuredJson = structuredData ? JSON.stringify(structuredData) : "";

  useEffect(() => {
    const canonicalUrl = `${CANONICAL_ORIGIN}${canonicalPath || location.pathname}`;
    const absoluteImage = image ? resolveAssetUrl(image) : "";
    document.title = title;
    setMeta("name", "description", description);
    setMeta("name", "robots", noIndex ? "noindex,follow" : "index,follow");
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:type", type);
    setMeta("property", "og:url", canonicalUrl);
    setMeta("property", "og:image", absoluteImage);
    setMeta("name", "twitter:card", absoluteImage ? "summary_large_image" : "summary");
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", description);
    setMeta("name", "twitter:image", absoluteImage);

    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.append(canonical);
    }
    canonical.href = canonicalUrl;

    let schema = document.getElementById("page-structured-data");
    if (structuredJson) {
      if (!schema) {
        schema = document.createElement("script");
        schema.id = "page-structured-data";
        schema.type = "application/ld+json";
        document.head.append(schema);
      }
      schema.textContent = structuredJson;
    } else {
      schema?.remove();
    }
  }, [canonicalPath, description, image, location.pathname, noIndex, structuredJson, title, type]);
}
