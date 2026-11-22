import { createSupportRequest, getChatMessages, getMyPreferences, getMyReadingStats, getMySupportRequests, sendChatMessage, updateMyPreferences } from "../api";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { isGuestUser } from "../utils/guest";

/** Same FAQ content as Flutter HelpCenterScreen */
const FAQ = {
  "Account & Login": [
    {
      q: "How do I sign in with Google?",
      a: "On the login screen choose Continue with Google, pick your account, and complete the one-time profile form if this is your first visit. Later logins skip the form.",
    },
    {
      q: "Why am I asked to complete my profile?",
      a: "Only the first time you sign in with Google or email. We store display name and preferences so we do not ask again on that account.",
    },
    {
      q: "How do I sign out?",
      a: "Open Account (More) → Change accounts → Sign out. Reading progress stays linked to your account.",
    },
    {
      q: "Can I delete my account?",
      a: "Use Contact us and request account deletion. An admin will process the request.",
    },
  ],
  Reading: [
    {
      q: "How does reading progress work?",
      a: "Progress is saved per chapter as you read and when you track a story in Library. Resume continues where you left off on web and mobile.",
    },
    {
      q: "How are reading stats calculated?",
      a: "Your reading stats are calculated from the chapters and stories you read.",
    },
  ],
  "Writing & Stories": [
    {
      q: "How do I publish a story?",
      a: "Open Write, create a story, add chapters, and publish when you are ready.",
    },
    {
      q: "Where do likes and reviews appear?",
      a: "Your actions show under Profile. Interactions on your stories appear in notifications when enabled.",
    },
  ],
  "Notifications & Privacy": [
    {
      q: "What is Activity?",
      a: "Activity lists likes, comments, reviews, saves and follows related to your account when available from the API.",
    },
    {
      q: "How do I manage notification settings?",
      a: "Account → Settings → Notifications. Toggle reading reminders, new releases, recommendations and system messages (stored locally on web).",
    },
    {
      q: "Who can see my profile?",
      a: "Public profile shows display name, bio, and published stories. Email is only visible to you when signed in.",
    },
  ],
};

const GENRES = [
  "Romance",
  "Fantasy",
  "Thriller",
  "Mystery",
  "Sci-Fi",
  "Young Adult",
  "Horror",
  "LGBTQ+",
  "Werewolves",
  "Adventure",
  "Drama",
  "Humor",
];

const WARNINGS = ["Violence", "Strong language", "Sexual content", "Gore", "Abuse", "Suicide themes"];

function PageShell({ title, children }) {
  return (
    <div className="container page faq-page">
      <Link to="/account" className="page-back">
        ← Back to Account
      </Link>
      <h1>{title}</h1>
      {children}
    </div>
  );
}

export function AccountHelp() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState({});

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FAQ;
    const out = {};
    Object.entries(FAQ).forEach(([cat, items]) => {
      const match = items.filter(
        (it) => it.q.toLowerCase().includes(q) || it.a.toLowerCase().includes(q)
      );
      if (match.length) out[cat] = match;
    });
    return out;
  }, [query]);

  function toggle(key) {
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <PageShell title="Help Center">
      <input
        className="faq-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search help topics…"
        aria-label="Search help"
      />
      {Object.keys(filtered).length === 0 ? (
        <p className="meta">No results. Try another keyword.</p>
      ) : (
        Object.entries(filtered).map(([cat, items]) => (
          <div key={cat} className="faq-cat">
            <h2 className="faq-cat-title">{cat}</h2>
            {items.map((it) => {
              const key = `${cat}:${it.q}`;
              const isOpen = !!open[key];
              return (
                <div key={key} className={`faq-item ${isOpen ? "open" : ""}`}>
                  <button type="button" className="faq-q" onClick={() => toggle(key)}>
                    <span>{it.q}</span>
                    <span>{isOpen ? "−" : "+"}</span>
                  </button>
                  <div className="faq-a">{it.a}</div>
                </div>
              );
            })}
          </div>
        ))
      )}
    </PageShell>
  );
}

