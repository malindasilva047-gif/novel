import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getGenreBooks, getPublicGenreCovers, resolveAssetUrl } from "../api";
import { usePageMeta } from "../components/PageMeta";
import "./GenrePage.css";

const PAGE_SIZE = 18;
const CACHE_DURATION = 5 * 60 * 1000;
const genreBooksCache = new Map();
let genreCoversCache = null;

const TABS = [
  { id: "Trending", icon: "flame" },
  { id: "New", icon: "book" },
  { id: "Most Read", icon: "star" },
  { id: "Completed", icon: "check" },
];

const BASE_LANGUAGES = ["English", "Sinhala", "Japanese"];

const GENRE_BLURBS = {
  romance: "Stories filled with love, relationships, heartbreak and unforgettable moments.",
  fantasy: "Stories of magic, myth and worlds that exist just beyond the edge of the map.",
  thriller: "Stories that keep your pulse racing — secrets, suspense and one last twist.",
  mystery: "Stories built on clues, questions and the answers nobody expects.",
  drama: "Stories about people, choices and the moments that change everything.",
  "sci-fi": "Stories of future worlds, strange technology and the people who live with it.",
  horror: "Stories that linger in the dark long after you close the last page.",
  adventure: "Stories of journeys, danger and the courage to keep going.",
  "lgbtq+": "Stories of love, identity and lives told with honesty and heart.",
  poetry: "Stories and verses that turn a feeling into something you can hold.",
  "short stories": "Quick reads with a complete story, an ending and a little room to think.",
};

const GENRE_TAGLINES = {
  romance: "Love in every story…",
  fantasy: "Magic lives here…",
  thriller: "One more chapter…",
  mystery: "Every clue matters…",
  drama: "Some stories stay…",
  horror: "Don't read alone…",
};

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

function updatedTimestamp(book) {
  const timestamp = Date.parse(getUpdatedAt(book) || "");
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function coverGradient(id) {
  const n = Number(id) || 1;
  const hue = (n * 47) % 360;
  return `linear-gradient(160deg, hsl(${hue} 45% 28%), hsl(${(hue + 50) % 360} 50% 14%))`;
}

function storyCoverFor(book) {
  return resolveAssetUrl(book.cover_path || book.cover_url || book.coverPath || "");
}

function displayCount(value) {
  const count = Number(value);
  if (!Number.isFinite(count)) return null;
  if (count >= 1000000) return `${(count / 1000000).toFixed(1).replace(/\.0$/, "")}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return count.toLocaleString();
}

function viewsOf(book) {
  return Number(book.view_count || book.read_count || book.reads || 0) || 0;
}

function ratingOf(book) {
  const rating = Number(book.rating);
  return Number.isFinite(rating) ? rating : 0;
}

function storyLanguage(book) {
  const raw = String(book.language || book.language_name || "").trim().toLowerCase();
  if (!raw || ["en", "eng", "english", "en-us", "en-gb"].includes(raw)) return "English";
  if (["si", "sin", "sinhala", "sinhalese"].includes(raw)) return "Sinhala";
  if (["ja", "jp", "jpn", "japanese"].includes(raw)) return "Japanese";
  if (["ta", "tam", "tamil"].includes(raw)) return "Tamil";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function storyLength(book) {
  const count = Number(
    book.published_chapter_count ?? book.chapter_count ?? book.chapters_count ?? book.chapters,
  );
  if (!Number.isFinite(count) || count <= 0) return "Long Stories";
  return count <= 10 ? "Short Stories" : "Long Stories";
}

function tabIcon(name) {
  if (name === "flame") {
    return <path d="M12 3s4.5 3.7 4.5 8a4.5 4.5 0 0 1-9 0c0-1.6.7-2.8 1.4-3.7.2 1.4.9 2.3 1.8 2.3 1.2 0 1.7-1.4 1.3-6.6z" />;
  }
  if (name === "book") {
    return <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4zM20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h6z" />;
  }
  if (name === "star") {
    return <path d="m12 3.6 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.8l5.9-.9z" />;
  }
  return <path d="m5 12.5 4.5 4.5L19 7.5" />;
}

function StoryCard({ book }) {
  const cover = storyCoverFor(book);
  const [failedCover, setFailedCover] = useState("");
  const rating = Number(book.rating);
  const chapterCount = book.published_chapter_count ?? book.chapter_count
    ?? book.chapters_count ?? book.chapters;
  const chapters = Number(chapterCount);
  const chapterCountAvailable = chapterCount != null && Number.isFinite(chapters) && chapters > 0;
  const reads = Number(book.view_count || book.read_count || book.reads || 0);
  const completed = isCompleted(book);
  const tags = Array.isArray(book.tags)
    ? book.tags.map((tag) => (typeof tag === "string" ? tag : tag?.name || tag?.tag)).filter(Boolean)
    : [];

  return (
    <article className="genre-story-card">
      <div
        className="genre-story-cover"
        style={!cover || failedCover === cover ? { background: coverGradient(book.id) } : undefined}
        aria-hidden="true"
      >
        {cover && failedCover !== cover ? (
          <img src={cover} alt="" loading="lazy" decoding="async" onError={() => setFailedCover(cover)} />
        ) : null}
      </div>
      <div className="genre-story-content">
        <h2><Link to={`/stories/${book.id}`}>{book.title || "Untitled story"}</Link></h2>
        <p className="genre-story-author">
          <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>
          {book.author || "Unknown author"}
        </p>
        <div className="genre-story-stats">
          {reads > 0 ? (
            <span aria-label={`${reads.toLocaleString()} reads`}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
              {displayCount(reads)}
            </span>
          ) : null}
          {chapterCountAvailable ? (
            <span>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h5v17H6a2 2 0 0 0-2 2zM20 5a2 2 0 0 0-2-2h-5v17h5a2 2 0 0 1 2 2z" /></svg>
              {chapters} {chapters === 1 ? "chapter" : "chapters"}
            </span>
          ) : null}
          {Number.isFinite(rating) && rating > 0 ? (
            <span aria-label={`Rated ${rating.toFixed(1)} out of 5`}>
              <svg viewBox="0 0 24 24" aria-hidden="true" className="genre-stat-star"><path d="m12 3.6 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.8l5.9-.9z" /></svg>
              {rating.toFixed(1)}
            </span>
          ) : null}
        </div>
        {book.description ? <p className="genre-story-description">{book.description}</p> : null}
        {tags.length > 0 || completed ? (
          <div className="genre-story-tags">
            {tags.slice(0, 3).map((tag) => (
              <Link
                key={tag}
                className="genre-story-chip"
                to={`/tags/${encodeURIComponent(String(tag).replace(/^#/, ""))}`}
              >
                #{String(tag).replace(/^#/, "")}
              </Link>
            ))}
            {completed ? <span className="genre-story-chip genre-story-chip--done">Completed</span> : null}
          </div>
        ) : null}
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

