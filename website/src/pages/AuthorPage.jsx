import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import BookCard from "../components/BookCard";
import WallPostCard from "../components/WallPostCard";
import {
  commentWallPost,
  deleteWallPost,
  followAuthor,
  getAuthorBooks,
  getAuthorFollow,
  getUserProfile,
  getUserReadingLists,
  getUserReviews,
  getUserWall,
  getToken,
  likeWallPost,
  postUserWall,
  resolveAssetUrl,
  setAuthorNotifications,
  unfollowAuthor,
} from "../api";
import { isGuestUser } from "../utils/guest";
import { showToast } from "../components/ToastViewport";


function SocialIcon({ platform }) {
  const paths = {
    Facebook: <path d="M13.2 21v-8h2.7l.4-3.1h-3.1v-2c0-.9.3-1.6 1.6-1.6h1.7V3.5c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.5-4 4.2v2.3H7.4V13h2.7v8z" />,
    Instagram: <><rect x="3.4" y="3.4" width="17.2" height="17.2" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.8" cy="6.5" r=".9" fill="currentColor" stroke="none" /></>,
    "X / Twitter": <path d="M18.8 3H22l-7 8 8.2 10H17l-4.9-6.1L6.8 21H3.5l7.5-8.6L3.2 3h6.4l4.4 5.7zm-1.1 16.2h1.8L8.7 4.7H6.8z" />,
    YouTube: <><rect x="2.5" y="5" width="19" height="14" rx="4" /><path d="m10 9 5 3-5 3z" fill="currentColor" stroke="none" /></>,
    Website: <><circle cx="12" cy="12" r="9" /><path d="M3.5 12h17M12 3c2.2 2.4 3.2 5.4 3.2 9s-1 6.6-3.2 9c-2.2-2.4-3.2-5.4-3.2-9S9.8 5.4 12 3z" /></>,
  };
  return (
    <svg className={`profile-social-icon profile-social-icon--${String(platform).toLowerCase().replace(/[^a-z]+/g, "-")}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths[platform]}
    </svg>
  );
}

const PROFILE_TABS = [
  ["stories", "Stories"],
  ["about", "About"],
  ["wall", "Wall"],
  ["reviews", "Reviews"],
];
function handleProfileTabKey(event, tabs, activeTab, onChange) {
  const index = tabs.findIndex(([key]) => key === activeTab);
  let nextIndex = index;
  if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
  else if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
  else if (event.key === "Home") nextIndex = 0;
  else if (event.key === "End") nextIndex = tabs.length - 1;
  else return;

  event.preventDefault();
  const tabElement = event.currentTarget.querySelectorAll('[role="tab"]')[nextIndex];
  tabElement?.focus();
  onChange(tabs[nextIndex][0]);
}

const itemsFrom = (value) => Array.isArray(value)
  ? value
  : Array.isArray(value?.items)
    ? value.items
    : Array.isArray(value?.books)
      ? value.books
      : [];
const storyStatus = (story) => String(story.status_text || story.status || "").toLowerCase();
const displayBirthday = (value) => {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : (/^\d{2}\/\d{2}\/\d{4}$/.test(raw) ? raw : "");
};

export default function AuthorPage({ user }) {
  const { authorId } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [books, setBooks] = useState([]);
  const [readingLists, setReadingLists] = useState([]);
  const [wall, setWall] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("stories");
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [wallDraft, setWallDraft] = useState("");
  const [wallBusy, setWallBusy] = useState(null);
  const [storyQuery, setStoryQuery] = useState("");
  const [storyFilter, setStoryFilter] = useState("All stories");
  const [storySort, setStorySort] = useState("Recently updated");
  const guest = isGuestUser(user);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setProfile(null);
    setBooks([]);
    setReadingLists([]);
    setWall([]);
    setReviews([]);
    setError("");
    Promise.allSettled([
      getUserProfile(authorId),
      getAuthorBooks(authorId),
      getUserReadingLists(authorId),
      getUserWall(authorId),
      getUserReviews(authorId),
    ]).then(([profileResult, booksResult, listsResult, wallResult, reviewsResult]) => {
      if (cancelled) return;
      const errors = [];
      if (profileResult.status === "fulfilled") {
        setProfile(profileResult.value);
      } else {
        errors.push(`Profile could not load: ${profileResult.reason?.message || "Please try again."}`);
      }
      if (booksResult.status === "fulfilled") setBooks(itemsFrom(booksResult.value));
      else errors.push("Stories could not load.");
      if (listsResult.status === "fulfilled") setReadingLists(itemsFrom(listsResult.value));
      else errors.push("Reading lists could not load.");
      if (wallResult.status === "fulfilled") setWall(itemsFrom(wallResult.value));
      else errors.push("The profile wall could not load.");
      if (reviewsResult.status === "fulfilled") setReviews(itemsFrom(reviewsResult.value));
      else errors.push("Reviews could not load.");
      setError(errors.join(" "));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [authorId]);

  const profileUserId = profile?.id || authorId;
  const currentUserId = user?.id || user?.user_id;
  const isOwnProfile = currentUserId != null
    && String(profile?.id || authorId) === String(currentUserId);

  useEffect(() => {
    if (isOwnProfile) navigate("/profile?tab=About", { replace: true });
  }, [isOwnProfile, navigate]);

  useEffect(() => {
    let cancelled = false;
    if (guest || !profile?.id || isOwnProfile) {
      setFollowing(false);
      setNotificationsEnabled(false);
      return () => { cancelled = true; };
    }
    getAuthorFollow(profile.id).then((result) => {
      if (!cancelled) {
        setFollowing(Boolean(result?.following));
        setNotificationsEnabled(Boolean(result?.notifications_enabled));
      }
    }).catch((err) => {
      if (!cancelled) setError((current) => [current, `Follow status could not load: ${err.message || "Please try again."}`].filter(Boolean).join(" "));
    });
    return () => { cancelled = true; };
  }, [guest, profile?.id, isOwnProfile]);

  const name = profile?.display_name || profile?.username || `Author ${authorId}`;
  const username = String(profile?.username || "").replace(/^@+/, "");
  const photo = resolveAssetUrl(profile?.photo_url || profile?.avatar_url || "");
  const cover = resolveAssetUrl(profile?.cover_url || profile?.cover_path || "");
  useEffect(() => {
    setPhotoFailed(false);
  }, [photo]);
  const stats = useMemo(() => [
    { value: Number(profile?.followers || 0), label: "Followers" },
    { value: Number(profile?.following || 0), label: "Following" },
    { value: books.length, label: "Stories" },
  ], [profile, books.length]);
  const visibleBooks = useMemo(() => {
    const query = storyQuery.trim().toLocaleLowerCase();
    const filtered = books.filter((book) => {
      const status = storyStatus(book);
      if (storyFilter === "Ongoing" && !status.includes("ongoing")) return false;
      if (storyFilter === "Completed" && !/complete|finished/.test(status)) return false;
      if (!query) return true;
      return `${book.title || ""} ${book.description || ""} ${book.genre || book.primary_genre || ""}`
        .toLocaleLowerCase().includes(query);
    });
    return filtered.sort((left, right) => {
      if (storySort === "Most read") return Number(right.view_count || 0) - Number(left.view_count || 0);
      if (storySort === "Highest rated") return Number(right.rating || 0) - Number(left.rating || 0);
      return String(right.updated_at || right.created_at || right.id || "")
        .localeCompare(String(left.updated_at || left.created_at || left.id || ""), undefined, { numeric: true });
    });
  }, [books, storyFilter, storyQuery, storySort]);
  const socialLinks = [
    ["Instagram", profile?.instagram_url],
    ["X / Twitter", profile?.twitter_url],
    ["Facebook", profile?.facebook_url],
    ["YouTube", profile?.youtube_url],
    ["Website", profile?.website_url],
  ].map(([label, value]) => {
    try {
      const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(String(value || "")) ? value : `https://${value}`);
      return { label, href: ["http:", "https:"].includes(url.protocol) ? url.href : "" };
    } catch {
      return { label, href: "" };
    }
  }).filter((link) => link.href);
  const publishedCount = Number(profile?.story_count || profile?.published_story_count || books.length || 0);
  const aboutDetails = [
    ["Username", username ? `@${username}` : ""],
    ["Gender", profile?.gender || ""],
    ["Birthday", displayBirthday(profile?.birth_date)],
    ["Location", profile?.country || ""],
    ["Published stories", publishedCount ? String(publishedCount) : ""],
  ].filter(([, value]) => value);

  async function toggleFollow() {
    if (guest) { navigate("/login"); return; }
    if (!profile?.id || followBusy) return;
    setFollowBusy(true);
    setError("");
    try {
      const result = following
        ? await unfollowAuthor(profile.id)
        : await followAuthor(profile.id);
      const isFollowing = Boolean(result?.following);
      setFollowing(isFollowing);
      if (!isFollowing) setNotificationsEnabled(false);
      setProfile((current) => current ? {
        ...current,
        followers: Number.isFinite(Number(result?.followers))
          ? Number(result.followers)
          : Math.max(0, Number(current.followers || 0) + (isFollowing ? 1 : -1)),
      } : current);
      showToast(isFollowing ? `Following ${name}.` : `Unfollowed ${name}.`, "success");
    } catch (err) {
      setError(err.message || "Could not update your follow.");
    } finally {
      setFollowBusy(false);
    }
  }

  async function toggleNotifications() {
    if (guest) { navigate("/login"); return; }
    if (!profile?.id || !following || notificationBusy) return;
    setNotificationBusy(true);
    setError("");
    try {
      const result = await setAuthorNotifications(profile.id, !notificationsEnabled);
      setNotificationsEnabled(Boolean(result?.notifications_enabled));
      showToast(result?.notifications_enabled ? "Author updates enabled." : "Author updates disabled.", "success");
    } catch (err) {
      setError(err.message || "Could not update author notifications.");
    } finally {
      setNotificationBusy(false);
    }
  }

  async function submitWallPost(event) {
    event.preventDefault();
    const body = wallDraft.trim();
    if (!body || wallBusy) return;
    setWallBusy("compose");
    setError("");
    try {
      await postUserWall(profileUserId, body);
      setWallDraft("");
      setWall(itemsFrom(await getUserWall(profileUserId)));
      showToast("Posted to the author's wall.", "success");
    } catch (err) {
      setError(err.message || "Could not post to this wall.");
    } finally {
      setWallBusy(null);
    }
  }

  async function refreshWall() {
    setWall(itemsFrom(await getUserWall(profileUserId)));
  }

  async function likePost(post) {
    setWallBusy(post.id);
    setError("");
    try {
      await likeWallPost(post.id);
      await refreshWall();
    } catch (err) {
      setError(err.message || "Could not like this post.");
    } finally {
      setWallBusy(null);
    }
  }

  async function commentOnPost(post, body) {
    setWallBusy(post.id);
    setError("");
    try {
      await commentWallPost(post.id, body);
      await refreshWall();
      return true;
    } catch (err) {
      setError(err.message || "Could not post this reply.");
      return false;
    } finally {
      setWallBusy(null);
    }
  }

  async function deleteWallPostByOwner(post) {
    setWallBusy(post.id);
    setError("");
    try {
      await deleteWallPost(post.id);
      setWall((current) => current.filter((item) => String(item.id) !== String(post.id)));
      showToast("Wall post deleted.", "success");
      return true;
    } catch (err) {
      setError(err.message || "Could not delete this wall post.");
      return false;
    } finally {
      setWallBusy(null);
    }
  }

  return (
    <main className="author-public-page profile-page">
      <div
        className={`author-public-cover ${cover ? "has-image" : ""}`}
        style={cover ? { backgroundImage: `linear-gradient(180deg,rgba(11,10,18,.1),rgba(11,10,18,.92)),url("${cover.replace(/["\\\n\r]/g, "")}")` } : undefined}
        aria-hidden="true"
      />
      <div className="author-public-content">
        {error ? <div className="error-banner" role="alert">{error}</div> : null}
        <section className="profile-heading card-panel author-public-heading">
          <div className="profile-avatar-frame author-public-avatar">
            {photo && !photoFailed ? (
              <img className="profile-avatar-lg" src={photo} alt={`${name}'s profile`} onError={() => setPhotoFailed(true)} />
            ) : (
              <div className="profile-avatar-lg profile-avatar-fallback" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</div>
            )}
          </div>
          <div className="profile-heading-copy author-public-copy">
            <div className="profile-heading-overview">
              <div className="profile-heading-identity">
                <div className="profile-identity-badges author-public-badges">
                  <span className="eyebrow">WINGSAGA AUTHOR</span>
                  {profile?.is_author ? <span className="profile-author-badge author-public-author-badge"><span aria-hidden="true">✦</span> Author</span> : null}
                  {profile?.is_verified === true || profile?.verified === true ? (
                    <span className="profile-verified-badge author-public-verified-badge" aria-label="Verified author">✓ Verified</span>
                  ) : null}
                </div>
                <h1>{name}</h1>
                {username ? <p className="profile-handle author-public-handle">@{username}</p> : null}
                <p className="profile-bio-text author-public-bio">{profile?.bio || "This author is just getting started. Explore their stories below."}</p>
                <div className="profile-identity-meta author-public-identity-meta">
                  {profile?.country ? <span><span aria-hidden="true">⌖</span>{profile.country}</span> : null}
                  {Number(profile?.story_count || profile?.published_story_count || books.length || 0) ? (
                    <span>
                      <span aria-hidden="true">▣</span>
                      {Number(profile?.story_count || profile?.published_story_count || books.length || 0)} published{" "}
                      {Number(profile?.story_count || profile?.published_story_count || books.length || 0) === 1 ? "story" : "stories"}
                    </span>
                  ) : null}
                </div>
                {socialLinks.length ? (
                  <div className="profile-identity-social author-public-identity-social" aria-label="Social profiles">
                    {socialLinks.map((link) => (
                      <a
                        key={link.label}
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="profile-identity-social-link author-public-identity-social-link"
                        title={link.label}
                        aria-label={link.label}
                      >
                        <span className="profile-identity-social-icon author-public-identity-social-icon">
                          <SocialIcon platform={link.label} />
                        </span>
                        <span className="profile-identity-social-label author-public-identity-social-label">{link.label}</span>
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <aside className="profile-heading-aside author-public-actions" aria-label="Author statistics and actions">
            <div className="profile-metric-chips" aria-label="Author metrics">
              <span><strong>{loading ? "—" : Number(profile?.followers || 0).toLocaleString()}</strong> Followers</span>
              <span><strong>{loading ? "—" : Number(profile?.following || 0).toLocaleString()}</strong> Following</span>
              <span><strong>{loading ? "—" : books.length.toLocaleString()}</strong> Stories</span>
            </div>
            <div className="profile-heading-actions">
              {!isOwnProfile ? (
                <>
                  <button type="button" className={`btn ${following ? "btn-ghost" : "btn-primary"}`} onClick={toggleFollow} disabled={followBusy}>
                    {followBusy ? "Saving…" : following ? "Following" : "Follow author"}
                  </button>
                  {following ? (
                    <button
                      type="button"
                      className={`author-notification-toggle${notificationsEnabled ? " is-enabled" : ""}`}
                      onClick={toggleNotifications}
                      disabled={notificationBusy}
                      aria-label={notificationsEnabled ? "Turn off author update notifications" : "Turn on author update notifications"}
                      aria-pressed={notificationsEnabled}
                      title={notificationsEnabled ? "Author notifications on" : "Get new story and chapter updates"}
                    >
                      <span aria-hidden="true">🔔</span>
                      <span>{notificationBusy ? "Saving…" : notificationsEnabled ? "Updates on" : "Notify me"}</span>
                    </button>
                  ) : null}
                </>
              ) : (
                <Link className="btn btn-primary" to="/profile">Your profile</Link>
              )}
            </div>
          </aside>
        </section>


        <div className="author-public-tabs" role="tablist" aria-label="Author profile sections" onKeyDown={(event) => handleProfileTabKey(event, PROFILE_TABS, tab, setTab)}>
          {PROFILE_TABS.map(([key, label]) => (
            <button key={key} type="button" role="tab" id={`author-tab-${key}`} aria-controls={`author-panel-${key}`} tabIndex={tab === key ? 0 : -1} aria-selected={tab === key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
              {label}{key === "stories" ? ` (${books.length})` : key === "wall" ? ` (${wall.length})` : key === "reviews" ? ` (${reviews.length})` : ""}
            </button>
          ))}
        </div>

        {loading ? <div className="author-public-loading profile-tabpanel" id={`author-panel-${tab}`} role="tabpanel" aria-labelledby={`author-tab-${tab}`} tabIndex={0}><span role="status" aria-live="polite">Loading {name}'s profile…</span></div> : null}

        {!loading && tab === "about" ? (
          <div className="author-public-about-layout profile-tabpanel" id="author-panel-about" role="tabpanel" aria-labelledby="author-tab-about" tabIndex={0}>
            <section className="author-public-about card-panel">
              <span className="eyebrow">ABOUT THE AUTHOR</span>
              <h2>A little about {name}</h2>
              <p>{profile?.bio || "This author has not added a bio yet."}</p>
              {aboutDetails.length ? (
                <dl className="author-public-details author-public-details--list">
                  {aboutDetails.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
                </dl>
              ) : null}
              {socialLinks.length ? (
                <div className="author-public-social-block">
                  <h3 className="author-public-social-title">Social media</h3>
                  <nav className="author-public-social-links" aria-label={`${name}'s social links`}>
                    {socialLinks.map((link) => (
                      <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer">
                        <span className="author-public-social-icon-wrap"><SocialIcon platform={link.label} /></span>
                        <span className="author-public-social-copy"><strong>{link.label}</strong></span>
                        <span className="author-public-social-external" aria-hidden="true">↗</span>
                      </a>
                    ))}
                  </nav>
                </div>
              ) : null}
            </section>
            <section className="author-public-reading-lists">
              <header className="author-public-section-heading">
                <div><span className="eyebrow">THE READING SHELF</span><h2>Reading lists</h2></div>
                <span>{readingLists.length} {readingLists.length === 1 ? "list" : "lists"}</span>
              </header>
              {readingLists.length ? (
                <div className="author-public-list-grid">
                  {readingLists.map((list, index) => {
                    const image = resolveAssetUrl(list.cover_path || list.covers?.[0] || "");
                    return (
                      <article className="author-public-list-card" key={list.id || `${list.name}-${index}`}>
                        <span className="author-public-list-cover">
                          {image ? <img src={image} alt="" loading="lazy" /> : <span>{String(list.name || "L").slice(0, 1).toUpperCase()}</span>}
                        </span>
                        <span><strong>{list.name || "Reading list"}</strong><small>{Number(list.story_count || 0)} stories</small></span>
                      </article>
                    );
                  })}
                </div>
              ) : <p className="meta">No public reading lists yet.</p>}
            </section>
          </div>
        ) : null}

        {!loading && tab === "stories" ? (
          <section className="author-public-stories profile-tabpanel" id="author-panel-stories" role="tabpanel" aria-labelledby="author-tab-stories" tabIndex={0}>
            <header className="author-public-section-heading">
              <div><span className="eyebrow">THE STORY SHELF</span><h2>Stories by {name}</h2></div>
              <span>{visibleBooks.length} of {books.length} {books.length === 1 ? "story" : "stories"}</span>
            </header>
            <div className="author-story-controls">
              <label className="author-story-search"><span className="visually-hidden">Search this author's stories</span><input type="search" value={storyQuery} onChange={(event) => setStoryQuery(event.target.value)} placeholder="Search stories…" /></label>
              <label><span className="visually-hidden">Filter stories by status</span><select value={storyFilter} onChange={(event) => setStoryFilter(event.target.value)}><option>All stories</option><option>Ongoing</option><option>Completed</option></select></label>
              <label><span className="visually-hidden">Sort stories</span><select value={storySort} onChange={(event) => setStorySort(event.target.value)}><option>Recently updated</option><option>Most read</option><option>Highest rated</option></select></label>
            </div>
            {visibleBooks.length ? <div className="trending-grid">{visibleBooks.map((book, index) => <div className="trending-cell" key={book.id || `${book.title}-${index}`}><BookCard book={book} variant="grid" /></div>)}</div> : (
              <div className="author-public-empty card-panel"><span className="eyebrow">{books.length ? "NO MATCHES" : "A NEW CHAPTER"}</span><h3>{books.length ? "No stories match those filters" : "No public stories yet"}</h3><p className="meta">{books.length ? "Try another search or status filter." : `Check back soon to see what ${name} shares next.`}</p>{!books.length ? <Link className="btn btn-ghost" to="/">Browse stories</Link> : null}</div>
            )}
          </section>
        ) : null}

        {!loading && tab === "wall" ? (
          <section className="profile-feed-section author-public-wall profile-tabpanel" id="author-panel-wall" role="tabpanel" aria-labelledby="author-tab-wall" tabIndex={0}>
            <header className="author-public-section-heading"><div><span className="eyebrow">COMMUNITY</span><h2>{name}'s wall</h2></div></header>
            {!guest ? (
              <form className="profile-wall-compose card-panel" onSubmit={submitWallPost}>
                <label className="visually-hidden" htmlFor="author-wall-message">Write a wall post</label>
                <textarea id="author-wall-message" value={wallDraft} onChange={(event) => setWallDraft(event.target.value)} maxLength={1000} rows={3} placeholder={`Share a note with ${name}…`} />
                <div><span className="meta">{wallDraft.length}/1000</span><button className="btn btn-primary btn-sm" type="submit" disabled={wallBusy === "compose" || !wallDraft.trim()}>{wallBusy === "compose" ? "Posting…" : "Post to wall"}</button></div>
              </form>
            ) : <p className="meta"><Link to="/login">Sign in</Link> to post on this wall.</p>}
            {wall.length ? (
              <div className="profile-feed-list">{wall.map((post, index) => {
                const currentUserId = user?.id || user?.user_id;
                const canDelete = currentUserId != null && post.user_id != null && String(post.user_id) === String(currentUserId);
                return <WallPostCard key={post.id || `wall-${index}`} post={post} canInteract={!guest && Boolean(getToken())} canDelete={canDelete} busy={wallBusy === post.id} onLike={likePost} onComment={commentOnPost} onDelete={deleteWallPostByOwner} />;
              })}</div>
            ) : <div className="author-public-empty card-panel"><h3>No wall posts yet</h3><p className="meta">Be the first to leave a note for {name}.</p></div>}
          </section>
        ) : null}

        {!loading && tab === "reviews" ? (
          <section className="profile-reviews-section author-public-reviews profile-tabpanel" id="author-panel-reviews" role="tabpanel" aria-labelledby="author-tab-reviews" tabIndex={0}>
            <header className="author-public-section-heading"><div><span className="eyebrow">READER VOICE</span><h2>Reviews by {name}</h2></div><span>{reviews.length} {reviews.length === 1 ? "review" : "reviews"}</span></header>
            {reviews.length ? (
              <div className="profile-review-list">
                {reviews.map((review, index) => {
                  const story = review.book || {};
                  const bookId = review.book_id || story.id;
                  const title = review.book_title || story.title || "Story review";
                  const image = resolveAssetUrl(review.cover_path || story.cover_path || "");
                  return (
                    <article className="profile-review-card card-panel" key={review.id || `review-${index}`}>
                      {bookId ? <Link to={`/stories/${bookId}`} className="profile-review-cover">{image ? <img src={image} alt="" loading="lazy" /> : <span>{title.slice(0, 1)}</span>}</Link> : null}
                      <div className="profile-review-copy">
                        <Link to={bookId ? `/stories/${bookId}` : "/"} className="profile-review-title">{title}</Link>
                        <span className="profile-review-rating" aria-label={`${review.rating || 0} out of 5 stars`}>★ {Number(review.rating || 0)}/5</span>
                        <p>{review.comment || review.body || "No written review."}</p>
                        <time>{review.created_at ? new Date(review.created_at).toLocaleDateString() : ""}</time>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : <div className="author-public-empty card-panel"><h3>No reviews yet</h3><p className="meta">{name} has not reviewed a story yet.</p></div>}
          </section>
        ) : null}
      </div>
    </main>
  );
}