export function AccountContact({ user }) {
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [issue, setIssue] = useState("general");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [supportItems, setSupportItems] = useState([]);
  const [chatItems, setChatItems] = useState([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const signedIn = Boolean(user && !isGuestUser(user));

  useEffect(() => {
    if (!signedIn) return undefined;
    let active = true;
    const refreshInbox = async () => {
      const [support, chat] = await Promise.allSettled([getMySupportRequests(), getChatMessages()]);
      if (!active) return;
      if (support.status === "fulfilled") setSupportItems(support.value?.items || []);
      if (chat.status === "fulfilled") setChatItems(chat.value?.items || []);
    };
    void refreshInbox();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshInbox();
    }, 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, [signedIn]);

  async function sendChat(e) {
    e.preventDefault();
    const text = chatDraft.trim();
    if (!text || chatBusy) return;
    setChatBusy(true);
    try {
      await sendChatMessage(text);
      setChatDraft("");
      const response = await getChatMessages();
      setChatItems(response?.items || []);
    } catch (err) {
      setError(String(err.message || "Message could not be sent."));
    } finally {
      setChatBusy(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await createSupportRequest({
        email: email.trim(),
        first_name: firstName.trim() || "Reader",
        issue,
        subject: subject.trim() || "Website contact",
        description: message.trim(),
        device_type: "web",
      });
      setSent(true);
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageShell title="Contact us">
      <div className="card-panel">
        {error ? <div className="error-banner">{error}</div> : null}
        {sent ? (
          <p>
            Thank you — your message was sent to support.
            An admin can reply from the admin panel.
          </p>
        ) : (
          <form className="contact-form" onSubmit={submit}>
            <label>
              Name
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </label>
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>
              Topic
              <select value={issue} onChange={(e) => setIssue(e.target.value)}>
                <option value="general">General</option>
                <option value="account">Account / login</option>
                <option value="reading">Reading / library</option>
                <option value="writing">Writing / stories</option>
                <option value="bug">Bug report</option>
              </select>
            </label>
            <label>
              Subject
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Short summary" />
            </label>
            <label>
              Message
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} required />
            </label>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? "Sending…" : "Send message"}
            </button>
          </form>
        )}
      </div>
      {signedIn ? (
        <>
          <section className="card-panel account-support-inbox">
            <h2>Your support requests</h2>
            {supportItems.length ? supportItems.map((item) => (
              <article className="account-support-ticket" key={item.id}>
                <div><strong>{item.subject || item.topic || "Contact request"}</strong><span>{item.status || "open"}</span></div>
                <p>{item.message || item.description}</p>
                {item.admin_reply ? <blockquote><strong>Wingsaga support replied</strong><br />{item.admin_reply}</blockquote> : null}
              </article>
            )) : <p className="meta">Your submitted requests and replies will appear here.</p>}
          </section>
          <section className="card-panel account-chat-inbox">
            <h2>Message Wingsaga support</h2>
            <div className="account-chat-messages" aria-live="polite">
              {chatItems.map((item) => <article className={`account-chat-message is-${String(item.sender || "user").toLowerCase()}`} key={item.id}><span>{item.message}</span><small>{item.sender === "admin" ? "Wingsaga support" : "You"}</small></article>)}
              {!chatItems.length ? <p className="meta">Send us a message and our team will reply here.</p> : null}
            </div>
            <form className="account-chat-compose" onSubmit={sendChat}>
              <input value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} maxLength={4000} placeholder="Write a message…" aria-label="Message Wingsaga support" />
              <button className="btn btn-primary" disabled={chatBusy || !chatDraft.trim()}>{chatBusy ? "Sending…" : "Send"}</button>
            </form>
          </section>
        </>
      ) : null}
    </PageShell>
  );
}

export function AccountStats({ user }) {
  const guest = isGuestUser(user);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(!guest);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (guest) {
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    getMyReadingStats()
      .then((data) => { if (!cancelled) setStats(data || {}); })
      .catch((err) => { if (!cancelled) setError(err.message || "Reading stats could not load."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [guest, user?.id, user?.user_id, reloadKey]);

  if (guest) {
    return (
      <PageShell title="Reading stats">
        <section className="guest-lock card-panel">
          <h2>Your reading journey</h2>
          <p className="meta">Sign in to sync reading totals and genre activity across devices.</p>
          <Link className="btn btn-primary" to="/login">Sign in</Link>
        </section>
      </PageShell>
    );
  }

  return (
    <PageShell title="Reading stats">
      {error ? <div className="error-banner" role="alert">{error} <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReloadKey((key) => key + 1)}>Retry</button></div> : null}
      <div className="profile-stat-row">
        <div className="profile-stat-card">
          <strong>{loading ? "—" : Number(stats?.books_read || 0).toLocaleString()}</strong>
          <span>Books read</span>
        </div>
        <div className="profile-stat-card">
          <strong>{loading ? "—" : Number(stats?.pages_read || 0).toLocaleString()}</strong>
          <span>Pages read</span>
        </div>
        <div className="profile-stat-card">
          <strong>{loading ? "—" : Number(stats?.current_streak || 0).toLocaleString()}</strong>
          <span>Current streak</span>
        </div>
        <div className="profile-stat-card">
          <strong>{loading ? "—" : Number(stats?.month_books || 0).toLocaleString()}</strong>
          <span>This month</span>
        </div>
      </div>
      <section className="reading-stats-genres">
        <h2>Top genres</h2>
        {stats?.top_genres?.length ? <div className="reading-genre-list">{stats.top_genres.map((genre) => <div className="reading-genre-row" key={genre.name}><span>{genre.name}</span><strong>{genre.count}</strong></div>)}</div> : <p className="meta">Genre activity will appear as you add stories to your library.</p>}
      </section>
      <Link className="btn btn-primary" to="/library">Open library</Link>
    </PageShell>
  );
}

export function AccountNotifications() {
  const [flags, setFlags] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("nh_notif") || "{}");
    } catch {
      return {};
    }
  });
  const [status, setStatus] = useState("");
  useEffect(() => { getMyPreferences().then((p) => { if (p?.notifications) setFlags(p.notifications); }).catch((e) => setStatus(e.message)); }, []);
  async function toggle(key) {
    const next = { ...flags, [key]: !flags[key] };
    setFlags(next); setStatus("Saving…");
    try { await updateMyPreferences({ notifications: { [key]: next[key] } }); localStorage.setItem("nh_notif", JSON.stringify(next)); setStatus("Saved to your account"); }
    catch (e) { setFlags(flags); setStatus(e.message || "Could not save preference"); }
  }
  const rows = [
    ["reading_reminders", "Reading reminders"],
    ["new_releases", "New releases"],
    ["recommendations", "Recommendations"],
    ["marketing", "Wingsaga updates"],
    ["system", "System messages"],
  ];
  return (
    <PageShell title="Notifications">
      <div className="account-section">
        {rows.map(([key, label]) => (
          <div key={key} className="toggle-row">
            <span>{label}</span>
            <button
              type="button"
              className={`toggle-switch ${flags[key] !== false ? "on" : ""}`}
              aria-pressed={flags[key] !== false}
              onClick={() => toggle(key)}
            />
          </div>
        ))}
      </div>
      <p className="meta" role="status">{status || "Preferences sync with your Wingsaga account."}</p>
    </PageShell>
  );
}

