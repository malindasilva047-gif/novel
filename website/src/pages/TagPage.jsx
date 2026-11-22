import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import ShareDialog from "../components/ShareDialog";
import { showToast } from "../components/ToastViewport";
import {
  followTagWeb,
  getTagBooksForHub,
  getTagFollowStateWeb,
  getTagsForHub,
  resolveAssetUrl,
  unfollowTagWeb,
} from "../api";
import "./TagPage.css";

const FILTERS = [
  { key: "top", label: "Top Stories", sort: "top" },
  { key: "recent", label: "Recent Stories", sort: "recent" },
  { key: "trending", label: "Trending Stories", sort: "trending" },
  { key: "liked", label: "Most Liked Stories", sort: "liked" },
];

const PAGE_SIZE = 12;

function displayCount(value) {
  if (value == null || value === "") return "—";
  const count = Number(value);
  if (!Number.isFinite(count)) return "—";
  if (count >= 1000) {
    const k = (count / 1000).toFixed(1).replace(/\.0$/, "");
    return `${k}K`;
  }
  return count.toLocaleString();
}

function coverGradient(id) {
  const n = Number(id) || 1;
  const h = (n * 47) % 360;
  return `linear-gradient(160deg, hsl(${h} 45% 28%), hsl(${(h + 50) % 360} 50% 14%))`;
}

