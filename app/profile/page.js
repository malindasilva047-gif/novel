'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest, readToken } from '@/lib/api';

const PALETTES = [
  'linear-gradient(160deg,#1a0a2e,#3d1a5e)',
  'linear-gradient(160deg,#0a1628,#1a3060)',
  'linear-gradient(160deg,#1a0a10,#5e1a2e)',
  'linear-gradient(160deg,#0a1a0a,#1a3c1a)',
  'linear-gradient(160deg,#1a140a,#5e3c0a)',
];
const pal = (i) => PALETTES[Math.abs(i || 0) % PALETTES.length];

const BADGE_COLOR = {
  Bronze: '#4a3620',
  Silver: '#3b4557',
  Gold: '#5b4a16',
  Platinum: '#1d4b4f',
  Verified: '#234b2a',
  Unlocked: '#4c3e1d',
};

export default function ProfilePage() {
  const router = useRouter();
  const [tab, setTab] = useState('stories');
  const [user, setUser] = useState(null);
  const [stories, setStories] = useState([]);
  const [badges, setBadges] = useState([]);
  const [history, setHistory] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
  const [stats, setStats] = useState({ reads: 0, stories: 0, followers: 0, following: 0, likes: 0 });
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [editForm, setEditForm] = useState({
    full_name: '',
    bio: '',
    location: '',
    country: '',
    phone: '',
    date_of_birth: '',
    gender: '',
    website: '',
    preferred_language: '',
    reading_goal: '',
  });

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {}
    }

    const token = readToken();
    if (!token) {
      setLoading(false);
      return;
    }

    Promise.all([
      apiRequest('/users/me', { token }).catch(() => null),
      apiRequest('/stories/mine', { token }).catch(() => []),
      apiRequest('/reader/badges', { token }).catch(() => []),
      apiRequest('/reader/history', { token }).catch(() => []),
      apiRequest('/reader/bookmarks', { token }).catch(() => []),
      apiRequest('/users/me/stats', { token }).catch(() => null),
    ]).then(([me, mine, badgeData, historyData, bookmarkData, statsData]) => {
      if (me) {
        setUser(me);
        localStorage.setItem('user', JSON.stringify(me));
      }
      setStories(Array.isArray(mine) ? mine : []);
      setBadges(Array.isArray(badgeData) ? badgeData : []);
      setHistory(Array.isArray(historyData) ? historyData : []);
      setBookmarks(Array.isArray(bookmarkData) ? bookmarkData : []);
      if (statsData) {
        setStats({
          reads: Number(statsData.reads || 0),
          stories: Number(statsData.stories || 0),
          followers: Number(statsData.followers || 0),
          following: Number(statsData.following || 0),
          likes: Number(statsData.likes || 0),
        });
      }
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const token = readToken();
    if (!token) return;

    const interval = setInterval(async () => {
      try {
        const statsData = await apiRequest('/users/me/stats', { token });
        setStats({
          reads: Number(statsData.reads || 0),
          stories: Number(statsData.stories || 0),
          followers: Number(statsData.followers || 0),
          following: Number(statsData.following || 0),
          likes: Number(statsData.likes || 0),
        });
      } catch {
        // Ignore polling errors
      }
    }, 12000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!user) return;
    setEditForm({
      full_name: user.full_name || '',
      bio: user.bio || '',
      location: user.location || '',
      country: user.country || '',
      phone: user.phone || '',
      date_of_birth: user.date_of_birth || '',
      gender: user.gender || '',
      website: user.website || '',
      preferred_language: user.preferred_language || '',
      reading_goal: user.reading_goal || '',
    });
  }, [user]);

  async function saveProfile() {
    const token = readToken();
    if (!token) {
      setProfileMsg('Please sign in again.');
      return;
    }
    try {
      setSavingProfile(true);
      setProfileMsg('');
      await apiRequest('/users/me', {
        method: 'PATCH',
        token,
        body: {
          full_name: editForm.full_name,
          bio: editForm.bio,
          location: editForm.location,
          country: editForm.country,
          phone: editForm.phone,
          date_of_birth: editForm.date_of_birth,
          gender: editForm.gender,
          website: editForm.website,
          favorite_genres: user?.favorite_genres || [],
          reading_goal: editForm.reading_goal,
          preferred_language: editForm.preferred_language,
        },
      });
      const refreshed = await apiRequest('/users/me', { token });
      setUser(refreshed);
      localStorage.setItem('user', JSON.stringify(refreshed));
      setProfileMsg('Profile updated successfully.');
    } catch (err) {
      setProfileMsg(err.message || 'Could not update profile.');
    } finally {
      setSavingProfile(false);
    }
  }

  if (!user && !loading) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
        <p style={{ color: 'var(--muted)', fontSize: '16px' }}>Sign in to view your profile</p>
        <button className="bx-btn-primary" onClick={() => router.push('/auth/signin')}>Sign In</button>
      </div>
    );
  }

  const username = user?.username || user?.full_name || 'Reader';
  const initials = username.slice(0, 2).toUpperCase();

  return (
    <main style={{ paddingBottom: '60px' }}>
      <div className="bx-cover-banner" />

      <div className="bx-profile-sec">
        <div className="bx-profile-top">
          <div style={{ position: 'relative' }}>
            <div className="bx-pav">{initials}</div>
            <span className="bx-vbadge">*</span>
          </div>
          <div className="bx-profile-cta">
            <button className="bx-btn-primary" onClick={() => router.push('/write')}>+ New Story</button>
            <button className="bx-btn-ghost" style={{ fontSize: '13px', padding: '7px 14px' }} onClick={() => setTab('about')}>Edit Profile</button>
          </div>
        </div>

        <div className="bx-profile-name">{username}</div>
        <div className="bx-profile-handle">@{user?.email?.split('@')[0] || username.toLowerCase().replace(/\s/g, '_')}</div>
        <p className="bx-profile-bio">{user?.bio || 'I write stories that live between the real and the impossible. Fantasy, romance, and everything in between.'}</p>

        <div className="bx-profile-meta">
          <span className="bx-pmi">Location: {user?.location || 'Earth'}</span>
          <span className="bx-pmi">Country: {user?.country || 'Not set'}</span>
          <span className="bx-pmi">Joined: {user?.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'Recently'}</span>
          <span className="bx-pmi">Email: {user?.email}</span>
        </div>

        <div className="bx-profile-badges" style={{ marginTop: '14px' }}>
          {badges.slice(0, 6).map((b, i) => (
            <div key={`${b.badge_key || b.title}-${i}`} className="bx-badge-chip" style={{ background: BADGE_COLOR[b.tier] || '#2e2e3a', borderColor: 'transparent', opacity: b.unlocked === false ? 0.45 : 1 }}>
              <span>Badge</span>
              <span>{b.title}{b.tier ? ` | ${b.tier}` : ''}</span>
            </div>
          ))}
          {badges.length === 0 && <div className="bx-badge-chip" style={{ background: '#2e2e3a' }}>No badges yet</div>}
        </div>
      </div>

      <div className="bx-profile-sec" style={{ paddingTop: '16px', paddingBottom: '0' }}>
        <div className="bx-stats-row">
          {[
            [String(stats.reads || 0), 'Reads'],
            [String(stats.stories || 0), 'Stories'],
            [String(stats.followers || 0), 'Followers'],
            [String(stats.following || 0), 'Following'],
            [String(stats.likes || 0), 'Likes'],
          ].map(([n, l]) => (
            <div className="bx-sti" key={l}>
              <span className="bx-stn">{n}</span>
              <span className="bx-stl">{l}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bx-channel-nav" style={{ marginTop: '16px' }}>
        <div className="bx-chtabs">
          {['stories', 'reading', 'activity', 'about', 'badges'].map((t) => (
            <button key={t} className={`bx-chtab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="bx-profile-sec" style={{ paddingTop: '24px' }}>
        {tab === 'stories' && (
          <div className="bx-slist">
            {stories.map((s, i) => (
              <div key={s._id || s.id || i} className="bx-scard" onClick={() => router.push(`/read/${s._id || s.id}`)}>
                <div className="bx-scov" style={{ background: pal(i) }}>
                  {s.cover_image && <img src={s.cover_image} alt={s.title} />}
                  {!s.cover_image && s.title.slice(0, 30)}
                </div>
                <div className="bx-sinf">
                  <div className="bx-stitle">{s.title}</div>
                  <p className="bx-sdesc">{s.description || s.summary || ''}</p>
                  <div className="bx-stags"><span className="bx-stag">{(s.categories || [])[0] || 'Fiction'}</span></div>
                  <div className="bx-sfooter">
                    <span className="bx-sstat">Views {s.views || 0}</span>
                    <span className="bx-sstat">Likes {s.likes || 0}</span>
                    <span className={`bx-sstatus ${s.status || 'ongoing'}`}>{s.status || 'Ongoing'}</span>
                  </div>
                </div>
              </div>
            ))}
            {stories.length === 0 && <div style={{ color: 'var(--muted)', padding: '24px 0' }}>No stories yet. Start writing from /write.</div>}
          </div>
        )}

        {tab === 'reading' && (
          <div style={{ display: 'grid', gap: '10px' }}>
            {bookmarks.map((b, i) => (
              <div key={`${b.story_id}-${i}`} className="chapter-card" style={{ cursor: 'pointer' }} onClick={() => router.push(`/read/${b.story_id}`)}>
                <div style={{ fontSize: '14px', color: '#fff' }}>{b.title}</div>
                <div className="token-state">Bookmarked</div>
              </div>
            ))}
            {bookmarks.length === 0 && <p style={{ color: 'var(--muted)' }}>No reading list items yet.</p>}
          </div>
        )}

        {tab === 'activity' && (
          <div style={{ display: 'grid', gap: '10px' }}>
            {history.map((h, i) => (
              <div key={`${h.story_id}-${i}`} className="chapter-card" style={{ cursor: 'pointer' }} onClick={() => router.push(`/read/${h.story_id}`)}>
                <div style={{ fontSize: '14px', color: '#fff' }}>{h.title}</div>
                <div className="token-state">Progress: {Math.round(h.progress_pct || 0)}%</div>
              </div>
            ))}
            {history.length === 0 && <p style={{ color: 'var(--muted)' }}>No recent reading activity.</p>}
          </div>
        )}

        {tab === 'about' && (
          <div style={{ maxWidth: '640px' }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px' }}>
              <h3 style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: '20px', color: '#fff', marginBottom: '16px', fontWeight: 400 }}>About {username}</h3>
              <div style={{ display: 'grid', gap: '10px' }}>
                <label className="bx-auth-label">Username (locked)</label>
                <input className="bx-auth-input" value={user?.username || ''} readOnly disabled />
                <label className="bx-auth-label">Email (locked)</label>
                <input className="bx-auth-input" value={user?.email || ''} readOnly disabled />
                <label className="bx-auth-label">Name (locked after first setup)</label>
                <input className="bx-auth-input" value={editForm.full_name} readOnly disabled />
                <label className="bx-auth-label">Date Of Birth (locked after first setup)</label>
                <input className="bx-auth-input" value={editForm.date_of_birth} readOnly disabled />
                <label className="bx-auth-label">Bio</label>
                <textarea className="bx-auth-input" rows={3} value={editForm.bio} onChange={(e) => setEditForm((prev) => ({ ...prev, bio: e.target.value }))} style={{ resize: 'vertical', fontFamily: 'DM Sans,sans-serif' }} />
                <label className="bx-auth-label">Location</label>
                <input className="bx-auth-input" value={editForm.location} onChange={(e) => setEditForm((prev) => ({ ...prev, location: e.target.value }))} />
                <label className="bx-auth-label">Country</label>
                <input className="bx-auth-input" value={editForm.country} onChange={(e) => setEditForm((prev) => ({ ...prev, country: e.target.value }))} />
                <label className="bx-auth-label">Phone</label>
                <input className="bx-auth-input" value={editForm.phone} onChange={(e) => setEditForm((prev) => ({ ...prev, phone: e.target.value }))} />
                <label className="bx-auth-label">Gender</label>
                <input className="bx-auth-input" value={editForm.gender} onChange={(e) => setEditForm((prev) => ({ ...prev, gender: e.target.value }))} />
                <label className="bx-auth-label">Website</label>
                <input className="bx-auth-input" value={editForm.website} onChange={(e) => setEditForm((prev) => ({ ...prev, website: e.target.value }))} />
                <label className="bx-auth-label">Preferred Language</label>
                <input className="bx-auth-input" value={editForm.preferred_language} onChange={(e) => setEditForm((prev) => ({ ...prev, preferred_language: e.target.value }))} />
                <label className="bx-auth-label">Reading Goal</label>
                <input className="bx-auth-input" value={editForm.reading_goal} onChange={(e) => setEditForm((prev) => ({ ...prev, reading_goal: e.target.value }))} />
                <button className="bx-btn-primary" onClick={saveProfile} disabled={savingProfile} style={{ marginTop: '8px' }}>
                  {savingProfile ? 'Saving...' : 'Save Profile'}
                </button>
                {profileMsg && <p style={{ fontSize: '12px', color: 'var(--muted)' }}>{profileMsg}</p>}
              </div>
              {(user?.favorite_genres || []).length > 0 && (
                <>
                  <div style={{ height: '1px', background: 'var(--border)', margin: '20px 0' }} />
                  <p style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Favourite Genres</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {(user.favorite_genres || []).map((g) => <span key={g} className="bx-stag" style={{ fontSize: '12px', padding: '4px 12px' }}>{g}</span>)}
                  </div>
                </>
              )}
              <div style={{ height: '1px', background: 'var(--border)', margin: '20px 0' }} />
              <p style={{ fontSize: '13px', color: 'var(--muted)' }}>Preferred language: {user?.preferred_language || 'Not set'}</p>
              <p style={{ fontSize: '13px', color: 'var(--muted)' }}>Reading goal: {user?.reading_goal || 'Not set'}</p>
              <p style={{ fontSize: '13px', color: 'var(--muted)' }}>Phone: {user?.phone || 'Not set'}</p>
            </div>
          </div>
        )}

        {tab === 'badges' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: '12px' }}>
            {badges.map((b, i) => (
              <div key={`${b.badge_key || b.title}-${i}`} style={{ background: BADGE_COLOR[b.tier] || '#2e2e3a', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px', textAlign: 'center', opacity: b.unlocked === false ? 0.45 : 1 }}>
                <div style={{ fontSize: '22px', marginBottom: '10px' }}>Badge</div>
                <div style={{ fontSize: '14px', fontWeight: 500, color: '#fff', marginBottom: '4px' }}>{b.title}</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)', marginBottom: '4px' }}>{b.tier || 'Locked'}</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
                  {b.unlocked === false
                    ? `Progress ${b.progress_value || 0}${b.next_target ? ` / ${b.next_target}` : ''}`
                    : (b.description || 'Achievement unlocked')}
                </div>
              </div>
            ))}
            {badges.length === 0 && <p style={{ color: 'var(--muted)' }}>No badges yet.</p>}
          </div>
        )}
      </div>
    </main>
  );
}
