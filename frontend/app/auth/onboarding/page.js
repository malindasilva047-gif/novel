'use client';

import { useEffect, useMemo, useState } from 'react';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiRequest, readToken } from '@/lib/api';

const GENRES = ['Fantasy', 'Romance', 'Mystery', 'Sci-Fi', 'Horror', 'Adventure', 'Drama', 'Teen Fiction', 'Fan Fiction', 'Poetry'];

function OnboardingPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = useMemo(() => searchParams.get('next') || '/', [searchParams]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    full_name: '',
    bio: '',
    location: '',
    country: '',
    phone: '',
    date_of_birth: '',
    gender: '',
    website: '',
    reading_goal: '',
    preferred_language: 'English',
    favorite_genres: [],
  });

  useEffect(() => {
    const token = readToken();
    if (!token) {
      router.replace(`/auth/signin?next=${encodeURIComponent(nextPath)}`);
      return;
    }

    apiRequest('/users/me', { token })
      .then((me) => {
        if (me?.profile_completed) {
          router.replace(nextPath);
          return;
        }
        setForm((prev) => ({
          ...prev,
          full_name: me?.full_name || '',
          bio: me?.bio || '',
          location: me?.location || '',
          country: me?.country || '',
          phone: me?.phone || '',
          date_of_birth: me?.date_of_birth || '',
          gender: me?.gender || '',
          website: me?.website || '',
          reading_goal: me?.reading_goal || '',
          preferred_language: me?.preferred_language || 'English',
          favorite_genres: Array.isArray(me?.favorite_genres) ? me.favorite_genres : [],
        }));
      })
      .catch(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.replace('/auth/signin');
      })
      .finally(() => setLoading(false));
  }, [nextPath, router]);

  const toggleGenre = (genre) => {
    setForm((prev) => {
      const exists = prev.favorite_genres.includes(genre);
      return {
        ...prev,
        favorite_genres: exists
          ? prev.favorite_genres.filter((item) => item !== genre)
          : [...prev.favorite_genres, genre],
      };
    });
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiRequest('/users/me', { method: 'PATCH', body: form });
      const me = await apiRequest('/users/me');
      localStorage.setItem('user', JSON.stringify(me));
      router.replace(nextPath);
    } catch (err) {
      setError(err.message || 'Could not save your profile right now.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <main className="bx-section" style={{ minHeight: '60vh' }} />;
  }

  return (
    <main className="bx-section" style={{ maxWidth: '840px' }}>
      <div className="bx-auth-card" style={{ margin: '0 auto', maxWidth: '760px' }}>
        <h1 className="bx-auth-title">Complete your profile</h1>
        <p className="bx-auth-sub">This helps us show better stories for your interests and location.</p>
        {error ? <div className="bx-auth-error" style={{ marginBottom: '14px' }}>{error}</div> : null}

        <form className="bx-auth-form" onSubmit={submit}>
          <div className="bx-auth-field">
            <label className="bx-auth-label">Full Name</label>
            <input className="bx-auth-input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
          </div>

          <div className="bx-auth-field">
            <label className="bx-auth-label">Bio</label>
            <textarea className="bx-auth-input" rows={3} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} required />
          </div>

          <div className="bx-auth-grid-2">
            <div className="bx-auth-field">
              <label className="bx-auth-label">Location (City)</label>
              <input className="bx-auth-input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} required />
            </div>
            <div className="bx-auth-field">
              <label className="bx-auth-label">Country</label>
              <input className="bx-auth-input" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} required />
            </div>
          </div>

          <div className="bx-auth-grid-2">
            <div className="bx-auth-field">
              <label className="bx-auth-label">Phone</label>
              <input className="bx-auth-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="bx-auth-field">
              <label className="bx-auth-label">Date of Birth</label>
              <input type="date" className="bx-auth-input" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
            </div>
          </div>

          <div className="bx-auth-grid-2">
            <div className="bx-auth-field">
              <label className="bx-auth-label">Gender</label>
              <input className="bx-auth-input" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} placeholder="Optional" />
            </div>
            <div className="bx-auth-field">
              <label className="bx-auth-label">Preferred Language</label>
              <input className="bx-auth-input" value={form.preferred_language} onChange={(e) => setForm({ ...form, preferred_language: e.target.value })} required />
            </div>
          </div>

          <div className="bx-auth-field">
            <label className="bx-auth-label">Website</label>
            <input className="bx-auth-input" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://" />
          </div>

          <div className="bx-auth-field">
            <label className="bx-auth-label">Reading Goal</label>
            <input className="bx-auth-input" value={form.reading_goal} onChange={(e) => setForm({ ...form, reading_goal: e.target.value })} placeholder="Read 12 novels this month" />
          </div>

          <div className="bx-auth-field">
            <label className="bx-auth-label">Favorite Genres</label>
            <div className="bx-onboard-genre-wrap">
              {GENRES.map((genre) => (
                <button
                  type="button"
                  key={genre}
                  className={`bx-onboard-genre ${form.favorite_genres.includes(genre) ? 'active' : ''}`}
                  onClick={() => toggleGenre(genre)}
                >
                  {genre}
                </button>
              ))}
            </div>
          </div>

          <button type="submit" className="bx-auth-submit" disabled={saving}>
            {saving ? 'Saving profile...' : 'Save and Continue'}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<main className="bx-section" style={{ minHeight: '60vh' }} />}>
      <OnboardingPageInner />
    </Suspense>
  );
}