function StoryCover({ src, id }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) {
    return (
      <div className="ws-tag-cover-fallback" style={{ background: coverGradient(id) }} aria-hidden="true" />
    );
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

export default function TagPage({ user }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [tag, setTag] = useState(null);
  const [books, setBooks] = useState([]);
  const [relatedTags, setRelatedTags] = useState([]);
  const [filter, setFilter] = useState("top");
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


  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [tagName]);

  const showNotice = useCallback((message, type = "success") => showToast(message, type), []);

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
    const selectedSort = FILTERS.find((item) => item.key === selectedFilter)?.sort || "top";
    const [tagResult, bookResult] = await Promise.allSettled([
      getTagsForHub(),
      getTagBooksForHub(tagName, selectedSort, { limit: PAGE_SIZE, offset: 0 }),
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
    setTag(
      resolvedTag.name
        ? resolvedTag
        : { name: tagName, description: "", cover_path: "" },
    );
    const relatedFromBooks = Array.isArray(bookPayload?.related_tags)
      ? bookPayload.related_tags
      : [];
    setRelatedTags(
      relatedFromBooks.length
        ? relatedFromBooks.map((item) => {
            const name = String(item.name || item.tag || "");
            const listedTag = allTags.find(
              (candidate) =>
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
            .slice(0, 10),
    );
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
    setError(
      tagResult.status === "rejected"
        ? "Story details loaded, but hashtag suggestions are temporarily unavailable."
        : "",
    );
    setLoading(false);
  }, [filter, tagName, user]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMoreRef.current || !hasMore) return;
    const requestId = loadRequestId.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const selectedSort = FILTERS.find((item) => item.key === filter)?.sort || "top";
      const response = await getTagBooksForHub(tagName, selectedSort, {
        limit: PAGE_SIZE,
        offset: pageRef.current * PAGE_SIZE,
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
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore, loading, loadingMore]);

  async function shareTag() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const title = `#${displayName} – Wingsaga`;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
      } else {
        await navigator.clipboard.writeText(url);
        showNotice("Hashtag link copied.");
      }
    } catch (err) {
      if (err?.name !== "AbortError") {
        showNotice(err?.message || "Could not share this hashtag.", "danger");
      }
    }
  }

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

  const displayName = tag?.name || tagName;
  const storyCount = tag?.book_count ?? (loading || error ? null : books.length);
  const storyCountLabel =
    storyCount == null || !Number.isFinite(Number(storyCount))
      ? "Stories"
      : Number(storyCount) === 1
        ? "Story"
        : "Stories";
  const followerCountNumber = followers == null ? null : Number(followers);
  const followerCountLabel = followerCountNumber === 1 ? "Follower" : "Followers";
  const listTitle = FILTERS.find((item) => item.key === filter)?.label || "Top Stories";

  const coverCandidates = [
    ...new Set(
      [tag?.cover_path, ...books.map((book) => book.cover_path || book.cover_url)]
        .filter(Boolean)
        .map(resolveAssetUrl),
    ),
  ];
  const coverUrl = coverCandidates.find((url) => !failedCoverUrls.has(url)) || "";

  useEffect(() => {
    document.title = `#${displayName} – Wingsaga`;
  }, [displayName]);

  return (
    <div className="ws-tag">
      <section className={`ws-tag-hero${coverUrl ? " has-cover" : ""}`} id="hero">
        {coverUrl ? (
          <img
            className="ws-tag-hero-img"
            src={coverUrl}
            alt=""
            loading="eager"
            fetchPriority="high"
            decoding="async"
            onError={() => setFailedCoverUrls((current) => new Set(current).add(coverUrl))}
          />
        ) : (
          <svg className="ws-tag-art" viewBox="0 0 1440 430" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <defs>
              <linearGradient id="ws-sk" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#0b2a1f" />
                <stop offset="1" stopColor="#2c5a43" />
              </linearGradient>
              <radialGradient id="ws-mg">
                <stop offset="0" stopColor="#e9efd0" />
                <stop offset="1" stopColor="#e9efd0" stopOpacity="0" />
              </radialGradient>
              <pattern id="ws-tr" width="46" height="90" patternUnits="userSpaceOnUse">
                <path d="M23 4 41 50H5ZM23 30 45 82H1Z" fill="#06190f" />
              </pattern>
            </defs>
            <rect width="1440" height="430" fill="url(#ws-sk)" />
            <circle cx="1280" cy="110" r="150" fill="url(#ws-mg)" opacity=".35" />
            <circle cx="1280" cy="110" r="52" fill="#dfe6c4" />
            <path d="M0 300 180 190 330 270 520 150 700 280 880 200 1080 290 1260 210 1440 290V430H0Z" fill="#1d4a37" opacity=".7" />
            <path d="M900 330V210h22v-30l11-26 11 26v30h26v-20l10-24 10 24v70h30V160l12-34 12 34v100h24v-40h30v110Z" fill="#0e2b20" />
            <path d="M0 340 120 300 260 335 420 290 600 345 800 320 1000 350 1200 315 1440 345V430H0Z" fill="#0f3326" />
            <rect y="345" width="1440" height="85" fill="url(#ws-tr)" />
          </svg>
        )}
        <svg className="ws-tag-wave" viewBox="0 0 1440 90" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 62C240 8 480 8 720 50S1200 100 1440 30V90H0Z" fill="var(--ws-bg, #FFFFFF)" />
          <path d="M0 62C240 8 480 8 720 50S1200 100 1440 30" fill="none" stroke="#2f9a6e" strokeOpacity=".7" strokeWidth="3" />
        </svg>
        <div className="ws-tag-wrap">
          <nav className="ws-tag-crumbs" aria-label="Breadcrumb" style={{ color: "#ffffff" }}>
            <Link to="/" style={{ color: "#ffffff" }}>Home</Link>
            <span aria-hidden="true">›</span>
            <Link to="/" style={{ color: "#ffffff" }}>Tag</Link>
            <span aria-hidden="true">›</span>
            <span aria-current="page" style={{ color: "#ffffff" }}>#{displayName}</span>
          </nav>
          <div className="ws-tag-hero-body">
            <div className="ws-tag-kicker" style={{ color: "#ffffff" }}>Stories that share a thread</div>
            <h1 style={{ color: "#ffffff" }}>#{displayName}</h1>
            <p className="ws-tag-sub" style={{ color: "#ffffff" }}>
              {tag?.description || `Find stories connected by #${displayName}.`}
            </p>
          </div>
          <div className="ws-tag-hero-foot">
            <div className="ws-tag-stats">
              <div className="ws-tag-stat">
                <svg className="ws-tag-i" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 5a2 2 0 0 1 2-2h5v17H6a2 2 0 0 0-2 2zM20 5a2 2 0 0 0-2-2h-5v17h5a2 2 0 0 1 2 2z" />
                </svg>
                <div>
                  <b>{displayCount(storyCount)}</b>
                  <span>{storyCountLabel}</span>
                </div>
              </div>
              {followers != null && (
                <div className="ws-tag-stat">
                  <svg className="ws-tag-i" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="9" cy="8" r="4" />
                    <path d="M2 21c0-4 3-6 7-6s7 2 7 6M16 4a4 4 0 0 1 0 8M18 15c2.5.7 4 2.5 4 6" />
                  </svg>
                  <div>
                    <b>{displayCount(followers)}</b>
                    <span>{followerCountLabel}</span>
                  </div>
                </div>
              )}
            </div>
            <div className="ws-tag-actions">
              <button
                className={`ws-tag-btn ws-tag-btn-primary${following ? " on" : ""}`}
                type="button"
                onClick={toggleFollow}
                disabled={followBusy || loading}
                aria-pressed={following}
              >
                {followBusy ? "Saving…" : following ? "Following" : user ? "Follow +" : "Sign in to follow"}
              </button>
              <button className="ws-tag-btn ws-tag-btn-ghost" type="button" onClick={shareTag}>
                Share
              </button>
            </div>
          </div>
        </div>
      </section>

      <main className="ws-tag-main">
        <div className="ws-tag-wrap">
          <div className="ws-tag-tabbar" role="tablist" aria-label="Sort stories">
            {FILTERS.map((item) => (
              <button
                key={item.key}
                className={`ws-tag-tab${filter === item.key ? " is-active" : ""}`}
                role="tab"
                type="button"
                aria-selected={filter === item.key}
                onClick={() => setFilter(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="ws-tag-heading">
            <h2>{listTitle}</h2>
            <i />
          </div>

          {error && (
            <div className={`ws-tag-state${books.length ? "" : " is-error"}`} role={books.length ? "status" : "alert"}>
              <p>{error}</p>
              <button type="button" onClick={() => loadTag(filter)}>Try again</button>
            </div>
          )}

          <div className="ws-tag-grid" aria-live="polite" aria-busy={loading}>
            {loading &&
              Array.from({ length: 6 }, (_, index) => (
                <div className="ws-tag-story sk" key={`sk-${index}`}>
                  <div className="ws-tag-cover" />
                  <div className="ws-tag-info">
                    <div className="l" />
                    <div className="l s" />
                    <div className="l s" />
                  </div>
                </div>
              ))}

            {!loading &&
              books.map((book) => {
                const bookCover = book.cover_path || book.cover_url || "";
                const bookCoverUrl = bookCover ? resolveAssetUrl(bookCover) : "";
                const reads = Number(book.view_count || book.read_count || book.reads || 0);
                const parts = Number(book.chapter_count || book.parts || book.chapters || 0);
                const tags = Array.isArray(book.tags)
                  ? book.tags.map((t) => (typeof t === "string" ? t : t?.name || t?.tag)).filter(Boolean)
                  : [];
                return (
                  <article className="ws-tag-story" key={book.id}>
                    <div className="ws-tag-cover" style={!bookCoverUrl ? { background: coverGradient(book.id) } : undefined}>
                      <StoryCover src={bookCoverUrl} id={book.id} />
                    </div>
                    <div className="ws-tag-info">
                      <div className="ws-tag-top">
                        <h3>
                          <Link to={`/stories/${book.id}`}>{book.title || "Untitled story"}</Link>
                        </h3>
                      </div>
                      <div className="ws-tag-by">
                        <svg className="ws-tag-i" viewBox="0 0 24 24" aria-hidden="true">
                          <circle cx="12" cy="8" r="4" />
                          <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
                        </svg>
                        {book.author || "Unknown author"}
                      </div>
                      <div className="ws-tag-meta">
                        <span>
                          <svg className="ws-tag-i" viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                          {displayCount(reads)}
                        </span>
                        {parts > 0 && (
                          <span>
                            <svg className="ws-tag-i" viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M4 5a2 2 0 0 1 2-2h5v17H6a2 2 0 0 0-2 2zM20 5a2 2 0 0 0-2-2h-5v17h5a2 2 0 0 1 2 2z" />
                            </svg>
                            {parts} {parts === 1 ? "chapter" : "chapters"}
                          </span>
                        )}
                      </div>
                      {book.description ? <p className="ws-tag-desc">{book.description}</p> : null}
                      {tags.length > 0 && (
                        <div className="ws-tag-foot">
                          <span className="ws-tag-hts">
                            {tags.slice(0, 3).map((t) => (
                              <Link
                                key={t}
                                className="ws-tag-ht"
                                to={`/tags/${encodeURIComponent(String(t).replace(/^#/, ""))}`}
                              >
                                #{String(t).replace(/^#/, "")}
                              </Link>
                            ))}
                          </span>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
          </div>

          {!loading && !error && books.length === 0 && (
            <div className="ws-tag-state">
              <p>When published stories are tagged #{displayName}, they&apos;ll appear here.</p>
              <Link to="/">Browse stories</Link>
            </div>
          )}

          {loadingMore && <div className="ws-tag-state" role="status">Loading more stories…</div>}
          {hasMore && !loading && <div ref={sentinelRef} id="sentinel" aria-hidden="true" />}
          {!hasMore && books.length > 0 && !loading && (
            <div className="ws-tag-state" role="status">
              You&apos;ve reached the end of #{displayName}.
            </div>
          )}

          {relatedTags.length > 0 && (
            <section className="ws-tag-related">
              <h3>Related Hashtags</h3>
              <div className="ws-tag-tags">
                {relatedTags.map((item) => {
                  const name = item.name || item.tag;
                  return (
                    <Link
                      key={item.id || name}
                      className="ws-tag-tag"
                      to={`/tags/${encodeURIComponent(name)}`}
                    >
                      <b>#{name}</b>
                      <span>{displayCount(item.book_count)} stories</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </main>

      {shareOpen ? <ShareDialog title={`#${displayName}`} onClose={() => setShareOpen(false)} /> : null}
    </div>
  );
}
