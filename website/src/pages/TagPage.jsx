import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import ShareDialog from "../components/ShareDialog";
import BookCard from "../components/BookCard";
import { showToast } from "../components/ToastViewport";
import {
  followTagWeb,
  getTagBooksForHub,
  getTagFollowStateWeb,
  getTagsForHub,
  resolveAssetUrl,
  unfollowTagWeb,
} from "../api";

const FILTERS = [
  { key: "top", label: "Top", sort: "top" },
  { key: "recent", label: "Recent", sort: "recent" },
  { key: "trending", label: "Trending", sort: "trending" },
  { key: "liked", label: "Most Liked", sort: "liked" },
];

const TAG_VIEW_STORAGE_KEY = "wingsaga:tag-hub-view";

function getStoredTagView() {
  try {
    return localStorage.getItem(TAG_VIEW_STORAGE_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

function StoryCover({ src, loading = "lazy", fetchPriority }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [src]);

  if (!src || failed) {
    return <span className="tag-hub-cover-fallback" aria-hidden="true">W</span>;
  }

  return (
    <img
      src={src}
      alt=""
      loading={loading}
      fetchPriority={fetchPriority}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

function displayCount(value) {
  if (value == null || value === "") return "—";
  const count = Number(value);
  return Number.isFinite(count) ? count.toLocaleString() : "—";
}

export default function TagPage({ user }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [tag, setTag] = useState(null);
  const [books, setBooks] = useState([]);
  const [relatedTags, setRelatedTags] = useState([]);
  const [filter, setFilter] = useState("top");
  const [view, setView] = useState(getStoredTagView);
  const [following, setFollowing] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [followers, setFollowers] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [error, setError] = useState("");
  const [failedCoverUrls, setFailedCoverUrls] = useState(() => new Set());
  const loadRequestId = useRef(0);
  const sentinelRef = useRef(null);
  const pageRef = useRef(0);
  const loadingMoreRef = useRef(false);

  const tagName = useMemo(() => {
    const raw = location.pathname.slice("/tags/".length);
    try {
      return decodeURIComponent(raw).replace(/^#/, "").trim();
    } catch {
      return raw.replace(/^#/, "").trim();
    }
  }, [location.pathname]);

  const showNotice = useCallback((message, type = "success") => showToast(message, type), []);

  function selectView(nextView) {
    setView(nextView);
    try {
      localStorage.setItem(TAG_VIEW_STORAGE_KEY, nextView);
    } catch {
      showNotice("View changed, but your preference could not be saved.", "warning");
    }
  }

  const loadTag = useCallback(async (selectedFilter = filter) => {
    const requestId = ++loadRequestId.current;
    if (!tagName) {
      setError("That hashtag could not be found.");
      setLoading(false);
      return;
    }
    loadingMoreRef.current = false;
    pageRef.current = 0;
    setLoadingMore(false);
    setHasMore(false);
    setLoading(true);
    setError("");
    const selectedSort = FILTERS.find((item) => item.key === selectedFilter)?.sort || "trending";
    const [tagResult, bookResult] = await Promise.allSettled([
      getTagsForHub(),
      getTagBooksForHub(tagName, selectedSort, { limit: 20, offset: 0 }),
    ]);
    if (requestId !== loadRequestId.current) return;

    const tagPayload = tagResult.status === "fulfilled" ? tagResult.value : null;
    const bookPayload = bookResult.status === "fulfilled" ? bookResult.value : null;
    const allTags = Array.isArray(tagPayload?.items) ? tagPayload.items : [];
    const matched = allTags.find(
      (item) => String(item.name || item.tag || "").toLowerCase() === tagName.toLowerCase(),
    );
    const tagMeta = bookPayload?.tag_meta || {};
    const resolvedTag = { ...matched, ...tagMeta };
    setTag(resolvedTag.name ? resolvedTag : {
      name: tagName,
      description: "",
      cover_path: "",
    });
    const relatedFromBooks = Array.isArray(bookPayload?.related_tags)
      ? bookPayload.related_tags
      : [];
    setRelatedTags(relatedFromBooks.length
      ? relatedFromBooks.map((item) => {
        const name = String(item.name || item.tag || "");
        const listedTag = allTags.find((candidate) =>
          (item.id != null && String(candidate.id) === String(item.id))
          || String(candidate.name || candidate.tag || "").toLowerCase() === name.toLowerCase(),
        );
        return {
          ...listedTag,
          ...item,
          book_count: listedTag?.book_count ?? item.book_count ?? item.shared_stories,
        };
      })
      : allTags
        .filter((item) => String(item.name || item.tag || "").toLowerCase() !== tagName.toLowerCase())
        .slice(0, 10));
    if (bookResult.status === "fulfilled") {
      setBooks(Array.isArray(bookPayload?.items) ? bookPayload.items : []);
      setHasMore(Boolean(bookPayload?.has_more));
      pageRef.current = 1;
    }
    setFollowers(
      matched?.followers_count != null ? Number(matched.followers_count) : null,
    );
    if (bookResult.status === "rejected") {
      setError(bookResult.reason?.message || "Could not load stories for this hashtag.");
      setLoading(false);
      return;
    }
    if (user) {
      try {
        const state = await getTagFollowStateWeb(tagName);
        if (requestId !== loadRequestId.current) return;
        setFollowing(Boolean(state?.following));
        if (state?.followers != null) setFollowers(Number(state.followers));
      } catch {
        if (requestId !== loadRequestId.current) return;
        setFollowing(false);
      }
    } else {
      setFollowing(false);
    }
    setError(tagResult.status === "rejected"
      ? "Story details loaded, but hashtag suggestions are temporarily unavailable."
      : "");
    setLoading(false);
  }, [filter, tagName, user]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMoreRef.current || !hasMore) return;
    const requestId = loadRequestId.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const selectedSort = FILTERS.find((item) => item.key === filter)?.sort || "trending";
      const response = await getTagBooksForHub(tagName, selectedSort, {
        limit: 20,
        offset: pageRef.current * 20,
      });
      if (requestId !== loadRequestId.current) return;
      const nextItems = Array.isArray(response?.items) ? response.items : [];
      setBooks((current) => {
        const existingIds = new Set(current.map((item) => String(item.id)));
        return [...current, ...nextItems.filter((item) => !existingIds.has(String(item.id)))];
      });
      pageRef.current += 1;
      setHasMore(Boolean(response?.has_more));
    } catch (loadError) {
      if (requestId === loadRequestId.current) {
        setError(loadError?.message || "Could not load more stories for this hashtag.");
      }
    } finally {
      if (requestId === loadRequestId.current) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [filter, hasMore, loading, tagName]);

  useEffect(() => {
    loadTag(filter);
    return () => {
      loadRequestId.current += 1;
    };
  }, [filter, loadTag]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || loading || loadingMore) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore();
    }, { rootMargin: "480px 0px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore, loading, loadingMore]);

  async function toggleFollow() {
    if (!user) {
      navigate("/login");
      return;
    }
    if (followBusy) return;
    setFollowBusy(true);
    try {
      const result = following
        ? await unfollowTagWeb(tagName)
        : await followTagWeb(tagName);
      setFollowing(Boolean(result?.following));
      if (result?.followers != null) setFollowers(Number(result.followers));
      showNotice(result?.following ? `Following #${displayName}.` : `Unfollowed #${displayName}.`);
    } catch (followError) {
      showNotice(followError?.message || "Could not update your follow.", "danger");
    } finally {
      setFollowBusy(false);
    }
  }

  function shareTag() { setShareOpen(true); }

  const displayName = tag?.name || tagName;
  const storyCount = tag?.book_count ?? (loading || error ? null : books.length);
  const storyCountLabel = storyCount == null || !Number.isFinite(Number(storyCount))
    ? "Stories"
    : Number(storyCount) === 1 ? "Story" : "Stories";
  const followerCountNumber = followers == null ? null : Number(followers);
  const followerCountLabel = followerCountNumber === 1 ? "Follower" : "Followers";
  const visibleBooks = books;
  const coverCandidates = [...new Set([
    tag?.cover_path,
    ...books.map((book) => book.cover_path || book.cover_url),
  ].filter(Boolean).map(resolveAssetUrl))];
  const coverUrl = coverCandidates.find((url) => !failedCoverUrls.has(url)) || "";
  return (
    <div className="tag-hub">
      <section className={`tag-hub-hero${coverUrl ? " has-cover" : ""}`}>
        {coverUrl && (
          <img
            className="tag-hub-hero-cover"
            src={coverUrl}
            alt=""
            loading="eager"
            fetchPriority="high"
            decoding="async"
            onError={() => setFailedCoverUrls((current) => new Set(current).add(coverUrl))}
          />
        )}
        <div className="tag-hub-hero-glow" aria-hidden="true" />
        <div className="tag-hub-hero-content">
          <nav className="tag-hub-breadcrumb" aria-label="Breadcrumb">
            <Link to="/">Home</Link><span aria-hidden="true">›</span>
            <Link to="/">Browse</Link><span aria-hidden="true">›</span>
            <span aria-current="page">#{displayName}</span>
          </nav>
          <span className="tag-hub-eyebrow"><span className="tag-hub-live-dot" /> STORIES THAT SHARE A THREAD</span>
          <div className="tag-hub-title-row">
            <div className="tag-hub-intro">
              <h1><span>#</span>{displayName}</h1>
              <p>{tag?.description || `Find stories connected by #${displayName}.`}</p>
              <div className="tag-hub-stats">
                <div role="group" aria-label={`${displayCount(storyCount)} ${storyCountLabel.toLowerCase()}`}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5zM4 5.5v16M8 7h8M8 11h8" /></svg>
                  <strong>{displayCount(storyCount)}</strong><span>{storyCountLabel}</span>
                </div>
                {followers != null && (
                  <div role="group" aria-label={`${displayCount(followers)} ${followerCountLabel.toLowerCase()}`}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 20v-1.6a3.4 3.4 0 0 0-3.4-3.4H6.4A3.4 3.4 0 0 0 3 18.4V20m6.5-9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm6-6.7a3.5 3.5 0 0 1 0 6.8m2 3.9a3.4 3.4 0 0 1 3.5 3.4V20" /></svg>
                    <strong>{displayCount(followers)}</strong><span>{followerCountLabel}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="tag-hub-actions">
              <button
                className={`tag-hub-follow${following ? " is-following" : ""}`}
                type="button"
                onClick={toggleFollow}
                disabled={followBusy || loading}
                aria-pressed={following}
              >
                {followBusy ? "Saving…" : following ? "Following" : user ? "Follow hashtag" : "Sign in to follow"}
              </button>
              <button className="tag-hub-icon-button tag-hub-share-button" type="button" onClick={shareTag} aria-label="Share hashtag" title="Share hashtag">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path strokeLinecap="round" strokeLinejoin="round" d="m8.7 10.6 6.6-4.2M8.7 13.4l6.6 4.2"/></svg><span>Share</span>
              </button>

            </div>
          </div>
        </div>
      </section>

      <main className="tag-hub-main">
        <nav className="tag-hub-tabs" aria-label="Sort hashtag stories">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={filter === item.key}
              className={filter === item.key ? "active" : ""}
              onClick={() => setFilter(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {error && (
          <div className={`tag-hub-message${books.length ? "" : " error"}`} role={books.length ? "status" : "alert"}>
            <p>{error}</p>
            <button type="button" onClick={() => loadTag(filter)}>Try again</button>
          </div>
        )}

        <section className="tag-hub-discovery" aria-busy={loading}>
          <div className="tag-hub-section-heading">
            <div>
              <h2>Top Stories</h2>
              <span>Stories tagged #{displayName}</span>
            </div>
            <div className="tag-hub-discovery-controls">
              <span className="tag-hub-sort-note">Sort by {FILTERS.find((item) => item.key === filter)?.label || "Top"}</span>
              <div className="tag-hub-view-switch" role="group" aria-label="Story display">
                <button
                  type="button"
                  className={view === "grid" ? "active" : ""}
                  aria-label="Grid view"
                  aria-pressed={view === "grid"}
                  onClick={() => selectView("grid")}
                >
                  <span aria-hidden="true">▦</span> Grid
                </button>
                <button
                  type="button"
                  className={view === "list" ? "active" : ""}
                  aria-label="List view"
                  aria-pressed={view === "list"}
                  onClick={() => selectView("list")}
                >
                  <span aria-hidden="true">☰</span> List
                </button>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="tag-hub-story-list tag-hub-story-list--loading" role="status" aria-label="Loading stories">
              {Array.from({ length: 5 }, (_, index) => (
                <div className="tag-hub-story-skeleton" key={index}>
                  <span />
                  <span />
                  <span><i /><i /><i /></span>
                </div>
              ))}
            </div>
          ) : null}
          {!loading && visibleBooks.length ? (
            <div className={`tag-hub-story-list is-${view}`}>
              {visibleBooks.map((book, index) => {
                if (view === "grid") {
                  return (
                    <div className="tag-hub-story-card" key={book.id}>
                      <BookCard book={book} variant="shelf" inkittStyle />
                    </div>
                  );
                }
                const bookCover = book.cover_path || book.cover_url || "";
                const bookCoverUrl = bookCover ? resolveAssetUrl(bookCover) : "";
                const genre = book.genre || book.primary_genre || displayName;
                const status = book.status_text || (book.is_completed ? "Completed" : "Ongoing");
                const reads = Number(book.view_count || book.read_count || 0);
                const rating = Number(book.rating || 0);
                return (
                  <Link className="tag-hub-story-row" key={book.id} to={`/stories/${book.id}`}>
                    <span className="tag-hub-story-rank" aria-hidden="true">{index + 1}</span>
                    <span className="tag-hub-story-cover">
                      <StoryCover src={bookCoverUrl} />
                    </span>
                    <span className="tag-hub-story-copy">
                      <strong>{book.title || "Untitled story"}</strong>
                      <small>by {book.author || "Unknown author"}</small>
                      {book.description ? <span className="tag-hub-story-description">{book.description}</span> : null}
                      <span className="tag-hub-story-meta">
                        {genre ? <span className="tag-hub-story-chip">{genre}</span> : null}
                        {status ? <span className="tag-hub-story-chip">{status}</span> : null}
                        <span className="tag-hub-story-counts">{reads.toLocaleString()} reads · ★ {rating > 0 ? rating.toFixed(1) : "—"}</span>
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : null}
          {!loading && !error && visibleBooks.length === 0 ? (
            <div className="tag-hub-empty">
              <span aria-hidden="true">#</span>
              <h3>No published stories yet</h3>
              <p>When published stories are tagged #{displayName}, they’ll appear here.</p>
              <Link to="/">Browse stories</Link>
            </div>
          ) : null}
          {loadingMore && <div className="tag-hub-message" role="status">Loading more stories…</div>}
          {hasMore && !loading && <div ref={sentinelRef} className="tag-hub-load-sentinel" aria-hidden="true" />}
          {!hasMore && visibleBooks.length > 0 && !loading && (
            <p className="tag-hub-end-message" role="status">You’re all caught up.</p>
          )}
        </section>
      </main>
      {shareOpen ? <ShareDialog title={`#${displayName}`} onClose={() => setShareOpen(false)} /> : null}
      {relatedTags.length > 0 && (
        <section className="tag-hub-related" aria-labelledby="tag-hub-related-title">
          <h2 id="tag-hub-related-title">Related Hashtags</h2>
          <nav className="tag-hub-related-strip" aria-label="Related hashtags">
            {relatedTags.map((item) => {
              const name = item.name || item.tag;
              return (
                <Link
                  key={item.id || name}
                  className={String(name).toLowerCase() === String(displayName).toLowerCase() ? "is-current" : ""}
                  to={`/tags/${encodeURIComponent(name)}`}
                >
                  <strong>#{name}</strong>
                  <small>{displayCount(item.book_count)} stories</small>
                </Link>
              );
            })}
          </nav>
        </section>
      )}
    </div>
  );
}