export function AccountGenres() {
  const [selected, setSelected] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("nh_genres") || "[]");
    } catch {
      return [];
    }
  });
  const [status, setStatus] = useState("");
  useEffect(() => { getMyPreferences().then((p) => { if (Array.isArray(p?.favourite_genres)) setSelected(p.favourite_genres); }).catch((e) => setStatus(e.message)); }, []);
  async function toggle(g) {
    const next = selected.includes(g) ? selected.filter((x) => x !== g) : [...selected, g];
    setSelected(next); setStatus("Saving…");
    try { await updateMyPreferences({ favourite_genres: next }); localStorage.setItem("nh_genres", JSON.stringify(next)); setStatus("Saved to your account"); }
    catch (e) { setSelected(selected); setStatus(e.message || "Could not save genres"); }
  }
  return (
    <PageShell title="Favourite genres">
      <div className="account-section">
        <div className="chip-grid">
          {GENRES.map((g) => (
            <button
              key={g}
              type="button"
              className={`genre-chip ${selected.includes(g) ? "on" : ""}`}
              onClick={() => toggle(g)}
            >
              {g}
            </button>
          ))}
        </div>
      </div>
      <p className="meta" role="status">{status || "Selected genres personalize your account across devices."}</p>
    </PageShell>
  );
}

