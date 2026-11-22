import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getGenreBooks, getGenres, getPublicGenreCovers, resolveAssetUrl } from "../api";
import { usePageMeta } from "../components/PageMeta";
import "./GenrePage.css";

const PAGE_SIZE = 18;
const CACHE_DURATION = 5 * 60 * 1000;
const SORT_OPTIONS = ["Popular", "Completed", "Unexplored", "Recently Updated"];
const genreBooksCache = new Map();
let genreNamesCache = null;
let genreCoversCache = null;

function cachedRequest(cache, key, fetcher) {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.promise || Promise.resolve(cached.value);
  }

  const promise = fetcher().then((value) => {
    cache.set(key, { value, expiresAt: Date.now() + CACHE_DURATION });
    return value;
  }).catch((error) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, { promise, expiresAt: Date.now() + CACHE_DURATION });
  return promise;
}

function decodeGenre(value) {
  try {
    return decodeURIComponent(value || "Stories").trim() || "Stories";
  } catch {
    return String(value || "Stories").trim() || "Stories";
  }
}

function isCompleted(book) {
  const status = String(book.status_text || book.status || "").toLowerCase();
  return book.is_completed === true
    || Number(book.is_completed) === 1
    || /complete|finished|published/.test(status);
}

function getUpdatedAt(book) {
  return book.updated_at || book.last_updated || book.last_updated_at || book.created_at || "";
}

function StoryCard({ book, rank }) {
  const cover = resolveAssetUrl(book.cover_path || book.coverPath || "");
  const [failedCover, setFailedCover] = useState("");
  const rating = Number(book.rating);
  const genre = book.secondary_genre || book.primary_genre || book.genre || "";
  const chapterCount = book.published_chapter_count ?? book.chapter_count
    ?? book.chapters_count ?? book.chapters;
  const chapters = Number(chapterCount);
  const chapterCountAvailable = chapterCount != null && Number.isFinite(chapters);
  const reads = Number(book.view_count || book.read_count || book.reads || 0);
  const completed = isCompleted(book);
  const status = String(book.status_text || book.status || "").trim() || (completed ? "Completed" : "Ongoing");

  return (
    <article className="genre-story-card">
      <span className="genre-story-rank" aria-hidden="true">{rank}</span>
      <Link className="genre-story-cover" to={`/stories/${book.id}`} tabIndex={-1} aria-hidden="true">
        {cover && failedCover !== cover ? (
          <img src={cover} alt="" loading="lazy" decoding="async" onError={() => setFailedCover(cover)} />
        ) : (
          <span className="genre-story-cover-fallback" aria-hidden="true">W</span>
        )}
        {Number.isFinite(rating) && rating > 0 ? (
          <span className="genre-story-rating" aria-label={`Rated ${rating.toFixed(1)} out of 5`}>
            <span aria-hidden="true">★</span> {rating.toFixed(1)}
          </span>
        ) : null}
      </Link>
      <div className="genre-story-content">
        <h2><Link to={`/stories/${book.id}`}>{book.title || "Untitled story"}</Link></h2>
        <p className="genre-story-author">by {book.author || "Unknown author"}</p>
        {book.description ? <p className="genre-story-description">{book.description}</p> : null}
        <div className="genre-story-details">
          {genre ? <span className="genre-story-chip">{genre}</span> : null}
          <span className={`genre-story-status${completed ? " is-completed" : ""}`}>{status}</span>
        </div>
        <div className="genre-story-stats">
          {chapterCountAvailable ? <span>{chapters} {chapters === 1 ? "Chapter" : "Chapters"}</span> : null}
          {reads > 0 ? <span aria-label={`${reads.toLocaleString()} reads`}>{reads.toLocaleString()} reads</span> : null}
          {Number.isFinite(rating) && rating > 0 ? <span><span aria-hidden="true">★</span> {rating.toFixed(1)}</span> : null}
        </div>
      </div>
    </article>
  );
}

function GenreStorySkeleton() {
  return (
    <div className="genre-story-skeleton" aria-hidden="true">
      <span className="genre-skeleton-cover" />
      <span className="genre-skeleton-line genre-skeleton-line--title" />
      <span className="genre-skeleton-line genre-skeleton-line--author" />
      <span className="genre-skeleton-line genre-skeleton-line--description" />
      <span className="genre-skeleton-line genre-skeleton-line--details" />
    </div>
  );
}

