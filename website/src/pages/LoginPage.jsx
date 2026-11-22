import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { emailAuth, registerAccount, resendEmailVerification, setToken, verifyEmail } from "../api";
import { showToast } from "../components/ToastViewport";
import GoogleSignInButton from "../components/GoogleSignInButton";

const SIGNUP_GENDERS = ["Female", "Male", "Non-binary", "Prefer not to say"];
const SIGNUP_COUNTRIES = ["United States", "United Kingdom", "India", "Sri Lanka", "Canada", "Australia", "Germany", "France", "Other"];

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
  const [verificationEmail, setVerificationEmail] = useState(() => sessionStorage.getItem("novelhub_pending_email_verification") || "");
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationSent, setVerificationSent] = useState(false);
  const [mode, setMode] = useState(requestedAuthMode === "signup" ? "register" : "login");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (requestedAuthMode) {
      setMode(requestedAuthMode === "signup" ? "register" : "login");
    }
  }, [requestedAuthMode]);
  const returnTo = typeof location.state?.returnTo === "string"
    && location.state.returnTo.startsWith("/")
    && !location.state.returnTo.startsWith("//")
    ? location.state.returnTo
    : "/";

  async function finish(token, authResult) {
    setToken(token);
    try {
      await onSuccess?.(token, authResult);
    } catch {
      // Keep the API token if the profile refresh is briefly unavailable.
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
      if (registering) {
        if (username.trim().replace(/^@/, "").length < 3) throw new Error("Choose a username with at least 3 characters.");
        if (!birthDate || !gender) throw new Error("Enter your birthday and select your gender.");
        if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
          throw new Error("Use at least 8 characters with a letter, number, and symbol.");
        }
        if (password !== confirmPassword) throw new Error("Passwords do not match.");
        if (!acceptedTerms) throw new Error("Agree to the Privacy Policy and Terms to create an account.");
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
        if (!response?.needs_verification) throw new Error(response?.message || "Could not start email verification.");
        setVerificationEmail(normalizedEmail);
        sessionStorage.setItem("novelhub_pending_email_verification", normalizedEmail);
        setVerificationCode(response.dev_token || "");
        setVerificationSent(Boolean(response.email_sent));
        return;
      }
      response = await emailAuth({ email: normalizedEmail, password, mode: "login" });
      const token = response?.cookie_session
        ? "cookie-session"
        : (response?.access_token || response?.token || response?.accessToken);
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
      showToast(response?.message || "A new verification code was sent.", response?.email_sent ? "success" : "warning");
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
      // Keep the API token if the profile refresh is briefly unavailable.
    }
    navigate(authResult?.is_new_user ? "/profile?setup=1" : returnTo, { replace: true });
  }

  const registering = mode === "register";

  return (
    <>
      <div className="container page narrow login-page">
        <span className="eyebrow">WINGSAGA</span>
        <h1>{verificationEmail ? "Verify your email" : registering ? "Create your account" : "Welcome back"}</h1>
        <p className="meta">Pick up your reading and writing wherever you left off.</p>
        {verificationEmail ? <form className="auth-form" onSubmit={submitVerification}>
          <p className="meta">{verificationSent ? `Enter the verification code sent to ${verificationEmail}.` : `Email delivery is unavailable. Configure email delivery, then resend a code to ${verificationEmail}.`}</p>
          <label>Verification code
            <input value={verificationCode} onChange={(event) => setVerificationCode(event.target.value)} autoComplete="one-time-code" required />
          </label>
          {error ? <div className="error-banner" role="alert">{error}</div> : null}
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Checking…" : "Verify email"}</button>
          <button type="button" className="btn btn-ghost" onClick={resendVerification} disabled={busy}>Resend code</button>
        </form> : <form className="auth-form" onSubmit={onSubmit}>
          {registering ? (
            <>
              <label>Display name
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" required />
              </label>
              <label>Username
                <input value={username} onChange={(event) => setUsername(event.target.value)} minLength={3} autoComplete="username" required />
              </label>
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
            </>
          ) : null}
          <label>
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={registering ? 8 : 1}
              required
              autoComplete={registering ? "new-password" : "current-password"}
            />
          </label>
          {registering ? <>
            <label>Confirm password
              <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required />
            </label>
            <label className="auth-terms-check">
              <input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} required />
              <span>I agree to the <a href="/account/terms" target="_blank" rel="noreferrer">Terms</a> and <a href="/account/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.</span>
            </label>
          </> : null}
          {error ? <div className="error-banner" role="alert">{error}</div> : null}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Please wait…" : registering ? "Create account" : "Sign in"}
          </button>
          <div className="auth-divider"><span>or</span></div>
          <GoogleSignInButton onSuccess={finishGoogleSignIn} />
        </form>}
        {!verificationEmail ? <p className="meta auth-page-switch">
          {registering ? "Already have an account? " : "New to Wingsaga? "}
          <button
            type="button"
            className="link-btn"
            onClick={() => { setMode(registering ? "login" : "register"); setError(""); }}
          >
            {registering ? "Sign in" : "Create an account"}
          </button>
        </p> : null}
      </div>
    </>
  );
}
