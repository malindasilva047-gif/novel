'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiRequest, readToken } from '@/lib/api';

function compact(n) {
  const value = Number(n || 0);
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(value);
}

export default function PublicProfilePage() {
  const params = useParams();
  const router = useRouter();
  const userId = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [stories, setStories] = useState([]);
  const [isGeeked, setIsGeeked] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!userId) return;
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        const token = readToken();
        const [userRes, storiesRes, geekRes] = await Promise.all([
          apiRequest(`/users/${userId}`).catch(() => null),
          apiRequest('/stories?limit=120').catch(() => ({ stories: [] })),
          token ? apiRequest(`/users/${userId}/geek-status`, { token }).catch(() => null) : Promise.resolve(null),
        ]);

        if (!mounted) return;
        if (!userRes) {
          setToast('Author profile not found.');
          return;
        }

        setProfile(userRes);
        const all = Array.isArray(storiesRes?.stories) ? storiesRes.stories : [];
        setStories(all.filter((s) => String(s.author_id || '') === String(userId)));
        setIsGeeked(Boolean(geekRes?.is_geeked));
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const displayName = useMemo(() => {
    if (!profile) return 'Author';
    return profile.full_name || profile.username || 'Author';
  }, [profile]);

  async function toggleGeek() {
    const token = readToken();
    if (!token) {
      router.push(`/auth/signin?next=${encodeURIComponent(`/profile/${userId}`)}`);
      return;
    }

    try {
      const path = isGeeked ? `/users/${userId}/unfollow` : `/users/${userId}/follow`;
      const result = await apiRequest(path, { method: 'POST', token });
      setIsGeeked((prev) => !prev);
      setProfile((prev) => {
        if (!prev) return prev;
        const current = Number(prev.geeks_count || prev.followers_count || 0);
        const next = Math.max(0, current + (isGeeked ? -1 : 1));
        return {
          ...prev,
          geeks_count: next,
          followers_count: next,
        };
      });
      setToast(result?.message || 'Updated geek status.');
    } catch (err) {
      setToast(err?.message || 'Could not update geek status.');
    }
  }

  if (loading) {
    return <main style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>Loading author profile...</main>;
  }

  if (!profile) {
    return <main style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>Author profile not found.</main>;
  }

  return (
    <main style={{ maxWidth: 1160, margin: '0 auto', padding: '24px 20px 36px' }}>
      <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <div style={{ width: 54, height: 54, borderRadius: '50%', background: 'linear-gradient(135deg,#7c6df0,#f43f5e)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700 }}>
              {String(displayName).slice(0, 1).toUpperCase()}
            </div>
            <div>
              <h1 style={{ color: '#fff', margin: 0, fontFamily: 'Cormorant Garamond,serif', fontSize: 34, lineHeight: 1.1 }}>{displayName}</h1>
              <p style={{ color: 'var(--muted)', margin: '4px 0 0' }}>@{String(profile.username || displayName).toLowerCase().replace(/\s+/g, '_')}</p>
            </div>
          </div>
          <button className="bx-btn-primary" onClick={toggleGeek}>{isGeeked ? '✓ Geeked Author' : '+ Geek Author'}</button>
        </div>

        <p style={{ color: 'var(--muted)', marginTop: 14 }}>{profile.bio || 'Author profile'}</p>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10 }}>
          <div style={{ background: 'var(--deep)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', color: '#fff' }}><strong>{compact(profile.geeks_count || profile.followers_count)}</strong> Geeks</div>
          <div style={{ background: 'var(--deep)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', color: '#fff' }}><strong>{compact(stories.length)}</strong> Stories</div>
          <div style={{ background: 'var(--deep)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', color: '#fff' }}><strong>{compact(stories.reduce((sum, s) => sum + Number(s.views || 0), 0))}</strong> Reads</div>
        </div>
      </section>

      <section>
        <h2 style={{ color: '#fff', margin: '0 0 14px', fontFamily: 'Cormorant Garamond,serif', fontSize: 30 }}>Published Stories</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 14 }}>
          {stories.map((s, i) => (
            <button
              key={`${s.id || s._id}-${i}`}
              type="button"
              onClick={() => router.push(`/story/${s.id || s._id}`)}
              style={{ textAlign: 'left', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 10, cursor: 'pointer' }}
            >
              <div style={{ aspectRatio: '2 / 3', borderRadius: 8, overflow: 'hidden', background: '#1a1f2e', marginBottom: 8 }}>
                {s.cover_image ? <img src={s.cover_image} alt={s.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
              </div>
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{s.title}</div>
              <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>👁 {compact(s.views)} • ♥ {compact(s.likes)}</div>
            </button>
          ))}
          {!stories.length && <p style={{ color: 'var(--muted)' }}>No published stories yet.</p>}
        </div>
      </section>

      {toast && <div className="bx-toast show">{toast}</div>}
    </main>
  );
}