export default function GenrePage() {
  const { genre } = useParams();
  const label = decodeGenre(genre);
  usePageMeta({
    title: `${label} Stories | Wingsaga`,
    description: `Explore ${label.toLocaleLowerCase()} stories on Wingsaga. Find your next read from new voices and reader favorites.`,
    canonicalPath: `/genres/${encodeURIComponent(label)}`,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `${label} Stories`,
      description: `Explore ${label.toLocaleLowerCase()} stories on Wingsaga.`,
      url: `https://wingsaga.com/genres/${encodeURIComponent(label)}`,
    },
  });
  const [books, setBooks] = useState([]);
  const [genres, setGenres] = useState([]);
  const [genreCovers, setGenreCovers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sort, setSort] = useState("Popular");
  const [period, setPeriod] = useState("All time");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [retry, setRetry] = useState(0);
  const loadMoreRef = useRef(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    Promise.all([
      cachedRequest(genreBooksCache, label.toLocaleLowerCase(), async () => {
        const response = await getGenreBooks(label);
        const items = response?.items || response?.books || [];
        if (!Array.isArray(items)) throw new Error("The genre response did not contain a story list.");
        return items;
      }),
      genreNamesCache
        ? Promise.resolve(genreNamesCache)
        : getGenres().then((response) => {
          const items = response?.items || response || [];
          const names = Array.isArray(items)
            ? items.map((item) => typeof item === "string" ? item : item?.name || item?.genre || "").filter(Boolean)
            : [];
          genreNamesCache = [...new Set(names)];
          return genreNamesCache;
        }).catch(() => []),
      genreCoversCache
        ? Promise.resolve(genreCoversCache)
        : getPublicGenreCovers().then((response) => {
          const items = Array.isArray(response?.items) ? response.items : [];
          genreCoversCache = items;
          return items;
        }).catch((coverError) => {
          console.warn("Could not load genre cover images:", coverError);
          return [];
        }),
    ]).then(([items, genreNames, genreCoverItems]) => {
      if (!active) return;
      setBooks(items);
      setGenres(genreNames);
      setGenreCovers(genreCoverItems);
    }).catch((loadError) => {
      if (active) setError(loadError.message || "Could not load stories for this genre.");
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, [label, retry]);

  useEffect(() => {
    const refreshGenre = () => {
      genreBooksCache.delete(label.toLocaleLowerCase());
      genreNamesCache = null;
      genreCoversCache = null;
      setRetry((current) => current + 1);
    };
    window.addEventListener("novelhub:content-changed", refreshGenre);
    return () => window.removeEventListener("novelhub:content-changed", refreshGenre);
  }, [label]);

  const filteredBooks = useMemo(() => {
    const targetGenre = label.toLocaleLowerCase();
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    let result = books.filter((book) => {
      const primary = String(book.primary_genre || book.genre || "").trim().toLocaleLowerCase();
      const secondary = String(book.secondary_genre || "").trim().toLocaleLowerCase();
      return !targetGenre || targetGenre === "stories" || primary === targetGenre || secondary === targetGenre;
    });

    if (period === "Last 30 days") {
      result = result.filter((book) => {
        const timestamp = Date.parse(getUpdatedAt(book));
        return Number.isNaN(timestamp) || timestamp >= cutoff;
      });
    }

    if (sort === "Completed") {
      result = result.filter(isCompleted);
    } else if (sort === "Unexplored") {
      result = result.filter((book) => !isCompleted(book));
    } else if (sort === "Recently Updated") {
      result = [...result].sort((a, b) => Date.parse(getUpdatedAt(b) || 0) - Date.parse(getUpdatedAt(a) || 0));
    } else {
      result = [...result].sort((a, b) => (
        Number(b.rating || 0) - Number(a.rating || 0)
        || Number(b.likes_count || b.likes || 0) - Number(a.likes_count || a.likes || 0)
      ));
    }
    return result;
  }, [books, label, period, sort]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filteredBooks]);

  const visibleBooks = filteredBooks.slice(0, visibleCount);
  const hasMore = visibleCount < filteredBooks.length;

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasMore || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisibleCount((count) => Math.min(count + PAGE_SIZE, filteredBooks.length));
      }
    }, { rootMargin: "320px 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [filteredBooks.length, hasMore, visibleBooks.length]);

  const genreLinks = [...new Set(["Stories", label, ...genres])];
  const genreCoverPath = genreCovers.find((item) =>
    String(item.name || "").toLocaleLowerCase() === label.toLocaleLowerCase(),
  )?.image_path;
  const genreCover = genreCoverPath ? resolveAssetUrl(genreCoverPath) : "";

  return (
    <main className="genre-explorer-page">
      <header className="genre-explorer-hero">
        {genreCover ? <img className="genre-explorer-hero-cover" src={genreCover} alt="" aria-hidden="true" loading="eager" fetchPriority="high" decoding="async" /> : null}
        <nav className="genre-breadcrumbs" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{label}</span>
        </nav>
        <p className="genre-hero-eyebrow">Explore your next favorite</p>
        <h1>{label} Stories</h1>
        <p className="genre-hero-summary">
          Find your next read in {label.toLocaleLowerCase()} — from fresh new voices to stories readers love.
        </p>
        <div className="genre-hero-actions">
          <a className="genre-hero-cta" href="#genre-stories">
            Browse stories <span aria-hidden="true">→</span>
          </a>
          <div className="genre-stat-card" role="status">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5zM4 5.5v16M8 7h8M8 11h8" /></svg>
            <span>{loading ? "Finding stories…" : `${filteredBooks.length.toLocaleString()} ${filteredBooks.length === 1 ? "story" : "stories"}`}</span>
          </div>
        </div>
      </header>

      <section className="genre-explorer-content" id="genre-stories" aria-label={`${label} stories`}>
        {genreLinks.length > 1 ? (
          <nav className="genre-selector" aria-label="Browse genres">
            {genreLinks.map((name) => (
              <Link
                key={name}
                to={`/genres/${encodeURIComponent(name)}`}
                className={`genre-selector-chip${name.toLocaleLowerCase() === label.toLocaleLowerCase() ? " is-active" : ""}`}
                aria-current={name.toLocaleLowerCase() === label.toLocaleLowerCase() ? "page" : undefined}
              >
                {name}
              </Link>
            ))}
          </nav>
        ) : null}

        <div className="genre-results-toolbar">
          <label className="genre-filter-select">
            <span>Sort by</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort genre stories">
              {SORT_OPTIONS.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label className="genre-filter-select">
            <span>Period</span>
            <select value={period} onChange={(event) => setPeriod(event.target.value)} aria-label="Filter by update date">
              {["All time", "Last 30 days"].map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
        </div>

        {error ? (
          <div className="genre-state genre-state--error" role="alert">
            <span className="genre-state-icon" aria-hidden="true">!</span>
            <h2>Stories could not be loaded</h2>
            <p>{error}</p>
            <button type="button" onClick={() => setRetry((value) => value + 1)}>Try again</button>
          </div>
        ) : null}

        {loading ? (
          <div className="genre-story-grid" aria-label="Loading stories">
            {Array.from({ length: 12 }, (_, index) => <GenreStorySkeleton key={index} />)}
          </div>
        ) : null}

        {!loading && !error && filteredBooks.length > 0 ? (
          <>
            <div className="genre-story-grid">
              {visibleBooks.map((book, index) => <StoryCard key={book.id} book={book} rank={index + 1} />)}
            </div>
            {hasMore ? (
              <div className="genre-load-more" ref={loadMoreRef}>
                <button type="button" onClick={() => setVisibleCount((count) => Math.min(count + PAGE_SIZE, filteredBooks.length))}>
                  Load more stories
                </button>
              </div>
            ) : null}
          </>
        ) : null}

        {!loading && !error && filteredBooks.length === 0 ? (
          <div className="genre-state genre-state--empty">
            <span className="genre-state-icon" aria-hidden="true">✦</span>
            <h2>No stories found yet</h2>
            <p>Try a different filter, or check back as new {label.toLocaleLowerCase()} stories are added.</p>
          </div>
        ) : null}
      </section>
    </main>
  );
}