function FilterGroup({ title, options, value, onChange }) {
  return (
    <div className="genre-hub-filter-group" role="group" aria-label={title}>
      <h3 className="genre-hub-filter-title">{title}</h3>
      <div className="genre-hub-filter-options">
        {options.map((option) => (
          <label key={option} className={`genre-hub-check${value === option ? " is-checked" : ""}`}>
            <input
              type="radio"
              name={`genre-filter-${title.toLowerCase()}`}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
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
  const [genreCovers, setGenreCovers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sort, setSort] = useState("Trending");
  const [status, setStatus] = useState("All");
  const [type, setType] = useState("All");
  const [language, setLanguage] = useState("All");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [retry, setRetry] = useState(0);
  const loadMoreRef = useRef(null);
  const resultsRef = useRef(null);

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
    ]).then(([items, genreCoverItems]) => {
      if (!active) return;
      setBooks(items);
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
      genreCoversCache = null;
      setRetry((current) => current + 1);
    };
    window.addEventListener("novelhub:content-changed", refreshGenre);
    return () => window.removeEventListener("novelhub:content-changed", refreshGenre);
  }, [label]);

  const genreBooks = useMemo(() => {
    const targetGenre = label.toLocaleLowerCase();
    return books.filter((book) => {
      const primary = String(book.primary_genre || book.genre || "").trim().toLocaleLowerCase();
      const secondary = String(book.secondary_genre || "").trim().toLocaleLowerCase();
      return !targetGenre || targetGenre === "stories" || primary === targetGenre || secondary === targetGenre;
    });
  }, [books, label]);

  const languageOptions = useMemo(() => {
    const found = [...new Set(genreBooks.map(storyLanguage))];
    return ["All", ...BASE_LANGUAGES, ...found.filter((name) => !BASE_LANGUAGES.includes(name))];
  }, [genreBooks]);

  const filteredBooks = useMemo(() => {
    let result = genreBooks.filter((book) => {
      if (status === "Completed" && !isCompleted(book)) return false;
      if (status === "Ongoing" && isCompleted(book)) return false;
      if (type !== "All" && storyLength(book) !== type) return false;
      if (language !== "All" && storyLanguage(book) !== language) return false;
      return true;
    });

    if (sort === "Completed") {
      result = result.filter(isCompleted);
    }

    if (sort === "New") {
      result = [...result].sort((a, b) => (
        updatedTimestamp(b) - updatedTimestamp(a)
        || Number(b.id || 0) - Number(a.id || 0)
      ));
    } else if (sort === "Most Read") {
      result = [...result].sort((a, b) => viewsOf(b) - viewsOf(a));
    } else {
      result = [...result].sort((a, b) => (
        ratingOf(b) - ratingOf(a)
        || Number(b.likes_count || b.likes || 0) - Number(a.likes_count || a.likes || 0)
        || viewsOf(b) - viewsOf(a)
      ));
    }
    return result;
  }, [genreBooks, language, sort, status, type]);

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

  const genreCoverPath = genreCovers.find((item) =>
    String(item.name || "").toLocaleLowerCase() === label.toLocaleLowerCase(),
  )?.image_path;
  const genreCover = genreCoverPath ? resolveAssetUrl(genreCoverPath) : "";
  const leadBookCover = useMemo(() => (
    [...genreBooks].sort((a, b) => ratingOf(b) - ratingOf(a)).map(storyCoverFor).find(Boolean) || ""
  ), [genreBooks]);
  const heroImage = genreCover || leadBookCover;

  const totalReaders = useMemo(
    () => genreBooks.reduce((sum, book) => sum + viewsOf(book), 0),
    [genreBooks],
  );
  const averageRating = useMemo(() => {
    const rated = genreBooks.filter((book) => ratingOf(book) > 0);
    if (!rated.length) return null;
    return rated.reduce((sum, book) => sum + ratingOf(book), 0) / rated.length;
  }, [genreBooks]);

  const blurb = GENRE_BLURBS[label.toLocaleLowerCase()]
    || `Stories filled with ${label.toLocaleLowerCase()} — new voices, reader favorites and unforgettable moments.`;
  const tagline = GENRE_TAGLINES[label.toLocaleLowerCase()] || "Every story, a new world…";
  const hasFilters = status !== "All" || type !== "All" || language !== "All";

  function clearFilters() {
    setStatus("All");
    setType("All");
    setLanguage("All");
  }

  function exploreAll() {
    clearFilters();
    setSort("Trending");
    if (typeof resultsRef.current?.scrollIntoView === "function") {
      resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const storyCountLabel = loading
    ? "Loading stories…"
    : `${filteredBooks.length.toLocaleString()} ${filteredBooks.length === 1 ? "story" : "stories"}`;

  return (
    <main className="genre-explorer-page genre-explorer-page--hub">
      <section
        className="genre-hub-hero"
        aria-label={`${label} genre`}
        style={heroImage ? { "--genre-hub-image": `url(${JSON.stringify(heroImage)})` } : undefined}
      >
        <div className="genre-hub-hero-art" aria-hidden="true" />
        <div className="genre-hub-hero-inner">
          <Link className="genre-hub-back" to="/">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path strokeLinecap="round" strokeLinejoin="round" d="m15 18-6-6 6-6" /></svg>
            Genres
          </Link>
          <h1 className="genre-hub-title">
            <svg className="genre-hub-title-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-7.5-10A4.5 4.5 0 0 1 12 7.7 4.5 4.5 0 0 1 19.5 11c0 5.4-7.5 10-7.5 10z" /></svg>
            {label}
          </h1>
          <p className="genre-hub-blurb">{blurb}</p>
          <ul className="genre-hub-stats">
            <li>
              <span className="genre-hub-stat-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4zM20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h6z" /></svg>
              </span>
              <span className="genre-hub-stat-copy">
                <b>{loading ? "—" : displayCount(genreBooks.length) || genreBooks.length}</b>
                <small>Stories</small>
              </span>
            </li>
            <li>
              <span className="genre-hub-stat-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.4" /><path d="M2.5 20c0-3.6 3-5.6 6.5-5.6s6.5 2 6.5 5.6" /><circle cx="17.5" cy="9" r="2.6" /><path d="M17 14.3c2.8.2 4.5 1.9 4.5 4.7" /></svg>
              </span>
              <span className="genre-hub-stat-copy">
                <b>{loading ? "—" : displayCount(totalReaders) || "0"}</b>
                <small>Readers</small>
              </span>
            </li>
            <li>
              <span className="genre-hub-stat-icon genre-hub-stat-icon--star" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="m12 3.6 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.8l5.9-.9z" /></svg>
              </span>
              <span className="genre-hub-stat-copy">
                <b>{loading ? "—" : averageRating ? averageRating.toFixed(1) : "New"}</b>
                <small>Rating</small>
              </span>
            </li>
          </ul>
        </div>
        <span className="genre-hub-tagline" aria-hidden="true">{tagline}</span>
      </section>

      <div className="genre-hub-wrap">
        <div className="genre-hub-toolbar">
          <div className="genre-hub-tabs" role="tablist" aria-label={`${label} story lists`}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={sort === tab.id}
                className={`genre-hub-tab${sort === tab.id ? " is-active" : ""}`}
                onClick={() => setSort(tab.id)}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24">{tabIcon(tab.icon)}</svg>
                {tab.id}
              </button>
            ))}
          </div>
          <label className="genre-hub-sort">
            <span>Sort by:</span>
            <span className="genre-hub-sort-field">
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value)}
                aria-label={`Sort ${label} stories`}
              >
                {TABS.map((tab) => <option key={tab.id} value={tab.id}>{tab.id}</option>)}
              </select>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" /></svg>
            </span>
          </label>
        </div>

        <div className="genre-hub-layout">
          <aside className="genre-hub-filters" aria-label={`Filter ${label} stories`}>
            <h2 className="genre-hub-filters-title">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path strokeLinecap="round" strokeLinejoin="round" d="M3 5h18l-7 8v6l-4 2v-8z" /></svg>
              Filters
            </h2>

            <FilterGroup
              title="Status"
              options={["All", "Ongoing", "Completed"]}
              value={status}
              onChange={setStatus}
            />
            <FilterGroup
              title="Type"
              options={["All", "Short Stories", "Long Stories"]}
              value={type}
              onChange={setType}
            />
            <FilterGroup
              title="Language"
              options={languageOptions}
              value={language}
              onChange={setLanguage}
            />

            <button
              type="button"
              className="genre-hub-clear"
              onClick={clearFilters}
              disabled={!hasFilters}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M20 11A8 8 0 1 0 6 6.3M20 4v6h-6" /></svg>
              Clear Filters
            </button>
          </aside>

          <section
            className="genre-hub-results"
            id="genre-stories"
            aria-label={`${label} stories`}
            ref={resultsRef}
          >
            <p className="genre-hub-status" role="status">
              {storyCountLabel}
              {!loading && sort ? ` · ${sort}` : ""}
            </p>

            {error ? (
              <div className="genre-state genre-state--error" role="alert">
                <span className="genre-state-icon" aria-hidden="true">!</span>
                <h2>Stories could not be loaded</h2>
                <p>{error}</p>
                <button type="button" onClick={() => setRetry((value) => value + 1)}>Try again</button>
              </div>
            ) : null}

            {loading ? (
              <div className="genre-story-grid genre-hub-grid" aria-label="Loading stories">
                {Array.from({ length: 9 }, (_, index) => <GenreStorySkeleton key={index} />)}
              </div>
            ) : null}

            {!loading && !error && filteredBooks.length > 0 ? (
              <>
                <div className="genre-story-grid genre-hub-grid">
                  {visibleBooks.map((book) => <StoryCard key={book.id} book={book} />)}
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
                <p>
                  {hasFilters
                    ? "No stories match these filters. Try clearing them to see every story in this genre."
                    : `New ${label.toLocaleLowerCase()} stories are added all the time — check back soon.`}
                </p>
                {hasFilters ? (
                  <button type="button" onClick={clearFilters}>Clear filters</button>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>

        <section className="genre-hub-discover" aria-label={`Discover more ${label} stories`}>
          <span className="genre-hub-discover-glow" aria-hidden="true" />
          <span className="genre-hub-discover-book" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.5C10.5 5 8.4 4.4 5 4.4v13.2c3.4 0 5.5.6 7 2.1 1.5-1.5 3.6-2.1 7-2.1V4.4c-3.4 0-5.5.6-7 2.1zM12 6.5v13.2" /></svg>
          </span>
          <div className="genre-hub-discover-copy">
            <h2>Discover more {label} stories</h2>
            <p>Let your heart be part of a beautiful story…</p>
          </div>
          <button type="button" className="genre-hub-discover-cta" onClick={exploreAll}>
            Explore all {label} stories
            <span aria-hidden="true">→</span>
          </button>
        </section>
      </div>
    </main>
  );
}
