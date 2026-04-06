"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiRequest, saveToken } from "@/lib/api";

function AdminLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const reason = useMemo(() => searchParams.get("reason"), [searchParams]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    try {
      const tokenData = await apiRequest("/auth/login", {
        method: "POST",
        body: { identifier: identifier.trim(), password },
      });

      saveToken(tokenData.access_token);
      const me = await apiRequest("/users/me", { token: tokenData.access_token });

      if (!(me?.is_admin || me?.role === "admin")) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        setMessage("This account is not an admin account.");
        return;
      }

      localStorage.setItem("user", JSON.stringify(me));
      router.replace("/admin");
    } catch (error) {
      setMessage(error?.message || "Login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page-wrap" style={{ minHeight: "86vh", display: "grid", placeItems: "center" }}>
      <section className="api-panel" style={{ width: "min(460px, 92vw)", padding: "28px" }}>
        <h1 style={{ marginBottom: "10px" }}>Admin Login</h1>
        <p className="token-state" style={{ marginBottom: "18px" }}>
          Restricted portal. Only verified admin accounts can continue.
        </p>

        {reason === "forbidden" && (
          <p className="panel-msg" style={{ marginBottom: "12px" }}>
            Admin access required. Please sign in with an admin account.
          </p>
        )}

        {message && (
          <p className="panel-msg" style={{ marginBottom: "12px" }}>
            {message}
          </p>
        )}

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: "12px" }}>
          <input
            className="bx-auth-input"
            placeholder="Email or username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
            required
          />
          <input
            type="password"
            className="bx-auth-input"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <button className="bx-auth-submit" type="submit" disabled={submitting}>
            {submitting ? "Signing in..." : "Sign in to Admin"}
          </button>
        </form>
      </section>
    </main>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <main className="page-wrap" style={{ minHeight: "86vh", display: "grid", placeItems: "center" }}>
          <section className="api-panel" style={{ width: "min(460px, 92vw)", padding: "28px" }}>
            <p className="panel-msg">Loading admin login...</p>
          </section>
        </main>
      }
    >
      <AdminLoginContent />
    </Suspense>
  );
}
