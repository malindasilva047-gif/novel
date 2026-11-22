import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { resolveAssetUrl } from "../api";

export default function BookCard({ book, variant = "shelf", link = true, immersive = false, coverOverlay = null, cardFooter = null, showRating = true, showStatus = true, inkittStyle = false }) {
  const [failedCover, setFailedCover] = useState("");
  const navigate = useNavigate();
  if (!book) return null;
  const cover = resolveAssetUrl(book.cover_path || book.coverPath || "");
  const showCoverFallback = !cover || failedCover === cover;
  const rating = book.rating != null ? Number(book.rating).toFixed(1) : null;
  const tag = book.secondary_genre || book.genre || book.primary_genre || "";
  const reads = Number(book.view_count || book.read_count || book.reads || 0);
  const rawStatus = String(book.publication_status || book.status || book.work_status || book.status_text || "");
  const statusLooksLikeTime = /^(just now|\d+\s*(seconds?|secs?|minutes?|mins?|hours?|days?|weeks?|months?|years?)(\s+ago)?)/i.test(rawStatus.trim());
  const completed = book.is_completed === true || Number(book.is_completed) === 1 || /complete|finished/i.test(rawStatus);
  const status = completed ? "Completed" : !statusLooksLikeTime && /draft|hiatus|ongoing/i.test(rawStatus) ? rawStatus : "Ongoing";
  const to = `/stories/${book.id}`;
  const className = `book-card book-card--${variant}${inkittStyle ? " book-card--inkitt" : ""}`;
  const responsiveCover = (() => {
    if (!cover) return null;
    try {
      const url = new URL(cover, window.location.origin);
      if (url.origin !== window.location.origin || !/^\/api\/media\/\d+$/.test(url.pathname)) return null;
      return [320, 640, 960, 1280].map((width) => {
        const source = new URL(url);
        source.searchParams.set("width", String(width));
        return `${source.href} ${width}w`;
      }).join(", ");
    } catch {
      return null;
    }
  })();

  const body = (
    <>
      <div className="book-cover-wrap">
        {!showCoverFallback ? (
          <img
            className="book-cover"
            src={cover}
            srcSet={responsiveCover || undefined}
            sizes={variant === "grid" ? "(max-width: 600px) 42vw, (max-width: 1000px) 22vw, 220px" : "(max-width: 600px) 38vw, 160px"}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFailedCover(cover)}
          />
        ) : (
          <div
            className="book-cover book-cover--fallback"
            role="img"
            aria-label={`Default cover for ${book.title || "Untitled story"}`}
          >
            {variant === "mini" ? (
              <span className="fallback-letter">{(book.title || "?")[0]}</span>
            ) : (
              <>
                <span className="book-cover-fallback-mark" aria-hidden="true">W</span>
                <strong>{book.title || "Untitled story"}</strong>
                <small>{book.author || "Wingsaga author"}</small>
              </>
            )}
          </div>
        )}
        {showRating && rating != null && !Number.isNaN(Number(rating)) ? (
          <span className="book-rating-badge" aria-label={`Rating ${rating}`}>
            <span className="rating-star" aria-hidden="true">★</span>
            <span className="rating-num">{rating}</span>
          </span>
        ) : null}
        {immersive && tag ? <span className="book-cover-genre-badge">{tag}</span> : null}
        {coverOverlay}
      </div>
      {cardFooter}
      {variant !== "mini" && (
        <div className="book-meta">
          <div className="book-title">{book.title}</div>
          <div className="book-author">by {book.author || "Unknown"}</div>
          <div className="book-card-stats">
            <span aria-label={`${reads.toLocaleString()} ${inkittStyle ? "views" : "reads"}`}>
              ◉ {reads ? `${reads.toLocaleString()}${inkittStyle ? " views" : ""}` : "New"}
            </span>
            {!immersive && rating != null && !Number.isNaN(Number(rating)) ? <span aria-label={`Rating ${rating}`}>★ {rating}</span> : null}
          </div>
          <div className="book-card-badges">
            {!immersive && tag ? <Link className="book-tag-chip" to={`/genres/${encodeURIComponent(tag)}`} onClick={(event) => event.stopPropagation()}>{tag}</Link> : null}
            {showStatus ? <span className={`book-status-chip ${completed ? "book-status-chip--completed" : "book-status-chip--ongoing"}`}>{status}</span> : null}
          </div>
        </div>
      )}
    </>
  );

  if (!link) {
    return <div className={className}>{body}</div>;
  }
  return (
    <article
      className={className}
      role="link"
      tabIndex={0}
      onClick={() => navigate(to)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          navigate(to);
        }
      }}
    >
      {body}
    </article>
  );
}
