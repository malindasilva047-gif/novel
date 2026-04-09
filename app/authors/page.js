'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest } from '@/lib/api';

const AVATAR_COLORS = [
  '#8B4513', '#2F4F4F', '#663399', '#DC143C',
  '#4169E1', '#FF8C00', '#008080', '#9B2335',
];

const FALLBACK_AUTHORS = [
  { id: 'mock-1', username: 'Elena Rose',   full_name: 'Elena Rose',   bio: 'Fantasy & Romance — weaving enchanted worlds.', story_count: 5, total_likes: 1240, profile_image: '' },
  { id: 'mock-2', username: 'Marcus Stone', full_name: 'Marcus Stone', bio: 'Sci-Fi thriller with hard science undertones.',   story_count: 3, total_likes: 890,  profile_image: '' },
  { id: 'mock-3', username: 'Aurora Sky',   full_name: 'Aurora Sky',   bio: 'Literary fiction & poetry that moves the soul.',   story_count: 7, total_likes: 2100, profile_image: '' },
  { id: 'mock-4', username: 'Blake Morgan', full_name: 'Blake Morgan', bio: 'Mystery & Horror — every page a new dread.',         story_count: 4, total_likes: 760,  profile_image: '' },
  { id: 'mock-5', username: 'Dr. Kepler',   full_name: 'Dr. Kepler',   bio: 'Hard sci-fi & speculative futures.',                story_count: 6, total_likes: 1580, profile_image: '' },
  { id: 'mock-6', username: 'James Chen',   full_name: 'James Chen',   bio: 'Wuxia & Eastern Fantasy with epic scope.',          story_count: 2, total_likes: 430,  profile_image: '' },
  { id: 'mock-7', username: 'Sofia Night',  full_name: 'Sofia Night',  bio: 'Dark romance and forbidden love stories.',          story_count: 4, total_likes: 1100, profile_image: '' },
  { id: 'mock-8', username: 'Ash Stormwood',full_name: 'Ash Stormwood','bio':'Adventure & Isekai — portal worlds await.',       story_count: 5, total_likes: 960,  profile_image: '' },
];

