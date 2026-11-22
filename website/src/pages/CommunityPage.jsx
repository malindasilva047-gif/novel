import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { commentWallPost, deleteWallPost, getActivityFeed, getMe, getUserWall, likeWallPost, postUserWall, getToken } from "../api";
import { isGuestUser } from "../utils/guest";
import WallPostCard from "../components/WallPostCard";

export default function CommunityPage({ user }) {
  const guest = isGuestUser(user);
  const [wall, setWall] = useState([]);
  const [activity, setActivity] = useState([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [targetId, setTargetId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [wallBusy, setWallBusy] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (guest) {
        setWall([]);
        setActivity([]);
        setLoading(false);
        return;
      }
      try {
        let uid = user?.id || user?.user_id;
        if (!uid && getToken()) {
          const me = await getMe();
          uid = me?.id || me?.user_id;
        }
        if (!uid) return;
        if (!cancelled) setTargetId(uid);
        const [wallResponse, activityResponse] = await Promise.all([
          getUserWall(uid),
          getActivityFeed(uid),
        ]);
        if (!cancelled) {
          setWall(wallResponse?.items || wallResponse || []);
          setActivity(activityResponse?.items || activityResponse || []);
        }
      } catch (err) {
        if (!cancelled) setError(String(err.message || err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [guest, user]);

  useEffect(() => {
    if (guest || !targetId) return undefined;
    let active = true;
    async function refreshCommunity() {
      try {
        const [wallResponse, activityResponse] = await Promise.all([
          getUserWall(targetId),
          getActivityFeed(targetId),
        ]);
        if (!active) return;
        setWall(wallResponse?.items || wallResponse || []);
        setActivity(activityResponse?.items || activityResponse || []);
      } catch {
        // Retain the current community feed until a later successful refresh.
      }
    }
    window.addEventListener("novelhub:content-changed", refreshCommunity);
    return () => {
      active = false;
      window.removeEventListener("novelhub:content-changed", refreshCommunity);
    };
  }, [guest, targetId]);

  async function onPost(event) {
    event.preventDefault();
    if (!targetId || !body.trim() || posting) return;
    setPosting(true);
    setError("");
    try {
      await postUserWall(targetId, body.trim());
      setBody("");
      setMsg("Your note has been shared.");
      const response = await getUserWall(targetId);
      setWall(response?.items || response || []);
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setPosting(false);
    }
  }

  async function onLikePost(post) {
    setWallBusy(post.id);
    setError("");
    try {
      const result = await likeWallPost(post.id);
      setWall((current) => current.map((item) => item.id === post.id ? { ...item, likes: result?.likes ?? item.likes, liked: result?.liked === true } : item));
      return true;
    } catch (err) {
      setError(String(err.message || err));
      return false;
    } finally {
      setWallBusy(null);
    }
  }

  async function onCommentPost(post, text) {
    setWallBusy(post.id);
    setError("");
    try {
      await commentWallPost(post.id, text);
      const response = await getUserWall(targetId);
      setWall(response?.items || response || []);
      setMsg("Your reply has been shared.");
      return true;
    } catch (err) {
      setError(String(err.message || err));
      return false;
    } finally {
      setWallBusy(null);
    }
  }

  async function onDeletePost(post) {
    setWallBusy(post.id);
    setError("");
    try {
      await deleteWallPost(post.id);
      setWall((current) => current.filter((item) => String(item.id) !== String(post.id)));
      setMsg("Your wall post has been deleted.");
      return true;
    } catch (err) {
      setError(String(err.message || err));
      return false;
    } finally {
      setWallBusy(null);
    }
  }

  return (
    <main className="community-page page-shell">
      <header className="community-hero">
        <div className="community-hero-copy"><span className="eyebrow">READ TOGETHER</span><h1>Stories bring us closer.</h1><p>Share the moments that stay with you, and see what your Wingsaga circle is reading and writing.</p></div>
        <div className="community-hero-mark" aria-hidden="true"><span>✦</span><i /><b /></div>
        <div className="community-hero-stats"><span><strong>{wall.length}</strong> wall moments</span><span><strong>{activity.length}</strong> recent updates</span></div>
      </header>

      <div className="community-content">
        <section className="community-main-column">
          {error ? <div className="error-banner" role="alert">{error}</div> : null}
          {msg ? <p className="community-status" role="status">{msg}</p> : null}
          {guest ? (
            <section className="community-join card-panel"><span className="community-mini-icon">✧</span><div><h2>Your reading circle is waiting.</h2><p className="meta">Sign in to share a thought and keep up with your community.</p></div><Link className="btn btn-primary" to="/login">Join the conversation</Link></section>
          ) : (
            <form className="community-composer card-panel" onSubmit={onPost}>
              <div className="community-composer-avatar">{(user?.display_name || "R").slice(0, 1).toUpperCase()}</div>
              <div className="community-composer-main"><label className="eyebrow" htmlFor="community-wall-post">A NOTE FOR YOUR READERS</label><textarea id="community-wall-post" rows={3} maxLength={500} value={body} onChange={(event) => setBody(event.target.value)} placeholder="What story has been on your mind lately?" />
                <div className="community-compose-bottom"><span className="meta">{body.length}/500</span><button type="submit" className="btn btn-primary" disabled={posting || !body.trim()}>{posting ? "Sharing…" : "Share a thought"}</button></div>
              </div>
            </form>
          )}

          <section className="community-feed-section">
            <div className="community-section-heading"><div><span className="eyebrow">YOUR SPACE</span><h2>Wall moments</h2></div><span className="community-count">{wall.length}</span></div>
            {loading ? <div className="community-loading card-panel">Gathering your community…</div> : null}
            {!loading && wall.length ? <div className="community-feed">{wall.map((post) => {
              const currentUserId = user?.id || user?.user_id;
              const canDelete = currentUserId != null && post.user_id != null && String(post.user_id) === String(currentUserId);
              return <WallPostCard key={post.id} post={post} canInteract={!guest && Boolean(getToken())} canDelete={canDelete} busy={wallBusy === post.id} onLike={onLikePost} onComment={onCommentPost} onDelete={onDeletePost} />;
            })}</div> : null}
            {!loading && !guest && !wall.length ? <div className="community-empty card-panel"><span>✧</span><h3>Be the first to leave a note.</h3><p className="meta">Your wall is ready for reading updates, story milestones, and little moments in between.</p></div> : null}
          </section>
        </section>

        <aside className="community-side-column">
          <section className="community-activity-card card-panel"><div className="community-section-heading"><div><span className="eyebrow">HAPPENING NOW</span><h2>Recent activity</h2></div><span className="activity-pulse" /></div>
            {loading ? <p className="meta">Loading activity…</p> : null}
            {!loading && activity.length ? <ul className="activity-timeline">{activity.map((item) => <li key={item.id}><span className="activity-dot" /><div><strong>{item.title || item.type || "Community update"}</strong><p>{item.message || "A new moment from your Wingsaga circle."}</p><time>{item.created_at || "Recently"}</time></div></li>)}</ul> : null}
            {!loading && !activity.length ? <p className="meta community-side-empty">When you and your readers share stories, the latest moments will appear here.</p> : null}
          </section>
          <section className="community-prompt-card"><span className="eyebrow">A SMALL PROMPT</span><p>What book would you give to someone who needs a little hope?</p><Link to="/">Find a story to share <span aria-hidden="true">→</span></Link></section>
        </aside>
      </div>
    </main>
  );
}
