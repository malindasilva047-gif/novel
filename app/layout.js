import "./globals.css";
import { Suspense } from "react";
import Navbar from "@/components/Navbar";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000";

export const metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Bixbi - Read & Write What You Love",
    template: "%s | Bixbi",
  },
  description: "Discover millions of stories, novels and poems. Read, write, and connect with authors worldwide.",
  keywords: [
    "read stories",
    "write stories",
    "novels online",
    "fiction platform",
    "poetry community",
    "Bixbi",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "Bixbi",
    title: "Bixbi - Read & Write What You Love",
    description: "Discover millions of stories, novels and poems. Read, write, and connect with authors worldwide.",
    images: [
      {
        url: "/images.jpg",
        width: 1200,
        height: 630,
        alt: "Bixbi story platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Bixbi - Read & Write What You Love",
    description: "Discover millions of stories, novels and poems. Read, write, and connect with authors worldwide.",
    images: ["/images.jpg"],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500&family=Lora:ital,wght@0,400;0,500;1,400;1,500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Suspense fallback={<header className="bx-hdr" />}>
          <Navbar />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
