import { createPortal } from "react-dom";
import "./SignOutDialog.css";

/**
 * Mirrors the mobile app's sign-out confirmation:
 * "Are you sure you want to sign out?" / "You will need to sign in again to access your account."
 */
export default function SignOutDialog({ open, onCancel, onConfirm, busy = false }) {
  if (!open) return null;
  return createPortal(
    <div className="signout-overlay" role="presentation" onClick={busy ? undefined : onCancel}>
      <div
        className="signout-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="signout-dialog-title"
        aria-describedby="signout-dialog-body"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="signout-dialog-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
            <path d="M10 17l5-5-5-5" />
            <path d="M15 12H3" />
          </svg>
        </span>
        <h3 id="signout-dialog-title">Are you sure you want to sign out?</h3>
        <p id="signout-dialog-body">You will need to sign in again to access your account.</p>
        <div className="signout-dialog-buttons">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={busy}>
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
