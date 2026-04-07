import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bx-footer">
      <div className="bx-footer-grid">
        <div className="bx-footer-brand">
          <Link href="/" className="bx-logo">Bi<span>x</span>bi</Link>
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
          <Link href="/discover?sort=popular">Popular</Link>
          <Link href="/discover?sort=new">New Releases</Link>
        </div>
      </div>

      <div className="bx-footer-bottom">
        <p>Copyright {new Date().getFullYear()} Bixbi. All rights reserved.</p>
        <div className="bx-footer-langs">
          <button type="button" className="bx-lang-btn active">EN</button>
          <button type="button" className="bx-lang-btn">SI</button>
          <button type="button" className="bx-lang-btn">TA</button>
        </div>
      </div>
    </footer>
  );
}