export function AccountWarnings() {
  const [selected, setSelected] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("nh_warn") || "[]");
    } catch {
      return [];
    }
  });
  const [status, setStatus] = useState("");
  useEffect(() => { getMyPreferences().then((p) => { if (p?.content_warnings) setSelected(Object.keys(p.content_warnings).filter((k) => p.content_warnings[k])); }).catch((e) => setStatus(e.message)); }, []);
  async function toggle(w) {
    const next = selected.includes(w) ? selected.filter((x) => x !== w) : [...selected, w];
    setSelected(next); setStatus("Saving…");
    try { await updateMyPreferences({ content_warnings: Object.fromEntries(WARNINGS.map((item) => [item, next.includes(item)])) }); localStorage.setItem("nh_warn", JSON.stringify(next)); setStatus("Saved to your account"); }
    catch (e) { setSelected(selected); setStatus(e.message || "Could not save content warnings"); }
  }
  return (
    <PageShell title="Content warnings">
      <div className="account-section">
        <div className="chip-grid">
          {WARNINGS.map((w) => (
            <button
              key={w}
              type="button"
              className={`genre-chip ${selected.includes(w) ? "on" : ""}`}
              onClick={() => toggle(w)}
            >
              {w}
            </button>
          ))}
        </div>
      </div>
      <p className="meta" role="status">{status || "These choices sync with your Wingsaga account."}</p>
    </PageShell>
  );
}

export function AccountLegal({ kind }) {
  const isPrivacy = kind === "privacy";
  const title = isPrivacy ? "Privacy Policy" : kind === "cookies" ? "Cookie preferences" : "Terms of Service";
  const [policyText, setPolicyText] = useState("");
  useEffect(() => {
    if (kind === "cookies") return;
    const file = isPrivacy ? "/legal/privacy.txt" : "/legal/terms.txt";
    fetch(file).then((response) => {
      if (!response.ok) throw new Error("Could not load policy");
      return response.text();
    }).then(setPolicyText).catch(() => setPolicyText("Policy text could not be loaded. Please contact Wingsaga77@gmail.com."));
  }, [isPrivacy, kind]);
  const sections = kind === "cookies" ? [
    { t: "Local storage", b: "We store your login token and UI preferences (theme, notification toggles) in local storage only." },
    { t: "No third-party ad cookies", b: "This web client does not load advertising trackers by default." },
  ] : null;

  return (
    <PageShell title={title}>
      {sections ? sections.map((s) => (
        <div key={s.t} className="legal-block">
          <h3>{s.t}</h3>
          <p>{s.b}</p>
        </div>
      )) : <div className="legal-block" style={{ whiteSpace: "pre-wrap", lineHeight: 1.65 }}>{policyText || "Loading policy…"}</div>}
    </PageShell>
  );
}

