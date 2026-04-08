"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CookieConsentModal from "@/components/CookieConsentModal";

export default function AppChrome({ children }) {
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith("/admin");

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
