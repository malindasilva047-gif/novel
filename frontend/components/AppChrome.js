"use client";

import { Suspense, useEffect } from "react";
import { usePathname } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CookieConsentModal from "@/components/CookieConsentModal";
import { fetchSiteSettings } from "@/lib/api";

export default function AppChrome({ children }) {
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith("/admin");

  // Sync theme from localStorage on every mount (handles SSR mismatch)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('theme');
      if (saved === 'light' || saved === 'dark') {
        document.documentElement.setAttribute('data-theme', saved);
      } else {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (isAdminRoute) {
      return;
    }

    fetchSiteSettings()
      .then((settings) => {
        if (typeof document === "undefined") {
          return;
        }
        document.documentElement.style.setProperty("--brand-primary", settings?.primary_color || "#1278ff");
        document.documentElement.style.setProperty("--brand-secondary", settings?.secondary_color || "#35a0ff");
      })
      .catch(() => {});
  }, [isAdminRoute]);

  if (isAdminRoute) {
    return <>{children}</>;
  }

  return (
    <>
      <Suspense fallback={<header className="bx-hdr" />}>
        <Navbar />
      </Suspense>
      {children}
      <Footer />
      <CookieConsentModal />
    </>
  );
}
