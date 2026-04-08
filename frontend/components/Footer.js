'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchSiteSettings } from '@/lib/api';

export default function Footer() {
  const [branding, setBranding] = useState({
    site_name: 'Bixbi',
    copyright_text: `Copyright ${new Date().getFullYear()} Bixbi. All rights reserved.`,
  });

  useEffect(() => {
    fetchSiteSettings().then(setBranding).catch(() => {});
  }, []);

  return (
    <footer className="bx-footer">
      <div className="bx-footer-grid">
        <div className="bx-footer-brand">
          <Link href="/" className="bx-logo">{branding.site_name}</Link>
          <p>Stories that stay with you. Read, write, and connect with Geeks worldwide.</p>
          <div className="bx-footer-socials">
            <a href="https://www.facebook.com/profile.php?id=100077340543704" target="_blank" rel="noreferrer">📘 Facebook</a>
            <a href="https://www.instagram.com" target="_blank" rel="noreferrer">📷 Instagram</a>
            <a href="https://www.youtube.com" target="_blank" rel="noreferrer">▶ YouTube</a>
          </div>
        </div>

        <div className="bx-footer-col">
          <h4>Quick Links</h4>
          <Link href="/">Home</Link>
          <Link href="/discover">Discover</Link>
          <Link href="/library">Library</Link>
          <Link href="/reviews">Top Reviews</Link>
          <Link href="/authors">Authors</Link>
        </div>

        <div className="bx-footer-col">
          <h4>Writers</h4>
          <Link href="/auth/signup">Create Account</Link>
          <Link href="/auth/signin?next=%2Fwrite">Start Writing</Link>
          <Link href="/auth/signin?next=%2Flibrary">My Library</Link>
          <Link href="/auth/signin?next=%2Fprofile">Profile</Link>
        </div>

        <div className="bx-footer-col">
          <h4>Account</h4>
          <Link href="/auth/signin">Sign In</Link>
          <Link href="/auth/signup">Sign Up</Link>
          <Link href="/cms/about">About</Link>
          <Link href="/cms/privacy-policy">Privacy</Link>
          <Link href="/cms/terms-of-service">Terms</Link>
        </div>
      </div>

      <div className="bx-footer-bottom">
        <p>{branding.copyright_text}</p>
      </div>
    </footer>
  );
}
