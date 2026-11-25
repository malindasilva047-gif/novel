import { useEffect, useRef, useState } from "react";
import { googleAuth, setToken } from "../api";
import { showToast } from "./ToastViewport";

const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim();

function loadGisScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }
    const existing = document.getElementById("google-gis");
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = "google-gis";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export default function GoogleSignInButton({ onSuccess }) {
  const buttonRef = useRef(null);
  const wrapRef = useRef(null);
  const onSuccessRef = useRef(onSuccess);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  onSuccessRef.current = onSuccess;

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return undefined;
    let cancelled = false;

    async function initialize() {
      try {
        await loadGisScript();
        if (cancelled || !window.google?.accounts?.id) return;

        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async (response) => {
            if (!response?.credential) {
              setError("Google did not return a sign-in token.");
              return;
            }
            setBusy(true);
            setError("");
            try {
              const result = await googleAuth({ id_token: response.credential });
              const token = result?.cookie_session
                ? "cookie-session"
                : (result?.access_token || result?.token);
              if (!token) throw new Error("The server did not return a session token.");
              setToken(token);
              await onSuccessRef.current?.(token, result);
              showToast("Signed in successfully.", "success");
            } catch (authError) {
              const message = String(authError?.message || authError);
              setError(message);
              showToast(message, "error");
            } finally {
              setBusy(false);
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
          // Avoid personalized "Continue as …" FedCM chrome when possible
          use_fedcm_for_button: false,
          itp_support: true,
        });

        const width = Math.max(280, Math.min(400, Math.floor(wrapRef.current?.clientWidth || 320)));
        if (buttonRef.current) {
          buttonRef.current.innerHTML = "";
          window.google.accounts.id.renderButton(buttonRef.current, {
            theme: "outline",
            size: "large",
            width,
            type: "standard",
            text: "continue_with",
            shape: "pill",
            logo_alignment: "left",
          });
        }
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) setError("Google Sign-In could not load. Please try again later.");
      }
    }

    void initialize();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!GOOGLE_CLIENT_ID) {
    return <p className="meta" role="status">Google sign-in is not configured for this site.</p>;
  }

  return (
    <div className="google-signin-inline" aria-busy={busy} ref={wrapRef}>
      <div className="google-btn-wrap">
        <div ref={buttonRef} className="google-btn-host" />
      </div>
      {busy ? <p className="meta" role="status">Signing in with Google…</p> : null}
      {error ? <div className="error-banner" role="alert">{error}</div> : null}
      {!ready && !error ? <p className="meta" role="status">Loading Google sign-in…</p> : null}
    </div>
  );
}
