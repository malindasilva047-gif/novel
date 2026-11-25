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
                        {showPassword ? "🙈" : "👁"}
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
                      →
                    </span>
                    {busy ? "Please wait…" : registering ? "Create account" : "Login"}
                  </button>
                </form>

                <div className="ws-auth__divider">
                  <span>or continue with</span>
                </div>

                <div className="ws-auth__social">
                  <div className="ws-auth__google-slot">
                    <GoogleSignInButton onSuccess={finishGoogleSignIn} />
                  </div>
                  <button
                    type="button"
                    className="ws-auth__social-btn ws-auth__social-btn--discord"
                    onClick={() => showToast("Discord sign-in is coming soon.", "info")}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
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
