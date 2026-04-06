"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, apiUpload, readToken } from "@/lib/api";

export default function AdminPage() {
  const router = useRouter();
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [reports, setReports] = useState([]);
  const [stories, setStories] = useState([]);
  const [comments, setComments] = useState([]);
  const [selectedCommentIds, setSelectedCommentIds] = useState([]);
  const [badgeSummary, setBadgeSummary] = useState([]);
  const [message, setMessage] = useState("Admin analytics panel.");
  const [me, setMe] = useState(null);
  const [bootstrapEmail, setBootstrapEmail] = useState("");
  const [bootstrapKey, setBootstrapKey] = useState("change-this-admin-bootstrap-key");
  const [meId, setMeId] = useState('');
  const [loadingAuth, setLoadingAuth] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const token = readToken();
        if (!token) {
          router.replace('/admin/login');
          return;
        }
        const meData = await apiRequest("/users/me", { token });
        if (!(meData?.is_admin || meData?.role === 'admin')) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          router.replace('/admin/login?reason=forbidden');
          return;
        }
        setMe(meData);
        setMeId(meData?.id || meData?._id || '');
        setBootstrapEmail(meData?.email || "");
        const [analytics, userList, reportList, storyList, commentList, badgeData] = await Promise.all([
          apiRequest("/admin/analytics", { token }),
          apiRequest("/admin/users", { token }),
          apiRequest("/admin/reports", { token }),
          apiRequest("/admin/stories", { token }),
          apiRequest("/admin/comments", { token }),
          apiRequest("/admin/badges/summary", { token }),
        ]);
        setStats(analytics);
        setUsers(userList || []);
        setReports(reportList || []);
        setStories(storyList || []);
        setComments(commentList || []);
        setBadgeSummary(badgeData?.items || []);
      } catch (error) {
        if (error?.status === 403) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          router.replace('/admin/login?reason=forbidden');
          return;
        } else {
          setMessage(error.message);
        }
      } finally {
        setLoadingAuth(false);
      }
    }
    load();
  }, [router]);

  if (loadingAuth) {
    return (
      <main className="page-wrap">
        <section className="api-panel">
          <p className="panel-msg">Checking admin session...</p>
        </section>
      </main>
    );
  }

  async function refreshAdminData() {
    const token = readToken();
    if (!token) {
      return;
    }
    const [analytics, userList, reportList, storyList, commentList, badgeData] = await Promise.all([
      apiRequest("/admin/analytics", { token }),
      apiRequest("/admin/users", { token }),
      apiRequest("/admin/reports", { token }),
      apiRequest("/admin/stories", { token }),
      apiRequest("/admin/comments", { token }),
      apiRequest("/admin/badges/summary", { token }),
    ]);
    setStats(analytics);
    setUsers(userList || []);
    setReports(reportList || []);
    setStories(storyList || []);
    setComments(commentList || []);
    setBadgeSummary(badgeData?.items || []);
    setSelectedCommentIds([]);
  }

  async function bootstrapCurrentUser() {
    try {
      const result = await apiRequest("/auth/bootstrap-admin", {
        method: "POST",
        body: { email: bootstrapEmail, bootstrap_key: bootstrapKey },
      });
      setMessage(`${result.message}. Please sign out and sign in again.`);
    } catch (error) {
      setMessage(error.message);
    }
  }

  function toggleCommentSelection(commentId) {
    setSelectedCommentIds((current) =>
      current.includes(commentId)
        ? current.filter((id) => id !== commentId)
        : [...current, commentId]
    );
  }

  async function bulkCommentAction(action) {
    if (!selectedCommentIds.length) {
      setMessage("Select comments first.");
      return;
    }
    try {
      const token = readToken();
      if (!token) {
        setMessage("Sign in first.");
        return;
      }
      const result = await apiRequest("/admin/comments/bulk-action", {
        method: "POST",
        body: { comment_ids: selectedCommentIds, action },
        token,
      });
      setMessage(`${result.message} (${result.affected})`);
      await refreshAdminData();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function setCommentVisibility(commentId, action) {
    try {
      const token = readToken();
      if (!token) {
        setMessage("Sign in first.");
        return;
      }
      const route = action === "show" ? `/admin/comments/${commentId}/show` : `/admin/comments/${commentId}/hide`;
      const result = await apiRequest(route, { method: "POST", token });
      setMessage(result.message);
      await refreshAdminData();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function deleteComment(commentId) {
    try {
      const token = readToken();
      if (!token) {
        setMessage("Sign in first.");
        return;
      }
      const result = await apiRequest(`/admin/comments/${commentId}`, { method: "DELETE", token });
      setMessage(result.message);
      await refreshAdminData();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function toggleBan(user) {
    try {
      const token = readToken();
      if (!token) {
        setMessage("Sign in first.");
        return;
      }
      const targetUserId = user?.id || user?._id;
      if (!targetUserId) {
        setMessage("Could not determine user id for this action.");
        return;
      }
      if (targetUserId === meId) {
        setMessage("Cannot ban your own account.");
        return;
      }
      const path = user.is_banned ? `/admin/users/${targetUserId}/unban` : `/admin/users/${targetUserId}/ban`;
      const result = await apiRequest(path, { method: "POST", token });
      setMessage(result.message);
      await refreshAdminData();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function resolveReport(reportId) {
    try {
      const token = readToken();
      if (!token) {
        setMessage("Sign in first.");
        return;
      }
      const result = await apiRequest(`/admin/reports/${reportId}/resolve`, { method: "POST", token });
      setMessage(result.message);
      await refreshAdminData();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function updateStoryStatus(storyId, status) {
    try {
      const token = readToken();
      if (!token) {
        setMessage("Sign in first.");
        return;
      }
      const result = await apiRequest(`/admin/stories/${storyId}/status`, {
        method: "PATCH",
        body: { status },
        token
      });
      setMessage(result.message);
      await refreshAdminData();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function deleteStory(storyId) {
    try {
      const token = readToken();
      if (!token) {
        setMessage("Sign in first.");
        return;
      }
      const result = await apiRequest(`/admin/stories/${storyId}`, {
        method: "DELETE",
        token
      });
      setMessage(result.message);
      await refreshAdminData();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function uploadStoryCover(storyId, event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const token = readToken();
      if (!token) {
        setMessage("Sign in first.");
        return;
      }
      const upload = await apiUpload("/stories/upload-cover", { file, token });
      const result = await apiRequest(`/admin/stories/${storyId}/cover`, {
        method: "PATCH",
        body: { cover_image: upload.url },
        token
      });
      setMessage(result.message);
      await refreshAdminData();
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <main className="page-wrap">
      <section className="section-title fade-up">
        <h1>Admin Panel</h1>
        <p>Manage users, stories, reports, and analytics.</p>
      </section>

      <section className="api-panel">
        <p className="panel-msg">{message}</p>
        {me && (
          <p className="token-state" style={{marginBottom:'10px'}}>
            Logged in as <strong>{me.username}</strong> ({me.email}) • Admin: <strong>{String(!!(me.is_admin || me.role === 'admin'))}</strong>
          </p>
        )}
        <div className="card-actions" style={{marginBottom:'10px'}}>
          <input
            value={bootstrapEmail}
            onChange={(e) => setBootstrapEmail(e.target.value)}
            placeholder="email"
            style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'8px',padding:'8px 10px',color:'var(--text)',minWidth:'240px'}}
          />
          <input
            value={bootstrapKey}
            onChange={(e) => setBootstrapKey(e.target.value)}
            placeholder="bootstrap key"
            style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'8px',padding:'8px 10px',color:'var(--text)',minWidth:'260px'}}
          />
          <button className="cta ghost small" onClick={bootstrapCurrentUser}>Promote Email To Admin</button>
        </div>
        {stats && (
          <div className="stats-row">
            <div className="stat-pill"><span>Total Users</span><strong>{stats.total_users}</strong></div>
            <div className="stat-pill"><span>Total Stories</span><strong>{stats.total_stories}</strong></div>
            <div className="stat-pill"><span>Total Comments</span><strong>{stats.total_comments}</strong></div>
            <div className="stat-pill"><span>Total Likes</span><strong>{stats.total_likes}</strong></div>
            <div className="stat-pill"><span>Open Reports</span><strong>{stats.open_reports}</strong></div>
            <div className="stat-pill"><span>Banned Users</span><strong>{stats.banned_users}</strong></div>
            <div className="stat-pill"><span>Hidden Comments</span><strong>{stats.hidden_comments}</strong></div>
            <div className="stat-pill"><span>Badges Earned</span><strong>{stats.badges_earned}</strong></div>
          </div>
        )}
      </section>

      <section className="split-section">
        <div className="api-panel">
          <h2>User Management</h2>
          <div className="chapter-list">
            {users.map((user) => (
              <article key={user.id} className="chapter-card">
                <h3>{user.username}</h3>
                <p>{user.email}</p>
                <p className="token-state">Verified: {String(user.is_email_verified)} • Banned: {String(user.is_banned)}</p>
                <button
                  className="admin-action danger"
                  title={(user.id || user._id) === meId ? 'You cannot ban yourself' : ''}
                  onClick={() => toggleBan(user)}
                >
                  {user.is_banned ? 'Unban' : 'Ban'}
                </button>
              </article>
            ))}
            {!users.length && <p className="token-state">No users found.</p>}
          </div>
        </div>

        <div className="api-panel">
          <h2>Reports</h2>
          <div className="chapter-list">
            {reports.map((report) => (
              <article key={report.id} className="chapter-card">
                <h3>{report.story_id}</h3>
                <p>{report.reason}</p>
                <p className="token-state">Status: {report.status}</p>
                {report.status !== "resolved" && (
                  <button className="cta ghost small" onClick={() => resolveReport(report.id)}>Resolve</button>
                )}
              </article>
            ))}
            {!reports.length && <p className="token-state">No reports found.</p>}
          </div>
        </div>
      </section>

      <section className="api-panel">
        <h2>Story Management</h2>
        <div className="chapter-list">
          {stories.map((story) => (
            <article key={story.id} className="chapter-card">
              <h3>{story.title}</h3>
              <p className="token-state">Author: {story.author_username} • Status: {story.status}</p>
              <p className="token-state">Likes: {story.likes} • Views: {story.views}</p>
              <div className="card-actions">
                <button className="cta ghost small" onClick={() => updateStoryStatus(story.id, "published")}>Publish</button>
                <button className="cta ghost small" onClick={() => updateStoryStatus(story.id, "draft")}>Draft</button>
                <button className="cta ghost small" onClick={() => updateStoryStatus(story.id, "archived")}>Archive</button>
                <button className="cta ghost small" onClick={() => deleteStory(story.id)}>Delete</button>
                <label className="cta ghost small">
                  Upload Cover
                  <input type="file" accept="image/*" onChange={(event) => uploadStoryCover(story.id, event)} hidden />
                </label>
              </div>
            </article>
          ))}
          {!stories.length && <p className="token-state">No stories found.</p>}
        </div>
      </section>

      <section className="api-panel">
        <h2>Comment Moderation</h2>
        <div className="card-actions" style={{marginBottom:'12px'}}>
          <button className="cta ghost small" onClick={() => bulkCommentAction("hide")}>Bulk Hide</button>
          <button className="cta ghost small" onClick={() => bulkCommentAction("show")}>Bulk Show</button>
          <button className="cta ghost small" onClick={() => bulkCommentAction("delete")}>Bulk Delete</button>
          <span className="token-state">Selected: {selectedCommentIds.length}</span>
        </div>
        <div className="chapter-list">
          {comments.map((comment) => (
            <article key={comment.id} className="chapter-card" style={{display:'grid',gridTemplateColumns:'24px 1fr',gap:'8px'}}>
              <input
                type="checkbox"
                checked={selectedCommentIds.includes(comment.id)}
                onChange={() => toggleCommentSelection(comment.id)}
                style={{marginTop:'4px'}}
              />
              <div>
                <p className="token-state">Story: {comment.story_id} • User: {comment.user_id}</p>
                <p style={{margin:'8px 0',fontSize:'13px',lineHeight:1.5}}>{comment.content}</p>
                <p className="token-state">Status: {comment.status || "visible"}</p>
                <div className="card-actions">
                  <button className="cta ghost small" onClick={() => setCommentVisibility(comment.id, "hide")}>Hide</button>
                  <button className="cta ghost small" onClick={() => setCommentVisibility(comment.id, "show")}>Show</button>
                  <button className="cta ghost small" onClick={() => deleteComment(comment.id)}>Delete</button>
                </div>
              </div>
            </article>
          ))}
          {!comments.length && <p className="token-state">No comments found.</p>}
        </div>
      </section>

      <section className="api-panel">
        <h2>Badge System Summary</h2>
        <div className="chapter-list">
          {badgeSummary.map((item, idx) => (
            <article key={`${item.badge_key}-${item.tier || idx}`} className="chapter-card">
              <h3>{item.title}</h3>
              <p className="token-state">Tier: {item.tier || "Unlocked"}</p>
              <p className="token-state">Earned by {item.count} users</p>
            </article>
          ))}
          {!badgeSummary.length && <p className="token-state">No badge data yet.</p>}
        </div>
      </section>
    </main>
  );
}
