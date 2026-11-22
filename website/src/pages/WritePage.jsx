import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getMyStories, resolveAssetUrl } from "../api";
import { isGuestUser } from "../utils/guest";

function getPublishedCount(story) {
  return Number(story.published_chapter_count || 0);
}

function getUpdatedAt(story) {
  return story.last_updated_at || story.updated_at || story.created_at || "";
}

function formatUpdated(value) {
  if (!value) return "No recent updates";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No recent updates";

  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days < 1) return "Updated today";
  if (days === 1) return "Updated yesterday";
  if (days < 30) return `Updated ${days} days ago`;
  return `Updated ${date.toLocaleDateString()}`;
}

function ActionIcon({ type }) {
  if (type === "book") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    );
  }
  if (type === "analytics") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 20V10M12 20V4M6 20v-6" />
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

export default function WritePage({ user }) {
  const guest = isGuestUser(user);
  const [stories, setStories] = useState([]);
  const [activeFilter, setActiveFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("recent");
  const [openMenuId, setOpenMenuId] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!guest);

  async function loadStories() {
    setLoading(true);
    setError("");
    try {
      const response = await getMyStories();
      setStories(response?.items || response || []);
    } catch (loadError) {
      setError(String(loadError?.message || loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (guest) {
      setStories([]);
      setLoading(false);
      return;
    }
    loadStories();
  }, [guest, user?.id, user?.user_id]);

  const counts = useMemo(() => ({
    all: stories.length,
    published: stories.filter((story) => getPublishedCount(story) > 0).length,
    drafts: stories.filter((story) => getPublishedCount(story) === 0).length,
  }), [stories]);

  const visibleStories = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = stories.filter((story) => {
      const published = getPublishedCount(story) > 0;
      if (activeFilter === "published" && !published) return false;
      if (activeFilter === "drafts" && published) return false;
      if (!query) return true;
      const tags = Array.isArray(story.tags) ? story.tags.join(" ") : "";
      return `${story.title || ""} ${story.author_name || story.author || ""} ${story.genre_name || story.genre || ""} ${tags}`
        .toLowerCase()
        .includes(query);
    });

    return filtered.sort((a, b) => {
      if (sort === "created") {
        return String(b.created_at || "").localeCompare(String(a.created_at || ""));
      }
      if (sort === "title") return String(a.title || "").localeCompare(String(b.title || ""));
      if (sort === "chapters") return Number(b.chapter_count || 0) - Number(a.chapter_count || 0);
      return String(getUpdatedAt(b)).localeCompare(String(getUpdatedAt(a)));
    });
  }, [stories, activeFilter, search, sort]);

  function scrollToStories() {
    document.getElementById("writer-story-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="writer-dashboard">
      <header className="writer-dashboard-header">
        <h1>Write</h1>
        <Link
          className="writer-new-button"
          to={guest ? "/login" : "/write/new"}
          state={guest ? { returnTo: "/write/new" } : undefined}
          aria-label="New story"
          title="New story"
        >
          <span aria-hidden="true">+</span>
        </Link>
      </header>

      <section className="writer-dashboard-hero">
        <h2 className="writer-dashboard-hero-title">Start Writing</h2>
        <p className="writer-dashboard-hero-description">Turn your ideas into stories readers will love</p>
      </section>

      <section className="writer-action-grid" aria-label="Writing shortcuts">
        <Link
          className="writer-action-card writer-action-primary"
          to={guest ? "/login" : "/write/new"}
          state={guest ? { returnTo: "/write/new" } : undefined}
        >
          <span className="writer-action-icon"><ActionIcon type="write" /></span>
          <span className="writer-action-copy">
            <span className="writer-action-title">New Story</span>
            <span className="writer-action-sub">Create from scratch</span>
          </span>
        </Link>
        <button className="writer-action-card writer-action-mystories" type="button" onClick={scrollToStories}>
          <span className="writer-action-icon"><ActionIcon type="book" /></span>
          <span className="writer-action-copy">
            <span className="writer-action-title">My Stories</span>
            <span className="writer-action-sub">{counts.all} {counts.all === 1 ? "story" : "stories"}</span>
          </span>
        </button>
        <Link className="writer-action-card writer-action-analytics" to="/write/analytics">
          <span className="writer-action-icon"><ActionIcon type="analytics" /></span>
          <span className="writer-action-copy">
            <span className="writer-action-title">Analytics</span>
            <span className="writer-action-sub">View your stats</span>
          </span>
        </Link>
      </section>

      <section className="writer-dashboard-controls" aria-label="Manage stories">
        <nav className="writer-main-tabs" aria-label="Writer pages">
          <Link className="active" to="/write" aria-current="page">Manage Stories</Link>
          <Link to="/write/analytics">Analytics</Link>
        </nav>

        <div className="writer-sub-tabs" role="tablist" aria-label="Story status">
          {[
            ["all", "All", counts.all],
            ["published", "Published", counts.published],
            ["drafts", "Drafts", counts.drafts],
          ].map(([filter, label, count]) => (
            <button
              key={filter}
              type="button"
              role="tab"
              aria-selected={activeFilter === filter}
              className={activeFilter === filter ? "active" : ""}
              onClick={() => setActiveFilter(filter)}
            >
              {label}<span className="writer-tab-count">{count}</span>
            </button>
          ))}
        </div>

        <div className="writer-search-row">
          <label className="writer-search-wrap">
            <span className="writer-search-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
            </span>
            <span className="sr-only">Search your stories</span>
            <input
              className="writer-search-input"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search your stories..."
            />
          </label>
          <label className="writer-sort-wrap">
            <span className="sr-only">Sort stories</span>
            <select className="writer-sort-select" value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="recent">Recently Updated</option>
              <option value="created">Recently Created</option>
              <option value="title">Title A-Z</option>
              <option value="chapters">Most Chapters</option>
            </select>
          </label>
        </div>
      </section>

      {error && (
        <div className="writer-dashboard-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={loadStories}>Retry</button>
        </div>
      )}

      <section className="writer-story-list" id="writer-story-list" aria-label="Your stories">
        {loading && <p className="writer-list-message">Loading your stories…</p>}
        {!loading && !error && visibleStories.length === 0 && (
          <div className="writer-list-empty">
            <h2>{guest ? "Sign in to manage your stories" : search ? "No stories found" : "No stories yet"}</h2>
            <p>{guest ? "Sign in to start writing and manage your stories." : search ? "Try a different search or filter." : "Create your first story and bring your ideas to life."}</p>
            {(guest || stories.length === 0) && (
              <Link className="writer-empty-action" to={guest ? "/login" : "/write/new"} state={guest ? { returnTo: "/write/new" } : undefined}>
                {guest ? "Sign in" : "Create a story"}
              </Link>
            )}
          </div>
        )}
        {!loading && visibleStories.map((story, index) => {
          const publishedCount = getPublishedCount(story);
          const published = publishedCount > 0;
          const tags = [
            ...(Array.isArray(story.tags) ? story.tags : []),
            story.genre_name || story.genre,
            story.is_completed ? "Completed" : !published ? "Draft" : "",
          ].filter(Boolean).slice(0, 3);
          const cover = resolveAssetUrl(story.cover_path || story.cover_url || story.cover_image || "");
          const menuOpen = openMenuId === story.id;

          return (
            <article className="writer-story-card" key={story.id || story.title || index}>
              <div className={`writer-story-cover writer-cover-${(index % 5) + 1}`}>
                <Link to={`/write/${story.id}`} className="writer-story-cover-link" aria-label={`Open ${story.title || "story"}`}>
                  {cover ? <img src={cover} alt="" /> : <span className="writer-cover-title">{story.title || "Untitled story"}</span>}
                </Link>
                <span className={`writer-story-status ${published ? "published" : "draft"}`}>{published ? "Published" : "Draft"}</span>
                <div
                  className="writer-story-menu-wrap"
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) setOpenMenuId(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setOpenMenuId(null);
                  }}
                >
                  <button
                    className="writer-story-menu-button"
                    type="button"
                    aria-label={`Actions for ${story.title || "story"}`}
                    aria-expanded={menuOpen}
                    onClick={() => setOpenMenuId(menuOpen ? null : story.id)}
                  >
                    <span aria-hidden="true">⋮</span>
                  </button>
                  {menuOpen && (
                    <div className="writer-story-menu">
                      <Link to={`/write/${story.id}`}>Manage chapters</Link>
                      <Link to={`/write/new?story=${encodeURIComponent(story.id)}`}>Edit story details</Link>
                    </div>
                  )}
                </div>
              </div>
              <div className="writer-story-body">
                <Link className="writer-story-title" to={`/write/${story.id}`}>{story.title || "Untitled story"}</Link>
                <p className="writer-story-author">{story.author_name || story.author || "You"}</p>
                {tags.length > 0 && (
                  <div className="writer-story-tags">
                    {tags.map((tag, tagIndex) => <span className="writer-story-tag" key={`${tag}-${tagIndex}`}>{tag}</span>)}
                  </div>
                )}
                <div className="writer-story-meta">
                  <span>{Number(story.chapter_count || 0)} chapters</span>
                  <span className="writer-meta-dot" aria-hidden="true" />
                  <span>{publishedCount} published</span>
                </div>
                <p className="writer-story-updated">{formatUpdated(getUpdatedAt(story))}</p>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
