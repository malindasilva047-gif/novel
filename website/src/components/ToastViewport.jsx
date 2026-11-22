import { useEffect, useRef, useState } from "react";

const TYPES = new Set(["success", "warning", "danger", "error", "info", "neutral"]);

export function showToast(message, type = "success") {
  if (typeof window === "undefined" || !String(message || "").trim()) return;
  const safeType = type === "error" ? "danger" : TYPES.has(type) ? type : "success";
  window.dispatchEvent(new CustomEvent("novelhub:toast", {
    detail: { message: String(message), type: safeType },
  }));
}

export default function ToastViewport() {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  useEffect(() => {
    function dismiss(id) {
      const timer = timers.current.get(id);
      if (timer) clearTimeout(timer);
      timers.current.delete(id);
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }

    function onToast(event) {
      const id = globalThis.crypto?.randomUUID?.()
        || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const toast = { ...event.detail, id };
      setToasts((current) => [...current.slice(-2), toast]);
      timers.current.set(id, setTimeout(() => dismiss(id), 4500));
    }

    window.addEventListener("novelhub:toast", onToast);
    return () => {
      window.removeEventListener("novelhub:toast", onToast);
      timers.current.forEach(clearTimeout);
      timers.current.clear();
    };
  }, []);

  return (
    <div className="toast-viewport" aria-live="polite" aria-relevant="additions removals">
      {toasts.map((toast) => (
        <div className={`app-toast app-toast--${toast.type}`} role={toast.type === "danger" || toast.type === "error" ? "alert" : "status"} key={toast.id}>
          <span className="app-toast-icon" aria-hidden="true">
            {toast.type === "success" ? "✓" : toast.type === "warning" ? "!" : toast.type === "danger" || toast.type === "error" ? "×" : "i"}
          </span>
          <p>{toast.message}</p>
          <button type="button" aria-label="Dismiss notification" onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}>×</button>
        </div>
      ))}
    </div>
  );
}