function initials(name) {
  return (name || '?')
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function fmtNumber(n) {
  if (!n) return '0';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

export default function AuthorsPage() {
  const router = useRouter();
  const [authors, setAuthors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [followed, setFollowed] = useState(new Set());
  const [toast, setToast] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await apiRequest('/discovery/authors?limit=50');
        setAuthors(Array.isArray(data) && data.length ? data : FALLBACK_AUTHORS);
      } catch {
        setAuthors(FALLBACK_AUTHORS);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 2800);
  }

  function handleGeek(id, name) {
    setFollowed(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        showToast(`Removed Geek from ${name}`);
      } else {
        next.add(id);
        showToast(`Geeked ${name}`);
      }
      return next;
    });
  }

  const filtered = search
    ? authors.filter(a => {
        const q = search.toLowerCase();
        return (
          (a.username || '').toLowerCase().includes(q) ||
          (a.full_name || '').toLowerCase().includes(q) ||
          (a.bio || '').toLowerCase().includes(q)
        );
      })
    : authors;

  return (
    <main style={{ minHeight: '100vh', background: 'var(--ink)', paddingBottom: 80 }}>

      {/* ── Page Header ── */}
      <div style={{
        background: 'linear-gradient(180deg, var(--deep) 0%, var(--ink) 100%)',
        borderBottom: '1px solid var(--border)',
        padding: '48px 24px 40px',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <p style={{ color: 'var(--gold)', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
            Community
          </p>
          <h1 style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 400,
            color: '#fff', marginBottom: 14, lineHeight: 1.1,
          }}>
            Meet the Authors
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 15, maxWidth: 480, lineHeight: 1.6, marginBottom: 32 }}>
            Voices that shape worlds — discover the writers behind your favourite stories.
          </p>

          {/* Search */}
          <div style={{ position: 'relative', maxWidth: 380 }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search authors…"
              style={{
                width: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
                color: 'var(--text)', padding: '12px 44px 12px 16px', borderRadius: 10,
                fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: 16, pointerEvents: 'none' }}>
              🔍
            </span>
          </div>
        </div>
      </div>

      {/* ── Author Grid ── */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px 0' }}>

        {loading ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 20,
          }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{
                background: 'var(--surface)', borderRadius: 14, padding: 24,
                border: '1px solid var(--border)', height: 180,
                animation: 'pulse 1.5s infinite',
              }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '80px 0', fontSize: 15 }}>
            No authors found{search ? ` for "${search}"` : ''}.
          </p>
        ) : (
          <>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 24 }}>
              {filtered.length} author{filtered.length !== 1 ? 's' : ''}
            </p>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 20,
            }}>
              {filtered.map((author, i) => {
                const colorBg = AVATAR_COLORS[i % AVATAR_COLORS.length];
                const isFollowed = followed.has(author.id);
                const displayName = author.full_name || author.username || 'Unknown';

                return (
                  <div
                    key={author.id}
                    style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 14,
                      padding: 24,
                      cursor: 'pointer',
                      transition: 'border-color 0.2s, transform 0.2s',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 14,
                    }}
                    onClick={() => router.push(`/discover?q=${encodeURIComponent(author.username)}`)}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = 'rgba(201,169,110,0.35)';
                      e.currentTarget.style.transform = 'translateY(-3px)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'var(--border)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    {/* Avatar + geek */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        {author.profile_image ? (
                          <img
                            src={author.profile_image}
                            alt={displayName}
                            style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)' }}
                          />
                        ) : (
                          <div style={{
                            width: 56, height: 56, borderRadius: '50%',
                            background: colorBg,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontFamily: "'Cormorant Garamond', serif",
                            fontSize: 20, fontWeight: 600, color: '#fff',
                            border: '2px solid var(--border)',
                            flexShrink: 0,
                          }}>
                            {initials(displayName)}
                          </div>
                        )}
                        <div>
                          <p style={{ color: 'var(--text)', fontWeight: 500, fontSize: 15, marginBottom: 2, lineHeight: 1.3 }}>
                            {displayName}
                          </p>
                          {author.username && author.full_name && author.username !== author.full_name && (
                            <p style={{ color: 'var(--muted)', fontSize: 12 }}>@{author.username}</p>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={e => { e.stopPropagation(); handleGeek(author.id, displayName); }}
                        style={{
                          background: isFollowed ? 'var(--gold-soft)' : 'none',
                          border: '1px solid ' + (isFollowed ? 'rgba(201,169,110,0.4)' : 'var(--border)'),
                          color: isFollowed ? 'var(--gold)' : 'var(--muted)',
                          padding: '5px 14px', borderRadius: 20,
                          fontSize: 12, cursor: 'pointer', fontWeight: 500,
                          fontFamily: "'DM Sans', sans-serif",
                          transition: 'all 0.2s', whiteSpace: 'nowrap', flexShrink: 0,
                        }}
                      >
                        {isFollowed ? '✓ Geeked' : '+ Geek'}
                      </button>
                    </div>

                    {/* Bio */}
                    {author.bio && (
                      <p style={{
                        color: 'var(--muted)', fontSize: 13, lineHeight: 1.55,
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}>
                        {author.bio}
                      </p>
                    )}

                    {/* Stats */}
                    <div style={{ display: 'flex', gap: 18, borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 'auto' }}>
                      <div>
                        <p style={{ color: 'var(--text)', fontWeight: 600, fontSize: 16 }}>
                          {author.story_count || 0}
                        </p>
                        <p style={{ color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Stories</p>
                      </div>
                      <div>
                        <p style={{ color: 'var(--text)', fontWeight: 600, fontSize: 16 }}>
                          {fmtNumber(author.total_likes)}
                        </p>
                        <p style={{ color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Likes</p>
                      </div>
                      {author.total_views > 0 && (
                        <div>
                          <p style={{ color: 'var(--text)', fontWeight: 600, fontSize: 16 }}>
                            {fmtNumber(author.total_views)}
                          </p>
                          <p style={{ color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Views</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--surface)', border: '1px solid var(--border)',
          color: 'var(--text)', padding: '10px 20px', borderRadius: 10,
          fontSize: 13, zIndex: 999, whiteSpace: 'nowrap',
          boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        }}>
          {toast}
        </div>
      )}
    </main>
  );
}
