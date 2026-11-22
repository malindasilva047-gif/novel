import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  followAuthor,
  getAuthorFollow,
  getBook,
  getBookReviews,
  getLibrary,
  getStoryRecommendations,
  getToken,
  resolveAssetUrl,
  saveLibraryProgress,
  unfollowAuthor,
} from "../api";
import ArrowCarousel from "../components/ArrowCarousel";
import BookCard from "../components/BookCard";
import { isGuestUser } from "../utils/guest";

function reviewDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function initials(name) {
  return String(name || "Reader")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();
}

function ReviewStars({ rating }) {
  const score = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return (
    <span className="story-review-stars" aria-label={`${score} out of 5 stars`}>
      <span aria-hidden="true">{"★".repeat(score)}<i>{"★".repeat(5 - score)}</i></span>
      <strong>{Number(rating || 0).toFixed(1)}</strong>
    </span>
  );
}

function ReviewCard({ review, index, onShare }) {
  const [expanded, setExpanded] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const reviewer = review.display_name || review.username || "Reader";
  const comment = review.comment || review.body || "";
  const canExpand = comment.length > 420;
  const commentBlocks = comment.split(/(\[spoiler\][\s\S]*?\[\/spoiler\])/gi);
  const date = reviewDate(review.created_at);
  const avatar = review.photo_url ? resolveAssetUrl(review.photo_url) : "";

  useEffect(() => setAvatarFailed(false), [avatar]);

  return (
    <li className="story-review-card">
      <article aria-label={`Review by ${reviewer}`}>
        <header className="story-review-card-header">
          <div className="story-review-reviewer">
            {avatar && !avatarFailed ? (
              <img
                className="story-review-avatar"
                src={avatar}
                alt=""
                loading="lazy"
                decoding="async"
                onError={() => setAvatarFailed(true)}
              />
            ) : (
              <span className="story-review-avatar story-review-avatar-fallback" aria-hidden="true">
                {initials(reviewer)}
              </span>
            )}
            <span className="story-review-reviewer-copy">
              <strong>{reviewer}</strong>
              {date ? <time dateTime={review.created_at}>{date}</time> : null}
            </span>
          </div>
          <span className="story-review-contributor-badge">Reader review</span>
        </header>
        <div className="story-review-card-rating">
          <ReviewStars rating={review.rating} />
          {review.title ? <h2 id={`review-title-${review.id || index}`}>{review.title}</h2> : null}
        </div>
        {comment ? (
          <div className={`story-review-body${expanded ? " is-expanded" : ""}`}>
            {commentBlocks.map((block, blockIndex) => {
              const spoiler = block.match(/^\[spoiler\]([\s\S]*?)\[\/spoiler\]$/i);
              if (spoiler) {
                return (
                  <details className="story-review-spoiler" key={`spoiler-${blockIndex}`}>
                    <summary>Reveal spoiler</summary>
                    <p>{spoiler[1].trim()}</p>
                  </details>
                );
              }
              return block ? <p key={`text-${blockIndex}`}>{block}</p> : null;
            })}
            {canExpand ? (
              <button
                type="button"
                className="story-review-expand"
                aria-expanded={expanded}
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded ? "Show less" : "Read full review"}
              </button>
            ) : null}
          </div>
        ) : (
          <p className="story-review-no-text">A rating from this reader, with no written note.</p>
        )}
        {[
          ["Plot", review.plot_rating],
          ["Writing", review.style_rating],
          ["Craft", review.tech_rating],
        ].some(([, value]) => Number(value) > 0) ? (
          <dl className="story-review-subratings">
            {[
              ["Plot", review.plot_rating],
              ["Writing", review.style_rating],
              ["Craft", review.tech_rating],
            ].filter(([, value]) => Number(value) > 0).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>★ {Number(value).toFixed(1)}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <footer className="story-review-card-footer">
          <span>Shared with the Wingsaga community</span>
          <button type="button" onClick={() => onShare(review)}>
            <span aria-hidden="true">↗</span> Share review
          </button>
        </footer>
      </article>
    </li>
  );
}

function ReviewSkeleton() {
  return (
    <div className="story-review-skeleton" aria-hidden="true">
      <span className="story-review-skeleton-avatar" />
      <span className="story-review-skeleton-lines"><i /><i /><i /></span>
    </div>
  );
}

export default function ReviewsPage({ user }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const guest = isGuestUser(user);
  const [book, setBook] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [recommendationError, setRecommendationError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [coverFailed, setCoverFailed] = useState(false);
  const [sort, setSort] = useState("recent");
  const [following, setFollowing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [actionBusy, setActionBusy] = useState("");
  const [notice, setNotice] = useState("");

  const showNotice = useCallback((message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3200);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setCoverFailed(false);
    setRecommendationError("");
    Promise.all([
      getBook(id),
      getBookReviews(id),
      getStoryRecommendations(id).catch((recommendationLoadError) => {
        if (active) setRecommendationError(recommendationLoadError.message || "Recommendations are temporarily unavailable.");
        return { items: [] };
      }),
    ])
      .then(([story, response, related]) => {
        if (!active) return;
        setBook(story);
        const items = response?.items || response || [];
        setReviews(Array.isArray(items) ? items : []);
        const seen = new Set([String(id)]);
        setRecommendations((Array.isArray(related?.items) ? related.items : []).filter((item) => {
          if (!item?.id || seen.has(String(item.id))) return false;
          seen.add(String(item.id));
          return true;
        }).slice(0, 12));
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || "Story reviews could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    let active = true;
    if (!getToken() || guest || !book) {
      setFollowing(false);
      setSaved(false);
      return () => { active = false; };
    }
    const followedAuthorId = book.author_id || book.user_id || book.author_user_id;
    Promise.all([
      getLibrary().catch((libraryError) => {
        if (active) showNotice(`Library status could not be checked: ${libraryError.message || "Please try again."}`);
        return [];
      }),
      followedAuthorId
        ? getAuthorFollow(followedAuthorId).catch((followError) => {
          if (active) showNotice(`Follow status could not be checked: ${followError.message || "Please try again."}`);
          return null;
        })
        : Promise.resolve(null),
    ]).then(([library, authorFollow]) => {
      if (!active) return;
      const entries = Array.isArray(library) ? library : library?.items || [];
      setSaved(entries.some((entry) => String(entry.book?.id || entry.story?.id || entry.book_id || entry.story_id) === String(id)));
      setFollowing(Boolean(authorFollow?.following));
    });
    return () => { active = false; };
  }, [book, guest, id, showNotice, user]);

  const sortedReviews = useMemo(() => [...reviews].sort((a, b) => {
    if (sort === "highest") return Number(b.rating || 0) - Number(a.rating || 0);
    if (sort === "lowest") return Number(a.rating || 0) - Number(b.rating || 0);
    return String(b.created_at || "").localeCompare(String(a.created_at || ""));
  }), [reviews, sort]);

  const distribution = useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0];
    reviews.forEach((review) => {
      const rating = Math.max(0, Math.min(5, Math.round(Number(review.rating) || 0)));
      counts[rating] += 1;
    });
    return counts;
  }, [reviews]);
  const ratedReviews = reviews.filter((review) => Number(review.rating) > 0);
  const average = ratedReviews.length
    ? ratedReviews.reduce((sum, review) => sum + Number(review.rating), 0) / ratedReviews.length
    : Number(book?.rating) || 0;
  const positiveRatingCount = ratedReviews.filter((review) => Number(review.rating) >= 4).length;
  const satisfaction = ratedReviews.length ? Math.round((positiveRatingCount / ratedReviews.length) * 100) : 0;
  const cover = book?.cover_path && !coverFailed ? resolveAssetUrl(book.cover_path) : "";
  const readerCount = Number(book?.view_count || book?.read_count || 0);
  const authorId = book?.author_id || book?.user_id || book?.author_user_id;

  async function toggleFollow() {
    if (!getToken() || guest) {
      navigate("/login");
      return;
    }
    if (!authorId || actionBusy) return;
    setActionBusy("follow");
    try {
      if (following) {
        await unfollowAuthor(authorId);
        setFollowing(false);
        showNotice("You unfollowed this author.");
      } else {
        await followAuthor(authorId);
        setFollowing(true);
        showNotice("You’re now following this author.");
      }
    } catch (actionError) {
      showNotice(actionError.message || "Could not update your follow.");
    } finally {
      setActionBusy("");
    }
  }

  async function saveStory() {
    if (!getToken() || guest) {
      navigate("/login");
      return;
    }
    if (saved || actionBusy) return;
    setActionBusy("save");
    try {
      await saveLibraryProgress({
        book_id: Number(id),
        reading_status: "Want to Read",
        chapters: Number(book?.published_chapter_count || book?.chapter_count || 0),
        last_chapter_number: 0,
        primary_genre: book?.genre || book?.primary_genre || "",
        secondary_genre: book?.secondary_genre || "",
      });
      setSaved(true);
      showNotice("Story saved to your library.");
    } catch (actionError) {
      showNotice(actionError.message || "Could not save this story.");
    } finally {
      setActionBusy("");
    }
  }

  async function shareReview(review) {
    const reviewer = review.display_name || review.username || "A Wingsaga reader";
    const text = `${reviewer} reviewed ${book?.title || "a story"} on Wingsaga.`;
    const url = `${window.location.origin}/stories/${id}/reviews`;
    try {
      if (navigator.share) await navigator.share({ title: `Review of ${book?.title || "a story"}`, text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        showNotice("Review link copied.");
      }
    } catch (shareError) {
      if (shareError.name !== "AbortError") showNotice("Could not share this review from your browser.");
    }
  }

  return (
    <main className="story-reviews-page">
      {loading ? (
        <div className="story-reviews-loading" role="status" aria-label="Loading story reviews">
          <span className="story-review-hero-skeleton" />
          <span className="story-review-analytics-skeleton" />
          <ReviewSkeleton />
        </div>
      ) : error ? (
        <section className="story-reviews-error" role="alert">
          <span aria-hidden="true">!</span>
          <h1>Reviews are taking a pause</h1>
          <p>{error}</p>
          <Link className="story-review-button story-review-button--primary" to={`/stories/${id}`}>Back to story</Link>
        </section>
      ) : book ? (
        <>
          <section className={`story-review-hero${cover ? " has-cover" : ""}`} aria-labelledby="story-review-title">
            {cover ? <img className="story-review-hero-backdrop" src={cover} alt="" fetchPriority="high" decoding="async" onError={() => setCoverFailed(true)} /> : null}
            <div className="story-review-hero-shade" aria-hidden="true" />
            <div className="story-review-hero-inner">
              <Link className="story-review-back" to={`/stories/${id}`}>← <span>Back to story</span></Link>
              <div className="story-review-showcase">
                {cover ? (
                  <img className="story-review-cover" src={cover} alt={`Cover of ${book.title || "this story"}`} fetchPriority="high" decoding="async" onError={() => setCoverFailed(true)} />
                ) : (
                  <div className="story-review-cover story-review-cover--fallback" role="img" aria-label={`Default cover for ${book.title || "this story"}`}>
                    <span aria-hidden="true">W</span><strong>{book.title || "Untitled story"}</strong>
                  </div>
                )}
                <div className="story-review-story-info">
                  <span className="story-review-eyebrow"><span aria-hidden="true">✦</span> THE READER COMMUNITY</span>
                  <h1 id="story-review-title">{book.title || "Untitled story"}</h1>
                  <p className="story-review-author">by <span>{book.author || book.author_display_name || "Wingsaga author"}</span></p>
                  <div className="story-review-genres">
                    {[...new Set([book.genre, book.primary_genre, book.secondary_genre].filter(Boolean))].slice(0, 3).map((genre) => (
                      <Link key={genre} to={`/genres/${encodeURIComponent(genre)}`}>{genre}</Link>
                    ))}
                    {book.is_completed === true || Number(book.is_completed) === 1 || /complete/i.test(book.status_text || "") ? <span className="story-review-status">Complete</span> : null}
                  </div>
                  <div className="story-review-hero-rating">
                    <span className="story-review-hero-score">{average ? average.toFixed(1) : "—"}</span>
                    <span className="story-review-hero-stars" aria-hidden="true">{"★".repeat(Math.round(average))}<i>{"★".repeat(5 - Math.round(average))}</i></span>
                    <span className="story-review-rating-copy">{reviews.length.toLocaleString()} {reviews.length === 1 ? "review" : "reviews"}</span>
                  </div>
                  <div className="story-review-hero-stats">
                    <span><strong>{readerCount.toLocaleString()}</strong> reads</span>
                    <span><strong>{reviews.length.toLocaleString()}</strong> reader notes</span>
                  </div>
                  <div className="story-review-hero-actions">
                    <Link className="story-review-button story-review-button--primary" to={`/stories/${id}`}>Read now <span aria-hidden="true">→</span></Link>
                    <button className={`story-review-button${saved ? " is-active" : ""}`} type="button" onClick={saveStory} disabled={actionBusy === "save"} aria-pressed={saved}>
                      <span aria-hidden="true">{saved ? "✓" : "＋"}</span> {saved ? "In your library" : "Save story"}
                    </button>
                    <button className={`story-review-button${following ? " is-active" : ""}`} type="button" onClick={toggleFollow} disabled={actionBusy === "follow" || !authorId} aria-pressed={following}>
                      <span aria-hidden="true">{following ? "✓" : "＋"}</span> {following ? "Following" : "Follow author"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="story-reviews-content">
            <section className="story-review-analytics" aria-labelledby="review-insights-title">
              <div className="story-review-analytics-intro">
                <span className="story-review-section-kicker">COMMUNITY PULSE</span>
                <h2 id="review-insights-title">Reader insights</h2>
                <p>Ratings and review notes shared by Wingsaga readers.</p>
              </div>
              <div className="story-review-average-panel">
                <strong>{average ? average.toFixed(1) : "—"}</strong>
                <span className="story-review-average-stars" aria-hidden="true">{"★".repeat(Math.round(average))}<i>{"★".repeat(5 - Math.round(average))}</i></span>
                <small>{ratedReviews.length.toLocaleString()} ratings</small>
              </div>
              <div className="story-review-distribution" role="list" aria-label="Rating distribution">
                {[5, 4, 3, 2, 1].map((rating) => {
                  const count = distribution[rating];
                  const percent = ratedReviews.length ? Math.round((count / ratedReviews.length) * 100) : 0;
                  return (
                    <div className="story-review-distribution-row" role="listitem" key={rating}>
                      <span>{rating} <i aria-hidden="true">★</i></span>
                      <span className="story-review-meter" role="img" aria-label={`${percent}% rated ${rating} stars`}>
                        <i style={{ width: `${percent}%` }} />
                      </span>
                      <small>{count}</small>
                    </div>
                  );
                })}
              </div>
              <div className="story-review-satisfaction">
                <span className="story-review-satisfaction-icon" aria-hidden="true">↗</span>
                <strong>{ratedReviews.length ? `${satisfaction}%` : "—"}</strong>
                <span>4+ star ratings</span>
                <small>Share of reader ratings at 4 stars and above</small>
              </div>
              <p className="story-review-analytics-note">Insights reflect the {ratedReviews.length.toLocaleString()} ratings shown for this story.</p>
            </section>

            <section className="story-review-list-section" aria-labelledby="story-reviews-heading">
              <div className="story-review-list-heading">
                <div>
                  <span className="story-review-section-kicker">FROM THE COMMUNITY</span>
                  <h2 id="story-reviews-heading">Reader reviews <span>{reviews.length}</span></h2>
                  <p>Thoughts, ratings, and favorite details from readers.</p>
                </div>
                <div className="story-review-list-controls">
                  <label htmlFor="story-review-sort">Sort by</label>
                  <select id="story-review-sort" value={sort} onChange={(event) => setSort(event.target.value)}>
                    <option value="recent">Most recent</option>
                    <option value="highest">Highest rated</option>
                    <option value="lowest">Lowest rated</option>
                  </select>
                  <Link className="story-review-write-link" to={`/stories/${id}/review`}>Write a review <span aria-hidden="true">↗</span></Link>
                </div>
              </div>

              {reviews.length ? (
                <ol className="story-review-list">
                  {sortedReviews.map((review, index) => (
                    <ReviewCard key={review.id || review.created_at || index} review={review} index={index} onShare={shareReview} />
                  ))}
                </ol>
              ) : (
                <div className="story-review-empty">
                  <span className="story-review-empty-mark" aria-hidden="true">✦</span>
                  <span className="story-review-section-kicker">A STORY IS BETTER SHARED</span>
                  <h3>Be the first to leave a review</h3>
                  <p>Tell other readers what stayed with you—your perspective helps stories find their people.</p>
                  <Link className="story-review-button story-review-button--primary" to={`/stories/${id}/review`}>Write the first review</Link>
                </div>
              )}
            </section>

            {recommendations.length || recommendationError ? (
              <section className="story-review-recommendations" aria-labelledby="similar-stories-title">
                <div className="story-review-recommendations-heading">
                  <div>
                    <span className="story-review-section-kicker">KEEP DISCOVERING</span>
                    <h2 id="similar-stories-title">Stories for your next chapter</h2>
                    <p>{recommendationError || "Hand-picked recommendations from the Wingsaga library."}</p>
                  </div>
                  {recommendations.length ? <Link to="/">Explore all stories <span aria-hidden="true">→</span></Link> : null}
                </div>
                {recommendations.length ? (
                  <ArrowCarousel
                    className="story-review-recommendation-track"
                    itemClassName="story-review-recommendation-item"
                    label="Recommended stories"
                    previousLabel="Previous recommended stories"
                    nextLabel="Next recommended stories"
                  >
                    {recommendations.map((recommendation) => (
                      <BookCard key={recommendation.id} book={recommendation} variant="shelf" />
                    ))}
                  </ArrowCarousel>
                ) : null}
              </section>
            ) : null}
          </div>
          {notice ? <div className="story-review-notice" role="status">{notice}</div> : null}
        </>
      ) : null}
    </main>
  );
}
