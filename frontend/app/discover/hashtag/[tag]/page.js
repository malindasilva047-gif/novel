'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest, readToken } from '@/lib/api';
import { appRoutes } from '@/lib/routes';

const SORTS = ['trending', 'new', 'top'];

function fmt(n) {
  const num = Number(n || 0);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(num);
}

export default function HashtagPage({ params }) {
  const router = useRouter();
  const tag = String(params?.tag || 'mystery').toLowerCase();

  const [sort, setSort] = useState('trending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [meta, setMeta] = useState({ story_count: 0, follower_count: 0, weekly_new: 0 });
  const [stories, setStories] = useState([]);
  const [trendingTags, setTrendingTags] = useState([]);
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const [toast, setToast] = useState('');

  const canFollow = Boolean(readToken());

  async function loadPageData(nextSort = sort) {
    setLoading(true);
    setError('');
    try {
      const [tagPayload, tagsPayload] = await Promise.all([
        apiRequest(`/discovery/hashtags/${encodeURIComponent(tag)}?sort=${nextSort}`),
        apiRequest('/discovery/hashtags?limit=10'),
      ]);

      setMeta({
        story_count: Number(tagPayload?.story_count || 0),
        follower_count: Number(tagPayload?.follower_count || 0),
        weekly_new: Number(tagPayload?.weekly_new || 0),
      });
      setStories(Array.isArray(tagPayload?.stories) ? tagPayload.stories : []);
      setTrendingTags(Array.isArray(tagsPayload) ? tagsPayload : []);
    } catch (e) {
      setError(e.message || 'Could not load hashtag data');
    } finally {
      setLoading(false);
    }
  }

  async function loadFollowStatus() {
    if (!canFollow) {
      setFollowing(false);
      return;
    }
    try {
      const data = await apiRequest(`/engagement/hashtags/${encodeURIComponent(tag)}/follow-status`);
      setFollowing(Boolean(data?.following));
    } catch {
      setFollowing(false);
    }
  }

  useEffect(() => {
    if (!SORTS.includes(sort)) setSort('trending');
  }, [sort]);

  useEffect(() => {
    loadPageData(sort);
    loadFollowStatus();
  }, [tag, sort]);

  async function toggleFollow() {
    if (!canFollow) {
      router.push(`/auth/signin?next=${encodeURIComponent(appRoutes.hashtag(tag))}`);
      return;
    }
    if (followBusy) return;
    setFollowBusy(true);
    try {
      if (following) {
        await apiRequest(`/engagement/hashtags/${encodeURIComponent(tag)}/follow`, { method: 'DELETE' });
        setFollowing(false);
        setMeta((p) => ({ ...p, follower_count: Math.max(0, p.follower_count - 1) }));
      } else {
        await apiRequest(`/engagement/hashtags/${encodeURIComponent(tag)}/follow`, { method: 'POST' });
        setFollowing(true);
        setMeta((p) => ({ ...p, follower_count: p.follower_count + 1 }));
      }
    } catch {
      // keep UI stable on API errors
    } finally {
      setFollowBusy(false);
    }
  }

  const heroTitle = useMemo(() => `#${tag}`, [tag]);
  
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  async function submitReport() {
    if (!canFollow) {
      router.push(`/auth/signin?next=${encodeURIComponent(appRoutes.hashtag(tag))}`);
      return;
    }
    const reason = reportReason.trim();
    if (!reason || reason.length < 3) return;
    setReportBusy(true);
    try {
      await apiRequest(`/engagement/hashtags/${encodeURIComponent(tag)}/report`, {
        method: 'POST',
        body: { reason },
      });
      setReportOpen(false);
      setReportReason('');
      setToast('Report submitted');
    } catch {
      setToast('Could not submit report');
    } finally {
      setReportBusy(false);
    }
  }

  return (
    <div className="hash-page">
      <div className="hero">
        <p className="eyebrow">Hashtag</p>
        <h1>{heroTitle}</h1>
        <div className="meta">
          <span>{fmt(meta.story_count)} stories</span>
          <span>{fmt(meta.follower_count)} followers</span>
          <span>+{fmt(meta.weekly_new)} this week</span>
        </div>
        <div className="hero-actions">
          <button className={`btn ${following ? 'btn-muted' : ''}`} onClick={toggleFollow} disabled={followBusy}>
            {following ? 'Following' : 'Follow'}
          </button>
          <button className="btn btn-muted" onClick={() => setReportOpen(true)}>
            Report
          </button>
          <button className="btn btn-muted" onClick={() => router.push('/discover')}>
            Back to Discover
          </button>
        </div>
      </div>

      <div className="layout">
        <aside className="sidebar">
          <div className="sidebar-title">Trending Tags</div>
          {trendingTags.map((t) => (
            <button key={t.tag} className={`tag-row ${t.tag === tag ? 'active' : ''}`} onClick={() => router.push(appRoutes.hashtag(t.tag))}>
              <span>#{t.tag}</span>
              <small>{fmt(t.story_count)}</small>
            </button>
          ))}
        </aside>

        <main className="content">
          <div className="tabs">
            {SORTS.map((k) => (
              <button key={k} className={`tab ${sort === k ? 'active' : ''}`} onClick={() => setSort(k)}>
                {k}
              </button>
            ))}
          </div>

          {loading && <div className="state">Loading hashtag stories...</div>}
          {!loading && error && <div className="state error">{error}</div>}

          {!loading && !error && (
            <div className="grid">
              {stories.map((s, idx) => (
                <article key={s.id || idx} className="card" onClick={() => router.push(`/story/${s.id}`)}>
                  <div className="cover">
                    {s.cover_image ? <img src={s.cover_image} alt={s.title} loading="lazy" /> : <span>📖</span>}
                  </div>
                  <div className="body">
                    <h3>{s.title}</h3>
                    <p>{s.author_name || 'Unknown author'}</p>
                    <div className="stats">
                      <span>👁 {fmt(s.views)}</span>
                      <span>♥ {fmt(s.likes)}</span>
                    </div>
                  </div>
                </article>
              ))}
              {stories.length === 0 && <div className="state">No stories found for this hashtag yet.</div>}
            </div>
          )}
        </main>
      </div>

      {reportOpen && (
        <div className="overlay" onClick={() => setReportOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Report #{tag}</h3>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="Reason for report..."
            />
            <div className="modal-actions">
              <button className="btn btn-muted" onClick={() => setReportOpen(false)}>Cancel</button>
              <button className="btn" onClick={submitReport} disabled={reportBusy || reportReason.trim().length < 3}>
                {reportBusy ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </div>
        </div>
      )}

      {!!toast && <div className="toast">{toast}</div>}

      <style jsx>{`
        .hash-page { padding: 16px; color: var(--text); }
        .hero { background: var(--card); border: 1px solid var(--card-border); border-radius: 16px; padding: 20px; margin-bottom: 16px; }
        .eyebrow { color: var(--muted); margin: 0 0 4px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; }
        h1 { margin: 0 0 8px; font-size: 32px; }
        .meta { display: flex; gap: 14px; flex-wrap: wrap; color: var(--muted); font-size: 13px; margin-bottom: 12px; }
        .hero-actions { display: flex; gap: 8px; }
        .btn { border: 1px solid var(--card-border); background: linear-gradient(135deg, #c8522a, #e8714a); color: #fff; border-radius: 999px; padding: 8px 16px; cursor: pointer; }
        .btn-muted { background: var(--bg3); color: var(--text); }
        .layout { display: grid; grid-template-columns: 260px 1fr; gap: 16px; }
        .sidebar { background: var(--card); border: 1px solid var(--card-border); border-radius: 12px; padding: 12px; height: fit-content; }
        .sidebar-title { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; }
        .tag-row { width: 100%; display: flex; justify-content: space-between; background: transparent; color: var(--text); border: 1px solid transparent; border-radius: 8px; padding: 8px; cursor: pointer; }
        .tag-row:hover, .tag-row.active { background: var(--bg3); border-color: var(--card-border); }
        .content { background: var(--card); border: 1px solid var(--card-border); border-radius: 12px; padding: 12px; }
        .tabs { display: flex; gap: 8px; margin-bottom: 12px; }
        .tab { background: var(--bg3); border: 1px solid var(--card-border); color: var(--muted); border-radius: 999px; padding: 6px 12px; cursor: pointer; text-transform: capitalize; }
        .tab.active { color: var(--text); border-color: #c8522a; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; }
        .card { background: var(--bg3); border: 1px solid var(--card-border); border-radius: 10px; overflow: hidden; cursor: pointer; }
        .cover { aspect-ratio: 2 / 3; background: var(--bg2); display: flex; align-items: center; justify-content: center; }
        .cover img { width: 100%; height: 100%; object-fit: cover; }
        .body { padding: 10px; }
        .body h3 { margin: 0 0 4px; font-size: 14px; line-height: 1.25; }
        .body p { margin: 0 0 8px; font-size: 12px; color: var(--muted); }
        .stats { display: flex; gap: 8px; font-size: 11px; color: var(--muted); }
        .state { padding: 20px; color: var(--muted); text-align: center; }
        .state.error { color: #f87171; }
        .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.55); display: flex; align-items: center; justify-content: center; z-index: 100; }
        .modal { width: min(420px, calc(100vw - 24px)); background: var(--card); border: 1px solid var(--card-border); border-radius: 12px; padding: 12px; }
        .modal h3 { margin: 0 0 10px; font-size: 16px; }
        .modal textarea { width: 100%; min-height: 110px; resize: vertical; border-radius: 8px; border: 1px solid var(--card-border); background: var(--bg3); color: var(--text); padding: 8px; }
        .modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px; }
        .toast { position: fixed; right: 16px; bottom: 16px; background: var(--bg3); border: 1px solid var(--card-border); border-radius: 8px; padding: 10px 14px; z-index: 120; }
        @media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}