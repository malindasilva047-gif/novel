
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  API_BASE_URL,
  clearAdminToken,
  createAchievement,
  createBook,
  createCategory,
  createMenuItem,
  createNotification,
  createReadingList,
  deleteAchievement,
  deleteBook,
  deleteCategory,
  deleteMenuItem,
  deleteNotification,
  deleteReadingList,
  getAdminBootstrap,
  getAdminSession,
  getAdminSupportRequests,
  getAdminToken,
  getContentVersion,
  listStoryImages,
  loginAdmin,
  setAdminToken,
  updateAchievement,
  updateBook,
  updateCategory,
  updateMenuItem,
  updateNotification,
  updateProfile,
  updateReadingList,
  updateSupportRequest,
  updateWriteScreen,
  uploadImage,
  uploadTagCoverImage,
  listAdminTags,
  createAdminTag,
  updateAdminTag,
  deleteAdminTag,
  listStoryReports,
  republishStory,
  createAdminChapter,
  listAdminChapters,
  getAdminStats,
  listAdminReviews,
  listChatConversations,
  getChatConversation,
  sendChatReply,
  listHomeSections,
  createHomeSection,
  updateHomeSection,
  deleteHomeSection,
  assignBooksToHomeSection,
  listHomeSectionBooks,
  listHomeHeroImages,
  createHomeHeroImage,
  updateHomeHeroImage,
  deleteHomeHeroImage,
  getLibraryHero,
  updateLibraryHero,
  deleteLibraryHero,
} from "./api";
import { AuthorsPage, UsersPage, ReviewsPage } from "./moderation_pages";

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: "▦" },
  { id: "novels", label: "Novels", icon: "☰" },
  { id: "home-sliders", label: "Home Sliders", icon: "▤" },
  { id: "home-hero-images", label: "Hero Backgrounds", icon: "▧" },
  { id: "library-hero", label: "Library Hero", icon: "▥" },
  { id: "authors", label: "Authors", icon: "✎" },
  { id: "users", label: "Users", icon: "☺" },
  { id: "reports", label: "Reports", icon: "▤" },
  { id: "reviews", label: "Reviews", icon: "★" },
  { id: "hashtags", label: "Hashtags", icon: "#" },
  { id: "genres", label: "Genres", icon: "◇" },
  { id: "revenue", label: "Catalog insights", icon: "$" },
  { id: "moderation", label: "Content Moderation", icon: "◎" },
  { id: "announcements", label: "Announcements", icon: "◎" },
  { id: "chat", label: "Live Chat", icon: "▰" },
  { id: "support", label: "Contact Us", icon: "✉" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

const EMPTY_BOOK = {
  title: "",
  author: "",
  description: "",
  cover_path: "",
  accent_hex: "#3b82f6",
  section_name: "recently_updated",
  status_text: "Ongoing",
  rating: 0,
  genre: "",
  cta_label: "Read now",
  sort_order: 999,
  chapters: [],
};

const MAX_HOME_HERO_IMAGES = 5;


/** Sample novels seeded from the admin UI (no backend seed script required). */
const DUMMY_NOVELS = [
  {
    title: "The Midnight Archive",
    author: "A. Rivers",
    description: "A librarian discovers books that rewrite the memories of anyone who reads them.",
    genre: "Fantasy",
    section_name: "recently_updated",
    status_text: "Ongoing",
    rating: 4.6,
    accent_hex: "#5B6CFF",
    cta_label: "Read now",
    sort_order: 10,
    chapters: [
      { title: "Chapter 1: Locked Stacks", content: "The archive only opened after midnight. Mira held the brass key until it warmed in her palm.\n\nShelves rearranged themselves when she blinked." },
      { title: "Chapter 2: The First Page", content: "The first page of the forbidden ledger showed her own name written in a hand she did not recognize." },
    ],
  },
  {
    title: "Neon Harbor",
    author: "K. Sol",
    description: "In a coastal city powered by storms, a courier delivers messages that can change the weather.",
    genre: "Sci-Fi",
    section_name: "recently_updated",
    status_text: "Ongoing",
    rating: 4.4,
    accent_hex: "#14B8A6",
    cta_label: "Read now",
    sort_order: 11,
    chapters: [
      { title: "Chapter 1: Tide Code", content: "Rain wrote equations on the glass. Jun read them the way other people read street signs." },
      { title: "Chapter 2: Harbor Lights", content: "Every neon sign was a battery. The city charged itself on lightning and gossip." },
    ],
  },
  {
    title: "Letters From the Quiet Year",
    author: "M. Wren",
    description: "A year of unsent letters becomes the only map back to a lost hometown.",
    genre: "Drama",
    section_name: "recently_completed",
    status_text: "Ongoing",
    rating: 4.8,
    accent_hex: "#F59E0B",
    cta_label: "Read now",
    sort_order: 12,
    chapters: [
      { title: "Chapter 1: January", content: "I wrote to you on the coldest morning, then left the envelope under a stone by the river." },
      { title: "Chapter 2: June", content: "Summer returned the letter unopened, water-stained, with a new sentence in the margin." },
    ],
  },
];

const EMPTY_CATEGORY = { name: "", topic_count: 0, tab_group: "explore", sort_order: 999, image_path: "" };
const EMPTY_NOTIFICATION = { tab: "Story", title: "", message: "", created_at: "Now" };

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function statusBadge(status) {
  const s = (status || "").toLowerCase();
  if (s.includes("publish") || s === "active" || s === "approved") return "badge-green";
  if (s.includes("pending") || s.includes("review") || s.includes("draft") || s.includes("schedul"))
    return "badge-orange";
  if (s.includes("reject") || s.includes("suspend") || s.includes("inactive") || s.includes("ban"))
    return "badge-red";
  return "badge-blue";
}

function coverUrl(path) {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  const base = API_BASE_URL.replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function BarChart({ data, color = "var(--accent)" }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="bar-chart">
      {data.map((d) => (
        <div className="bar-col" key={d.label}>
          <div className="bar" style={{ height: `${(d.value / max) * 100}%`, background: color }} />
          <span className="bar-label">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function LineChart({ series }) {
  const w = 400;
  const h = 140;
  const pad = 10;
  const all = series.flatMap((s) => s.points);
  const max = Math.max(...all, 1);
  const n = series[0]?.points.length || 1;
  const toPath = (points) =>
    points
      .map((v, i) => {
        const x = pad + (i / Math.max(n - 1, 1)) * (w - pad * 2);
        const y = h - pad - (v / max) * (h - pad * 2);
        return `${i === 0 ? "M" : "L"}${x},${y}`;
      })
      .join(" ");
  return (
    <div className="line-chart">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={pad}
            x2={w - pad}
            y1={h - pad - f * (h - pad * 2)}
            y2={h - pad - f * (h - pad * 2)}
            stroke="#2a3344"
            strokeWidth="1"
          />
        ))}
        {series.map((s) => (
          <path key={s.name} d={toPath(s.points)} fill="none" stroke={s.color} strokeWidth="2.5" />
        ))}
      </svg>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(() => getAdminToken());
  const [session, setSession] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [liveStats, setLiveStats] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [contentVersion, setContentVersion] = useState("");
  const [search, setSearch] = useState("");
  const [inboxOpen, setInboxOpen] = useState(false);
  const [inboxSources, setInboxSources] = useState({ chats: [], reports: [], reviews: [] });
  const [selectedChatUserId, setSelectedChatUserId] = useState(null);
  const [focusedSupportId, setFocusedSupportId] = useState(null);
  const [dismissedInboxIds, setDismissedInboxIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem("novelhub_admin_inbox_dismissed") || "[]"); }
    catch { return []; }
  });

  const [categories, setCategories] = useState([]);
  const [books, setBooks] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [writeScreen, setWriteScreen] = useState({});
  const [profile, setProfile] = useState({});
  const [readingLists, setReadingLists] = useState([]);
  const [achievements, setAchievements] = useState([]);
  const [supportRequests, setSupportRequests] = useState([]);
  const [storyImages, setStoryImages] = useState([]);

  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [bookModal, setBookModal] = useState(null);
  const [categoryModal, setCategoryModal] = useState(null);
  const [notifModal, setNotifModal] = useState(null);
  const [filterGenre, setFilterGenre] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [modTab, setModTab] = useState("novels");

  const toast = (msg, ok = true) => {
    setSuccess(ok ? msg : "");
    setError(ok ? "" : msg);
    setTimeout(() => {
      setSuccess("");
      setError("");
    }, 3200);
  };

  const loadAll = useCallback(async () => {
    if (!getAdminToken()) return;
    setLoading(true);
    try {
      const [sessionPayload, bootstrap, version, images] = await Promise.all([
        getAdminSession(),
        getAdminBootstrap(),
        getContentVersion(),
        listStoryImages().catch(() => ({ items: [] })),
      ]);
      setSession(sessionPayload);
      setCategories(asArray(bootstrap.categories));
      setBooks(asArray(bootstrap.books));
      setNotifications(
        asArray(bootstrap.notifications).map((n) => ({
          ...n,
          tab: n.tab ?? n.tab_name ?? "Story",
        }))
      );
      setMenuItems(asArray(bootstrap.menu_items));
      setWriteScreen(bootstrap.write_screen || {});
      setProfile(bootstrap.profile || {});
      setReadingLists(asArray(bootstrap.reading_lists));
      setAchievements(asArray(bootstrap.achievements));
      setSupportRequests(asArray(bootstrap.support_requests || bootstrap.support || []));
      setContentVersion(typeof version === "string" ? version : version?.version || "");
      setStoryImages(asArray(images.items || images));
      try {
        const st = await getAdminStats();
        setLiveStats(st);
      } catch (_) {
        setLiveStats(null);
      }
    } catch (e) {
      if (String(e.message || e).includes("401") || String(e.message || e).includes("403")) {
        clearAdminToken();
        setToken("");
        setSession(null);
      }
      toast(String(e.message || e), false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) loadAll();
  }, [token, loadAll]);

  useEffect(() => {
    if (!token) return undefined;
    const refreshSupportRequests = async () => {
      try {
        const payload = await getAdminSupportRequests();
        setSupportRequests(asArray(payload.items));
      } catch (_) {
        // Keep the last known list visible when a background refresh fails.
      }
    };
    refreshSupportRequests();
    const timer = window.setInterval(refreshSupportRequests, 15000);
    return () => window.clearInterval(timer);
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;
    let active = true;
    const refreshInbox = async () => {
      const [chatResult, reportResult, reviewResult, supportResult] = await Promise.allSettled([
        listChatConversations(), listStoryReports(), listAdminReviews(50), getAdminSupportRequests(),
      ]);
      if (!active) return;
      setInboxSources({
        chats: chatResult.status === "fulfilled" ? asArray(chatResult.value?.items) : [],
        reports: reportResult.status === "fulfilled" ? asArray(reportResult.value?.items) : [],
        reviews: reviewResult.status === "fulfilled" ? asArray(reviewResult.value?.items) : [],
      });
      if (supportResult.status === "fulfilled") setSupportRequests(asArray(supportResult.value?.items));
    };
    void refreshInbox();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshInbox();
    }, 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, [token]);

  useEffect(() => {
    if (!sidebarOpen) return undefined;
    function closeOnEscape(event) {
      if (event.key === "Escape") setSidebarOpen(false);
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [sidebarOpen]);

  const authors = useMemo(() => {
    const map = new Map();
    for (const b of books) {
      const name = (b.author || "Unknown").trim();
      if (!map.has(name)) {
        map.set(name, { name, novels: [], genres: new Set() });
      }
      const a = map.get(name);
      a.novels.push(b);
      if (b.genre) a.genres.add(b.genre);
    }
    return [...map.values()].map((a) => ({
      ...a,
      total: a.novels.length,
      genreFocus: [...a.genres][0] || "—",
      status: a.novels.some((n) => /publish/i.test(n.status_text || "")) ? "Active" : "Inactive",
      lastActive: "—",
      cover: a.novels[0]?.cover_path || "",
    }));
  }, [books]);

  const genres = useMemo(() => {
    const g = new Set(books.map((b) => b.genre).filter(Boolean));
    return ["All", ...g];
  }, [books]);

  const filteredBooks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return books.filter((b) => {
      if (filterGenre !== "All" && b.genre !== filterGenre) return false;
      if (filterStatus !== "All" && !(b.status_text || "").toLowerCase().includes(filterStatus.toLowerCase()))
        return false;
      if (!q) return true;
      return [b.title, b.author, b.genre].some((x) => (x || "").toLowerCase().includes(q));
    });
  }, [books, search, filterGenre, filterStatus]);

  const stats = useMemo(
    () => ({
      novels: books.length,
      authors: authors.length,
      published: books.filter((b) => /publish/i.test(b.status_text || "")).length,
      pending: books.filter((b) => /pending|draft|review/i.test(b.status_text || "")).length,
      support: supportRequests.length,
      categories: categories.length,
    }),
    [books, authors, supportRequests, categories]
  );
  const inboxItems = useMemo(() => {
    const items = [];
    for (const request of supportRequests) {
      if (["resolved", "closed"].includes(String(request.status || "open").toLowerCase()) || request.admin_reply) continue;
      items.push({ id: `support:${request.id}`, kind: "support", title: request.subject || request.issue || "Contact Us message", sender: request.first_name || request.email || "Reader", body: request.description || "New support request", created_at: request.created_at, target: request.id });
    }
    for (const chat of inboxSources.chats) {
      if (String(chat.last_sender || "").toLowerCase() !== "user") continue;
      items.push({ id: `chat:${chat.user_id}:${chat.last_message_id}`, kind: "chat", title: chat.display_name || chat.email || `Reader #${chat.user_id}`, sender: "Live chat", body: chat.last_message || "New reader message", created_at: chat.last_message_at, target: chat.user_id });
    }
    for (const report of inboxSources.reports) {
      items.push({ id: `report:${report.book_id}:${report.last_report_at}`, kind: "report", title: report.title || `Story #${report.book_id}`, sender: `${report.report_count || 1} story report(s)`, body: `Reported by readers · ${report.author || "Unknown author"}`, created_at: report.last_report_at, target: report.book_id });
    }
    for (const review of inboxSources.reviews) {
      items.push({ id: `review:${review.id}`, kind: "review", title: review.book_title || "Story review", sender: review.display_name || review.email || "Reader", body: review.comment || `${review.rating || "New"}-star review`, created_at: review.created_at, target: review.book_id });
    }
    return items
      .filter((item) => !dismissedInboxIds.includes(item.id))
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  }, [supportRequests, inboxSources, dismissedInboxIds]);
  const notificationCount = inboxItems.length;

  function dismissInboxItem(event, id) {
    event.stopPropagation();
    event.preventDefault();
    const next = [...new Set([...dismissedInboxIds, id])];
    setDismissedInboxIds(next);
    localStorage.setItem("novelhub_admin_inbox_dismissed", JSON.stringify(next));
  }

  function openInboxItem(item) {
    setInboxOpen(false);
    if (item.kind === "chat") {
      setSelectedChatUserId(Number(item.target));
      setPage("chat");
    } else if (item.kind === "support") {
      setFocusedSupportId(Number(item.target));
      setPage("support");
    }
    else if (item.kind === "report") setPage("reports");
    else if (item.kind === "review") setPage("reviews");
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    try {
      const res = await loginAdmin(loginForm);
      setAdminToken(res.token);
      setToken(res.token);
      setSession({ username: res.username });
      toast("Signed in");
    } catch (err) {
      setError(String(err.message || err));
    }
  }

  function logout() {
    clearAdminToken();
    setToken("");
    setSession(null);
  }

  async function seedDummyData() {
    if (!window.confirm("Create 3 sample published novels with chapters? Existing titles may duplicate.")) return;
    try {
      setLoading(true);
      let ok = 0;
      for (const novel of DUMMY_NOVELS) {
        const { chapters = [], ...bookPayload } = novel;
        const created = await createBook({ ...bookPayload, status_text: "Ongoing" });
        const bookId = created?.id || created?.book_id;
        if (bookId && chapters.length) {
          for (let i = 0; i < chapters.length; i++) {
            const ch = chapters[i];
            await createAdminChapter(bookId, {
              title: ch.title || `Chapter ${i + 1}`,
              content: ch.content || "",
              chapter_number: i + 1,
              submission_status: "published",
            });
          }
        }
        ok += 1;
      }
      toast(`Seeded ${ok} dummy novel(s)`);
      await loadAll();
    } catch (e) {
      toast(String(e.message || e), false);
    } finally {
      setLoading(false);
    }
  }

  async function saveBook(payload, id) {
    try {
      // Admin novels are always published (no separate Publish step)
      const body = { ...payload, status_text: "Ongoing" };
      const chapters = Array.isArray(payload.chapters) ? payload.chapters : [];
      let bookId = id;
      if (id) {
        await updateBook(id, body);
      } else {
        const created = await createBook(body);
        bookId = created?.id || created?.book_id;
      }
      // Create chapters if provided (new or existing book)
      if (bookId && chapters.length) {
        for (let i = 0; i < chapters.length; i++) {
          const ch = chapters[i];
          const title = (ch.title || `Chapter ${i + 1}`).trim();
          const content = (ch.content || "").trim();
          if (!title && !content) continue;
          try {
            await createAdminChapter(bookId, {
              title: title || `Chapter ${i + 1}`,
              content: content || "",
              chapter_number: i + 1,
              submission_status: "published",
            });
          } catch (chErr) {
            console.warn("chapter create failed", chErr);
          }
        }
      }
      setBookModal(null);
      toast(id ? "Novel updated" : "Novel created (published)");
      await loadAll();
    } catch (e) {
      toast(String(e.message || e), false);
    }
  }

  async function removeBook(id) {
    if (!window.confirm("Delete this novel?")) return;
    try {
      await deleteBook(id);
      toast("Novel deleted");
      await loadAll();
    } catch (e) {
      toast(String(e.message || e), false);
    }
  }

  async function quickBookStatus(row, status_text) {
    try {
      await updateBook(row.id, { ...row, status_text });
      toast(`Status → ${status_text}`);
      await loadAll();
    } catch (e) {
      toast(String(e.message || e), false);
    }
  }

  if (!token) {
    return (
      <div className="login-page">
        <form className="login-card" onSubmit={handleLogin}>
          <div className="brand" style={{ padding: 0, marginBottom: 12 }}>
            <div className="brand-mark">N</div>
            NovelHub Admin
          </div>
          <h1>Sign in</h1>
          <p>Manage novels, authors, users, and content.</p>
          {error && <div className="login-error">{error}</div>}
          <label htmlFor="admin-username">Username</label>
          <input
            id="admin-username"
            value={loginForm.username}
            onChange={(e) => setLoginForm((f) => ({ ...f, username: e.target.value }))}
            autoComplete="username"
            required
          />
          <label htmlFor="admin-password">Password</label>
          <input
            id="admin-password"
            type="password"
            value={loginForm.password}
            onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))}
            autoComplete="current-password"
            required
          />
          <button type="submit">Login</button>
          <p style={{ marginTop: 14, fontSize: ".75rem" }}>
            Credentials from backend <code>.env</code> (<code>ADMIN_USERNAME</code> / <code>ADMIN_PASSWORD</code>)
          </p>
        </form>
      </div>
    );
  }

  const pageTitle = NAV.find((n) => n.id === page)?.label || "Dashboard";

  return (
    <div className="app-shell">
      {sidebarOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside id="admin-navigation" className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">N</div>
          <div>
            <div>NovelHub</div>
            <div style={{ fontSize: ".7rem", color: "var(--text-muted)", fontWeight: 400 }}>Admin Dashboard</div>
          </div>
        </div>
        <ul className="nav-list">
          {NAV.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className={`nav-item ${page === n.id ? "active" : ""}`}
                onClick={() => {
                  setPage(n.id);
                  setSidebarOpen(false);
                }}
              >
                <span className="nav-icon" aria-hidden="true">{n.label.slice(0, 1)}</span>
                {n.label}
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="btn" style={{ marginTop: 12 }} onClick={logout}>
          Sign out
        </button>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <button
            type="button"
            className="mobile-menu-btn"
            aria-label="Open navigation"
            aria-controls="admin-navigation"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen(true)}
          >
            {String.fromCharCode(9776)}
          </button>
          <h1>{pageTitle}</h1>
          <div className="top-search">
            <input
              placeholder="Search novels, authors, users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="top-actions">
            <button type="button" className="btn btn-sm" onClick={loadAll} disabled={loading}>
              {loading ? "Sync…" : "Refresh"}
            </button>
            <button
              type="button"
              className="icon-btn"
              title="Open notifications"
              aria-label={`Open notifications, ${notificationCount} unread`}
              aria-expanded={inboxOpen}
              onClick={() => setInboxOpen((open) => !open)}
            >
              {String.fromCharCode(128276)}{notificationCount > 0 && <span className="badge-dot">{notificationCount > 9 ? "9+" : notificationCount}</span>}
            </button>
            {inboxOpen && (
              <div className="admin-inbox-menu" role="dialog" aria-label="Admin notification inbox">
                <div className="admin-inbox-heading"><strong>Notifications</strong><span>{notificationCount} new</span></div>
                <div className="admin-inbox-list">
                  {inboxItems.map((item) => (
                    <article className="admin-inbox-item" key={item.id}>
                      <button type="button" className="admin-inbox-open" onClick={() => openInboxItem(item)}>
                        <span className={`admin-inbox-kind is-${item.kind}`}>{item.kind === "support" ? "CONTACT" : item.kind.toUpperCase()}</span>
                        <strong>{item.title}</strong>
                        <small>{item.sender}</small>
                        <span className="admin-inbox-message">{item.body}</span>
                      </button>
                      <button type="button" className="admin-inbox-dismiss" onClick={(event) => dismissInboxItem(event, item.id)} aria-label={`Ignore ${item.title}`}>Ignore</button>
                    </article>
                  ))}
                  {!inboxItems.length && <p className="admin-inbox-empty">You’re all caught up.</p>}
                </div>
                <button type="button" className="admin-inbox-all" onClick={() => { setInboxOpen(false); setPage("support"); }}>Open contact requests</button>
              </div>
            )}
            <div className="user-chip">
              <div className="avatar-fallback">{(session?.username || "A")[0].toUpperCase()}</div>
              <div>
                <div style={{ fontWeight: 600 }}>{session?.username || "Admin"}</div>
                <div style={{ fontSize: ".7rem", color: "var(--text-muted)" }}>v{contentVersion || "—"}</div>
              </div>
            </div>
          </div>
        </header>

        <main className="content">
          {page === "dashboard" && (
            <Dashboard
              stats={stats}
              books={books}
              authors={authors}
              supportRequests={supportRequests}
              onReview={(b) => {
                setPage("novels");
                setBookModal(b);
              }}
              onGoto={(p) => setPage(p)}
            />
          )}
          {page === "novels" && (
            <NovelsPage
              books={filteredBooks}
              genres={genres}
              filterGenre={filterGenre}
              setFilterGenre={setFilterGenre}
              filterStatus={filterStatus}
              setFilterStatus={setFilterStatus}
              onCreate={() => setBookModal({ ...EMPTY_BOOK })}
              onEdit={(b) => setBookModal({ ...b, chapters: b.chapters || [] })}
              onDelete={removeBook}
              onStatus={quickBookStatus}
              onSeedDummy={seedDummyData}
              storyImages={storyImages}
            />
          )}
                    {page === "home-sliders" && (
            <HomeSlidersPage books={books} onRefresh={loadAll} />
          )}
          {page === "home-hero-images" && <HomeHeroImagesPage />}
          {page === "library-hero" && <LibraryHeroPage />}

{page === "authors" && <AuthorsPage authors={authors} search={search} />}
          {page === "reviews" && <ReviewsPage />}
          {page === "users" && (
            <UsersPage profile={profile} supportRequests={supportRequests} onUpdateSupport={async (id, p) => {
              await updateSupportRequest(id, p);
              toast("Updated");
              loadAll();
            }} />
          )}
          {page === "reports" && <StoryReportsPage />}
          {page === "hashtags" && <HashtagsPage />}
          {page === "genres" && (
            <GenresPage
              categories={categories}
              onDeleteCategory={async (id) => {
                if (!window.confirm("Delete category?")) return;
                await deleteCategory(id);
                toast("Deleted");
                loadAll();
              }}
              openCategory={() => setCategoryModal({ ...EMPTY_CATEGORY })}
              editCategory={(category) => setCategoryModal({ ...category })}
            />
          )}
          {page === "revenue" && <RevenuePage books={books} />}
          {page === "moderation" && (
            <ModerationPage
              books={books}
              supportRequests={supportRequests}
              modTab={modTab}
              setModTab={setModTab}
              onStatus={quickBookStatus}
              onSupport={async (id, status) => {
                await updateSupportRequest(id, { status });
                toast("Request updated");
                loadAll();
              }}
            />
          )}
          {page === "announcements" && (
            <AnnouncementsPage
              items={notifications}
              onCreate={() => setNotifModal({ ...EMPTY_NOTIFICATION })}
              onEdit={(n) => setNotifModal({ ...n })}
              onDelete={async (id) => {
                if (!window.confirm("Delete announcement?")) return;
                await deleteNotification(id);
                toast("Deleted");
                loadAll();
              }}
            />
          )}
          {page === "chat" && <AdminChatPage selectedUserId={selectedChatUserId} />}
          {page === "support" && (
            <SupportRequestsPage
              items={supportRequests}
              focusTicketId={focusedSupportId}
              onUpdate={async (id, payload) => {
                await updateSupportRequest(id, payload);
                toast("Support request updated");
                loadAll();
              }}
            />
          )}
          {page === "settings" && (
            <SettingsPage
              writeScreen={writeScreen}
              profile={profile}
              onSaveWrite={async (p) => {
                await updateWriteScreen(p);
                toast("Write screen saved — Flutter will pick up on next sync");
                loadAll();
              }}
              onSaveProfile={async (p) => {
                await updateProfile(p);
                toast("Profile defaults saved");
                loadAll();
              }}
            />
          )}
        </main>
      </div>

      {bookModal && (
        <BookModal
          book={bookModal}
          storyImages={storyImages}
          onClose={() => setBookModal(null)}
          onSave={saveBook}
          onUpload={async (file) => {
            const res = await uploadImage(file);
            return res.path || res.cover_path || res.url || "";
          }}
        />
      )}
      {categoryModal && (
        <CategoryModal
          item={categoryModal}
          onClose={() => setCategoryModal(null)}
          onSave={async (p) => {
            if (categoryModal.id) await updateCategory(categoryModal.id, p);
            else await createCategory(p);
            toast("Genre saved");
            setCategoryModal(null);
            loadAll();
          }}
        />
      )}
      {notifModal && (
        <NotifModal
          item={notifModal}
          onClose={() => setNotifModal(null)}
          onSave={async (p) => {
            if (notifModal.id) await updateNotification(notifModal.id, p);
            else await createNotification(p);
            toast("Announcement saved — visible after app content sync");
            setNotifModal(null);
            loadAll();
          }}
        />
      )}

      {(success || error) && (
        <div className={`toast ${error ? "err" : "ok"}`}>{error || success}</div>
      )}
    </div>
  );
}

