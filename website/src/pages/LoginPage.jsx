import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { emailAuth, registerAccount, resendEmailVerification, setToken, verifyEmail } from "../api";
import { showToast } from "../components/ToastViewport";
import GoogleSignInButton from "../components/GoogleSignInButton";
import "./LoginPage.css";

const SIGNUP_GENDERS = ["Female", "Male", "Non-binary", "Prefer not to say"];
const SIGNUP_COUNTRIES = [
  "United States", "United Kingdom", "India", "Sri Lanka", "Canada",
  "Australia", "Germany", "France", "Other",
];

/** Temporary hero art — replace later with your final image in /public/assets */
const HERO_IMAGE = "/assets/story-moonlit-couple.jpg";

function latestAllowedBirthDate() {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 16);
  return date.toISOString().slice(0, 10);
}

export default function LoginPage({ onSuccess }) {
  const navigate = useNavigate();
  const location = useLocation();
  const requestedAuthMode = location.state?.authMode || new URLSearchParams(location.search).get("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState("");
  const [country, setCountry] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState(
    () => sessionStorage.getItem("novelhub_pending_email_verification") || "",
  );
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationSent, setVerificationSent] = useState(false);
  const [mode, setMode] = useState(requestedAuthMode === "signup" ? "register" : "login");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("nh-theme") || localStorage.getItem("ws-theme") || "light";
    } catch {
      return "light";
    }
  });

  useEffect(() => {
    if (requestedAuthMode) {
      setMode(requestedAuthMode === "signup" ? "register" : "login");
    }
  }, [requestedAuthMode]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
    try {
      localStorage.setItem("nh-theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const returnTo =
    typeof location.state?.returnTo === "string" &&
    location.state.returnTo.startsWith("/") &&
    !location.state.returnTo.startsWith("//")
      ? location.state.returnTo
      : "/";

  async function finish(token, authResult) {
    setToken(token);
    try {
      await onSuccess?.(token, authResult);
    } catch {
      /* profile refresh optional */
    }
    showToast("Signed in successfully.", "success");
    navigate(authResult?.is_new_user ? "/profile?setup=1" : returnTo, { replace: true });
  }

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const normalizedEmail = email.trim().toLowerCase();
      let response;
      if (mode === "register") {
        if (username.trim().replace(/^@/, "").length < 3) {
          throw new Error("Choose a username with at least 3 characters.");
        }
        if (!birthDate || !gender) throw new Error("Enter your birthday and select your gender.");
        if (
          password.length < 8 ||
          !/[A-Za-z]/.test(password) ||
          !/[0-9]/.test(password) ||
          !/[^A-Za-z0-9]/.test(password)
        ) {
          throw new Error("Use at least 8 characters with a letter, number, and symbol.");
        }
        if (password !== confirmPassword) throw new Error("Passwords do not match.");
        if (!acceptedTerms) {
          throw new Error("Agree to the Privacy Policy and Terms to create an account.");
        }
        response = await registerAccount({
          email: normalizedEmail,
          password,
          display_name: displayName.trim(),
          username: username.trim().replace(/^@/, ""),
          birth_date: birthDate,
          gender,
          country,
          profile_complete: Boolean(country),
          accepted_terms: acceptedTerms,
        });
        if (!response?.needs_verification) {
          throw new Error(response?.message || "Could not start email verification.");
        }
        setVerificationEmail(normalizedEmail);
        sessionStorage.setItem("novelhub_pending_email_verification", normalizedEmail);
        setVerificationCode(response.dev_token || "");
        setVerificationSent(Boolean(response.email_sent));
        return;
      }
      response = await emailAuth({ email: normalizedEmail, password, mode: "login" });
      const token = response?.cookie_session
        ? "cookie-session"
        : response?.access_token || response?.token || response?.accessToken;
      if (!token) throw new Error("The server did not return a session token.");
      await finish(token, response);
    } catch (err) {
      const message = String(err.message || err);
      setError(message);
      showToast(message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function submitVerification(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await verifyEmail({ email: verificationEmail, token: verificationCode.trim() });
      setVerificationEmail("");
      sessionStorage.removeItem("novelhub_pending_email_verification");
      setVerificationCode("");
      setPassword("");
      setMode("login");
      showToast("Email verified. Sign in with your new account.", "success");
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  }

  async function resendVerification() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await resendEmailVerification(verificationEmail);
      if (response?.dev_token) setVerificationCode(response.dev_token);
      setVerificationSent(Boolean(response?.email_sent));
      showToast(
        response?.message || "A new verification code was sent.",
        response?.email_sent ? "success" : "warning",
      );
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  }

  async function finishGoogleSignIn(token, authResult) {
    try {
      await onSuccess?.(token, authResult);
    } catch {
      /* ignore */
    }
    navigate(authResult?.is_new_user ? "/profile?setup=1" : returnTo, { replace: true });
  }

  const registering = mode === "register";

  return (
    <div className="ws-auth" data-theme={theme}>
      <div className="ws-auth__shell">
        {/* ===== Left art panel ===== */}
        <aside className="ws-auth__hero" aria-hidden={false}>
          <div className="ws-auth__hero-bg" style={{ backgroundImage: `url(${HERO_IMAGE})` }} />
          <div className="ws-auth__hero-overlay" />

                    <div className="ws-auth__wave" aria-hidden="true">
            <svg viewBox="0 0 100 1000" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
              <path
                fill="currentColor"
                d="M100 0
                   C 70 80, 42 160, 48 280
                   C 56 420, 92 480, 88 580
                   C 84 700, 40 780, 48 900
                   C 52 950, 70 980, 100 1000
                   L 100 0 Z"
              />
            </svg>
          </div>

          <div className="ws-auth__hero-content">
            <Link to="/" className="ws-auth__brand">
              <span className="ws-auth__brand-mark">W</span>
              <span className="ws-auth__brand-name">Wingsaga</span>
            </Link>
            <div className="ws-auth__hero-copy">
              <h1 className="ws-auth__hero-title">
                Stories that
                <br />
                bring us <em>together</em>
              </h1>
              <p className="ws-auth__hero-sub">Read. Write. Share.</p>
            </div>
          </div>
        </aside>

        {/* ===== Right form panel ===== */}
        <section className="ws-auth__panel">
          <div className="ws-auth__panel-top">
            <button
              type="button"
              className="ws-auth__theme"
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            >
              <span className={theme === "light" ? "is-active" : ""}>☀</span>
              <span className={theme === "dark" ? "is-active" : ""}>☾</span>
            </button>
          </div>

          <div className="ws-auth__panel-inner">
            <div className="ws-auth__logo-wrap">

                            <span className="ws-auth__leaves" aria-hidden="true">
                <svg viewBox="0 0 160 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 48c8-22 28-38 48-40-6 22-22 42-44 48-5 1-8-2-4-8z" fill="#c8ebd8"/>
                  <path d="M22 40c14-18 32-26 46-20" stroke="#8fc9a8" strokeWidth="1.4" strokeLinecap="round"/>
                  <path d="M28 55c12-16 30-24 44-16" stroke="#a3d4b8" strokeWidth="1.2" strokeLinecap="round" opacity=".8"/>
                  <path d="M148 48c-8-22-28-38-48-40 6 22 22 42 44 48 5 1 8-2 4-8z" fill="#d5f0e2"/>
                  <path d="M138 40c-14-18-32-26-46-20" stroke="#8fc9a8" strokeWidth="1.4" strokeLinecap="round"/>
                  <path d="M132 55c-12-16-30-24-44-16" stroke="#a3d4b8" strokeWidth="1.2" strokeLinecap="round" opacity=".8"/>
                  <path d="M52 22c10-18 28-26 40-16-4 16-18 28-36 30-4 0-8-4-4-14z" fill="#e2f6eb"/>
                  <path d="M108 22c-10-18-28-26-40-16 4 16 18 28 36 30 4 0 8-4 4-14z" fill="#e2f6eb"/>
                </svg>
              </span>

              <span className="ws-auth__logo">W</span>
            </div>

            {verificationEmail ? (
              <>
                <h2 className="ws-auth__heading">Verify your email</h2>
                <p className="ws-auth__lede">
                  {verificationSent
                    ? `Enter the verification code sent to ${verificationEmail}.`
                    : `Email delivery is unavailable. Configure email delivery, then resend a code to ${verificationEmail}.`}
                </p>
                <form className="ws-auth__form" onSubmit={submitVerification}>
                  <label className="ws-auth__field">
                    <span className="ws-auth__label">Verification code</span>
                    <div className="ws-auth__input-wrap">
                      <input
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value)}
                        required
                        autoComplete="one-time-code"
                        placeholder="Enter code"
                      />
                    </div>
                  </label>
                  {error ? (
                    <div className="ws-auth__error" role="alert">
                      {error}
                    </div>
                  ) : null}
                  <button type="submit" className="ws-auth__submit" disabled={busy}>
                    {busy ? "Please wait…" : "Verify email"}
                  </button>
                  <button type="button" className="ws-auth__link-btn" onClick={resendVerification} disabled={busy}>
                    Resend code
                  </button>
                </form>
              </>
            ) : (
              <>
                <h2 className="ws-auth__heading">
                  {registering ? "Create account" : "Welcome Back!"}
                </h2>
                <p className="ws-auth__lede">
                  {registering
                    ? "Join Wingsaga to read, write, and share stories."
                    : "Sign in to continue your journey on Wingsaga"}
                </p>

                <form className="ws-auth__form" onSubmit={onSubmit}>
                  {registering ? (
                    <>
                      <label className="ws-auth__field">
                        <span className="ws-auth__label">Display name</span>
                        <div className="ws-auth__input-wrap">
                          <input
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            required
                            autoComplete="nickname"
                            placeholder="Your name"
                          />
                        </div>
                      </label>
                      <label className="ws-auth__field">
                        <span className="ws-auth__label">Username</span>
                        <div className="ws-auth__input-wrap">
                          <input
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            autoComplete="username"
                            placeholder="@username"
                          />
                        </div>
                      </label>
                      <div className="ws-auth__row">
                        <label className="ws-auth__field">
                          <span className="ws-auth__label">Birthday</span>
                          <div className="ws-auth__input-wrap">
                            <input
                              type="date"
                              value={birthDate}
                              max={latestAllowedBirthDate()}
                              onChange={(e) => setBirthDate(e.target.value)}
                              required
                            />
                          </div>
                        </label>
                        <label className="ws-auth__field">
                          <span className="ws-auth__label">Gender</span>
                          <div className="ws-auth__input-wrap">
                            <select value={gender} onChange={(e) => setGender(e.target.value)} required>
                              <option value="">Select</option>
                              {SIGNUP_GENDERS.map((g) => (
                                <option key={g} value={g}>
                                  {g}
                                </option>
                              ))}
                            </select>
                          </div>
                        </label>
                      </div>
                      <label className="ws-auth__field">
                        <span className="ws-auth__label">Country (optional)</span>
                        <div className="ws-auth__input-wrap">
                          <select value={country} onChange={(e) => setCountry(e.target.value)}>
                            <option value="">Select country</option>
                            {SIGNUP_COUNTRIES.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </div>
                      </label>
                    </>
                  ) : null}

                  <label className="ws-auth__field">
                    <span className="ws-auth__label">Email Address</span>
                    <div className="ws-auth__input-wrap">
                      <span className="ws-auth__icon" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <rect x="3" y="5" width="18" height="14" rx="2" />
                          <path d="M3 7l9 7 9-7" />
                        </svg>
                      </span>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                        placeholder="Email Address"
                      />
                    </div>
                  </label>

                  <label className="ws-auth__field">
                    <span className="ws-auth__label">Password</span>
                    <div className="ws-auth__input-wrap">
                      <span className="ws-auth__icon" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <rect x="5" y="11" width="14" height="10" rx="2" />
                          <path d="M8 11V8a4 4 0 018 0v3" />
                        </svg>
                      </span>
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        minLength={registering ? 8 : 1}
                        required
                        autoComplete={registering ? "new-password" : "current-password"}
                        placeholder="Password"
                      />
                      <button
                        type="button"
                        className="ws-auth__eye"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        onClick={() => setShowPassword((v) => !v)}
                      >
                        {showPassword ? (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3l18 18M10.5 10.5a3 3 0 004 4M9.9 5.1A10.5 10.5 0 0121 12c-.7 1.2-1.6 2.3-2.7 3.2M6.1 6.1C4.7 7.3 3.6 8.7 3 12c1.8 4.5 6 7.5 9 7.5 1.2 0 2.4-.3 3.5-.8"/></svg>
                        ) : (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>
                        )}
                      </button>
                    </div>
                  </label>

                  {registering ? (
                    <>
                      <label className="ws-auth__field">
                        <span className="ws-auth__label">Confirm password</span>
                        <div className="ws-auth__input-wrap">
                          <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            autoComplete="new-password"
                            required
                            placeholder="Confirm password"
                          />
                        </div>
                      </label>
                      <label className="ws-auth__check">
                        <input
                          type="checkbox"
                          checked={acceptedTerms}
                          onChange={(e) => setAcceptedTerms(e.target.checked)}
                          required
                        />
                        <span>
                          I agree to the{" "}
                          <a href="/account/terms" target="_blank" rel="noreferrer">
                            Terms
                          </a>{" "}
                          and{" "}
                          <a href="/account/privacy" target="_blank" rel="noreferrer">
                            Privacy Policy
                          </a>
                          .
                        </span>
                      </label>
                    </>
                  ) : (
                    <div className="ws-auth__meta-row">
                      <label className="ws-auth__check">
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                        />
                        <span>Remember me</span>
                      </label>
                      <Link className="ws-auth__forgot" to="/login?auth=login">
                        Forgot password?
                      </Link>
                    </div>
                  )}

                  {error ? (
                    <div className="ws-auth__error" role="alert">
                      {error}
                    </div>
                  ) : null}

                  <button type="submit" className="ws-auth__submit" disabled={busy}>
                    <span className="ws-auth__submit-icon" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4" />
                        <path d="M10 17l5-5-5-5" />
                        <path d="M15 12H3" />
                      </svg>
                    </span>
                    {busy ? "Please wait…" : registering ? "Create account" : "Login"}
                  </button>
                </form>

                <div className="ws-auth__divider">
                  <span>or continue with</span>
                </div>

                <div className="ws-auth__social">
                  <div className="ws-auth__google-slot">
                    <button type="button" className="ws-auth__google-custom" tabIndex={-1} aria-hidden="true">
                      <svg className="g-logo" viewBox="0 0 48 48" aria-hidden="true">
                        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.5-.4-3.5z"/>
                        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 35.9 26.8 37 24 37c-5.3 0-9.7-3.1-11.3-7.5l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
                        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l.1.1 6.2 5.2C39.2 37.3 44 32 44 24c0-1.3-.1-2.5-.4-3.5z"/>
                      </svg>
                      Continue with Google
                    </button>
                    <div className="ws-auth__google-hidden" aria-hidden="true">
                      <GoogleSignInButton onSuccess={finishGoogleSignIn} />
                    </div>
                  </div>
                  <button
                    type="button"
                    className="ws-auth__social-btn ws-auth__social-btn--discord"
                    onClick={() => showToast("Discord sign-in is coming soon.", "info")}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="#5865F2" aria-hidden="true">
                      <path d="M20.3 4.3A16.8 16.8 0 0015.9 3l-.3.6a14.5 14.5 0 014 1.4 13.5 13.5 0 00-10.9 0 14.5 14.5 0 014-1.4L12.4 3a16.8 16.8 0 00-4.4 1.3C4.2 7.1 3.3 11.3 3.5 15.5a16.7 16.7 0 005.1 2.6l.7-1.1a10.8 10.8 0 01-1.7-.8l.4-.3c3.3 1.5 6.9 1.5 10.2 0l.4.3c-.5.3-1.1.6-1.7.8l.7 1.1a16.7 16.7 0 005.1-2.6c.4-5.1-.6-9.2-2.4-11.2zM9.7 13.6c-.8 0-1.5-.8-1.5-1.7s.7-1.7 1.5-1.7 1.5.8 1.5 1.7-.7 1.7-1.5 1.7zm4.6 0c-.8 0-1.5-.8-1.5-1.7s.7-1.7 1.5-1.7 1.5.8 1.5 1.7-.7 1.7-1.5 1.7z" />
                    </svg>
                    Continue with Discord
                  </button>
                </div>

                <p className="ws-auth__switch">
                  {registering ? (
                    <>
                      Already have an account?{" "}
                      <button type="button" onClick={() => { setMode("login"); setError(""); }}>
                        Login
                      </button>
                    </>
                  ) : (
                    <>
                      Don&apos;t have an account?{" "}
                      <button type="button" onClick={() => { setMode("register"); setError(""); }}>
                        Sign up
                      </button>
                    </>
                  )}
                </p>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
