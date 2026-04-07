'use client';
import { useState } from 'react';
import { Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiRequest, saveToken } from '@/lib/api';
import GoogleSignInButton from '@/components/GoogleSignInButton';

function SignInPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [needsVerif, setNeedsVerif] = useState(false);

  const nextPath = searchParams.get('next') || '/';

  async function finishLogin(accessToken, loginPayload = null) {
    saveToken(accessToken);
    if (loginPayload?.onboarding_required) {
      router.push(`/auth/onboarding?next=${encodeURIComponent(nextPath)}`);
      return;
    }
    try {
      const me = await apiRequest('/users/me', { token: accessToken });
      localStorage.setItem('user', JSON.stringify(me));
      if (!me?.profile_completed) {
        router.push(`/auth/onboarding?next=${encodeURIComponent(nextPath)}`);
        return;
      }
    } catch {
      localStorage.removeItem('user');
    }
    router.push(nextPath);
  }

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true); setError(''); setNeedsVerif(false);
    try {
      const data = await apiRequest('/auth/login', { method: 'POST', body: form });
      await finishLogin(data.access_token, data);
    } catch (err) {
      if (err.status === 403) { setNeedsVerif(true); setError('Your email is not verified yet. Please complete sign up Step 2.'); }
      else if (err.status === 401) setError('Invalid username/email or password.');
      else setError(err.message || 'Sign in failed. Please try again.');
    } finally { setLoading(false); }
  }

  async function handleGoogleSignIn(credential) {
    setGoogleLoading(true);
    setError('');
    setNeedsVerif(false);
    try {
      const data = await apiRequest('/auth/google', { method: 'POST', body: { credential } });
      await finishLogin(data.access_token, data);
    } catch (err) {
      setError(err.message || 'Google sign-in failed. Please try again.');
      setGoogleLoading(false);
    }
  }

  return (
    <div className="bx-auth-page">
      <div className="bx-auth-card">
        <div className="bx-auth-logo">Bi<span>x</span>bi</div>
        <h1 className="bx-auth-title">Welcome back</h1>
        <p className="bx-auth-sub">Sign in to continue your reading journey</p>

        {error && (
          <div className={`${needsVerif ? 'bx-auth-success' : 'bx-auth-error'}`} style={{marginBottom:'16px'}}>
            {error}
            {needsVerif && (
              <span> <Link href="/auth/signup" style={{color:'inherit',fontWeight:600}}>Complete sign up ?</Link></span>
            )}
          </div>
        )}

        <form className="bx-auth-form" onSubmit={onSubmit}>
          <div className="bx-auth-field">
            <label className="bx-auth-label">Username or Email</label>
            <input
              className="bx-auth-input"
              placeholder="Enter your username or email"
              value={form.identifier}
              onChange={e => setForm({...form, identifier: e.target.value})}
              required autoFocus
            />
          </div>
          <div className="bx-auth-field">
            <label className="bx-auth-label">Password</label>
            <input
              type="password"
              className="bx-auth-input"
              placeholder="Enter your password"
              value={form.password}
              onChange={e => setForm({...form, password: e.target.value})}
              required
            />
          </div>

          <button type="submit" className="bx-auth-submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div className="bx-auth-divider"><span>Or continue with</span></div>
        <GoogleSignInButton onCredential={handleGoogleSignIn} disabled={loading || googleLoading} />

        <div className="bx-auth-divider"><span>New to Bixbi?</span></div>
        <p className="bx-auth-link">
          <Link href="/auth/signup">Create a free account ?</Link>
        </p>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="bx-auth-page" />}>
      <SignInPageInner />
    </Suspense>
  );
}
