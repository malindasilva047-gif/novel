'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiRequest, fetchSiteSettings, readToken } from '@/lib/api';

export default function Navbar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userDd, setUserDd] = useState(false);
  const [writeDd, setWriteDd] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [branding, setBranding] = useState({ site_name: 'Wingsaga', logo_url: '' });
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const userRef = useRef(null);
  const writeRef = useRef(null);
  const notifRef = useRef(null);

  const refreshNotifications = async (markRead = false) => {
    const token = readToken();
    if (!token) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    try {
      const payload = await apiRequest('/users/notifications?limit=8', { token });
      setNotifications(Array.isArray(payload?.items) ? payload.items : []);
      setUnreadCount(Number(payload?.unread_count || 0));
      if (markRead && Number(payload?.unread_count || 0) > 0) {
        await apiRequest('/users/notifications/mark-read', { method: 'POST', token });
        setUnreadCount(0);
        setNotifications((prev) => prev.map((item) => ({ ...item, is_read: true })));
      }
    } catch {
      setNotifications([]);
      setUnreadCount(0);
    }
  };

  useEffect(() => {
    fetchSiteSettings().then(setBranding).catch(() => {});

    const stored = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
    if (stored) {
      try {
        setUser(JSON.parse(stored));
        return;
      } catch {}
    }

    const token = readToken();
    if (!token) {
      setUser(null);
      return;
    }

    apiRequest('/users/me', { token })
      .then((profile) => {
        localStorage.setItem('user', JSON.stringify(profile));
        setUser(profile);
        refreshNotifications().catch(() => {});
      })
      .catch(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
        setNotifications([]);
        setUnreadCount(0);
      });
  }, [pathname]);

  useEffect(() => {
    if (!user) return undefined;
    refreshNotifications().catch(() => {});
    const timer = setInterval(() => {
      refreshNotifications().catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
  }, [user]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (userRef.current && !userRef.current.contains(e.target)) setUserDd(false);
      if (writeRef.current && !writeRef.current.contains(e.target)) setWriteDd(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => { setMobileOpen(false); }, [pathname]);
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const handleSignOut = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setNotifications([]);
    setUnreadCount(0);
    setNotifOpen(false);
    setUserDd(false);
    router.push('/');
  };

  const handleWriteRoute = (target) => {
    setWriteDd(false);
    if (!user) {
      router.push(`/auth/signin?next=${encodeURIComponent(target)}`);
      return;
    }
    router.push(target);
  };

  const submitSearch = () => {
    const q = searchText.trim();
    if (!q) {
      router.push('/discover');
      return;
    }
    router.push(`/discover?q=${encodeURIComponent(q)}`);
    setMobileOpen(false);
  };

  const currentSort = searchParams.get('sort');
  const currentGenre = searchParams.get('genre');
  const currentHash = typeof window !== 'undefined' ? window.location.hash : '';

  const nav = [
    { href: '/discover', label: 'Discover', isActive: pathname === '/discover' && !currentSort && !currentGenre && !currentHash },
    { href: '/discover?sort=new', label: 'New', isActive: pathname === '/discover' && currentSort === 'new' },
    { href: '/discover?sort=popular', label: 'Popular', isActive: pathname === '/discover' && currentSort === 'popular' },
    { href: '/discover?genre=fan%20fiction', label: 'Fan Fiction', isActive: pathname === '/discover' && currentGenre === 'fan fiction' },
    { href: '/discover#genres', label: 'Genres', isActive: pathname === '/discover' && currentHash === '#genres' },
  ];

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() ?? 'U';

  return (
    <>
      <header className="bx-header" style={{ boxShadow: scrolled ? '0 2px 18px rgba(0,0,0,0.3)' : 'none' }}>
        <div className="bx-hdr-left">
          <Link href="/" className="bx-logo">
            {branding.logo_url ? (
              <img src={branding.logo_url} alt={branding.site_name} className="bx-nav-logo-img" />
            ) : (
              <>{branding.site_name}</>
            )}
          </Link>

          <div className="bx-nav-search-inline">
            <button className="bx-btn-icon" onClick={submitSearch} aria-label="Search">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
              </svg>
            </button>
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitSearch();
                }
              }}
              placeholder="Search stories, author..."
            />
          </div>
        </div>

        <nav className="bx-nav">
          {nav.map(({ href, label, isActive }) => (
            <Link key={href} href={href} className={isActive ? 'active' : ''}>
              {label}
            </Link>
          ))}
          {user && <Link href="/library" className={pathname === '/library' ? 'active' : ''}>Library</Link>}
        </nav>

        <div className="bx-hdr-right">
          <div className="bx-dd-wrap" ref={writeRef}>
            <button className="bx-btn-write" onClick={() => setWriteDd(v => !v)}>
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{width:'13px',height:'13px'}}>
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              <span className="write-label">Write</span>
              <svg style={{width:'11px',height:'11px',opacity:0.7}} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M6 9l6 6 6-6"/></svg>
            </button>
            <div className={`bx-dd${writeDd ? ' open' : ''}`} style={{minWidth:'170px',right:0}}>
              <div className="bx-dd-sec">
                <div className="bx-dd-row" onClick={() => handleWriteRoute('/write')}>
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{width:'14px',height:'14px',color:'var(--muted)',flexShrink:0}}><path d="M12 5v14M5 12h14"/></svg>
                  New story
                </div>
                <div className="bx-dd-row" onClick={() => handleWriteRoute('/profile')}>
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{width:'14px',height:'14px',color:'var(--muted)',flexShrink:0}}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/></svg>
                  My works
                </div>
              </div>
            </div>
          </div>

          {user ? (
            <>
              <div className="bx-dd-wrap" ref={notifRef}>
                <button
                  className="bx-btn-icon"
                  style={{position:'relative'}}
                  aria-label="Notifications"
                  onClick={() => {
                    const next = !notifOpen;
                    setNotifOpen(next);
                    if (next) refreshNotifications(true).catch(() => {});
                  }}
                >
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                    <path d="M13.73 21a2 2 0 01-3.46 0"/>
                  </svg>
                  {unreadCount > 0 && <span className="bx-ndot" />}
                </button>
                <div className={`bx-dd${notifOpen ? ' open' : ''}`} style={{minWidth:'260px',right:0}}>
                  <div className="bx-dd-sec">
                    <div className="bx-dd-row" style={{cursor:'default',fontWeight:600}}>Notifications</div>
                  </div>
                  <div className="bx-dd-sec">
                    {notifications.length === 0 ? (
                      <div className="bx-dd-row" style={{cursor:'default',color:'var(--muted)'}}>No new notifications</div>
                    ) : (
                      notifications.map((item) => (
                        <div
                          key={item.id}
                          className="bx-dd-row"
                          onClick={() => {
                            setNotifOpen(false);
                            if (item.story_id) router.push(`/read/${item.story_id}`);
                          }}
                          style={{alignItems:'flex-start'}}
                        >
                          <div style={{display:'flex',flexDirection:'column',gap:'3px'}}>
                            <span style={{fontSize:'12px',color:'var(--text)'}}>{item.message}</span>
                            <span style={{fontSize:'10px',color:'var(--muted)'}}>{item.created_at ? new Date(item.created_at).toLocaleString() : ''}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="bx-dd-wrap" ref={userRef}>
                <div className="bx-pna" onClick={() => setUserDd(v => !v)} title={user.username}>
                  {initials}
                </div>
                <div className={`bx-dd${userDd ? ' open' : ''}`} style={{minWidth:'200px',right:0}}>
                  <div className="bx-pnd-user">
                    <div className="bx-pnd-av">{initials}</div>
                    <div>
                      <div className="bx-pnd-name">{user.username || 'Reader'}</div>
                      <div className="bx-pnd-handle">{user.email}</div>
                    </div>
                  </div>
                  <div className="bx-dd-sec">
                    <div className="bx-dd-row" onClick={() => { setUserDd(false); router.push('/profile'); }}>
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{width:'14px',height:'14px',color:'var(--muted)',flexShrink:0}}><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                      Profile
                    </div>
                    <div className="bx-dd-row" onClick={() => { setUserDd(false); router.push('/library'); }}>
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{width:'14px',height:'14px',color:'var(--muted)',flexShrink:0}}><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
                      Library
                    </div>
                  </div>
                  {(user.role === 'admin' || user.is_admin) && (
                    <div className="bx-dd-sec">
                      <div className="bx-dd-row" style={{color:'var(--teal)'}} onClick={() => { setUserDd(false); router.push('/admin'); }}>
                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{width:'14px',height:'14px',flexShrink:0}}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                        Admin Panel
                      </div>
                    </div>
                  )}
                  <div className="bx-dd-sec">
                    <div className="bx-dd-row" style={{color:'var(--rose)'}} onClick={handleSignOut}>
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{width:'14px',height:'14px',flexShrink:0}}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                      Sign out
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <Link href="/auth/signin">
              <button className="bx-btn-ghost" style={{fontSize:'13px'}}>Sign In</button>
            </Link>
          )}

          <button className="bx-hamburger" onClick={() => setMobileOpen(true)} aria-label="Menu">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{width:'22px',height:'22px'}}>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
        </div>
      </header>

      <div className={`bx-mobile-nav${mobileOpen ? ' open' : ''}`}>
        <div className="bx-mobile-nav-bg" onClick={() => setMobileOpen(false)} />
        <div className="bx-mobile-nav-panel">
          <button className="bx-mobile-nav-close" onClick={() => setMobileOpen(false)}>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{width:'22px',height:'22px'}}><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
          {nav.map(({ href, label, isActive }) => (
            <Link key={href} href={href} className={isActive ? 'active' : ''}>{label}</Link>
          ))}
          {user && <Link href="/library" className={pathname === '/library' ? 'active' : ''}>Library</Link>}
          <Link href={user ? '/write' : '/auth/signin?next=%2Fwrite'}>New Story</Link>
          <Link href={user ? '/profile' : '/auth/signin?next=%2Fprofile'}>My Works</Link>
          <div className="bx-mobile-search-row">
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitSearch();
                }
              }}
              placeholder="Search stories"
            />
            <button onClick={submitSearch}>Go</button>
          </div>
          <div className="bx-mobile-nav-divider" />
          {user ? (
            <>
              <Link href="/profile">My Profile</Link>
              <Link href="/write">Write a Story</Link>
              {(user.role === 'admin' || user.is_admin) && <Link href="/admin">Admin Panel</Link>}
              <div className="bx-mobile-nav-divider" />
              <button onClick={handleSignOut} style={{background:'none',border:'none',color:'var(--rose)',fontSize:'16px',padding:'11px 14px',borderRadius:'8px',cursor:'pointer',textAlign:'left',fontFamily:'DM Sans, sans-serif',width:'100%'}}>
                Sign Out
              </button>
            </>
          ) : (
            <>
              <Link href="/auth/signin">Sign In</Link>
            </>
          )}
        </div>
      </div>
    </>
  );
}