function AdminChatPage({ selectedUserId = null }) {
  const [conversations, setConversations] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadConversations() {
    try {
      const data = await listChatConversations();
      const items = asArray(data.items);
      setConversations(items);
      const requested = items.find((item) => Number(item.user_id) === Number(selectedUserId));
      if (requested) setSelectedUser(requested);
      else if (!selectedUser && items[0]) setSelectedUser(items[0]);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(user) {
    if (!user) return;
    try {
      const data = await getChatConversation(user.user_id);
      setMessages(asArray(data.items));
    } catch (e) {
      setError(String(e.message || e));
    }
  }

  useEffect(() => {
    loadConversations();
  }, [selectedUserId]);

  useEffect(() => {
    loadMessages(selectedUser);
  }, [selectedUser]);

  async function reply(e) {
    e.preventDefault();
    const message = draft.trim();
    if (!message || !selectedUser) return;
    try {
      await sendChatReply(selectedUser.user_id, message);
      setDraft("");
      await loadMessages(selectedUser);
      await loadConversations();
    } catch (err) {
      setError(String(err.message || err));
    }
  }

  return (
    <section className="page-section">
      <div className="page-heading">
        <div><h2>Live Chat</h2><p>Reply to readers from the app.</p></div>
        <button type="button" className="btn btn-sm" onClick={loadConversations}>Refresh</button>
      </div>
      {error && <div className="login-error">{error}</div>}
      <div className="chat-layout">
        <div className="panel chat-list">
          <div className="panel-header"><h3>Conversations</h3><span>{conversations.length}</span></div>
          {loading && <div className="empty">Loading conversations…</div>}
          {!loading && conversations.length === 0 && <div className="empty">No reader messages yet.</div>}
          {conversations.map((conversation) => (
            <button
              type="button"
              className={`chat-user ${selectedUser?.user_id === conversation.user_id ? "active" : ""}`}
              key={conversation.user_id}
              onClick={() => setSelectedUser(conversation)}
            >
              <strong>{conversation.display_name || conversation.email || `User #${conversation.user_id}`}</strong>
              <span>{conversation.message_count} messages</span>
              <small>{conversation.email}</small>
            </button>
          ))}
        </div>
        <div className="panel chat-thread">
          <div className="panel-header"><h3>{selectedUser?.display_name || "Select a conversation"}</h3></div>
          <div className="chat-messages">
            {messages.map((message) => (
              <div className={`chat-bubble ${message.sender === "admin" ? "admin" : "reader"}`} key={message.id}>
                <span>{message.message}</span>
                <small>{message.sender === "admin" ? "Admin" : "Reader"}</small>
              </div>
            ))}
            {!messages.length && selectedUser && <div className="empty">No messages in this conversation.</div>}
          </div>
          <form className="chat-compose" onSubmit={reply}>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a reply…" disabled={!selectedUser} />
            <button type="submit" className="btn" disabled={!selectedUser || !draft.trim()}>Send</button>
          </form>
        </div>
      </div>
    </section>
  );
}

function Dashboard({ stats, liveStats, books, authors, supportRequests, onReview, onGoto }) {
  const s = {
    novels: liveStats?.books ?? stats?.novels ?? books.length,
    authors: liveStats?.authors ?? stats?.authors ?? authors.length,
    published: liveStats?.published ?? stats?.published ?? 0,
    drafts: liveStats?.drafts ?? stats?.drafts ?? 0,
    users: liveStats?.users ?? stats?.users ?? 0,
    reviews: liveStats?.reviews ?? 0,
    reports: liveStats?.reports ?? 0,
    support: supportRequests?.length ?? 0,
  };
  const genreCounts = useMemo(() => {
    const m = {};
    for (const b of books) {
      const g = b.genre || "Other";
      m[g] = (m[g] || 0) + 1;
    }
    return Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, value]) => ({ label: label.slice(0, 8), value }));
  }, [books]);

  const lineSeries = [
    {
      name: "Novels",
      color: "#3b82f6",
      points: [30, 45, 40, 60, 55, 70, 65, 80, 75, 90, 95, 110],
    },
    {
      name: "Reads",
      color: "#14b8a6",
      points: [20, 35, 50, 45, 60, 70, 65, 85, 90, 100, 120, 140],
    },
  ];

  const pending = books.filter((b) => /pending|draft|review/i.test(b.status_text || "")).slice(0, 5);

  return (
    <>
      <div className="stats-row">
        <div className="stat-card" role="button" tabIndex={0} style={{ cursor: "pointer" }} onClick={() => onGoto?.("novels")} onKeyDown={(e) => e.key === "Enter" && onGoto?.("novels")}>
          <div className="label"><span className="stat-icon">▣</span> Total Novels</div>
          <p className="value">{s.novels}</p>
          <div className="trend">{stats.published} published · open Novels</div>
        </div>
        <div className="stat-card" role="button" tabIndex={0} style={{ cursor: "pointer" }} onClick={() => onGoto?.("authors")} onKeyDown={(e) => e.key === "Enter" && onGoto?.("authors")}>
          <div className="label"><span className="stat-icon">✎</span> Active Authors</div>
          <p className="value">{s.authors}</p>
          <div className="trend">Open Authors</div>
        </div>
        <div className="stat-card" role="button" tabIndex={0} style={{ cursor: "pointer" }} onClick={() => onGoto?.("users")} onKeyDown={(e) => e.key === "Enter" && onGoto?.("users")}>
          <div className="label"><span className="stat-icon">☺</span> Users</div>
          <p className="value">{s.users}</p>
          <div className="trend">All accounts</div>
        </div>
        <div className="stat-card" role="button" tabIndex={0} style={{ cursor: "pointer" }} onClick={() => onGoto?.("reviews")} onKeyDown={(e) => e.key === "Enter" && onGoto?.("reviews")}>
          <div className="label"><span className="stat-icon">★</span> Reviews</div>
          <p className="value">{s.reviews}</p>
          <div className="trend">Moderate reviews</div>
        </div>
        <div className="stat-card">
          <div className="label"><span className="stat-icon">✓</span> Published</div>
          <p className="value">{s.published}</p>
          <div className="trend">Live catalog</div>
        </div>
        <div className="stat-card" role="button" tabIndex={0} style={{ cursor: "pointer" }} onClick={() => onGoto?.("moderation")} onKeyDown={(e) => e.key === "Enter" && onGoto?.("moderation")}>
          <div className="label"><span className="stat-icon">＋</span> Pending Review</div>
          <p className="value">{stats.pending}</p>
          <div className="trend" style={{ color: "var(--orange)" }}>Open Moderation</div>
        </div>
        <div className="stat-card">
          <div className="label"><span className="stat-icon">✉</span> Support</div>
          <p className="value">{s.support}</p>
          <div className="trend">{stats.categories} categories</div>
        </div>
      </div>

      <div className="panel-grid">
        <div className="panel">
          <div className="panel-header">
            <h3>Novel Performance Overview</h3>
            <span className="meta">Illustrative trend</span>
          </div>
          <LineChart series={lineSeries} />
        </div>
        <div className="panel">
          <div className="panel-header">
            <h3>Content Moderation Queue</h3>
            <span className="meta">{pending.length} pending</span>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Author</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pending.length === 0 && (
                  <tr><td colSpan={4} className="empty">Queue empty</td></tr>
                )}
                {pending.map((b) => (
                  <tr key={b.id}>
                    <td>{b.title}</td>
                    <td>{b.author}</td>
                    <td><span className={`badge ${statusBadge(b.status_text)}`}>{b.status_text || "—"}</span></td>
                    <td>
                      <button type="button" className="btn btn-sm btn-primary" onClick={() => onReview(b)}>
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="panel-grid-3">
        <div className="panel">
          <div className="panel-header"><h3>Top Genres</h3></div>
          <BarChart data={genreCounts.length ? genreCounts : [{ label: "—", value: 1 }]} />
        </div>
        <div className="panel">
          <div className="panel-header"><h3>Recent Activity</h3></div>
          {books.slice(0, 5).map((b) => (
            <div className="activity-item" key={b.id}>
              <div className="avatar-fallback" style={{ width: 28, height: 28, fontSize: 10 }}>
                {(b.author || "?")[0]}
              </div>
              <div>
                <strong>{b.author}</strong> — {b.title}
              </div>
            </div>
          ))}
          {books.length === 0 && <div className="empty">No activity yet</div>}
        </div>
        <div className="panel">
          <div className="panel-header">
            <h3>Quick links</h3>
          </div>
          <div className="btn-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
            <button type="button" className="btn" onClick={() => onGoto("novels")}>Manage novels</button>
            <button type="button" className="btn" onClick={() => onGoto("moderation")}>Content moderation</button>
            <button type="button" className="btn" onClick={() => onGoto("announcements")}>Announcements</button>
            <button type="button" className="btn" onClick={() => onGoto("genres")}>Manage genres</button>
          </div>
        </div>
      </div>
    </>
  );
}

function NovelsPage({
  books,
  genres,
  filterGenre,
  setFilterGenre,
  filterStatus,
  setFilterStatus,
  onCreate,
  onEdit,
  onDelete,
  onStatus,
  onSeedDummy,
}) {
  return (
    <div className="layout-with-aside">
      <div>
        <div className="toolbar">
          <select value={filterGenre} onChange={(e) => setFilterGenre(e.target.value)}>
            {genres.map((g) => (
              <option key={g} value={g}>{g === "All" ? "All Genres" : g}</option>
            ))}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            {["All", "Draft", "Ongoing", "Completed", "Published"].map((s) => (
              <option key={s} value={s}>{s === "All" ? "All Status" : s}</option>
            ))}
          </select>
          <button type="button" className="btn" onClick={onSeedDummy} style={{ marginLeft: "auto" }} title="Insert sample novels via admin API">
            Seed dummy data
          </button>
          <button type="button" className="btn btn-primary" onClick={onCreate}>
            Create New Novel
          </button>
        </div>
        <div className="panel">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Cover</th>
                  <th>Title</th>
                  <th>Author</th>
                  <th>Genre</th>
                  <th>Status</th>
                  <th>Rating</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {books.map((b) => (
                  <tr key={b.id}>
                    <td>
                      {b.cover_path ? (
                        <img className="cover-thumb" src={coverUrl(b.cover_path)} alt="" />
                      ) : (
                        <div className="cover-thumb" />
                      )}
                    </td>
                    <td style={{ fontWeight: 600 }}>{b.title}</td>
                    <td>{b.author}</td>
                    <td>{b.genre || "—"}</td>
                    <td><span className={`badge ${statusBadge(b.status_text)}`}>{b.status_text || "—"}</span></td>
                    <td>{b.rating ?? "—"}</td>
                    <td>
                      <div className="btn-row">
                        <button type="button" className="btn btn-sm" onClick={() => onEdit(b)}>Edit</button>
                        <button type="button" className="btn btn-sm btn-danger" onClick={() => onDelete(b.id)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {books.length === 0 && (
                  <tr><td colSpan={7} className="empty">No novels match filters</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="aside-stack">
        <div className="panel">
          <div className="panel-header"><h3>Recent Novels</h3></div>
          {books.slice(0, 6).map((b) => (
            <div className="activity-item" key={b.id}>
              {b.cover_path ? (
                <img className="cover-thumb" style={{ width: 28, height: 40 }} src={coverUrl(b.cover_path)} alt="" />
              ) : (
                <div className="cover-thumb" style={{ width: 28, height: 40 }} />
              )}
              <div>
                <div style={{ fontWeight: 600, fontSize: ".8rem" }}>{b.title}</div>
                <div style={{ color: "var(--text-muted)", fontSize: ".72rem" }}>{b.author}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StoryReportsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await listStoryReports();
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (e) {
      setError(e.message || "Failed to load reports");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const flagged = items.filter((r) => Number(r.report_count || 0) >= 3);

  return (
    <>
      <div className="stats-row">
        <div className="stat-card"><div className="label">Reported stories</div><p className="value">{items.length}</p></div>
        <div className="stat-card"><div className="label">Flagged (3+ reports)</div><p className="value">{flagged.length}</p></div>
        <div className="stat-card"><div className="label">Rule</div><p className="value" style={{fontSize:14}}>3 unique accounts</p></div>
      </div>
      <div className="panel">
        <div className="panel-header">
          <h3>Story reports</h3>
          <button type="button" className="btn-ghost" onClick={load}>Refresh</button>
        </div>
        {error && <div className="error-banner">{error}</div>}
        {loading ? <p>Loading…</p> : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Author</th>
                  <th>Reports</th>
                  <th>Status</th>
                  <th>Last report</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr><td colSpan={6} style={{color:"var(--text-muted)"}}>No reports yet. Stories appear here after users report them.</td></tr>
                )}
                {items.map((r) => (
                  <tr key={r.book_id} style={Number(r.report_count)>=3 ? {background:"#fff5f5"} : undefined}>
                    <td><strong>{r.title || `#${r.book_id}`}</strong></td>
                    <td>{r.author || "—"}</td>
                    <td>
                      <span className={Number(r.report_count)>=3 ? "badge danger" : "badge"}>
                        {r.report_count}
                      </span>
                      {Number(r.report_count)>=3 ? " · Admin queue" : ""}
                    </td>
                    <td>{r.status_text || "—"}</td>
                    <td>{r.last_report_at ? String(r.last_report_at).slice(0,19) : "—"}</td>
                    <td>
                      <button
                        type="button"
                        className="btn-primary"
                        style={{fontSize:12, padding:"4px 10px"}}
                        disabled={busyId === r.book_id}
                        onClick={async () => {
                          setBusyId(r.book_id);
                          setError("");
                          try {
                            await republishStory(r.book_id);
                            await load();
                          } catch (e) {
                            setError(e.message || "Re-publish failed");
                          } finally {
                            setBusyId(null);
                          }
                        }}
                      >
                        {busyId === r.book_id ? "…" : "Re-publish"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

async function validateTagCover(file) {
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    throw new Error("Choose a JPG, PNG, or WebP image.");
  }
  const previewUrl = URL.createObjectURL(file);
  try {
    await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = resolve;
      image.onerror = () => reject(new Error("This image could not be opened."));
      image.src = previewUrl;
    });
  } finally {
    URL.revokeObjectURL(previewUrl);
  }
}

function TagCoverPreview({ file, path, name }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    if (!file) {
      setSrc(coverUrl(path));
      return undefined;
    }
    const preview = URL.createObjectURL(file);
    setSrc(preview);
    return () => URL.revokeObjectURL(preview);
  }, [file, path]);
  return src
    ? <img src={src} alt={`${name} tag cover preview`} style={{ width: 112, height: 48, objectFit: "cover", borderRadius: 6 }} />
    : <span className="meta">No cover</span>;
}

function HashtagsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [newCover, setNewCover] = useState(null);
  const [coverFiles, setCoverFiles] = useState({});
  const [uploadingTagId, setUploadingTagId] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await listAdminTags();
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (e) {
      setError(e.message || "Failed to load hashtags");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function onCreate(e) {
    e.preventDefault();
    const n = name.trim().replace(/^#/, "");
    if (!n) return;
    setBusy(true);
    setError("");
    try {
      const uploaded = newCover ? await uploadTagCoverImage(newCover) : null;
      await createAdminTag({
        name: n,
        cover_path: uploaded?.path || uploaded?.cover_path || uploaded?.url || "",
      });
      setName("");
      setNewCover(null);
      await load();
    } catch (err) {
      setError(err.message || "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRename(tag) {
    const next = window.prompt("Rename hashtag", tag.name);
    if (!next || !next.trim()) return;
    setBusy(true);
    try {
      await updateAdminTag(tag.id, {
        name: next.trim().replace(/^#/, ""),
        cover_path: tag.cover_path || "",
        description: tag.description || "",
      });
      await load();
    } catch (err) {
      setError(err.message || "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function onCoverChange(tag, file) {
    if (!file) return;
    setError("");
    try {
      await validateTagCover(file);
      setCoverFiles((current) => ({ ...current, [tag.id]: file }));
    } catch (validationError) {
      setError(validationError.message || "That tag cover is not valid.");
    }
  }

  async function saveTagCover(tag) {
    const file = coverFiles[tag.id];
    if (!file || busy) return;
    setBusy(true);
    setUploadingTagId(tag.id);
    setError("");
    try {
      const uploaded = await uploadTagCoverImage(file);
      const coverPath = uploaded?.path || uploaded?.cover_path || uploaded?.url || "";
      if (!coverPath) throw new Error("The uploaded image did not return a cover path.");
      await updateAdminTag(tag.id, {
        name: tag.name,
        cover_path: coverPath,
        description: tag.description || "",
      });
      setCoverFiles((current) => {
        const next = { ...current };
        delete next[tag.id];
        return next;
      });
      await load();
    } catch (saveError) {
      setError(saveError.message || "Could not update this tag cover.");
    } finally {
      setUploadingTagId(null);
      setBusy(false);
    }
  }

  async function onDelete(tag) {
    if (!window.confirm(`Delete #${tag.name}? Stories will lose this tag.`)) return;
    setBusy(true);
    try {
      await deleteAdminTag(tag.id);
      await load();
    } catch (err) {
      setError(err.message || "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="panel">
        <div className="panel-header"><h3>Hashtag management</h3></div>
        <p style={{color:"var(--text-muted)", marginBottom:12}}>
          Authors can only attach hashtags you create here (max 3 per story).
        </p>
        <form onSubmit={onCreate} style={{display:"flex", gap:8, marginBottom:16, flexWrap:"wrap", alignItems:"center"}}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New hashtag (without #)"
            style={{flex:1, minWidth:180}}
          />
          <label className="btn-ghost">
            Choose cover
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) validateTagCover(file).then(() => { setNewCover(file); setError(""); }).catch((err) => setError(err.message));
                e.target.value = "";
              }}
            />
          </label>
          <TagCoverPreview file={newCover} name={name || "New hashtag"} />
          <button type="submit" className="btn-primary" disabled={busy}>Add hashtag</button>
          <button type="button" className="btn-ghost" onClick={load}>Refresh</button>
        </form>
        {error && <div className="error-banner">{error}</div>}
        {loading ? <p>Loading…</p> : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Hashtag</th><th>Cover</th><th>Stories</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr><td colSpan={4} style={{color:"var(--text-muted)"}}>No hashtags yet. Add the first one.</td></tr>
                )}
                {items.map((t) => (
                  <tr key={t.id}>
                    <td><strong>#{t.name}</strong></td>
                    <td>
                      <div style={{display:"grid", gap:6}}>
                        <TagCoverPreview file={coverFiles[t.id]} path={t.cover_path} name={t.name} />
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          aria-label={`Choose a cover for #${t.name}`}
                          onChange={(e) => { void onCoverChange(t, e.target.files?.[0]); e.target.value = ""; }}
                        />
                        {coverFiles[t.id] ? (
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={() => saveTagCover(t)}
                            disabled={busy}
                          >
                            {uploadingTagId === t.id ? "Uploading…" : "Save cover"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td>{t.book_count ?? 0}</td>
                    <td style={{display:"flex", gap:8}}>
                      <button type="button" className="btn-ghost" onClick={() => onRename(t)} disabled={busy}>Rename</button>
                      <button type="button" className="btn-danger" onClick={() => onDelete(t)} disabled={busy}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function RevenuePage({ books }) {
  const published = books.filter((book) => !/draft|unpublished|private|pending/i.test(book.status_text || ""));
  const rated = books.map((book) => Number(book.rating)).filter((rating) => Number.isFinite(rating) && rating > 0);
  const genres = new Map();
  books.forEach((book) => {
    const genre = book.primary_genre || book.genre || "Unclassified";
    genres.set(genre, (genres.get(genre) || 0) + 1);
  });
  const genreCounts = [...genres.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  const hasViews = books.some((book) => book.view_count != null);
  const totalViews = hasViews ? books.reduce((sum, book) => sum + (Number(book.view_count) || 0), 0) : null;
  const averageRating = rated.length ? (rated.reduce((sum, rating) => sum + rating, 0) / rated.length).toFixed(1) : "—";

  return (
    <>
      <div className="stats-row">
        <div className="stat-card"><div className="label">Stories in catalog</div><p className="value">{books.length.toLocaleString()}</p><div className="trend">Live catalog data</div></div>
        <div className="stat-card"><div className="label">Available to readers</div><p className="value">{published.length.toLocaleString()}</p><div className="trend">Excludes draft and pending work</div></div>
        <div className="stat-card"><div className="label">Average rating</div><p className="value">{averageRating}</p><div className="trend">Across {rated.length.toLocaleString()} rated stories</div></div>
        <div className="stat-card"><div className="label">Story views</div><p className="value">{totalViews == null ? "—" : totalViews.toLocaleString()}</p><div className="trend">{hasViews ? "Reported by the catalog API" : "View totals are not available from the API"}</div></div>
      </div>
      <div className="panel">
        <div className="panel-header"><div><h3>Stories by genre</h3><p className="meta">Genre totals from the current catalog.</p></div></div>
        {genreCounts.length ? <BarChart data={genreCounts} /> : <p className="empty">Genre insights will appear when stories are added to the catalog.</p>}
      </div>
    </>
  );
}

function ModerationPage({ books, supportRequests, modTab, setModTab, onStatus, onSupport }) {
  const pending = books.filter((b) => /pending|draft|review/i.test(b.status_text || ""));
  return (
    <>
      <div className="tabs">
        <button type="button" className={`tab ${modTab === "novels" ? "active" : ""}`} onClick={() => setModTab("novels")}>
          Novels ({pending.length} pending)
        </button>
        <button type="button" className={`tab ${modTab === "support" ? "active" : ""}`} onClick={() => setModTab("support")}>
          Support ({supportRequests.length})
        </button>
      </div>
      {modTab === "novels" && (
        <div className="panel">
          <table className="data">
            <thead>
              <tr><th>Title</th><th>Author</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {pending.map((b) => (
                <tr key={b.id}>
                  <td>{b.title}</td>
                  <td>{b.author}</td>
                  <td><span className={`badge ${statusBadge(b.status_text)}`}>{b.status_text}</span></td>
                  <td className="btn-row">
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => onStatus(b, "Ongoing")}>Approve (Ongoing)</button>
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => onStatus(b, "Draft")}>Reject (Draft)</button>
                  </td>
                </tr>
              ))}
              {pending.length === 0 && <tr><td colSpan={4} className="empty">Nothing pending</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {modTab === "support" && (
        <div className="panel">
          <table className="data">
            <thead>
              <tr><th>Email</th><th>Subject</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {supportRequests.map((r) => (
                <tr key={r.id}>
                  <td>{r.email}</td>
                  <td>{r.subject || r.issue}</td>
                  <td><span className={`badge ${statusBadge(r.status)}`}>{r.status || "open"}</span></td>
                  <td className="btn-row">
                    <button type="button" className="btn btn-sm" onClick={() => onSupport(r.id, "resolved")}>Resolve</button>
                    <button type="button" className="btn btn-sm" onClick={() => onSupport(r.id, "closed")}>Close</button>
                  </td>
                </tr>
              ))}
              {supportRequests.length === 0 && <tr><td colSpan={4} className="empty">No support tickets</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function AnnouncementsPage({ items, onCreate, onEdit, onDelete }) {
  return (
    <>
      <div className="toolbar">
        <button type="button" className="btn btn-primary" onClick={onCreate} style={{ marginLeft: "auto" }}>
          Create New Announcement
        </button>
      </div>
      <div className="panel">
        <table className="data">
          <thead>
            <tr><th>Title</th><th>Tab</th><th>Message</th><th>When</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {items.map((n) => (
              <tr key={n.id}>
                <td style={{ fontWeight: 600 }}>{n.title}</td>
                <td>{n.tab || n.tab_name}</td>
                <td style={{ maxWidth: 280 }}>{(n.message || "").slice(0, 80)}</td>
                <td>{n.created_at}</td>
                <td className="btn-row">
                  <button type="button" className="btn btn-sm" onClick={() => onEdit(n)}>Edit</button>
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => onDelete(n.id)}>Delete</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={5} className="empty">No announcements</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SettingsPage({
  writeScreen,
  profile,
  onSaveWrite,
  onSaveProfile,
}) {
  const [ws, setWs] = useState(writeScreen);
  const [pf, setPf] = useState(profile);
  useEffect(() => setWs(writeScreen), [writeScreen]);
  useEffect(() => setPf(profile), [profile]);

  return (
    <div className="layout-with-aside">
      <div className="aside-stack">
        <div className="panel">
          <div className="panel-header"><h3>Write screen labels</h3></div>
          <div className="field" style={{ marginBottom: 8 }}>
            <label>Filter label</label>
            <input value={ws.filter_label || ""} onChange={(e) => setWs({ ...ws, filter_label: e.target.value })} />
          </div>
          <div className="field" style={{ marginBottom: 8 }}>
            <label>Sort label</label>
            <input value={ws.sort_label || ""} onChange={(e) => setWs({ ...ws, sort_label: e.target.value })} />
          </div>
          <div className="field" style={{ marginBottom: 8 }}>
            <label>Empty title</label>
            <input value={ws.empty_title || ""} onChange={(e) => setWs({ ...ws, empty_title: e.target.value })} />
          </div>
          <button type="button" className="btn btn-primary" onClick={() => onSaveWrite(ws)}>Save write screen</button>
        </div>
      </div>
      <div className="panel">
        <div className="panel-header"><h3>Default profile stats</h3></div>
        <div className="form-grid">
          <div className="field"><label>Display name</label>
            <input value={pf.display_name || ""} onChange={(e) => setPf({ ...pf, display_name: e.target.value })} /></div>
          <div className="field"><label>Username</label>
            <input value={pf.username || ""} onChange={(e) => setPf({ ...pf, username: e.target.value })} /></div>
          <div className="field"><label>Following</label>
            <input type="number" value={pf.following ?? 0} onChange={(e) => setPf({ ...pf, following: Number(e.target.value) })} /></div>
          <div className="field"><label>Followers</label>
            <input type="number" value={pf.followers ?? 0} onChange={(e) => setPf({ ...pf, followers: Number(e.target.value) })} /></div>
        </div>
        <button type="button" className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => onSaveProfile(pf)}>
          Save profile defaults
        </button>
        <p style={{ marginTop: 16, fontSize: ".8rem", color: "var(--text-muted)" }}>
          Changes write to the database via <code>/api/admin/*</code>. The Flutter app polls content version and reloads bootstrap — novels, categories, and notifications appear on Home / Library after sync.
        </p>
      </div>
    </div>
  );
}

function GenresPage({ categories, onDeleteCategory, openCategory, editCategory }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <h3>Categories / Genres</h3>
        <button type="button" className="btn btn-sm btn-primary" onClick={openCategory}>Add genre</button>
      </div>
      <table className="data">
        <thead><tr><th>Image</th><th>Name</th><th>Group</th><th></th></tr></thead>
        <tbody>
          {categories.map((category) => (
            <tr key={category.id}>
              <td>
                {category.image_path ? (
                  <img src={category.image_path.startsWith("http") ? category.image_path : `${API_BASE_URL}${category.image_path}`} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6 }} />
                ) : (
                  <span style={{ color: "var(--text-muted)" }}>—</span>
                )}
              </td>
              <td>{category.name}</td>
              <td>{category.tab_group}</td>
              <td className="btn-row">
                <button type="button" className="btn btn-sm" onClick={() => editCategory(category)}>Edit</button>
                <button type="button" className="btn btn-sm btn-danger" onClick={() => onDeleteCategory(category.id)}>Del</button>
              </td>
            </tr>
          ))}
          {categories.length === 0 && <tr><td colSpan={4} className="empty">No genres available</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function BookModal({ book, storyImages, onClose, onSave, onUpload }) {
  const [form, setForm] = useState(book);
  const [uploading, setUploading] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{book.id ? "Edit novel" : "Create novel"}</h2>
        <div className="form-grid">
          <div className="field full"><label>Title</label>
            <input value={form.title} onChange={(e) => set("title", e.target.value)} /></div>
          <div className="field"><label>Author</label>
            <input value={form.author} onChange={(e) => set("author", e.target.value)} /></div>
          <div className="field"><label>Genre</label>
            <input value={form.genre || ""} onChange={(e) => set("genre", e.target.value)} /></div>
          <div className="field"><label>Status</label>
            <input value="Ongoing" disabled readOnly title="Admin novels default to Ongoing (public)" />
            <input type="hidden" value="Ongoing" />
          </div>
          <div className="field"><label>Section</label>
            <select value={form.section_name || "recently_updated"} onChange={(e) => set("section_name", e.target.value)}>
              {["recently_updated", "recently_completed", "featured", "trending", "new_releases", "popular", "discover", "editor_picks", "weekend_binge", "romance", "fantasy", "custom"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            {form.section_name === "custom" && (
              <input
                style={{ marginTop: 8 }}
                placeholder="Custom slider section name"
                value={form.custom_section_name || ""}
                onChange={(e) => {
                  const custom = e.target.value.trim();
                  set("custom_section_name", custom);
                  set("section_name", custom || "custom");
                }}
              />
            )}
          </div>
          <div className="field"><label>Rating</label>
            <input type="number" step="0.1" value={form.rating ?? 0} onChange={(e) => set("rating", Number(e.target.value))} /></div>
          <div className="field full"><label>Description</label>
            <textarea value={form.description || ""} onChange={(e) => set("description", e.target.value)} /></div>
          <div className="field full"><label>Cover path</label>
            <input value={form.cover_path || ""} onChange={(e) => set("cover_path", e.target.value)} />
            <input
              type="file"
              accept="image/*"
              style={{ marginTop: 8 }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploading(true);
                try {
                  const path = await onUpload(file);
                  if (path) set("cover_path", path);
                } finally {
                  setUploading(false);
                }
              }}
            />
            {uploading && <span style={{ fontSize: ".8rem" }}>Uploading…</span>}
          </div>
        </div>
        <div className="field full" style={{ marginTop: 12 }}>
          <label>Chapters (optional — added on save)</label>
          <p className="meta" style={{ marginBottom: 8 }}>
            Novels publish automatically. Add one or more chapters below.
          </p>
          {(form.chapters || []).map((ch, idx) => (
            <div key={idx} style={{ border: "1px solid var(--border, #333)", borderRadius: 8, padding: 10, marginBottom: 8 }}>
              <div className="field" style={{ marginBottom: 6 }}>
                <label>Chapter {idx + 1} title</label>
                <input
                  value={ch.title || ""}
                  onChange={(e) => {
                    const next = [...(form.chapters || [])];
                    next[idx] = { ...next[idx], title: e.target.value };
                    set("chapters", next);
                  }}
                />
              </div>
              <div className="field">
                <label>Content</label>
                <textarea
                  rows={4}
                  value={ch.content || ""}
                  onChange={(e) => {
                    const next = [...(form.chapters || [])];
                    next[idx] = { ...next[idx], content: e.target.value };
                    set("chapters", next);
                  }}
                />
              </div>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                style={{ marginTop: 6 }}
                onClick={() => {
                  const next = (form.chapters || []).filter((_, i) => i !== idx);
                  set("chapters", next);
                }}
              >
                Remove chapter
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => set("chapters", [...(form.chapters || []), { title: "", content: "" }])}
          >
            + Add chapter
          </button>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onSave({ ...form, status_text: "Ongoing" }, book.id)}
          >
            Save &amp; publish
          </button>
        </div>
      </div>
    </div>
  );
}

function CategoryModal({ item, onClose, onSave }) {
  const [form, setForm] = useState(item);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");

  async function onPickFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr("");
    setUploading(true);
    try {
      const res = await uploadImage(file);
      const path = res.path || res.cover_path || res.url || "";
      if (!path) throw new Error("Upload returned empty path");
      setForm((f) => ({ ...f, image_path: path }));
    } catch (ex) {
      setErr(ex.message || "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  const preview = form.image_path
    ? (form.image_path.startsWith("http")
        ? form.image_path
        : `${API_BASE_URL}${form.image_path.startsWith("/") ? "" : "/"}${form.image_path}`)
    : "";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{item.id ? "Edit category / genre" : "New category / genre"}</h2>
        <div className="field" style={{ marginBottom: 8 }}>
          <label>Name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="field" style={{ marginBottom: 8 }}>
          <label>Tab group</label>
          <select
            value={form.tab_group || "explore"}
            onChange={(e) => setForm({ ...form, tab_group: e.target.value })}
          >
            <option value="explore">explore</option>
            <option value="discover">discover</option>
          </select>
        </div>
        <div className="field" style={{ marginBottom: 8 }}>
          <label>Genre image</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <label className="btn btn-sm" style={{ cursor: uploading ? "wait" : "pointer" }}>
              {uploading ? "Uploading…" : "Upload image"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: "none" }}
                disabled={uploading}
                onChange={onPickFile}
              />
            </label>
            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>or paste path/URL</span>
          </div>
          <input
            style={{ marginTop: 8 }}
            value={form.image_path || ""}
            onChange={(e) => setForm({ ...form, image_path: e.target.value })}
            placeholder="/api/media/123 or https://..."
          />
          {err ? <div style={{ color: "#c00", marginTop: 6, fontSize: 13 }}>{err}</div> : null}
          {preview ? (
            <div style={{ marginTop: 8 }}>
              <img
                src={preview}
                alt="preview"
                style={{ maxWidth: 120, maxHeight: 120, borderRadius: 8, objectFit: "cover" }}
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
              <div style={{ marginTop: 6 }}>
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  onClick={() => setForm({ ...form, image_path: "" })}
                >
                  Remove image
                </button>
              </div>
            </div>
          ) : null}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={() => onSave(form)} disabled={uploading}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function NotifModal({ item, onClose, onSave }) {
  const [form, setForm] = useState(item);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{item.id ? "Edit announcement" : "New announcement"}</h2>
        <div className="field" style={{ marginBottom: 8 }}>
          <label>Title</label>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className="field" style={{ marginBottom: 8 }}>
          <label>Tab</label>
          <input value={form.tab || ""} onChange={(e) => setForm({ ...form, tab: e.target.value })} />
        </div>
        <div className="field" style={{ marginBottom: 8 }}>
          <label>Message</label>
          <textarea value={form.message || ""} onChange={(e) => setForm({ ...form, message: e.target.value })} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={() => onSave(form)}>Save</button>
        </div>
      </div>
    </div>
  );
}

function SupportRequestsPage({ items = [], onUpdate, focusTicketId = null }) {
  const list = Array.isArray(items) ? items : [];
  const [replyFor, setReplyFor] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!focusTicketId) return;
    const ticket = list.find((item) => Number(item.id) === Number(focusTicketId));
    if (ticket) {
      setReplyFor(ticket.id);
      setReplyText(ticket.admin_reply || "");
    }
  }, [focusTicketId]);

  const sendReply = async () => {
    if (!replyFor || !replyText.trim()) return;
    setBusy(true);
    try {
      await onUpdate?.(replyFor, { status: "resolved", admin_reply: replyText.trim() });
      setReplyFor(null);
      setReplyText("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-body">
      <div className="page-header-row">
        <h2>Contact Us messages</h2>
        <span className="muted">{list.length} total</span>
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>ID</th>
              <th>From</th>
              <th>Subject</th>
              <th>Message</th>
              <th>Status</th>
              <th>Admin reply</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td>
                  <div>{r.first_name || "—"}</div>
                  <div className="muted" style={{ fontSize: "0.8rem" }}>{r.email || ""}</div>
                </td>
                <td>{r.subject || "—"}</td>
                <td>
                  <div>{r.issue || "—"}</div>
                  <div className="muted" style={{ fontSize: "0.8rem", maxWidth: 280, whiteSpace: "pre-wrap" }}>
                    {(r.description || "").slice(0, 220)}
                    {(r.description || "").length > 220 ? "…" : ""}
                  </div>
                </td>
                <td>
                  <span className={`badge ${String(r.status || "").toLowerCase() === "resolved" ? "ok" : "warn"}`}>
                    {r.status || "open"}
                  </span>
                </td>
                <td style={{ maxWidth: 220, whiteSpace: "pre-wrap", fontSize: "0.85rem" }}>
                  {r.admin_reply || "—"}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => { setReplyFor(r.id); setReplyText(r.admin_reply || ""); }}
                  >
                    Reply
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ marginLeft: 6 }}
                    onClick={() => onUpdate?.(r.id, { status: "resolved" })}
                  >
                    Resolve
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ marginLeft: 6 }}
                    onClick={() => onUpdate?.(r.id, { status: "open" })}
                  >
                    Reopen
                  </button>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">
                  No Contact Us messages yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {replyFor != null && (
        <div className="modal-backdrop" onClick={() => !busy && setReplyFor(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Reply to ticket #{replyFor}</h2>
            <p className="muted" style={{ marginBottom: 8 }}>
              Your reply is saved and shown to the user as a notification.
            </p>
            <div className="field" style={{ marginBottom: 8 }}>
              <label>Reply message</label>
              <textarea
                rows={5}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Type your reply to the user…"
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn" disabled={busy} onClick={() => setReplyFor(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={busy || !replyText.trim()} onClick={sendReply}>
                {busy ? "Sending…" : "Send reply"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Admin UI: manage Discover home story-card slider sections. */
function HomeSlidersPage({ books = [], onRefresh }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    section_key: "",
    label: "",
    description: "",
    sort_order: 100,
    is_active: true,
  });
  const [editingId, setEditingId] = useState(null);
  const [selectedSection, setSelectedSection] = useState(null);
  const [sectionBooks, setSectionBooks] = useState([]);
  const [assignIds, setAssignIds] = useState("");
  const [busy, setBusy] = useState(false);
  const [removingBookId, setRemovingBookId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await listHomeSections();
      const nextItems = Array.isArray(res?.items) ? res.items : [];
      setItems(nextItems);
      setSelectedSection((current) =>
        nextItems.find((item) => item.id === current?.id) || current || nextItems[0] || null
      );
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selectedSection?.section_key) {
      setSectionBooks([]);
      return undefined;
    }
    let cancelled = false;
    setSectionBooks([]);
    listHomeSectionBooks(selectedSection.section_key)
      .then((res) => {
        if (!cancelled) setSectionBooks(Array.isArray(res?.items) ? res.items : []);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e?.message || String(e));
          setSectionBooks([]);
        }
      });
    return () => { cancelled = true; };
  }, [selectedSection?.section_key]);

  const resetForm = () => {
    setEditingId(null);
    setForm({ section_key: "", label: "", description: "", sort_order: 100, is_active: true });
  };
  const startEdit = (row) => {
    setEditingId(row.id);
    setForm({ section_key: row.section_key || "", label: row.label || "", description: row.description || "", sort_order: row.sort_order ?? 100, is_active: !!row.is_active });
  };
  const openBooks = (row) => setSelectedSection(row);
  const save = async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      if (editingId) await updateHomeSection(editingId, form); else await createHomeSection(form);
      resetForm(); await load(); onRefresh?.();
    } catch (e) { setError(e?.message || String(e)); }
    finally { setBusy(false); }
  };
  const remove = async (id) => {
    if (!window.confirm("Delete this home slider section? Its books will move to Recently Updated.")) return;
    setBusy(true); setError("");
    try {
      await deleteHomeSection(id);
      if (selectedSection?.id === id) { setSelectedSection(null); setSectionBooks([]); }
      await load(); onRefresh?.();
    } catch (e) { setError(e?.message || String(e)); }
    finally { setBusy(false); }
  };
  const refreshSelectedBooks = async () => {
    if (!selectedSection?.section_key) return;
    const result = await listHomeSectionBooks(selectedSection.section_key);
    setSectionBooks(Array.isArray(result?.items) ? result.items : []);
  };
  const assign = async () => {
    if (!selectedSection) return;
    const ids = assignIds.split(/[\s,]+/).map((value) => Number.parseInt(value, 10)).filter((id) => Number.isInteger(id) && id > 0);
    if (!ids.length) { setError("Enter one or more valid novel IDs."); return; }
    setBusy(true); setError("");
    try {
      const result = await assignBooksToHomeSection(selectedSection.section_key, ids);
      if (Number(result?.updated) === 0) throw new Error("No matching novels were updated. Check the IDs and try again.");
      setAssignIds(""); await refreshSelectedBooks(); await load(); onRefresh?.();
    } catch (e) { setError(e?.message || String(e)); }
    finally { setBusy(false); }
  };
  const setFromDropdown = async (bookId) => {
    if (!selectedSection || !bookId) return;
    setBusy(true); setError("");
    try {
      const result = await assignBooksToHomeSection(selectedSection.section_key, [Number(bookId)]);
      if (Number(result?.updated) === 0) throw new Error("That novel could not be assigned. Refresh the catalog and try again.");
      await refreshSelectedBooks(); await load(); onRefresh?.();
    } catch (e) { setError(e?.message || String(e)); }
    finally { setBusy(false); }
  };
  const removeBook = async (book) => {
    setRemovingBookId(book.id); setError("");
    try {
      const result = await assignBooksToHomeSection("recently_updated", [Number(book.id)]);
      if (Number(result?.updated) === 0) throw new Error("This novel was not moved. Refresh and try again.");
      await refreshSelectedBooks(); await load(); onRefresh?.();
    } catch (e) { setError(e?.message || String(e)); }
    finally { setRemovingBookId(null); }
  };
  const coverUrl = (path) => {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    return `${API_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
  };
  const displayedBooks = sectionBooks.slice(0, 6);

  return (
    <div className="page-section home-sliders-page">
      <header className="home-sliders-heading">
        <div>
          <span className="home-sliders-eyebrow">DISCOVER ? CONTENT STUDIO</span>
          <h2>Home sliders</h2>
          <p>Shape the story shelves readers see first. Changes are saved to your catalog and sync to the app.</p>
        </div>
        <div className="home-sliders-heading-actions">
          <span className="home-sliders-live"><i /> {items.filter((item) => item.is_active).length} live</span>
          <button type="button" className="btn" onClick={load} disabled={loading || busy}>
            {loading ? "Refreshing?" : "Refresh sections"}
          </button>
        </div>
      </header>

      {error ? <div className="home-sliders-error" role="alert">{error}</div> : null}

      <section className="home-sliders-preview" aria-label="Selected home slider preview">
        <div className="home-sliders-preview-copy">
          <span className="home-sliders-eyebrow">LIVE SHELF PREVIEW</span>
          <h3>{selectedSection?.label || "Your next featured shelf"}</h3>
          <p>{selectedSection?.description || "Choose a section below and curate the stories shown on the home screen."}</p>
          <div className="home-sliders-preview-meta">
            <span className={selectedSection?.is_active ? "is-live" : ""}><i />{selectedSection?.is_active ? "Visible on home" : "Hidden from home"}</span>
            <span>{selectedSection?.book_count ?? sectionBooks.length} stories</span>
          </div>
        </div>
        <div className="home-sliders-rail" aria-label="Stories in selected slider">
          {displayedBooks.length ? displayedBooks.map((book, index) => (
            <article className={`home-sliders-book-preview${index === 0 ? " is-featured" : ""}`} key={book.id}>
              {coverUrl(book.cover_path)
                ? <img src={coverUrl(book.cover_path)} alt="" loading="lazy" />
                : <span className="home-sliders-cover-fallback">{(book.title || "N").slice(0, 1)}</span>}
              <div><strong>{book.title}</strong><small>{book.author || "NovelHub story"}</small></div>
            </article>
          )) : <div className="home-sliders-rail-empty">Select a shelf with stories to preview its card rail.</div>}
        </div>
      </section>

      <div className="home-sliders-workspace">
        <section className="home-sliders-section-list" aria-labelledby="home-slider-sections-title">
          <div className="home-sliders-section-heading">
            <div><span className="home-sliders-eyebrow">YOUR COLLECTION</span><h3 id="home-slider-sections-title">Sections <span>{items.length}</span></h3></div>
            <span className="home-sliders-section-hint">Select a shelf to preview and edit it</span>
          </div>
          {loading && !items.length ? <div className="home-sliders-empty">Loading home sections?</div> : null}
          {!loading && !items.length ? (
            <div className="home-sliders-empty"><strong>No shelves yet</strong><span>Create a section to start curating the home page.</span></div>
          ) : null}
          <div className="home-sliders-section-cards">
            {items.map((row, index) => (
              <article className={`home-sliders-section-card${selectedSection?.id === row.id ? " is-selected" : ""}`} key={row.id}>
                <button type="button" className="home-sliders-section-select" onClick={() => openBooks(row)} aria-pressed={selectedSection?.id === row.id}>
                  <span className="home-sliders-section-number">{String(index + 1).padStart(2, "0")}</span>
                  <span className="home-sliders-section-copy"><strong>{row.label}</strong><small>{row.description || row.section_key}</small></span>
                  <span className={`home-sliders-status${row.is_active ? " is-active" : ""}`}>{row.is_active ? "Live" : "Hidden"}</span>
                  <span className="home-sliders-section-count"><strong>{row.book_count ?? 0}</strong><small>stories</small></span>
                </button>
                <div className="home-sliders-section-tools">
                  <code>{row.section_key}</code><span>Order {row.sort_order}</span>
                  <div>
                    <button type="button" className="btn btn-sm" onClick={() => startEdit(row)}>Edit</button>
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(row.id)} disabled={busy}>Delete</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className="home-sliders-editor" aria-labelledby="home-slider-editor-title">
          <div className="home-sliders-editor-heading">
            <span className="home-sliders-eyebrow">SECTION SETTINGS</span>
            <h3 id="home-slider-editor-title">{editingId ? "Edit shelf" : "Create a shelf"}</h3>
            <p>{editingId ? "Update the label, order, or visibility of this shelf." : "Give this story rail a clear name and place it in the home feed."}</p>
          </div>
          <form onSubmit={save} className="home-sliders-form">
            <label>Display name<input required value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Editor?s picks" /></label>
            <label>Section key<input required value={form.section_key} onChange={(e) => setForm({ ...form, section_key: e.target.value })} placeholder="editors_picks" disabled={!!editingId} /><small>Must match the story section key in the catalog.</small></label>
            <label>Short description<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Fresh stories selected for readers" /></label>
            <div className="home-sliders-form-row">
              <label>Display order<input type="number" min="0" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) || 0 })} /></label>
              <label className="home-sliders-toggle"><input type="checkbox" checked={!!form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /><span><strong>Show on home</strong><small>Make this shelf visible</small></span></label>
            </div>
            <div className="home-sliders-form-actions">
              <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Saving?" : editingId ? "Save changes" : "Create shelf"}</button>
              {editingId ? <button type="button" className="btn" onClick={resetForm} disabled={busy}>Cancel</button> : null}
            </div>
          </form>
        </aside>
      </div>

      <section className="home-sliders-book-manager" aria-labelledby="home-slider-books-title">
        <div className="home-sliders-book-manager-heading">
          <div><span className="home-sliders-eyebrow">CURATE STORIES</span><h3 id="home-slider-books-title">{selectedSection ? `Stories in ${selectedSection.label}` : "Choose a shelf to curate"}</h3><p>Each novel appears in one home shelf at a time. Moving it here updates its section in the catalog.</p></div>
          {selectedSection ? <span className="home-sliders-key">{selectedSection.section_key}</span> : null}
        </div>
        {selectedSection ? (
          <>
            <div className="home-sliders-assign-row">
              <label>Find a novel<select defaultValue="" onChange={(e) => { const value = e.target.value; e.target.value = ""; if (value) setFromDropdown(value); }} disabled={busy}>
                <option value="">Choose from catalog?</option>
                {(books || []).map((book) => <option key={book.id} value={book.id}>#{book.id} ? {book.title}</option>)}
              </select></label>
              <span className="home-sliders-or">or</span>
              <label>Assign by novel IDs<input value={assignIds} onChange={(e) => setAssignIds(e.target.value)} placeholder="12, 45, 88" /></label>
              <button type="button" className="btn btn-primary" onClick={assign} disabled={busy || !assignIds.trim()}>{busy ? "Updating?" : "Assign novels"}</button>
            </div>
            {sectionBooks.length ? (
              <div className="home-sliders-assigned-list">
                {sectionBooks.map((book) => (
                  <article className="home-sliders-assigned-book" key={book.id}>
                    {coverUrl(book.cover_path) ? <img src={coverUrl(book.cover_path)} alt="" loading="lazy" /> : <span className="home-sliders-assigned-fallback">{(book.title || "N").slice(0, 1)}</span>}
                    <div><strong>{book.title}</strong><small>#{book.id} ? {book.author || "Unknown author"}</small></div>
                    <button type="button" className="btn btn-sm" onClick={() => removeBook(book)} disabled={busy || removingBookId === book.id}>{removingBookId === book.id ? "Moving?" : "Move to Recently Updated"}</button>
                  </article>
                ))}
              </div>
            ) : <div className="home-sliders-empty">No novels are assigned to this shelf yet. Choose one above to fill the preview.</div>}
          </>
        ) : <div className="home-sliders-empty">Create a shelf or select an existing section to manage its stories.</div>}
      </section>
    </div>
  );
}

function HomeHeroImagesPage() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ title: "", image_path: "", sort_order: 100, is_active: true });
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await listHomeHeroImages();
      setItems(Array.isArray(result?.items) ? result.items : []);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const reset = () => {
    setEditingId(null);
    setForm({ title: "", image_path: "", sort_order: 100, is_active: true });
  };

  const edit = (item) => {
    setEditingId(item.id);
    setForm({
      title: item.title || "",
      image_path: item.image_path || "",
      sort_order: Number(item.sort_order ?? 100),
      is_active: Boolean(Number(item.is_active)),
    });
  };

  const pickImage = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const result = await uploadImage(file);
      const path = result?.path || result?.url || "";
      if (!path) throw new Error("The uploaded image did not return a path.");
      setForm((current) => ({ ...current, image_path: path }));
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const save = async (event) => {
    event.preventDefault();
    if (!editingId && items.length >= MAX_HOME_HERO_IMAGES) {
      setError("You can use up to five hero backgrounds. Delete one before adding another.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (editingId) await updateHomeHeroImage(editingId, form);
      else await createHomeHeroImage(form);
      reset();
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`Delete "${item.title || "this hero background"}"?`)) return;
    setBusy(true);
    setError("");
    try {
      await deleteHomeHeroImage(item.id);
      if (editingId === item.id) reset();
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const preview = coverUrl(form.image_path);
  const imageLimitReached = !editingId && items.length >= MAX_HOME_HERO_IMAGES;

  return (
    <div className="page-section home-hero-images-page">
      <header className="home-sliders-heading">
        <div>
          <span className="home-sliders-eyebrow">HOME PAGE CONTENT</span>
          <h2>Hero backgrounds</h2>
          <p>Manage up to five images. The background follows the active featured-story slide on the home page.</p>
        </div>
        <button type="button" className="btn" onClick={load} disabled={loading || busy}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {error ? <div className="home-sliders-error" role="alert">{error}</div> : null}

      <div className="home-hero-images-layout">
        <section className="home-hero-images-list" aria-label="Existing hero backgrounds">
          <div className="home-hero-images-list-heading">
            <h3>Background images <span>{items.length}/{MAX_HOME_HERO_IMAGES}</span></h3>
            <p>Active images follow the featured-story slider. Lower order numbers appear first.</p>
          </div>
          {loading && !items.length ? <p className="home-sliders-empty">Loading hero backgrounds…</p> : null}
          {!loading && !items.length ? <p className="home-sliders-empty">No hero backgrounds yet. Add an image to get started.</p> : null}
          <div className="home-hero-images-grid">
            {items.map((item) => (
              <article className={`home-hero-image-card${editingId === item.id ? " is-editing" : ""}`} key={item.id}>
                {coverUrl(item.image_path)
                  ? <img src={coverUrl(item.image_path)} alt={item.title || "Home hero background"} loading="lazy" />
                  : <div className="home-hero-image-empty">Image unavailable</div>}
                <div className="home-hero-image-card-copy">
                  <strong>{item.title || "Untitled background"}</strong>
                  <span>{Number(item.is_active) ? "Active" : "Hidden"} · Order {item.sort_order}</span>
                </div>
                <div className="home-hero-image-card-actions">
                  <button type="button" className="btn btn-sm" onClick={() => edit(item)}>Edit</button>
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(item)} disabled={busy}>Delete</button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="home-hero-image-editor" aria-labelledby="home-hero-image-editor-title">
          <div>
            <span className="home-sliders-eyebrow">BACKGROUND SETTINGS</span>
            <h3 id="home-hero-image-editor-title">{editingId ? "Edit background" : "Add a background"}</h3>
            <p>Use a wide image for the best result. The hero applies a dark overlay to keep its text readable.</p>
          </div>
          <form onSubmit={save}>
            <label>
              Background image
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={pickImage} disabled={uploading || busy || imageLimitReached} />
            </label>
            <label>
              Or image path / URL
              <input required value={form.image_path} onChange={(event) => setForm({ ...form, image_path: event.target.value })} placeholder="/api/media/…" disabled={imageLimitReached} />
            </label>
            {preview ? <img className="home-hero-image-editor-preview" src={preview} alt="Hero background preview" /> : null}
            <label>
              Image label (optional)
              <input maxLength={160} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Evening city skyline" />
            </label>
            <label>
              Display order
              <input type="number" value={form.sort_order} onChange={(event) => setForm({ ...form, sort_order: Number(event.target.value) })} />
            </label>
            <label className="home-hero-image-active">
              <input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />
              Show this image on the home page
            </label>
            <div className="home-hero-image-editor-actions">
              {editingId ? <button type="button" className="btn" onClick={reset} disabled={busy}>Cancel</button> : null}
              <button type="submit" className="btn btn-primary" disabled={busy || uploading || imageLimitReached}>
                {uploading ? "Uploading…" : busy ? "Saving…" : editingId ? "Save changes" : imageLimitReached ? "Limit reached" : "Add background"}
              </button>
            </div>
            {imageLimitReached ? <p className="home-hero-image-limit" role="status">You can use up to five backgrounds. Delete one to add another.</p> : null}
          </form>
        </section>
      </div>
    </div>
  );
}

function LibraryHeroPage() {
  const [form, setForm] = useState({ title: "", image_path: "" });
  const [saved, setSaved] = useState({ title: "", image_path: "" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getLibraryHero();
      const next = { title: result?.title || "", image_path: result?.image_path || "" };
      setSaved(next);
      setForm(next);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pickImage = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const result = await uploadImage(file);
      const path = result?.path || result?.url || "";
      if (!path) throw new Error("The uploaded image did not return a path.");
      setForm((current) => ({ ...current, image_path: path }));
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const save = async (event) => {
    event.preventDefault();
    if (!form.image_path.trim()) {
      setError("Choose a background image first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await updateLibraryHero({
        title: form.title.trim(),
        image_path: form.image_path.trim(),
      });
      const next = { title: result?.title || form.title.trim(), image_path: result?.image_path || form.image_path.trim() };
      setSaved(next);
      setForm(next);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Remove the library hero background?")) return;
    setBusy(true);
    setError("");
    try {
      await deleteLibraryHero();
      setSaved({ title: "", image_path: "" });
      setForm({ title: "", image_path: "" });
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const preview = coverUrl(form.image_path);

  return (
    <div className="page-section home-hero-images-page">
      <header className="home-sliders-heading">
        <div>
          <span className="home-sliders-eyebrow">LIBRARY PAGE CONTENT</span>
          <h2>Library hero background</h2>
          <p>One static background image for the Library page hero. It does not rotate or animate.</p>
        </div>
        <button type="button" className="btn" onClick={load} disabled={loading || busy}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {error ? <div className="home-sliders-error" role="alert">{error}</div> : null}
      {loading ? <p className="home-sliders-empty">Loading the library hero…</p> : null}

      {!loading ? (
        <div className="home-hero-images-layout">
          <section className="home-hero-images-list" aria-label="Current library hero background">
            <div className="home-hero-images-list-heading">
              <h3>Current background</h3>
              <p>This image sits behind the Library page hero heading.</p>
            </div>
            {saved.image_path ? (
              <article className="home-hero-image-card">
                <img src={coverUrl(saved.image_path)} alt={saved.title || "Library hero background"} loading="lazy" />
                <div className="home-hero-image-card-copy">
                  <strong>{saved.title || "Library hero"}</strong>
                  <span>Active on the Library page</span>
                </div>
                <div className="home-hero-image-card-actions">
                  <button type="button" className="btn btn-sm btn-danger" onClick={remove} disabled={busy}>Remove</button>
                </div>
              </article>
            ) : (
              <p className="home-sliders-empty">No library background yet. Upload one to get started.</p>
            )}
          </section>

          <section className="home-hero-image-editor" aria-labelledby="library-hero-editor-title">
            <div>
              <span className="home-sliders-eyebrow">BACKGROUND SETTINGS</span>
              <h3 id="library-hero-editor-title">{saved.image_path ? "Replace the background" : "Add a background"}</h3>
              <p>Use a wide image. The hero applies a soft light overlay so the heading stays readable.</p>
            </div>
            <form onSubmit={save}>
              <label>
                Background image
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={pickImage} disabled={uploading || busy} />
              </label>
              <label>
                Or image path / URL
                <input required value={form.image_path} onChange={(event) => setForm({ ...form, image_path: event.target.value })} placeholder="/api/media/…" disabled={busy} />
              </label>
              {preview ? <img className="home-hero-image-editor-preview" src={preview} alt="Library hero preview" /> : null}
              <label>
                Image label (optional)
                <input maxLength={160} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Evening reading room" />
              </label>
              <div className="home-hero-image-editor-actions">
                <button type="submit" className="btn btn-primary" disabled={busy || uploading || !form.image_path.trim()}>
                  {uploading ? "Uploading…" : busy ? "Saving…" : "Save background"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
