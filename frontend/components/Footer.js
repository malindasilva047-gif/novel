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
          <p>Stories that stay with you. Read, write, and connect with readers worldwide.</p>
        </div>

        <div className="bx-footer-col">
          <h4>Discover</h4>
          <Link href="/">Home</Link>
          <Link href="/discover">Explore Stories</Link>
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
        <div className="bx-footer-langs">
          <button type="button" className="bx-lang-btn active">EN</button>
          <button type="button" className="bx-lang-btn">SI</button>
          <button type="button" className="bx-lang-btn">TA</button>
        </div>
      </div>
    </footer>
  );
}
