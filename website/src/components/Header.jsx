import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import AuthModal from "./AuthModal";
import {
  getAdminNotifications,
  getNotifications,
  getSearchHistory,
  getToken,
  resolveAssetUrl,
} from "../api";

const MAIN_NAV = [
  { to: "/", label: "Home", end: true },
  { to: "/library", label: "Library" },
];

const BROWSE_GENRES = [
  "Romance", "Fantasy", "Thriller", "Mystery", "Sci-Fi", "Young Adult",
  "Horror", "LGBTQ+", "Werewolves", "Adventure", "Drama", "Humor",
];

export default function Header({ user, onLogout, onAuthSuccess }) {
  const [q, setQ] = useState("");
  const [searchScope, setSearchScope] = useState("title");
  const [recentSearches, setRecentSearches] = useState([]);
  const [searchHistoryOpen, setSearchHistoryOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("signin");
  const [moreOpen, setMoreOpen] = useState(false);
  const [genresOpen, setGenresOpen] = useState(false);
  const [writeOpen, setWriteOpen] = useState(false);
  const [profileImageFailed, setProfileImageFailed] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("nh-theme") === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });
  const [notifications, setNotifications] = useState([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const profileName = user?.display_name || user?.username || user?.name || "";
  const profilePhoto = user?.photo_url || user?.photoUrl || user?.avatar_url || "";
  const profileImage = profilePhoto ? resolveAssetUrl(profilePhoto) : "";
  const moreRef = useRef(null);
  const writeRef = useRef(null);
  const writeButtonRef = useRef(null);
  const genresRef = useRef(null);
  const menuButtonRef = useRef(null);
  const notificationRef = useRef(null);
  const historyRequestRef = useRef(0);
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    // Several legacy route rules set an important page background. Keep the
    // shared app shell tied to the selected theme across every route.
    const themedShell = [document.body, document.getElementById("root"), document.querySelector(".app-shell"), document.querySelector(".main")];
    const shellBackground = theme === "dark" ? "#0D1914" : "#FFFFFF";
    const shellForeground = theme === "dark" ? "#F5F5F5" : "#202020";
    themedShell.filter(Boolean).forEach((element) => {
      element.style.setProperty("background", shellBackground, "important");
      element.style.setProperty("color", shellForeground, "important");
      element.style.setProperty("transition", "none", "important");
    });
    try {
      localStorage.setItem("nh-theme", theme);
    } catch {
      // Theme remains usable for this session when storage is unavailable.
    }
    document.querySelector(".guest-landing-reference")?.contentWindow?.postMessage(
      { type: "novelhub:theme", theme },
      window.location.origin,
    );
  }, [theme]);

  useEffect(() => {
    function onThemeMessage(event) {
      if (event.origin !== window.location.origin || event.data?.type !== "novelhub:theme") return;
      setTheme(event.data.theme === "dark" ? "dark" : "light");
    }
    window.addEventListener("message", onThemeMessage);
    return () => window.removeEventListener("message", onThemeMessage);
  }, []);

  useEffect(() => {
    setProfileImageFailed(false);
  }, [profileImage]);

  useEffect(() => {
    const updateScrollState = () => setHeaderScrolled(window.scrollY > 12);
    updateScrollState();
    window.addEventListener("scroll", updateScrollState, { passive: true });
    return () => window.removeEventListener("scroll", updateScrollState);
  }, []);

  const isGuest =
    !user ||
    String(user.email || "").includes("guest") ||
    String(user.provider || "") === "guest";
  const userKey = isGuest ? "guest" : String(user?.user_id || user?.id || user?.email || "account");
  const notificationStorageKey = `novelhub_notifications_seen:${userKey}`;
  const notificationUnreadKey = `novelhub_notifications_unread:${userKey}`;

  useEffect(() => {
    if (isGuest || !getToken()) {
      setNotifications([]);
      setUnreadNotificationCount(0);
      return undefined;
    }

    setNotifications([]);
    setUnreadNotificationCount(0);
    let active = true;
    let baselineLoaded = false;
    const refresh = async () => {
      try {
        const [activityResult, adminResult] = await Promise.allSettled([
          getNotifications(),
          getAdminNotifications(),
        ]);
        if (!active) return;
        const activityResponse = activityResult.status === "fulfilled" ? activityResult.value : null;
        const adminResponse = adminResult.status === "fulfilled" ? adminResult.value : null;
        const activity = Array.isArray(activityResponse)
          ? activityResponse
          : Array.isArray(activityResponse?.items) ? activityResponse.items : [];
        const announcements = Array.isArray(adminResponse)
          ? adminResponse
          : Array.isArray(adminResponse?.items) ? adminResponse.items : [];
        const all = [
          ...activity,
          ...announcements.map((item) => ({ ...item, id: `announcement-${item.id}`, notification_category: "announcement" })),
        ]
          .filter((item) => item?.id != null)
          .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
        setNotifications(all);

        let seen = [];
        let unread = [];
        try {
          seen = JSON.parse(localStorage.getItem(notificationStorageKey) || "[]");
          unread = JSON.parse(localStorage.getItem(notificationUnreadKey) || "[]");
          if (!Array.isArray(seen)) seen = [];
          if (!Array.isArray(unread)) unread = [];
        } catch {
          seen = [];
          unread = [];
        }
        const ids = all.map((item) => String(item.id));
        if (!baselineLoaded && !localStorage.getItem(notificationStorageKey)) {
          seen = ids;
          localStorage.setItem(notificationStorageKey, JSON.stringify(seen));
          localStorage.setItem(notificationUnreadKey, JSON.stringify([]));
          baselineLoaded = true;
          setUnreadNotificationCount(0);
          return;
        }
        baselineLoaded = true;
        const seenIds = new Set(seen.map(String));
        const unreadIds = new Set(unread.map(String));
        for (const id of ids) {
          if (!seenIds.has(id)) unreadIds.add(id);
        }
        localStorage.setItem(notificationUnreadKey, JSON.stringify([...unreadIds]));
        setUnreadNotificationCount(unreadIds.size);
      } catch (error) {
        console.warn("Could not refresh notifications:", error);
      }
    };

    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [isGuest, userKey]);

  function openNotifications() {
    const nextOpen = !notificationOpen;
    setNotificationOpen(nextOpen);
    if (!nextOpen) return;
    const ids = notifications.map((item) => String(item.id));
    try {
      const seen = JSON.parse(localStorage.getItem(notificationStorageKey) || "[]");
      localStorage.setItem(
        notificationStorageKey,
        JSON.stringify([...new Set([...(Array.isArray(seen) ? seen : []), ...ids])]),
      );
      localStorage.setItem(notificationUnreadKey, JSON.stringify([]));
    } catch (error) {
      console.warn("Could not update notification read state:", error);
    }
    setUnreadNotificationCount(0);
  }

  function notificationPath(item) {
    if (["support_reply", "chat_reply"].includes(String(item.type || "").toLowerCase())) {
      return "/account/contact";
    }
    if (item.chapter_id && item.book_id) {
      return `/stories/${item.book_id}/chapters/${item.chapter_id}`;
    }
    if (String(item.type || "").toLowerCase() === "follow" && item.actor_user_id) {
      return `/authors/${item.actor_user_id}`;
    }
    return item.book_id ? `/stories/${item.book_id}` : "/notifications";
  }

  async function loadSearchHistory(scope = searchScope) {
    const requestId = ++historyRequestRef.current;
    let local = [];
    try {
      const stored = JSON.parse(localStorage.getItem(`novelhub_search_history:${userKey}`) || "[]");
      if (Array.isArray(stored)) {
        local = stored.filter((entry) =>
          entry?.scope === scope && typeof entry.term === "string" && entry.term.trim(),
        );
      }
    } catch {
      local = [];
    }
    setRecentSearches(local.slice(0, 5));
    if (isGuest || !getToken()) return;
    try {
      const response = await getSearchHistory(scope);
      if (requestId !== historyRequestRef.current) return;
      const serverItems = Array.isArray(response?.items) ? response.items : [];
      const seen = new Set();
      const merged = [...serverItems, ...local].filter((entry) => {
        const term = String(entry?.display_term || entry?.term || "").trim();
        const key = term.toLocaleLowerCase();
        if (!term || seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 5).map((entry) => ({
        term: String(entry.display_term || entry.term).trim(),
        scope,
      }));
      setRecentSearches(merged);
    } catch {
      // Keep the browser's recent searches available when the optional sync is offline.
    }
  }

  function selectRecentSearch(entry) {
    const term = String(entry?.term || "").trim();
    if (!term) return;
    const scope = ["tag", "profile"].includes(entry.scope) ? entry.scope : "title";
    setQ(term);
    setSearchScope(scope);
    setSearchHistoryOpen(false);
    setMenuOpen(false);
    const params = new URLSearchParams({ q: term });
    if (scope !== "title") params.set("type", scope);
    navigate(`/?${params.toString()}`);
  }

  function changeSearchScope(scope) {
    setSearchScope(scope);
    if (searchHistoryOpen) void loadSearchHistory(scope);
  }

  useEffect(() => {
    historyRequestRef.current += 1;
    setRecentSearches([]);
    if (searchHistoryOpen) void loadSearchHistory(searchScope);
  }, [userKey]);

  useEffect(() => {
    document.body.classList.toggle("nav-open", menuOpen);
    return () => document.body.classList.remove("nav-open");
  }, [menuOpen, writeOpen]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setMoreOpen(false);
        setWriteOpen(false);
        setNotificationOpen(false);
        if (menuOpen) menuButtonRef.current?.focus();
        else if (writeOpen) writeButtonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  useEffect(() => {
    setMenuOpen(false);
    setMoreOpen(false);
    setWriteOpen(false);
    setNotificationOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function onDoc(e) {
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false);
      if (writeRef.current && !writeRef.current.contains(e.target)) setWriteOpen(false);
      if (genresRef.current && !genresRef.current.contains(e.target)) setGenresOpen(false);
      if (notificationRef.current && !notificationRef.current.contains(e.target)) {
        setNotificationOpen(false);
      }
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setQ(params.get("q") || "");
    const scope = params.get("type");
    setSearchScope(["tag", "profile"].includes(scope) ? scope : "title");
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (location.pathname === "/login") setAuthOpen(false);
  }, [location.pathname]);

  function submitSearch(e) {
    e.preventDefault();
    const term = q.trim();
    setSearchHistoryOpen(false);
    setMenuOpen(false);
    const params = new URLSearchParams();
    if (term) params.set("q", term);
    if (term && searchScope !== "title") params.set("type", searchScope);
    navigate(term ? `/?${params.toString()}` : "/");
  }

  function openAuth(mode) {
    if (location.pathname === "/login") {
      const currentState = location.state && typeof location.state === "object"
        ? location.state
        : {};
      navigate("/login", { state: { ...currentState, authMode: mode === "signup" ? "signup" : "signin" } });
      return;
    }
    setAuthMode(mode);
    setAuthOpen(true);
  }

  function closeMenu() {
    setMenuOpen(false);
    setMoreOpen(false);
    setWriteOpen(false);
    setGenresOpen(false);
  }

  return (
    <>
      <header className={`site-header site-header--pro${!isGuest ? " site-header--authenticated" : ""}${headerScrolled ? " is-scrolled" : ""}`}>
        <div className="header-bar">
          <button
            type="button"
            className="menu-toggle"
            ref={menuButtonRef}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-controls="primary-navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">{menuOpen ? <path d="m6 6 12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}</svg>
          </button>

          <Link to="/" className="logo" onClick={closeMenu} aria-label="Wingsaga home">
            <img className="logo-mark" src={theme === "dark" ? "/assets/wingsaga-logo-dark.jpeg" : "/assets/wingsaga-logo-light.jpeg"} alt="" />
            <span className="header-brand-name">Wingsaga</span>
          </Link>

          <nav
            id="primary-navigation"
            className={`nav-links ${menuOpen ? "open" : ""}`}
            aria-label="Main"
          >
            <div className="mobile-nav-heading">
              <span className="mobile-nav-kicker">YOUR READING SPACE</span>
              <strong>{isGuest ? "Find your next favorite story." : `Welcome back${profileName ? `, ${profileName.split(" ")[0]}` : ""}.`}</strong>
              <small>Read, explore, and create with Wingsaga.</small>
            </div>
            {MAIN_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => isActive && (item.to !== "/" || location.search !== "?sort=rating") ? "active" : ""}
                onClick={closeMenu}
              >
                <span>{item.label}</span>
              </NavLink>
            ))}

            <div className={`nav-dropdown nav-genres-dropdown${genresOpen ? " open" : ""}${location.pathname.startsWith("/genres/") ? " active" : ""}`} ref={genresRef}>
              <button type="button" className="nav-dropdown-btn" aria-haspopup="true" aria-expanded={genresOpen} onClick={() => setGenresOpen((open) => !open)}>
                <span>Browse</span><span className="nav-genre-chevron" aria-hidden="true">⌄</span>
              </button>
              <div className="nav-dropdown-panel nav-genres-panel" role="menu">
                {BROWSE_GENRES.map((genre) => (
                  <Link key={genre} to={`/genres/${encodeURIComponent(genre)}`} role="menuitem" onClick={closeMenu}>{genre}</Link>
                ))}
                <Link to="/genres/Stories" role="menuitem" onClick={closeMenu}>More genres</Link>
              </div>
            </div>
            <form className="nav-search mobile-only" onSubmit={submitSearch}>
              <select value={searchScope} onChange={(e) => changeSearchScope(e.target.value)} aria-label="Search type">
                <option value="title">Titles</option><option value="tag">Tags</option><option value="profile">Profiles</option>
              </select>
              <div className="search-history-field">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onFocus={() => {
                    setSearchHistoryOpen(true);
                    void loadSearchHistory(searchScope);
                  }}
                  onBlur={() => window.setTimeout(() => setSearchHistoryOpen(false), 140)}
                  placeholder="Search stories, authors, tags..."
                  aria-label="Search stories, authors, or tags"
                  aria-expanded={searchHistoryOpen}
                  aria-controls="mobile-search-history"
                  autoComplete="off"
                />
                {searchHistoryOpen && recentSearches.length > 0 ? (
                  <div className="search-history-menu" id="mobile-search-history" role="listbox" aria-label="Recent searches">
                    <span className="search-history-heading">Recent searches</span>
                    {recentSearches.map((entry, index) => (
                      <button
                        type="button"
                        role="option"
                        aria-selected="false"
                        key={`${entry.scope}:${entry.term}:${index}`}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => selectRecentSearch(entry)}
                      >
                        <span aria-hidden="true">↺</span><span>{entry.term}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <button type="submit" className="search-icon-btn" aria-label="Search stories" title="Search stories">
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <circle cx="10.8" cy="10.8" r="6.8" />
                  <path d="m16 16 4.2 4.2" />
                </svg>
              </button>
            </form>

            <div className="nav-auth mobile-only">
              {isGuest ? (
                <>
                  <button type="button" className="btn btn-ghost" onClick={() => { closeMenu(); openAuth("signin"); }}>
                    Sign in
                  </button>
                  <button type="button" className="btn btn-primary" onClick={() => { closeMenu(); openAuth("signup"); }}>
                    Sign up
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      closeMenu();
                      onLogout?.();
                      navigate("/");
                    }}
                  >
                    Log out
                  </button>
                </>
              )}
            </div>
          </nav>
          <form className="header-search desktop-only" onSubmit={submitSearch}>
            <select value={searchScope} onChange={(e) => changeSearchScope(e.target.value)} aria-label="Search type">
              <option value="title">Titles</option><option value="tag">Tags</option><option value="profile">Profiles</option>
            </select>
            <div className="search-history-field">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onFocus={() => {
                  setSearchHistoryOpen(true);
                  void loadSearchHistory(searchScope);
                }}
                onBlur={() => window.setTimeout(() => setSearchHistoryOpen(false), 140)}
                placeholder="Search stories, authors, tags..."
                aria-label="Search stories, authors, or tags"
                aria-expanded={searchHistoryOpen}
                aria-controls="desktop-search-history"
                autoComplete="off"
              />
              {searchHistoryOpen && recentSearches.length > 0 ? (
                <div className="search-history-menu" id="desktop-search-history" role="listbox" aria-label="Recent searches">
                  <span className="search-history-heading">Recent searches</span>
                  {recentSearches.map((entry, index) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected="false"
                      key={`${entry.scope}:${entry.term}:${index}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectRecentSearch(entry)}
                    >
                      <span aria-hidden="true">↺</span><span>{entry.term}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button type="submit" className="search-icon-btn" aria-label="Search stories" title="Search stories">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <circle cx="10.8" cy="10.8" r="6.8" />
                <path d="m16 16 4.2 4.2" />
              </svg>
            </button>
          </form>
          <div className="header-actions">
            <div className="header-write-menu" ref={writeRef}>
              <button
                type="button"
                className="header-write-link"
                ref={writeButtonRef}
                aria-label="Write"
                aria-haspopup="menu"
                aria-expanded={writeOpen}
                aria-controls="header-write-dropdown"
                title="Write"
                onClick={() => setWriteOpen((open) => !open)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
                <span className="header-write-label">Write</span>
              </button>
              {writeOpen ? (
                <div className="header-write-dropdown" id="header-write-dropdown" role="menu" aria-label="Writing options">
                  <Link role="menuitem" to="/write/new" onClick={closeMenu}>＋ New Story</Link>
                  <Link role="menuitem" to="/write" onClick={closeMenu}>Writing Desk</Link>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="header-theme-toggle"
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? (
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></svg>
              )}
            </button>

            <div className={`header-notifications ${notificationOpen ? "open" : ""}`} ref={notificationRef}>
              <button
                type="button"
                className="header-icon-link"
                aria-label={`Notifications${unreadNotificationCount ? `, ${unreadNotificationCount} unread` : ""}`}
                aria-expanded={notificationOpen}
                title="Notifications"
                onClick={openNotifications}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></svg>
                {unreadNotificationCount > 0 ? (
                  <span className="notification-count-badge">
                    {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
                  </span>
                ) : null}
              </button>
              {notificationOpen ? (
                <div className="header-notification-menu" role="dialog" aria-label="Recent notifications">
                  <div className="header-notification-heading">
                    <strong>Notifications</strong>
                    {unreadNotificationCount > 0 ? <span>{unreadNotificationCount} new</span> : null}
                  </div>
                  {notifications.length ? (
                    <>
                      {[
                        ["Activity", notifications.filter((item) => item.notification_category !== "announcement")],
                        ["Announcements", notifications.filter((item) => item.notification_category === "announcement")],
                      ].map(([label, items]) => items.length ? (
                        <section className="header-notification-group" key={label} aria-label={label}>
                          <h3>{label}</h3>
                          {items.slice(0, 3).map((item) => (
                            <Link
                              className="header-notification-item"
                              key={item.id}
                              to={notificationPath(item)}
                              onClick={() => setNotificationOpen(false)}
                            >
                              <span className="header-notification-dot" aria-hidden="true" />
                              <span><strong>{item.title || item.message || "Wingsaga update"}</strong><small>{item.message && item.title ? item.message : item.created_at || ""}</small></span>
                            </Link>
                          ))}
                        </section>
                      ) : null)}
                    </>
                  ) : <p className="header-notification-empty">You’re all caught up.</p>}
                  <Link
                    className="header-notification-more"
                    to="/notifications"
                    onClick={() => setNotificationOpen(false)}
                  >
                    See more
                  </Link>
                </div>
              ) : null}
            </div>
            <Link
              className="header-profile-link"
              to={isGuest ? "/login" : "/profile"}
              aria-label={isGuest ? "Sign in" : `Profile${profileName ? `: ${profileName}` : ""}`}
              title={isGuest ? "Sign in" : profileName || "Profile"}
            >
              {profileImage && !profileImageFailed ? <img src={profileImage} alt="" onError={() => setProfileImageFailed(true)} /> : <span>{isGuest ? <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-2a7 7 0 0 1 14 0v2z" /></svg> : (profileName || "N").slice(0, 1).toUpperCase()}</span>}
            </Link>
            <div className={`header-more ${moreOpen ? "open" : ""}`} ref={moreRef}>
              <button
                type="button"
                className="header-more-toggle"
                aria-label="More options"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen((open) => !open)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="5" r="1.8" />
                  <circle cx="12" cy="12" r="1.8" />
                  <circle cx="12" cy="19" r="1.8" />
                </svg>
              </button>
              {moreOpen && (
                <div className="header-more-menu" role="menu">
                  <Link role="menuitem" to="/library" onClick={closeMenu}>My library</Link>
                  {user && !isGuest ? <Link role="menuitem" to="/profile" onClick={closeMenu}>My profile</Link> : null}
                  <Link role="menuitem" to="/notifications" onClick={closeMenu}>Notifications</Link>
                  <Link role="menuitem" to="/account" onClick={closeMenu}>Account & settings</Link>
                  <Link role="menuitem" to="/community" onClick={closeMenu}>Community</Link>
                  <Link role="menuitem" to="/contests" onClick={closeMenu}>Writing contests</Link>
                  <Link role="menuitem" to="/write" onClick={closeMenu}>Write a story</Link>
                  {user && !isGuest ? (
                    <button type="button" role="menuitem" onClick={() => { closeMenu(); onLogout?.(); navigate("/"); }}>Sign out</button>
                  ) : (
                    <button type="button" role="menuitem" onClick={() => { closeMenu(); openAuth("signin"); }}>Sign in</button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {menuOpen && (
        <button type="button" className="nav-backdrop is-open" aria-label="Close navigation menu" onClick={closeMenu} />
      )}

      <AuthModal
        open={authOpen}
        mode={authMode}
        onClose={() => setAuthOpen(false)}
        onSuccess={async (token, res) => {
          await onAuthSuccess?.(token, res);
          setAuthOpen(false);
          if (!res?.is_new_user) navigate("/", { replace: true });
        }}
      />
    </>
  );
}
