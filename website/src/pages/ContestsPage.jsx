import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adminCreateContest, adminDeleteContest, getContests, getToken } from "../api";
import { isGuestUser } from "../utils/guest";

export default function ContestsPage({ user }) {
  const [contests, setContests] = useState([]);
  const [adminMode, setAdminMode] = useState(false);
  const [form, setForm] = useState({ title: "", theme: "", deadline: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const canManage = user && !isGuestUser(user) && getToken();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await getContests();
      setContests(response?.items || []);
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function addContest(event) {
    event.preventDefault();
    if (!form.title.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      await adminCreateContest({ title: form.title.trim(), theme: form.theme.trim(), deadline: form.deadline.trim() || "Open entry", is_active: true, is_neon: false });
      setForm({ title: "", theme: "", deadline: "" });
      setNotice("Contest created.");
      await load();
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setSaving(false);
    }
  }

  async function removeContest(id) {
    setDeleting(id);
    setError("");
    try {
      await adminDeleteContest(id);
      setNotice("Contest removed.");
      await load();
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setDeleting(null);
    }
  }

  const featured = contests.find((contest) => contest.is_neon) || contests[0];

  return (
    <main className="contest-page page-shell">
      <header className="contest-hero">
        <div className="contest-hero-copy"><span className="eyebrow">A PROMPT. A PAGE. A POSSIBILITY.</span><h1>Let your next story surprise you.</h1><p>Writing challenges give a fresh idea somewhere to grow. Find a theme, follow the feeling, and make it your own.</p><Link className="btn btn-primary" to="/write">Start a story <span aria-hidden="true">→</span></Link></div>
        <div className="contest-hero-feature" aria-label={featured ? `Featured contest: ${featured.title}` : "Writing challenge status"}><span className="contest-feature-star">✦</span><span className="eyebrow">{featured ? "IN THE SPOTLIGHT" : "YOUR NEXT PROMPT"}</span><h2>{featured?.title || (loading ? "Finding the next prompt" : "No featured prompt yet")}</h2><p>{featured?.theme || (loading ? "Checking the latest community writing challenges." : "There isn’t a featured challenge right now. Browse the open calls below or begin your own story.")}</p>{featured?.deadline ? <span className="contest-deadline">{featured.deadline}</span> : null}</div>
        <div className="contest-hero-note" aria-hidden="true">Make it yours <span>✧</span></div>
      </header>

      <section className="contest-content">
        <div className="contest-section-head"><div><span className="eyebrow">OPEN CALLS</span><h2>Find your writing spark</h2><p className="meta">Choose a challenge and turn a theme into a world only you could write.</p></div>{canManage ? <button className="btn btn-ghost" type="button" onClick={() => setAdminMode((value) => !value)}>{adminMode ? "Close tools" : "Contest tools"}</button> : null}</div>
        {error ? <div className="error-banner" role="alert">{error}</div> : null}
        {notice ? <p className="contest-notice" role="status">{notice}</p> : null}
        {canManage && adminMode ? <form className="contest-admin-form card-panel" onSubmit={addContest}><div><span className="eyebrow">CONTEST MANAGER</span><h3>Add a writing challenge</h3></div><label>Title<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required maxLength={120} /></label><label>Theme<input value={form.theme} onChange={(event) => setForm({ ...form, theme: event.target.value })} maxLength={250} /></label><label>Deadline<input value={form.deadline} onChange={(event) => setForm({ ...form, deadline: event.target.value })} placeholder="Open entry" maxLength={80} /></label><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Creating…" : "Create challenge"}</button></form> : null}
        {loading ? <div className="contest-loading">Finding your next prompt…</div> : null}
        {!loading && contests.length ? <div className="contest-grid">{contests.map((contest, index) => <article className={`contest-entry-card ${index % 3 === 1 ? "contest-entry-card--rose" : index % 3 === 2 ? "contest-entry-card--blue" : ""}`} key={contest.id}><div className="contest-card-top"><span className="contest-card-icon" aria-hidden="true">{index % 3 === 1 ? "♡" : index % 3 === 2 ? "✧" : "✦"}</span><span className="contest-open-pill">Open for entries</span></div><span className="eyebrow">WRITING CHALLENGE</span><h3>{contest.title}</h3><p>{contest.theme || "Bring your own voice to this community prompt."}</p><div className="contest-card-foot"><span><small>SUBMISSION</small><strong>{contest.deadline || "Open entry"}</strong></span><Link className="btn btn-primary" to="/write">Write yours <span aria-hidden="true">→</span></Link></div>{adminMode && canManage ? <button className="contest-delete" type="button" disabled={deleting === contest.id} onClick={() => removeContest(contest.id)}>{deleting === contest.id ? "Removing…" : "Remove challenge"}</button> : null}</article>)}</div> : null}
        {!loading && !contests.length ? <div className="contest-empty card-panel"><span aria-hidden="true">✧</span><h3>A new prompt is on its way.</h3><p className="meta">There are no open writing challenges at the moment. Your next story can still start today.</p><Link className="btn btn-primary" to="/write">Write your own story</Link></div> : null}
      </section>
      <section className="contest-encouragement"><span className="eyebrow">NO WRONG WAY TO BEGIN</span><p>Start with a character. Start with one line. Start with the feeling you can't quite shake.</p><Link to="/manage-stories">Open your writing desk <span aria-hidden="true">→</span></Link></section>
    </main>
  );
}
