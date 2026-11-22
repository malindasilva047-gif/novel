import { useEffect, useRef, useState } from "react";
import { emailAuth, googleAuth, registerAccount, resendEmailVerification, setToken, verifyEmail } from "../api";
import { showToast } from "./ToastViewport";

const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim();
const SIGNUP_GENDERS = ["Female", "Male", "Non-binary", "Prefer not to say"];
const SIGNUP_COUNTRIES = ["United States", "United Kingdom", "India", "Sri Lanka", "Canada", "Australia", "Germany", "France", "Other"];
let googleSignInHandler = null;
let initializedGoogleClientId = "";

function latestAllowedBirthDate() {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 16);
  return date.toISOString().slice(0, 10);
}

function loadGisScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }
    const existing = document.getElementById("google-gis");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", reject);
      return;
    }
    const s = document.createElement("script");
    s.id = "google-gis";
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export default function AuthModal({ open, mode = "signin", onClose, onSuccess }) {
  const [authMode, setAuthMode] = useState(mode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState("");
  const [country, setCountry] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState(() => sessionStorage.getItem("novelhub_pending_email_verification") || "");
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationSent, setVerificationSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const googleBtnRef = useRef(null);
  const onSuccessRef = useRef(onSuccess);

  onSuccessRef.current = onSuccess;

  useEffect(() => {
    if (open) {
      setAuthMode(mode);
      setError("");
    }
  }, [open, mode]);

  useEffect(() => {
    if (!open || !GOOGLE_CLIENT_ID) {
      setGoogleReady(false);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        await loadGisScript();
        if (cancelled || !window.google?.accounts?.id) return;
        googleSignInHandler = async (response) => {
            if (!response?.credential) {
              const message = "Google did not return a token.";
              setError(message);
              showToast(message, "error");
              return;
            }
            setLoading(true);
            setError("");
            try {
              const res = await googleAuth({ id_token: response.credential });
              const token = res?.cookie_session
                ? "cookie-session"
                : (res?.access_token || res?.token);
              if (!token) throw new Error("No access token from server");
              setToken(token);
              await onSuccessRef.current?.(token, res);
              showToast("Signed in successfully.", "success");
            } catch (e) {
              const message = String(e.message || e);
              setError(message);
              showToast(message, "error");
            } finally {
              setLoading(false);
            }
        };
        if (initializedGoogleClientId !== GOOGLE_CLIENT_ID) {
          window.google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: (response) => googleSignInHandler?.(response),
            auto_select: false,
            cancel_on_tap_outside: true,
            use_fedcm_for_button: true,
          });
          initializedGoogleClientId = GOOGLE_CLIENT_ID;
        }
        if (googleBtnRef.current) {
          googleBtnRef.current.innerHTML = "";
          window.google.accounts.id.renderButton(googleBtnRef.current, {
            theme: "filled_black",
            size: "large",
            width: 320,
            text: "continue_with",
            shape: "pill",
          });
        }
        if (!cancelled) setGoogleReady(true);
      } catch {
        if (!cancelled) {
          setGoogleReady(false);
          const message = "Google Sign-In script failed to load.";
          setError((prev) => prev || message);
          showToast(message, "error");
        }
      }
    })();
    return () => {
      cancelled = true;
      googleSignInHandler = null;
    };
  }, [open]);

  if (!open) return null;

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const em = email.trim().toLowerCase();
      if (!em) throw new Error("Email is required");
      if (authMode === "signup") {
        if (username.trim().replace(/^@/, "").length < 3) throw new Error("Choose a username with at least 3 characters.");
        if (!birthDate || !gender) throw new Error("Enter your birthday and select your gender.");
        if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
          throw new Error("Use at least 8 characters with a letter, number, and symbol.");
        }
        if (password !== confirmPassword) throw new Error("Passwords do not match.");
        if (!acceptedTerms) throw new Error("Agree to the Privacy Policy and Terms to create an account.");
        const registration = await registerAccount({
          email: em,
          password,
          username: username.trim().replace(/^@/, ""),
          display_name: displayName.trim(),
          birth_date: birthDate,
          gender,
          country,
          profile_complete: Boolean(country),
          accepted_terms: acceptedTerms,
        });
        if (!registration?.needs_verification) throw new Error(registration?.message || "Could not start email verification.");
        setVerificationEmail(em);
        sessionStorage.setItem("novelhub_pending_email_verification", em);
        setVerificationCode(registration.dev_token || "");
        setVerificationSent(Boolean(registration.email_sent));
        setError("");
        return;
      }
      const res = await emailAuth({
        email: em,
        password,
        mode: "login",
      });
      const token = res?.cookie_session
        ? "cookie-session"
        : (res?.access_token || res?.token);
      if (!token) throw new Error("No access token returned");
      setToken(token);
      await onSuccess?.(token, res);
      showToast("Signed in successfully.", "success");
    } catch (err) {
      const msg = String(err.message || err);
      if (msg.includes("401") || /invalid email or password/i.test(msg)) {
        setError(
          authMode === "signin"
            ? "Invalid email or password. If you only used Google before, use Google Sign-In or Sign up with a password."
            : msg
        );
      } else {
        setError(msg);
      }
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }

  async function submitVerification(event) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      await verifyEmail({ email: verificationEmail, token: verificationCode.trim() });
      setVerificationEmail("");
      sessionStorage.removeItem("novelhub_pending_email_verification");
      setVerificationCode("");
      setAuthMode("signin");
      setPassword("");
      setError("");
      showToast("Email verified. Sign in with your new account.", "success");
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setLoading(false);
    }
  }

  async function resendVerification() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const result = await resendEmailVerification(verificationEmail);
      if (result?.dev_token) setVerificationCode(result.dev_token);
      setVerificationSent(Boolean(result?.email_sent));
      setError(result?.message || "A new verification code was sent.");
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-overlay" role="dialog" aria-modal="true">
      <button type="button" className="auth-backdrop" aria-label="Close" onClick={onClose} />
      <div className="auth-card">
        <div className="auth-card-head">
        <h2>{verificationEmail ? "Verify your email" : authMode === "signup" ? "Create account" : "Sign in"}</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            ✕
          </button>
        </div>

        {error ? <div className="error-banner" role="alert">{error}</div> : null}

        {verificationEmail ? (
          <form className="auth-form" onSubmit={submitVerification}>
            <p className="meta">{verificationSent ? `Enter the verification code sent to ${verificationEmail}.` : `Email delivery is unavailable. Configure email delivery, then resend a code to ${verificationEmail}.`}</p>
            <label>Verification code
              <input value={verificationCode} onChange={(event) => setVerificationCode(event.target.value)} autoComplete="one-time-code" required />
            </label>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? "Checking…" : "Verify email"}</button>
            <button type="button" className="btn btn-ghost" onClick={resendVerification} disabled={loading}>Resend code</button>
          </form>
        ) : <>
        <div className="google-btn-wrap">
          {GOOGLE_CLIENT_ID ? (
            <div ref={googleBtnRef} className="google-btn-host" />
          ) : (
            <p className="meta">
              Google Sign-In needs <code>VITE_GOOGLE_CLIENT_ID</code> in website <code>.env</code>.
            </p>
          )}
          {GOOGLE_CLIENT_ID && !googleReady ? (
            <p className="meta">Loading Google…</p>
          ) : null}
        </div>

        <div className="auth-divider">
          <span>or email</span>
        </div>

        <form onSubmit={submit} className="auth-form">
          {authMode === "signup" ? (
            <label>
              Display name
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
                required
              />
            </label>
          ) : null}
          {authMode === "signup" ? <>
            <label>Birthday (16+)
              <input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} max={latestAllowedBirthDate()} required />
            </label>
            <label>Gender
              <select value={gender} onChange={(event) => setGender(event.target.value)} required>
                <option value="">Select gender</option>{SIGNUP_GENDERS.map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label>Country (optional)
              <select value={country} onChange={(event) => setCountry(event.target.value)}>
                <option value="">Select country</option>{SIGNUP_COUNTRIES.map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
          </> : null}
          {authMode === "signup" ? (
            <label>Username
              <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="At least 3 characters" autoComplete="username" minLength={3} required />
            </label>
          ) : null}
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              autoComplete="email"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={authMode === "signup" ? "Min 8 characters" : "Your password"}
              autoComplete={authMode === "signup" ? "new-password" : "current-password"}
              minLength={authMode === "signup" ? 8 : undefined}
              required
            />
          </label>
          {authMode === "signup" ? <>
            <label>Confirm password
              <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required />
            </label>
            <label className="auth-terms-check">
              <input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} required />
              <span>I agree to the <a href="/account/terms" target="_blank" rel="noreferrer">Terms</a> and <a href="/account/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.</span>
            </label>
          </> : null}
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? "Please wait…" : authMode === "signup" ? "Sign up" : "Sign in"}
          </button>
        </form>

        <p className="auth-switch meta">
          {authMode === "signup" ? (
            <>
              Already have an account?{" "}
              <button type="button" className="link-btn" onClick={() => setAuthMode("signin")}>
                Sign in
              </button>
            </>
          ) : (
            <>
              New here?{" "}
              <button type="button" className="link-btn" onClick={() => setAuthMode("signup")}>
                Create account
              </button>
            </>
          )}
        </p>
        </>}
      </div>
    </div>
  );
}
