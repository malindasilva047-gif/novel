import { Link } from "react-router-dom";

const socialLinks = [
  { name: "Instagram", href: "#", color: "instagram" },
  { name: "TikTok", href: "#", color: "tiktok" },
  { name: "Facebook", href: "#", color: "facebook" },
  { name: "Discord", href: "#", color: "discord" },
  { name: "YouTube", href: "#", color: "youtube" },
  { name: "X", href: "#", color: "x" },
];

function SocialIcon({ name }) {
  if (name === "Instagram") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="url(#wsFooterInstagramGradient)" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <defs>
          <linearGradient id="wsFooterInstagramGradient" x1="0" y1="24" x2="24" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#FEDA75" />
            <stop offset=".3" stopColor="#FA7E1E" />
            <stop offset=".55" stopColor="#D62976" />
            <stop offset=".8" stopColor="#962FBF" />
            <stop offset="1" stopColor="#4F5BD5" />
          </linearGradient>
        </defs>
        <rect x="3" y="3" width="18" height="18" rx="5.5" />
        <circle cx="12" cy="12" r="4.2" />
        <circle cx="17.4" cy="6.6" r="1" fill="url(#wsFooterInstagramGradient)" stroke="none" />
      </svg>
    );
  }
  if (name === "TikTok") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#25F4EE" d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" transform="translate(-.7 -.5)" />
        <path fill="#FE2C55" d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" transform="translate(.7 .5)" />
        <path fill="currentColor" d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
      </svg>
    );
  }
  if (name === "Facebook") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#1877F2" d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.69.24 2.69.24v2.97h-1.52c-1.5 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" /></svg>;
  }
  if (name === "Discord") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#5865F2" d="M5 5.5C7 4 9 3.4 9 3.4l.5 1a12 12 0 0 1 5 0l.5-1S17 4 19 5.5c2 3 3 6.5 2.7 11-1.5 1.2-3.2 2-4.9 2.5l-1-1.6c.6-.2 1.1-.5 1.6-.8l-.7-.5c-3 1.4-6.4 1.4-9.4 0l-.7.5c.5.3 1 .6 1.6.8l-1 1.6c-1.7-.5-3.4-1.3-4.9-2.5C.8 12 1.8 8.5 5 5.5z" /><ellipse cx="8.6" cy="12.6" rx="1.8" ry="2" fill="#fff" /><ellipse cx="15.4" cy="12.6" rx="1.8" ry="2" fill="#fff" /></svg>;
  }
  if (name === "YouTube") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="1" y="4.5" width="22" height="15" rx="4.5" fill="#FF0000" /><path d="M10 9l5.5 3L10 15z" fill="#fff" /></svg>;
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>;
}

export default function Footer({ user = null }) {
  const guest = !user || String(user.provider || "").toLowerCase() === "guest" || String(user.email || "").toLowerCase().includes("guest");
  const loginState = (returnTo) => ({ returnTo, authMode: "signin" });
  return (
    <footer className="site-footer site-footer--novelhub ws-footer-wrapper">
      <div className="ws-footer-container">
        <div className="ws-footer-grid">
          <div className="ws-footer-brand">
            <Link to="/" className="ws-footer-logo">
              <img className="ws-footer-logo-light" src="/assets/wingsaga-logo-light.jpeg" alt="" />
              <img className="ws-footer-logo-dark" src="/assets/wingsaga-logo-dark.jpeg" alt="" />
              <span>Wingsaga</span>
            </Link>
            <p>A modern storytelling community built for creators and readers. Discover original fiction, share chapters, and find your people.</p>
            <nav className="ws-footer-socials" aria-label="Social media">
              {socialLinks.map((social) => (
                <a
                  href={social.href}
                  className={`ws-footer-social ws-footer-social--${social.color}`}
                  aria-label={social.name}
                  title={social.name}
                  key={social.name}
                >
                  <SocialIcon name={social.name} />
                </a>
              ))}
            </nav>
            <a className="ws-footer-app-badge" href="/downloads/wingsaga-android-universal-release.apk" aria-label="Download the Wingsaga Android app">
              <svg viewBox="0 0 24 26" aria-hidden="true">
                <path d="M2 1.5L14 13 2 24.5z" fill="#00C3FF" />
                <path d="M2 1.5L18.5 10.5 14 13z" fill="#00E676" />
                <path d="M18.5 10.5L23 13l-4.5 2.5L14 13z" fill="#FFC400" />
                <path d="M2 24.5L14 13l4.5 2.5z" fill="#FF3D57" />
              </svg>
              <span className="ws-footer-app-badge-text"><small>Get it on</small><strong>Google Play</strong></span>
            </a>
          </div>

          <nav className="ws-footer-link-group" aria-label="Discover">
            <h3>Discover</h3>
            <Link to="/genres/Romance">Campus &amp; Romance</Link>
            <Link to="/genres/Fantasy">Fantasy &amp; Sci-Fi</Link>
            <Link to="/genres/Thriller">Mystery &amp; Thriller</Link>
            <Link to="/genres/Drama">Drama &amp; Slice of Life</Link>
            <Link to="/">Trending now</Link>
          </nav>
          <nav className="ws-footer-link-group" aria-label="Creators">
            <h3>Creators</h3>
            {guest ? (
              <Link to="/login" state={loginState("/write")}>Write Studio</Link>
            ) : (
              <Link to="/write">Write Studio</Link>
            )}
            <Link to="/account/help">Content guidelines</Link>
          </nav>
          <nav className="ws-footer-link-group" aria-label="Platform">
            <h3>Platform</h3>
            <Link to="/account/help">Help centre</Link>
            <Link to="/account/contact">Contact us</Link>
            <Link to="/community">Wingsaga community</Link>
          </nav>
        </div>

        <div className="ws-footer-bottom">
          <span>© {new Date().getFullYear()} Wingsaga. All rights reserved.</span>
          <nav aria-label="Legal">
            <Link to="/account/terms">Terms of service</Link>
            <Link to="/account/privacy">Privacy policy</Link>
            <Link to="/account/cookies">Cookie policy</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
