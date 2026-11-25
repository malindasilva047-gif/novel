import { buildSrcSet, variantUrl, COVER_SIZES } from "../utils/responsiveImage";
import { resolveAssetUrl } from "../api";

/**
 * Same visual cover, responsive WebP/AVIF + srcset for mobile/desktop bandwidth savings.
 */
export default function ResponsiveCover({
  src,
  alt = "",
  className,
  style,
  loading = "lazy",
  decoding = "async",
  sizes = COVER_SIZES,
  onError,
  fetchPriority,
}) {
  if (!src) {
    return <div className={className} style={style} aria-hidden="true" />;
  }

  const fallback = resolveAssetUrl(src);
  const webpSet = buildSrcSet(src, "webp");
  const avifSet = buildSrcSet(src, "avif");
  const defaultSrc = variantUrl(src, 600, "webp") || fallback;

  if (!webpSet) {
    return (
      <img
        src={fallback}
        alt={alt}
        className={className}
        style={style}
        loading={loading}
        decoding={decoding}
        onError={onError}
        fetchPriority={fetchPriority}
      />
    );
  }

  return (
    <picture>
      {avifSet ? <source type="image/avif" srcSet={avifSet} sizes={sizes} /> : null}
      <source type="image/webp" srcSet={webpSet} sizes={sizes} />
      <img
        src={defaultSrc}
        alt={alt}
        className={className}
        style={style}
        loading={loading}
        decoding={decoding}
        sizes={sizes}
        onError={onError}
        fetchPriority={fetchPriority}
      />
    </picture>
  );
}
