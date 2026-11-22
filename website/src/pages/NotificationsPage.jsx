import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAdminNotifications, getNotifications, resolveAssetUrl } from "../api";
import { isGuestUser } from "../utils/guest";

const itemsOf = (value) => Array.isArray(value) ? value : value?.items || [];
const formatDate = (value) => {
  if (!value || !Number.isNaN(Number(value))) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
};

export default function NotificationsPage({ user }) {
  const guest = isGuestUser(user);
  const [tab, setTab] = useState("activity");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    if (guest) {
      setItems([]);
      setError("");
      setLoading(false);
      return undefined;
    }
    let active = true;
    setLoading(true); setError("");
    (tab === "activity" ? getNotifications() : getAdminNotifications())
      .then((res) => { if (active) setItems(itemsOf(res)); })
      .catch((e) => { if (active) setError(e.message || "Notifications could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [guest, tab]);

  useEffect(() => {
    if (guest) return undefined;
    function refreshNotifications() {
      (tab === "activity" ? getNotifications() : getAdminNotifications())
        .then((response) => setItems(itemsOf(response)))
        .catch((e) => setError(e.message || "Notifications could not be refreshed."));
    }
    window.addEventListener("novelhub:content-changed", refreshNotifications);
    return () => window.removeEventListener("novelhub:content-changed", refreshNotifications);
  }, [guest, tab]);

  if (guest) return <div className="container page"><section className="guest-lock card-panel"><h1>Notifications</h1><p className="meta">Sign in to see story activity and Wingsaga announcements.</p><Link className="btn btn-primary" to="/login">Sign in</Link></section></div>;
  return <div className="container page notifications-page">
    <header className="page-header"><span className="eyebrow">YOUR READING COMMUNITY</span><h1>Notifications</h1><p className="meta">Story activity and announcements from Wingsaga.</p></header>
    <div className="profile-tabs" role="tablist" aria-label="Notification type">
      {[["activity", "Activity"], ["announcements", "Announcements"]].map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={`profile-tab ${tab === key ? "active" : ""}`} onClick={() => setTab(key)}>{label}</button>)}
    </div>
    {error && <div className="error-banner" role="alert">{error}</div>}
    {loading ? <p className="meta">Loading notifications…</p> : null}
    {!loading && !error && !items.length ? <section className="card-panel notification-empty"><span aria-hidden="true">✦</span><h2>You’re all caught up</h2><p className="meta">New story activity and announcements will appear here.</p></section> : null}
    <div className="notification-list">{items.map((item) => {
      const photo = resolveAssetUrl(item.actor_photo || item.cover_path || "");
      const content = <><div className="notification-avatar">{photo ? <img src={photo} alt="" /> : <span>{(item.actor_name || item.type || "N").slice(0, 1).toUpperCase()}</span>}</div><div className="notification-copy"><strong>{item.title || item.message || "Wingsaga update"}</strong>{item.message && item.title ? <p>{item.message}</p> : null}<time>{formatDate(item.created_at)}</time></div><span className="notification-arrow" aria-hidden="true">›</span></>;
      const type = String(item.type || "").toLowerCase();
      const destination = item.chapter_id && item.book_id
        ? `/stories/${item.book_id}/chapters/${item.chapter_id}`
        : ["support_reply", "chat_reply"].includes(type)
          ? "/account/contact"
        : type === "follow" && item.actor_user_id
          ? `/authors/${item.actor_user_id}`
          : item.book_id
            ? `/stories/${item.book_id}`
            : "";
      return destination ? <Link className="notification-row" key={item.id} to={destination}>{content}</Link> : <article className="notification-row" key={item.id}>{content}</article>;
    })}</div>
  </div>;
}
