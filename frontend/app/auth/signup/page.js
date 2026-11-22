'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiRequest, fetchSiteSettings, saveToken } from '@/lib/api';
import GoogleSignInButton from '@/components/GoogleSignInButton';

const STEPS = ['Account', 'Verify', 'Profile'];

export default function SignUpPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    token: '',
    pen_name: '',
    bio: '',
    fav_genres: [],
    location: '',
    country: '',
    phone: '',
    date_of_birth: '',
    gender: '',
    website: '',
    reading_goal: '',
    preferred_language: 'English',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [siteSettings, setSiteSettings] = useState({ site_name: 'Bixbi', login_config: { email_enabled: true, google_enabled: true } });

  const GENRES = ['Fantasy','Romance','Mystery','Sci-Fi','Horror','Adventure','Drama','Teen Fiction'];

  useEffect(() => {
    fetchSiteSettings().then(setSiteSettings).catch(() => {});
  }, []);

  async function hydrateUser(accessToken) {
    saveToken(accessToken);
    try {
      const me = await apiRequest('/users/me', { token: accessToken });
      localStorage.setItem('user', JSON.stringify(me));
      setForm((current) => ({
        ...current,
        email: me.email || current.email,
        pen_name: me.full_name || current.pen_name,
        bio: me.bio || current.bio,
        fav_genres: Array.isArray(me.favorite_genres) ? me.favorite_genres : current.fav_genres,
        location: me.location || current.location,
        country: me.country || current.country,
        phone: me.phone || current.phone,
        date_of_birth: me.date_of_birth || current.date_of_birth,
        gender: me.gender || current.gender,
        website: me.website || current.website,
        reading_goal: me.reading_goal || current.reading_goal,
        preferred_language: me.preferred_language || current.preferred_language,
      }));
      return me;
    } catch {
      localStorage.removeItem('user');
      return null;
    }
  }

  async function handleGoogleSignup(credential) {
    setGoogleLoading(true);
    setError('');
    setSuccess('');
    try {
      const data = await apiRequest('/auth/google', { method: 'POST', body: { credential } });
      const me = await hydrateUser(data.access_token);
      if (data.is_new_user || !me?.profile_completed) {
        router.push('/auth/onboarding?next=%2F');
      } else {
        setSuccess('Welcome back. Signed in with Google successfully.');
        router.push('/');
      }
    } catch (err) {
      setError(err.message || 'Google sign-up failed. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleStep1(e) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const result = await apiRequest('/auth/signup', { method: 'POST', body: { username: form.username, email: form.email, password: form.password } });
      if (result.auto_verified) {
        setSuccess('Account created! Please sign in to complete your profile setup.');
        setTimeout(() => router.push('/auth/signin?next=%2Fauth%2Fonboarding'), 900);
      } else {
        setStep(2);
        setSuccess('Account created! Check your email for a verification code.');
      }
    } catch (err) {
      const msg = (err?.message || '').toLowerCase();
      if (err?.status === 400 && msg.includes('email already registered')) {
        try {
          await apiRequest('/auth/resend-verification', { method: 'POST', body: { email: form.email } });
          setStep(2);
          setSuccess('This email is already registered. We sent a fresh verification code to your inbox.');
          setError('');
        } catch {
          setError('Email is already registered. Try signing in, or use a different email.');
        }
      } else if (err?.status === 400 && msg.includes('username already registered')) {
        setError('This username is already taken. Please choose a different username.');
      } else {
        setError(err.message || 'Registration failed.');
      }
    }
    finally { setLoading(false); }
  }

  async function handleStep2(e) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await apiRequest('/auth/verify-email', { method: 'POST', body: { email: form.email, token: form.token } });
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setSuccess('Email verified! Please login to continue profile setup.');
      setTimeout(() => router.push('/auth/signin?next=%2Fauth%2Fonboarding'), 1200);
    } catch (err) { setError(err.message || 'Verification failed. Check the code.'); }
    finally { setLoading(false); }
  }

  async function handleStep3(e) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await apiRequest('/users/me', {
        method: 'PATCH',
        body: {
          full_name: form.pen_name,
          bio: form.bio,
          location: form.location,
          country: form.country,
          phone: form.phone,
          date_of_birth: form.date_of_birth,
          gender: form.gender,
          website: form.website,
          favorite_genres: form.fav_genres,
          reading_goal: form.reading_goal,
          preferred_language: form.preferred_language,
        }
      }).catch(() => {});
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setSuccess('Profile complete! Welcome to Bixbi!');
      setTimeout(() => router.push('/auth/signin'), 1500);
    } catch { router.push('/auth/signin'); }
    finally { setLoading(false); }
  }

  const toggleGenre = (g) => setForm(f => ({ ...f, fav_genres: f.fav_genres.includes(g) ? f.fav_genres.filter(x => x !== g) : [...f.fav_genres, g] }));

  return (
    <div className="bx-auth-page">
      <div className="bx-auth-card">
        <div className="bx-auth-logo">{siteSettings.site_name}</div>

        <div className="bx-steps" style={{marginBottom:'24px'}}>
          {STEPS.map((s, i) => (
            <div key={s} className={`bx-step${step === i+1 ? ' active' : step > i+1 ? ' done' : ''}`}>
              <div className="bx-step-num">{step > i+1 ? '?' : i+1}</div>
              <div className="bx-step-label">{s}</div>
            </div>
          ))}
        </div>

        {error && <div className="bx-auth-error" style={{marginBottom:'16px'}}>{error}</div>}
        {success && <div className="bx-auth-success" style={{marginBottom:'16px'}}>{success}</div>}

        {step === 1 && (
          <>
            <h2 className="bx-auth-title">Create account</h2>
            <p className="bx-auth-sub">Join millions of readers and writers</p>
            {siteSettings?.login_config?.email_enabled !== false && (
              <form className="bx-auth-form" onSubmit={handleStep1}>
                <div className="bx-auth-field">
                  <label className="bx-auth-label">Username</label>
                  <input className="bx-auth-input" placeholder="Choose a username" value={form.username} onChange={e => setForm({...form, username: e.target.value})} required autoFocus />
                </div>
                <div className="bx-auth-field">
                  <label className="bx-auth-label">Email</label>
                  <input type="email" className="bx-auth-input" placeholder="Enter your email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required />
                </div>
                <div className="bx-auth-field">
                  <label className="bx-auth-label">Password</label>
                  <input type="password" className="bx-auth-input" placeholder="Create a strong password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} required minLength={8} />
                </div>
                <button type="submit" className="bx-auth-submit" disabled={loading}>{loading ? 'Creating…' : 'Create Account'}</button>
              </form>
            )}
            {siteSettings?.login_config?.google_enabled !== false && (
              <>
                <div className="bx-auth-divider"><span>Or continue with</span></div>
                <GoogleSignInButton onCredential={handleGoogleSignup} disabled={loading || googleLoading} text="signup_with" useRedirect={true} />
              </>
            )}
            {siteSettings?.login_config?.email_enabled === false && siteSettings?.login_config?.google_enabled === false && (
              <div className="bx-auth-error" style={{marginBottom:'16px'}}>New registrations are currently disabled by the administrator.</div>
            )}
            <div className="bx-auth-divider"><span>Already have an account?</span></div>
            <p className="bx-auth-link"><Link href="/auth/signin">Sign in ?</Link></p>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="bx-auth-title">Verify email</h2>
            <p className="bx-auth-sub">Enter the code sent to <strong style={{color:'var(--text)'}}>{form.email}</strong></p>
            <form className="bx-auth-form" onSubmit={handleStep2}>
              <div className="bx-auth-field">
                <label className="bx-auth-label">Verification Code</label>
                <input className="bx-auth-input" placeholder="Enter 6-digit code" value={form.token} onChange={e => setForm({...form, token: e.target.value})} required autoFocus maxLength={10} style={{letterSpacing:'0.2em',textAlign:'center',fontSize:'20px'}} />
              </div>
              <button type="submit" className="bx-auth-submit" disabled={loading}>{loading ? 'Verifying…' : 'Verify Email'}</button>
            </form>
            <p className="bx-auth-link" style={{marginTop:'14px'}}>
              Didn&apos;t get the code?{' '}
              <a href="#" style={{color:'var(--gold)',textDecoration:'none'}} onClick={e => { e.preventDefault(); apiRequest('/auth/resend-verification', {method:'POST', body:{email:form.email}}).then(() => setSuccess('Code resent. Please check your email inbox and spam folder.')).catch((err) => setError(err.message || 'Could not resend code right now.')); }}>Resend</a>
            </p>
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="bx-auth-title">Your profile</h2>
            <p className="bx-auth-sub">Tell us a bit about yourself (optional)</p>
            <form className="bx-auth-form" onSubmit={handleStep3}>
              <div className="bx-auth-field">
                <label className="bx-auth-label">Pen Name</label>
                <input className="bx-auth-input" placeholder="Your author name (optional)" value={form.pen_name} onChange={e => setForm({...form, pen_name: e.target.value})} />
              </div>
              <div className="bx-auth-field">
                <label className="bx-auth-label">Bio</label>
                <textarea className="bx-auth-input" placeholder="Tell readers about yourself…" value={form.bio} onChange={e => setForm({...form, bio: e.target.value})} rows={3} style={{resize:'none',fontFamily:'DM Sans, sans-serif'}} />
              </div>
              <div className="bx-auth-field">
                <label className="bx-auth-label">Location (City)</label>
                <input className="bx-auth-input" value={form.location} onChange={e => setForm({...form, location: e.target.value})} required />
              </div>
              <div className="bx-auth-field">
                <label className="bx-auth-label">Country</label>
                <input className="bx-auth-input" value={form.country} onChange={e => setForm({...form, country: e.target.value})} required />
              </div>
              <div className="bx-auth-field">
                <label className="bx-auth-label">Phone</label>
                <input className="bx-auth-input" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
              </div>
              <div className="bx-auth-field">
                <label className="bx-auth-label">Date of Birth</label>
                <input type="date" className="bx-auth-input" value={form.date_of_birth} onChange={e => setForm({...form, date_of_birth: e.target.value})} />
              </div>
              <div className="bx-auth-field">
                <label className="bx-auth-label">Preferred Language</label>
                <input className="bx-auth-input" value={form.preferred_language} onChange={e => setForm({...form, preferred_language: e.target.value})} required />
              </div>
              <div className="bx-auth-field">
                <label className="bx-auth-label">Reading Goal</label>
                <input className="bx-auth-input" value={form.reading_goal} onChange={e => setForm({...form, reading_goal: e.target.value})} />
              </div>
              <div className="bx-auth-field">
                <label className="bx-auth-label">Favourite Genres</label>
                <div style={{display:'flex',flexWrap:'wrap',gap:'8px',marginTop:'4px'}}>
                  {GENRES.map(g => (
                    <button type="button" key={g} onClick={() => toggleGenre(g)}
                      style={{padding:'5px 12px',borderRadius:'20px',fontSize:'12px',border:'1px solid',cursor:'pointer',fontFamily:'DM Sans,sans-serif',transition:'all 0.15s',
                        borderColor: form.fav_genres.includes(g) ? 'var(--gold)' : 'var(--border)',
                        background: form.fav_genres.includes(g) ? 'var(--gold-soft)' : 'transparent',
                        color: form.fav_genres.includes(g) ? 'var(--gold)' : 'var(--muted)'}}>
                      {g}
                    </button>
                  ))}
                </div>
              </div>
              <button type="submit" className="bx-auth-submit" disabled={loading}>{loading ? 'Saving…' : 'Complete Profile'}</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
