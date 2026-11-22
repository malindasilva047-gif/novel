import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { deleteStory, getMyStories, resolveAssetUrl } from "../api";
import { isGuestUser } from "../utils/guest";

function getStoryCounts(stories) {
  return stories.reduce((counts, story) => {
    const status = String(story.status_text || story.status || "").toLowerCase();
    const publishedCount = Number(story.published_chapter_count || 0);
    const isPublished = publishedCount > 0;
    counts.total += 1;
    if (isPublished) counts.published += 1;
    else counts.drafts += 1;
    if (story.is_completed === true || Number(story.is_completed) === 1 || /complete|finished/.test(status)) {
      counts.completed += 1;
    }
    return counts;
  }, { total: 0, published: 0, drafts: 0, completed: 0 });
}

function formatUpdated(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : `Updated ${date.toLocaleDateString()}`;
}

export default function ManageStoriesPage({ user }) {
  const guest = isGuestUser(user);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(() =>
    searchParams.get("tab") === "drafts"
      ? "drafts"
      : searchParams.get("tab") === "all"
        ? "all"
        : "submitted",
  );
  const [stories, setStories] = useState([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("recent");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!guest);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await getMyStories();
      const items = res?.items || res || [];
      setStories(items);
      const requestedTab = searchParams.get("tab");
      if (!["all", "drafts", "submitted"].includes(requestedTab)) {
        setTab(getStoryCounts(items).published > 0 ? "submitted" : "drafts");
      }
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function removeEmptyStory(story) {
    const chapterCount = Number(story.chapter_count || 0);
    const status = String(story.status_text || story.status || "").toLowerCase();
    if (chapterCount !== 0) {
      setError("Delete every chapter before deleting the story.");
      return;
    }
    if (!/draft|private|unpublish|hidden/.test(status)) {
      setError("Move the story to Draft before deleting it.");
      return;
    }
    if (!window.confirm("All chapters have been deleted. Delete this story and its details page? This action cannot be undone.")) {
      return;
    }
    try {
      setError("");
      await deleteStory(story.id);
      await load();
    } catch (e) {
      setError(String(e.message || e));
    }
  }

  useEffect(() => {
    if (guest) return;
    load();
  }, [guest, user?.id, user?.user_id]);

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    if (["all", "drafts", "submitted"].includes(requestedTab)) {
      setTab(requestedTab);
    }
  }, [searchParams]);

  function onCreate() {
    navigate("/write/new");
  }

  const filtered = useMemo(() => {
    let list = [...stories];
    list = list.filter((s) => {
      const publishedCount = Number(s.published_chapter_count || 0);
      const isSubmitted = publishedCount > 0;
      const status = String(s.status_text || s.status || "").toLowerCase();
      if (tab === "drafts" && isSubmitted) return false;
      if (tab === "submitted" && !isSubmitted) return false;
      if (filter === "ongoing" && !/ongoing|publish/.test(status)) return false;
      if (filter === "completed" && !/complete/.test(status)) return false;
      const query = q.trim().toLowerCase();
      if (query && !`${s.title || ""} ${s.author || ""}`.toLowerCase().includes(query)) return false;
      return true;
    });
    list.sort((a, b) => {
      if (sort === "title") return String(a.title || "").localeCompare(String(b.title || ""));
      if (sort === "reads") return Number(b.view_count || b.read_count || 0) - Number(a.view_count || a.read_count || 0);
      return String(b.last_updated_at || b.updated_at || "").localeCompare(String(a.last_updated_at || a.updated_at || "")) || Number(b.id || 0) - Number(a.id || 0);
    });
    return list;
  }, [stories, tab, q, filter, sort]);
  const counts = useMemo(() => getStoryCounts(stories), [stories]);

  if (guest) {
    return (
      <div className="container page">
        <div className="guest-lock">
          <h3>Sign in to manage stories</h3>
          <Link className="btn btn-primary" to="/login" state={{ returnTo: "/manage-stories" }}>
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="manage-page-inkitt">
      <main className="manage-content">
        <header className="manage-page-heading">
          <div>
            <span className="manage-eyebrow">WRITER WORKSPACE</span>
            <h1 className="manage-title">Your stories</h1>
            <p>Keep drafts moving, check on published work, and jump back into writing.</p>
          </div>
          <button type="button" className="btn btn-primary create-story-btn" onClick={onCreate}>
            <span aria-hidden="true">＋</span> Create a story
          </button>
        </header>

        <section className="manage-overview" aria-label="Story overview">
          <div><span>All stories</span><strong>{counts.total}</strong></div>
          <div><span>Published</span><strong>{counts.published}</strong></div>
          <div><span>Drafts</span><strong>{counts.drafts}</strong></div>
          <div><span>Completed</span><strong>{counts.completed}</strong></div>
        </section>

          <div className="manage-toolbar">
            <div className="manage-tabs">
              <button
                type="button"
                className={tab === "all" ? "active" : ""}
                onClick={() => setTab("all")}
              >
                All Stories <span>{counts.total}</span>
              </button>
              <button
                type="button"
                className={tab === "submitted" ? "active" : ""}
                onClick={() => setTab("submitted")}
              >
                Published <span>{counts.published}</span>
              </button>
              <button
                type="button"
                className={tab === "drafts" ? "active" : ""}
                onClick={() => setTab("drafts")}
              >
                Drafts <span>{counts.drafts}</span>
              </button>
            </div>
          </div>

          <div className="manage-filters">
            <label className="search-field">
              <span>Search</span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search your stories..."
              />
            </label>
            <label>
              <span>Filter by</span>
              <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="all">All stories</option>
                <option value="ongoing">Ongoing</option>
                <option value="completed">Completed</option>
              </select>
            </label>
            <label>
              <span>Sort by</span>
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="recent">Recently updated</option>
                <option value="title">Title (A-Z)</option>
                <option value="reads">Most reads</option>
              </select>
            </label>
          </div>

          {error && <div className="error-banner" role="alert">{error} <button type="button" className="btn btn-ghost btn-sm" onClick={load}>Retry</button></div>}
          {loading && <p className="meta">Loading…</p>}

          {!loading && filtered.length === 0 && (
            <div className="manage-empty">
              <div className="manage-empty-icon" aria-hidden="true">✦</div>
              <h3>{q || filter !== "all" ? "No stories match these filters" : tab === "drafts" ? "Your drafts will be waiting here" : "Your published stories will appear here"}</h3>
              <p>
                {q || filter !== "all"
                  ? "Try a different search or update the selected filters."
                  : tab === "drafts"
                    ? "Start a story or save your first chapter as a draft."
                    : "Publish a chapter to share your story with readers."}
              </p>
              {q || filter !== "all" ? <button type="button" className="btn btn-secondary" onClick={() => { setQ(""); setFilter("all"); }}>Clear filters</button> : <button type="button" className="btn btn-primary" onClick={onCreate}>Create a story</button>}
            </div>
          )}

          <div className="manage-story-grid">
            {filtered.map((s) => {
              const cover = resolveAssetUrl(s.cover_path || s.coverPath || "");
              const status = String(s.status_text || s.status || "").toLowerCase();
              const isCompleted = s.is_completed === true || Number(s.is_completed) === 1 || /complete|finished/.test(status);
              const isPublished = Number(s.published_chapter_count || 0) > 0;
              const title = s.title || "Untitled story";
              const rating = Number(s.rating);
              const reads = Number(s.view_count || s.read_count || 0);
              const chapterCount = Number(s.chapter_count || 0);
              const genre = s.secondary_genre || s.genre || s.primary_genre || "";
              return (
                <article key={s.id} className="manage-story-card">
                  <Link to={`/stories/${s.id}`} className="manage-cover" aria-label={`View ${title}`}>
                    {cover ? (
                      <img src={cover} alt={`${title} cover`} loading="lazy" decoding="async" />
                    ) : (
                      <div className="manage-cover-ph" role="img" aria-label={`Default cover for ${title}`}>
                        <span className="manage-cover-ph-mark" aria-hidden="true">W</span>
                        <strong>{title}</strong>
                        <small>{s.author || user?.display_name || user?.username || "Wingsaga author"}</small>
                      </div>
                    )}
                    <span className={`manage-cover-status${isPublished ? " is-published" : ""}`}>
                      {isCompleted ? "Completed" : isPublished ? "Published" : "Draft"}
                    </span>
                    {Number.isFinite(rating) && rating > 0 ? <span className="manage-cover-rating"><span aria-hidden="true">★</span> {rating.toFixed(1)}</span> : null}
                    {genre ? <span className="manage-cover-genre">{genre}</span> : null}
                  </Link>
                  <div className="manage-story-meta">
                    <Link to={`/stories/${s.id}`}>
                      <h3>{title}</h3>
                    </Link>
                    <p className="manage-story-author">by {s.author || user?.display_name || user?.username || "You"}</p>
                    <div className="manage-story-stats">
                      <span>{chapterCount} {chapterCount === 1 ? "chapter" : "chapters"}</span>
                      <span>{reads.toLocaleString()} reads</span>
                      {Number.isFinite(rating) && rating > 0 ? <span>★ {rating.toFixed(1)}</span> : null}
                    </div>
                    <div className="manage-story-details">
                      <span className={`manage-story-status${isPublished ? " is-published" : ""}`}>{isCompleted ? "Completed" : isPublished ? "Published" : "Draft"}</span>
                      <span>{s.genre || s.primary_genre || "Genre not set"}</span>
                      <span>{formatUpdated(s.last_updated_at || s.updated_at)}</span>
                    </div>
                    <div className="manage-story-actions">
                      <Link className="btn btn-primary" to={`/write/${s.id}`}>
                        Chapters
                      </Link>
                      <Link className="btn btn-secondary" to={`/write/new?story=${s.id}&returnTo=${encodeURIComponent(`/manage-stories?tab=${tab}`)}`}>
                        Edit details
                      </Link>
                      {Number(s.chapter_count || 0) === 0 &&
                      /draft|private|unpublish|hidden/i.test(String(s.status_text || s.status || "")) ? (
                        <button
                          type="button"
                          className="btn manage-delete-story"
                          onClick={() => removeEmptyStory(s)}
                        >
                          Delete story
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
      </main>
    </div>
  );
}