export function AccountLanguage() {
  const [language, setLanguage] = useState("en");
  const [status, setStatus] = useState("");
  useEffect(() => { getMyPreferences().then((p) => setLanguage(p?.language || "en")).catch((e) => setStatus(e.message)); }, []);
  async function save(e) { const value = e.target.value; setLanguage(value); setStatus("Saving…"); try { await updateMyPreferences({ language: value }); setStatus("Saved to your account"); } catch (err) { setStatus(err.message || "Could not save language"); } }
  return (
    <PageShell title="Language">
      <div className="account-section">
        <label className="toggle-row"><span>Display language</span><select value={language} onChange={save}><option value="en">English</option></select></label>
      </div>
      <p className="meta" role="status">{status || "Language preference syncs with your account."}</p>
    </PageShell>
  );
}

/** @deprecated name kept for App imports */
export function AccountSimple({ title, body }) {
  return (
    <PageShell title={title}>
      <div className="legal-block">
        <p>{body}</p>
      </div>
    </PageShell>
  );
}

export default function AccountPage({ user, onLogout }) {
  const guest = isGuestUser(user);
  const name = user?.display_name || user?.email || "Reader";
  const initial = String(name).trim().charAt(0).toUpperCase() || "R";
  const groups = [
    { title: "Your space", description: "Pick up a read or return to your writing.", links: [["Library", "Your saved stories and collections", "/library"], ["My stories", "Drafts and published work", "/manage-stories"], ["Reading stats", "Your reading activity", "/account/stats"]] },
    { title: "Preferences", description: "Shape the stories and updates you see.", links: [["Notifications", "Choose which updates reach you", "/account/notifications"], ["Language", "Set your preferred language", "/account/language"], ["Favourite genres", "Tune story recommendations", "/account/genres"], ["Content warnings", "Manage sensitive content filters", "/account/warnings"]] },
    { title: "Help & support", description: "Find an answer or get in touch with the team.", links: [["Help center", "Answers to common questions", "/account/help"], ["Contact us", "Send a message to Wingsaga support", "/account/contact"]] },
    { title: "Policies", description: "Read how Wingsaga works and protects your data.", links: [["Terms of service", "The rules for using Wingsaga", "/account/terms"], ["Privacy policy", "How account information is handled", "/account/privacy"], ["Cookie preferences", "Review cookie information", "/account/cookies"]] },
  ];

  return (
    <div className="container page account-page more-page">
      <header className="more-hero card-panel">
        <div className="more-avatar" aria-hidden="true">{initial}</div>
        <div className="more-hero-copy">
          <span className="eyebrow">WINGSAGA ACCOUNT</span>
          <h1>{guest ? "Make Wingsaga yours" : `Welcome back, ${name.split(" ")[0]}`}</h1>
          <p className="meta">{guest ? "Sign in to sync your library, preferences, and writing across devices." : user?.email || "Your reading and writing, all in one place."}</p>
        </div>
        <div className="more-hero-actions">
          {guest ? <Link className="btn btn-primary" to="/login">Sign in</Link> : <Link className="btn btn-primary" to="/profile">View profile</Link>}
        </div>
      </header>

      <div className="more-groups-grid">
        {groups.map((group) => (
          <section className="more-group" key={group.title}>
            <div className="more-group-heading"><h2>{group.title}</h2><p className="meta">{group.description}</p></div>
            <nav className="more-menu" aria-label={group.title}>
              {group.links.map(([label, detail, to]) => (
                <Link className="more-menu-item" to={to} key={to}>
                  <span className="more-menu-icon" aria-hidden="true">{label.slice(0, 3).toUpperCase()}</span>
                  <span className="more-menu-copy"><strong>{label}</strong><small>{detail}</small></span>
                  <span className="more-menu-chevron" aria-hidden="true">&gt;</span>
                </Link>
              ))}
            </nav>
          </section>
        ))}
      </div>

      {!guest ? (
        <section className="more-signout card-panel">
          <div><h2>Need a different account?</h2><p className="meta">Sign out from this device and continue with another account.</p></div>
          <button type="button" className="btn btn-ghost" onClick={() => onLogout?.()}>Sign out</button>
        </section>
      ) : (
        <div className="more-guest-note"><p className="meta">You can explore stories as a guest. Sign in is needed to save preferences and sync your reading.</p></div>
      )}
    </div>
  );
}
