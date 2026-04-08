"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, apiUpload, readToken } from "@/lib/api";

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "users", label: "Users" },
  { key: "books", label: "Books" },
  { key: "categories", label: "Categories" },
  { key: "languages", label: "Languages" },
  { key: "requests", label: "Book Requests" },
  { key: "setup", label: "Setup" },
  { key: "debug", label: "Admin Debug" },
];

function formatCount(value) {
  const count = Number(value || 0);
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return `${count}`;
}

function formatRelativeDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  if (diffHour < 24) return `${diffHour} hour${diffHour === 1 ? "" : "s"} ago`;
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString();
}

function ActionMenu({ items = [] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="admin-action-menu-wrap">
      <button className="admin-action-trigger" onClick={() => setOpen((prev) => !prev)}>
        •••
      </button>
      {open && (
        <div className="admin-action-menu">
          {items.map((item) => (
            <button
              key={item.label}
              className={`admin-action-menu-item ${item.danger ? "danger" : ""}`}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [message, setMessage] = useState("Loading admin workspace...");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(10);
  const [filter, setFilter] = useState("all");
  const [me, setMe] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [users, setUsers] = useState([]);
  const [books, setBooks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [requests, setRequests] = useState([]);
  const [setup, setSetup] = useState({ site_name: "Bixbi", logo_url: "", admins: [] });
  const [debugData, setDebugData] = useState({ last_activity: [], cache_keys: [], per_story_views: [] });
  const [siteName, setSiteName] = useState("Bixbi");
  const [siteLogo, setSiteLogo] = useState("");

  async function loadAdminData() {
    const token = readToken();
    if (!token) {
      router.replace("/admin/login");
      return;
    }

    const meData = await apiRequest("/users/me", { token });
    if (!(meData?.is_admin || meData?.role === "admin")) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      router.replace("/admin/login?reason=forbidden");
      return;
    }

    setMe(meData);

    const [dashboardData, analyticsData, userRows, storyRows, categoryRows, languageRows, requestRows, setupRows, debugRows] = await Promise.all([
      apiRequest("/admin/dashboard", { token }),
      apiRequest("/admin/analytics", { token }),
      apiRequest("/admin/users", { token }),
      apiRequest("/admin/stories", { token }),
      apiRequest("/admin/categories", { token }),
      apiRequest("/admin/languages", { token }),
      apiRequest("/admin/book-requests", { token }),
      apiRequest("/admin/setup", { token }),
      apiRequest("/admin/recommendations-debug", { token }),
    ]);

    setDashboard(dashboardData);
    setAnalytics(analyticsData);
    setUsers(Array.isArray(userRows) ? userRows : []);
    setBooks(Array.isArray(storyRows) ? storyRows : []);
    setCategories(Array.isArray(categoryRows?.items) ? categoryRows.items : []);
    setLanguages(Array.isArray(languageRows?.items) ? languageRows.items : []);
    setRequests(Array.isArray(requestRows?.items) ? requestRows.items : []);
    setSetup(setupRows || { site_name: "Bixbi", logo_url: "", admins: [] });
    setSiteName(setupRows?.site_name || "Bixbi");
    setSiteLogo(setupRows?.logo_url || "");
    setDebugData(debugRows || { last_activity: [], cache_keys: [], per_story_views: [] });
    setMessage("Admin workspace ready.");
  }

  useEffect(() => {
    loadAdminData()
      .catch((error) => {
        setMessage(error.message || "Could not load admin workspace.");
      })
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    const token = readToken();
    if (!token) return;
    const interval = setInterval(() => {
      apiRequest("/admin/recommendations-debug", { token })
        .then((data) => setDebugData(data || { last_activity: [], cache_keys: [], per_story_views: [] }))
        .catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const filteredUsers = useMemo(() => {
    return users
      .filter((item) => {
        if (filter !== "all" && item.status !== filter) return false;
        const haystack = `${item.username} ${item.name} ${item.email} ${item.mobile}`.toLowerCase();
        return haystack.includes(search.toLowerCase());
      })
      .slice(0, limit);
  }, [users, search, limit, filter]);

  const filteredBooks = useMemo(() => {
    return books
      .filter((item) => {
        if (filter !== "all" && item.status !== filter) return false;
        const haystack = `${item.title} ${item.publisher} ${item.author_name} ${item.category} ${item.language}`.toLowerCase();
        return haystack.includes(search.toLowerCase());
      })
      .slice(0, limit);
  }, [books, search, limit, filter]);

  const filteredCategories = useMemo(() => {
    return categories.filter((item) => item.name.toLowerCase().includes(search.toLowerCase())).slice(0, limit);
  }, [categories, search, limit]);

  const filteredLanguages = useMemo(() => {
    return languages.filter((item) => item.name.toLowerCase().includes(search.toLowerCase())).slice(0, limit);
  }, [languages, search, limit]);

  const filteredRequests = useMemo(() => {
    return requests
      .filter((item) => {
        if (filter !== "all" && item.status !== filter) return false;
        const haystack = `${item.title} ${item.requested_by} ${item.reason}`.toLowerCase();
        return haystack.includes(search.toLowerCase());
      })
      .slice(0, limit);
  }, [requests, search, limit, filter]);

  async function handleBanToggle(user) {
    const token = readToken();
    if (!token) return;
    const route = user.is_banned ? `/admin/users/${user.id}/unban` : `/admin/users/${user.id}/ban`;
    const result = await apiRequest(route, { method: "POST", token });
    setMessage(result.message || "User updated.");
    await loadAdminData();
  }

  async function handleStoryStatus(storyId, status) {
    const token = readToken();
    if (!token) return;
    const result = await apiRequest(`/admin/stories/${storyId}/status`, {
      method: "PATCH",
      token,
      body: { status },
    });
    setMessage(result.message || "Story updated.");
    await loadAdminData();
  }

  async function handleDeleteStory(storyId) {
    const token = readToken();
    if (!token) return;
    const result = await apiRequest(`/admin/stories/${storyId}`, { method: "DELETE", token });
    setMessage(result.message || "Story deleted.");
    await loadAdminData();
  }

  async function handleResolveRequest(requestId) {
    const token = readToken();
    if (!token) return;
    const result = await apiRequest(`/admin/reports/${requestId}/resolve`, { method: "POST", token });
    setMessage(result.message || "Request resolved.");
    await loadAdminData();
  }

  async function handleLogoUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const token = readToken();
    if (!token) return;
    const uploaded = await apiUpload("/admin/site-settings/logo", { fieldName: "image", file, token });
    setSiteLogo(uploaded.logo_url || "");
    setMessage(uploaded.message || "Logo uploaded.");
  }

  async function saveSetup() {
    const token = readToken();
    if (!token) return;
    const result = await apiRequest("/admin/site-settings", {
      method: "PATCH",
      token,
      body: { site_name: siteName, logo_url: siteLogo },
    });
    setMessage(result.message || "Setup saved.");
    await loadAdminData();
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.replace("/admin/login");
  }

  return (
    <main className="admin-shell">
      <aside className={`admin-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="admin-brand-row">
          <div className="admin-brand">Bixbi<span>Admin</span></div>
          <button className="admin-sidebar-close" onClick={() => setSidebarOpen(false)}>×</button>
        </div>

        <div className="admin-nav-group">
          <div className="admin-nav-title">Dashboard</div>
          {NAV_ITEMS.slice(0, 1).map((item) => (
            <button key={item.key} className={`admin-nav-item ${activeSection === item.key ? "active" : ""}`} onClick={() => { setActiveSection(item.key); setSidebarOpen(false); }}>
              {item.label}
            </button>
          ))}
        </div>

        <div className="admin-nav-group">
          <div className="admin-nav-title">Appearance</div>
          {NAV_ITEMS.slice(1, 6).map((item) => (
            <button key={item.key} className={`admin-nav-item ${activeSection === item.key ? "active" : ""}`} onClick={() => { setActiveSection(item.key); setSidebarOpen(false); }}>
              {item.label}
            </button>
          ))}
        </div>

        <div className="admin-nav-group">
          <div className="admin-nav-title">Site Settings</div>
          {NAV_ITEMS.slice(6).map((item) => (
            <button key={item.key} className={`admin-nav-item ${activeSection === item.key ? "active" : ""}`} onClick={() => { setActiveSection(item.key); setSidebarOpen(false); }}>
              {item.label}
            </button>
          ))}
        </div>

        <div className="admin-nav-group admin-nav-footer">
          <div className="admin-nav-title">My Settings</div>
          <button className="admin-nav-item" onClick={() => router.push("/profile")}>My Profile</button>
          <button className="admin-nav-item" onClick={logout}>Logout</button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            <button className="admin-hamburger" onClick={() => setSidebarOpen(true)}>☰</button>
            <div>
              <h1 className="admin-page-title">{NAV_ITEMS.find((item) => item.key === activeSection)?.label || "Admin"}</h1>
              <p className="admin-page-subtitle">{message}</p>
            </div>
          </div>
          <div className="admin-topbar-right">
            <div className="admin-user-chip">{me?.full_name || me?.username || "Admin"}</div>
          </div>
        </header>

        {activeSection === "dashboard" && (
          <section className="admin-content">
            <div className="admin-stat-grid">
              <div className="admin-stat-card"><span>Total Users</span><strong>{dashboard?.summary?.total_users || 0}</strong></div>
              <div className="admin-stat-card"><span>Total Books</span><strong>{dashboard?.summary?.total_books || 0}</strong></div>
              <div className="admin-stat-card"><span>Total Downloads</span><strong>{formatCount(dashboard?.summary?.total_downloads || 0)}</strong></div>
              <div className="admin-stat-card"><span>Total Views</span><strong>{formatCount(dashboard?.summary?.total_views || 0)}</strong></div>
            </div>

            <div className="admin-panel">
              <div className="admin-panel-header">
                <h2>Recent Books</h2>
              </div>
              <div className="admin-table-wrap compact">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Image</th>
                      <th>Title</th>
                      <th>Category</th>
                      <th>Status</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(dashboard?.recent_books || []).map((book) => (
                      <tr key={book.id}>
                        <td>
                          <div className="admin-book-thumb">{book.image ? <img src={book.image} alt={book.title} loading="eager" /> : book.title.slice(0, 1)}</div>
                        </td>
                        <td>{book.title}</td>
                        <td>{book.category}</td>
                        <td><span className={`admin-status-chip ${book.status}`}>{book.status}</span></td>
                        <td>{formatRelativeDate(book.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {activeSection !== "dashboard" && (
          <section className="admin-content">
            <div className="admin-toolbar">
              <div className="admin-toolbar-left">
                <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="admin-select">
                  {[10, 25, 50].map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <button className="admin-clear-btn" onClick={() => { setSearch(""); setFilter("all"); }}>Clear All</button>
              </div>
              <div className="admin-toolbar-right">
                <label>Filter by</label>
                <select value={filter} onChange={(e) => setFilter(e.target.value)} className="admin-select">
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                  <option value="open">Open</option>
                  <option value="resolved">Resolved</option>
                </select>
                <div className="admin-search-box">
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." />
                </div>
              </div>
            </div>

            {activeSection === "users" && (
              <>
                <div className="admin-stat-grid admin-sub-grid">
                  <div className="admin-stat-card"><span>Total Users</span><strong>{users.length}</strong></div>
                  <div className="admin-stat-card"><span>Active Users</span><strong>{users.filter((item) => item.status === "active").length}</strong></div>
                  <div className="admin-stat-card"><span>Inactive Users</span><strong>{users.filter((item) => item.status !== "active").length}</strong></div>
                </div>
                <div className="admin-panel">
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Username</th>
                          <th>Name</th>
                          <th>Email</th>
                          <th>Mobile</th>
                          <th>Reads</th>
                          <th>Books</th>
                          <th>Status</th>
                          <th>Created At</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUsers.map((user) => (
                          <tr key={user.id}>
                            <td>{user.username}</td>
                            <td>{user.name || "-"}</td>
                            <td>{user.email}</td>
                            <td>{user.mobile || "-"}</td>
                            <td>{user.reads_count}</td>
                            <td>{user.books_count}</td>
                            <td><span className={`admin-status-chip ${user.status}`}>{user.status === "active" ? "Active" : "Inactive"}</span></td>
                            <td>{formatRelativeDate(user.created_at)}</td>
                            <td>
                              <ActionMenu
                                items={[
                                  { label: user.is_banned ? "Unban" : "Ban", onClick: () => handleBanToggle(user) },
                                  { label: "Open Profile", onClick: () => router.push(`/profile`) },
                                ]}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {activeSection === "books" && (
              <>
                <div className="admin-stat-grid admin-sub-grid">
                  <div className="admin-stat-card"><span>Total Books</span><strong>{books.length}</strong></div>
                  <div className="admin-stat-card"><span>Active Books</span><strong>{books.filter((item) => item.status === "published").length}</strong></div>
                  <div className="admin-stat-card"><span>Pending Books</span><strong>{books.filter((item) => item.status !== "published").length}</strong></div>
                </div>
                <div className="admin-panel">
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Title</th>
                          <th>Publisher</th>
                          <th>Author</th>
                          <th>Category</th>
                          <th>Language</th>
                          <th>Status</th>
                          <th>Created At</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredBooks.map((book) => (
                          <tr key={book.id}>
                            <td>{book.title}</td>
                            <td>{book.publisher}</td>
                            <td>{book.author_name}</td>
                            <td>{book.category}</td>
                            <td>{book.language}</td>
                            <td><span className={`admin-status-chip ${book.status}`}>{book.status === "published" ? "Active" : book.status}</span></td>
                            <td>{formatRelativeDate(book.created_at)}</td>
                            <td>
                              <ActionMenu
                                items={[
                                  { label: "Publish", onClick: () => handleStoryStatus(book.id, "published") },
                                  { label: "Move To Draft", onClick: () => handleStoryStatus(book.id, "draft") },
                                  { label: "Delete", danger: true, onClick: () => handleDeleteStory(book.id) },
                                ]}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {activeSection === "categories" && (
              <div className="admin-panel">
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Status</th>
                        <th>Books</th>
                        <th>Created At</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCategories.map((item) => (
                        <tr key={item.name}>
                          <td>{item.name}</td>
                          <td><span className="admin-status-chip active">Active</span></td>
                          <td>{item.books_count}</td>
                          <td>{formatRelativeDate(item.created_at)}</td>
                          <td><ActionMenu items={[{ label: "View Books", onClick: () => setSearch(item.name) }]} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeSection === "languages" && (
              <div className="admin-panel">
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Language</th>
                        <th>Users</th>
                        <th>Active Users</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLanguages.map((item) => (
                        <tr key={item.name}>
                          <td>{item.name}</td>
                          <td>{item.users_count}</td>
                          <td>{item.active_users}</td>
                          <td><span className="admin-status-chip active">Active</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeSection === "requests" && (
              <div className="admin-panel">
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Requested By</th>
                        <th>Reason</th>
                        <th>Status</th>
                        <th>Created At</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRequests.map((item) => (
                        <tr key={item.id}>
                          <td>{item.title}</td>
                          <td>{item.requested_by}</td>
                          <td>{item.reason}</td>
                          <td><span className={`admin-status-chip ${item.status}`}>{item.status}</span></td>
                          <td>{formatRelativeDate(item.created_at)}</td>
                          <td>
                            <ActionMenu items={[{ label: "Resolve", onClick: () => handleResolveRequest(item.id) }]} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeSection === "setup" && (
              <div className="admin-setup-grid">
                <div className="admin-panel">
                  <div className="admin-panel-header"><h2>Logo & Branding</h2></div>
                  <div className="admin-form-grid">
                    <label>Site Name</label>
                    <input className="admin-input" value={siteName} onChange={(e) => setSiteName(e.target.value)} />
                    <label>Logo URL</label>
                    <input className="admin-input" value={siteLogo} onChange={(e) => setSiteLogo(e.target.value)} />
                    <label>Upload Logo</label>
                    <input type="file" onChange={handleLogoUpload} className="admin-file-input" />
                    <button className="admin-primary-btn" onClick={saveSetup}>Save Setup</button>
                  </div>
                </div>

                <div className="admin-panel">
                  <div className="admin-panel-header"><h2>Admin & Role</h2></div>
                  <div className="admin-table-wrap compact">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Image</th>
                          <th>Name</th>
                          <th>Email</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(setup.admins || []).map((item) => (
                          <tr key={item.id}>
                            <td>
                              <div className="admin-avatar">{item.image ? <img src={item.image} alt={item.name || item.username} loading="eager" /> : (item.name || item.username || "A").slice(0, 1)}</div>
                            </td>
                            <td>{item.name || item.username}</td>
                            <td>{item.email}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeSection === "debug" && (
              <div className="admin-debug-grid">
                <div className="admin-panel">
                  <div className="admin-panel-header"><h2>Last 10 user_activity inserts</h2></div>
                  <div className="admin-debug-list">
                    {(debugData.last_activity || []).map((item, index) => (
                      <div key={`${item.user_id}-${index}`} className="admin-debug-card">
                        <strong>{item.action_type}</strong>
                        <span>User: {item.user_id}</span>
                        <span>Story: {item.post_id}</span>
                        <span>Read Time: {item.read_time || 0}s</span>
                        <span>Scroll: {item.scroll_depth || 0}%</span>
                        <span>{formatRelativeDate(item.created_at)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="admin-panel">
                  <div className="admin-panel-header"><h2>Live recommendation cache keys</h2></div>
                  <div className="admin-debug-list">
                    {(debugData.cache_keys || []).map((item) => (
                      <div key={item} className="admin-debug-card mono">{item}</div>
                    ))}
                    {(!debugData.cache_keys || debugData.cache_keys.length === 0) && <div className="admin-debug-card">No recommendation cache keys yet.</div>}
                  </div>
                </div>

                <div className="admin-panel">
                  <div className="admin-panel-header"><h2>Per-story live views from DB</h2></div>
                  <div className="admin-debug-list">
                    {(debugData.per_story_views || []).map((item) => (
                      <div key={item.story_id} className="admin-debug-card">
                        <strong>{item.title}</strong>
                        <span>{item.views} views</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
