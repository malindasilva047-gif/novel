'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiRequest } from '@/lib/api';
import StoryCard from '@/components/StoryCard';

const CONTINUE_COVER_PALETTES = [
  'linear-gradient(160deg,#1a0a2e,#3d1a5e)',
  'linear-gradient(160deg,#0a1628,#1a3060)',
  'linear-gradient(160deg,#1a0a10,#5e1a2e)',
  'linear-gradient(160deg,#0a1a0a,#1a3c1a)',
  'linear-gradient(160deg,#1a140a,#5e3c0a)',
  'linear-gradient(160deg,#0a1a1a,#0a4040)',
];

function coverPalette(seed) {
  return CONTINUE_COVER_PALETTES[Math.abs(Number(seed) || 0) % CONTINUE_COVER_PALETTES.length];
}

// -- Hero slides ------------------------------------------
const HERO_SLIDES = [
  {
    id: 1,
    bg: 'linear-gradient(160deg,#0e0204 0%,#3a0813 40%,#1a0608 70%,#0a0a0a 100%)',
    tag: '?  Featured Story',
    title: <>The <em>Last</em> Kingdom<br />of Stars</>,
    desc: 'An epic fantasy spanning centuries — where gods walk among mortals and destiny is written in blood.',
    author: 'Elara Moonwhisper',
    genre: 'Fantasy',
  },
  {
    id: 2,
    bg: 'linear-gradient(160deg,#020a1a 0%,#061840 40%,#040e28 70%,#020608 100%)',
    tag: '?  Trending Now',
    title: <>Echoes of a<br /><em>Broken</em> Sea</>,
    desc: 'A nautical adventure that pulls you beneath the waves and never lets you go.',
    author: 'Caspian Drake',
    genre: 'Adventure',
  },
  {
    id: 3,
    bg: 'linear-gradient(160deg,#0a0a02 0%,#262010 40%,#1a1808 70%,#080808 100%)',
    tag: '?  Editor\'s Pick',
    title: <><em>Gilded</em> Dust<br />& Forgotten Vows</>,
    desc: 'A slow-burn romance set in the glittering courts of a dying empire.',
    author: 'Seraphina Vale',
    genre: 'Romance',
  },
];

// -- Genre data -------------------------------------------
const GENRES = [
  { name: 'Fantasy', icon: '??', bg: 'linear-gradient(135deg,#1a0a2e 0%,#3d1260 100%)' },
  { name: 'Romance', icon: '??', bg: 'linear-gradient(135deg,#2a0a14 0%,#6e1430 100%)' },
  { name: 'Mystery', icon: '??', bg: 'linear-gradient(135deg,#0a1428 0%,#1a3060 100%)' },
  { name: 'Sci-Fi', icon: '??', bg: 'linear-gradient(135deg,#0a1a24 0%,#0a3a56 100%)' },
  { name: 'Horror', icon: '??', bg: 'linear-gradient(135deg,#100808 0%,#3a1010 100%)' },
  { name: 'Adventure', icon: '??', bg: 'linear-gradient(135deg,#0a1a0a 0%,#1a3c18 100%)' },
  { name: 'Drama', icon: '??', bg: 'linear-gradient(135deg,#1a1208 0%,#3e2c0a 100%)' },
  { name: 'Teen Fiction', icon: '?', bg: 'linear-gradient(135deg,#1a0a28 0%,#480a60 100%)' },
  { name: 'Fan Fiction', icon: '??', bg: 'linear-gradient(135deg,#0a1428 0%,#1e2e50 100%)' },
  { name: 'Poetry', icon: '??', bg: 'linear-gradient(135deg,#200a1e 0%,#4a0e46 100%)' },
];

// -- Mock authors -----------------------------------------
const MOCK_AUTHORS = [
  { id: 1, name: 'Elena Voss', followers: '42.1k', init: 'EV', bg: 'linear-gradient(135deg,#1a1a0a,#2e2a08)' },
  { id: 2, name: 'Kian Rivers', followers: '31.8k', init: 'KR', bg: 'linear-gradient(135deg,#0a1a10,#0e3020)' },
  { id: 3, name: 'Lyra Moon', followers: '58.4k', init: 'LM', bg: 'linear-gradient(135deg,#1a0a2e,#2e0a50)' },
  { id: 4, name: 'Ash Stormwood', followers: '19.2k', init: 'AS', bg: 'linear-gradient(135deg,#0a1428,#12203c)' },
  { id: 5, name: 'Sera Wilde', followers: '76.3k', init: 'SW', bg: 'linear-gradient(135deg,#280a10,#4e1020)' },
  { id: 6, name: 'Callum Grey', followers: '23.7k', init: 'CG', bg: 'linear-gradient(135deg,#0e0e10,#1e1e28)' },
  { id: 7, name: 'Isolde Fae', followers: '44.1k', init: 'IF', bg: 'linear-gradient(135deg,#200a1a,#3a0a30)' },
];

// -- Mock reviews -----------------------------------------
const MOCK_REVIEWS = [
  { id: 1, user: 'StarReader', book: 'The Last Kingdom', rating: 5, text: '"Absolutely breathtaking prose. Every chapter felt like waking from a beautiful dream."', date: '2 days ago', init: 'SR', bg: '#1a1a0a' },
  { id: 2, user: 'LunaMoth', book: 'Echoes of a Broken Sea', rating: 5, text: '"I stayed up until 3am reading this. No regrets. Pure magic."', date: '4 days ago', init: 'LM', bg: '#0a1428' },
  { id: 3, user: 'WildReader', book: 'Gilded Dust', rating: 4, text: '"The slow burn is real but every page is worth it. The ending made me cry."', date: '1 week ago', init: 'WR', bg: '#280a10' },
  { id: 4, user: 'Phantom77', book: 'Dark Waters', rating: 5, text: '"This author understands the human soul in ways most published authors never do."', date: '1 week ago', init: 'PH', bg: '#0a1a10' },
  { id: 5, user: 'Aurora', book: 'Crimson Veil', rating: 5, text: '"I came for the romance, I stayed for the world-building. Outstanding."', date: '2 weeks ago', init: 'AU', bg: '#1a0a2e' },
];

// -- useDragScroll -----------------------------------------
function useDragScroll(ref) {
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);
  const moved = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onDown = (e) => {
      isDragging.current = true; moved.current = false;
      startX.current = e.pageX - el.offsetLeft;
      scrollLeft.current = el.scrollLeft;
      el.classList.add('dragging');
    };
    const onMove = (e) => {
      if (!isDragging.current) return;
      e.preventDefault(); moved.current = true;
      const x = e.pageX - el.offsetLeft;
      el.scrollLeft = scrollLeft.current - (x - startX.current) * 1.5;
    };
    const onUp = () => { isDragging.current = false; el.classList.remove('dragging'); };
    el.addEventListener('mousedown', onDown);
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseup', onUp);
    el.addEventListener('mouseleave', onUp);
    return () => {
      el.removeEventListener('mousedown', onDown);
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseup', onUp);
      el.removeEventListener('mouseleave', onUp);
    };
  }, [ref]);
}

// -- Main Home component -----------------------------------
export default function Home() {
  const router = useRouter();
  const [slide, setSlide] = useState(0);
  const [stories, setStories] = useState([]);
  const [continueHistory, setContinueHistory] = useState([]);
  const [featured, setFeatured] = useState(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('trending');
  const heroRef = useRef(null);
  const touchStart = useRef(0);
  const trendRef = useRef(null);
  const reviewRef = useRef(null);
  const continueRef = useRef(null);
  useDragScroll(trendRef);
  useDragScroll(reviewRef);
  useDragScroll(continueRef);

  // Auto-slide hero
  useEffect(() => {
    const t = setInterval(() => setSlide(s => (s + 1) % HERO_SLIDES.length), 5000);
    return () => clearInterval(t);
  }, []);

  // Load homepage feeds from discovery APIs
  useEffect(() => {
    Promise.all([
      apiRequest('/discovery/trending').catch(() => []),
      apiRequest('/discovery/feed').catch(() => []),
      apiRequest('/reader/history').catch(() => []),
    ]).then(([trendingData, feedData, historyData]) => {
      const trending = Array.isArray(trendingData) ? trendingData : [];
      const feed = Array.isArray(feedData) ? feedData : [];
      const merged = [...trending, ...feed].reduce((acc, item) => {
        const key = String(item.id || item._id || item.title || Math.random());
        if (!acc.seen.has(key)) {
          acc.seen.add(key);
          acc.items.push({ ...item, _id: item._id || item.id, genre: (item.categories || [])[0] || item.genre || 'Fiction' });
        }
        return acc;
      }, { seen: new Set(), items: [] }).items;

      if (merged.length > 0) {
        setStories(merged);
        setFeatured(merged[0]);
      }
      setContinueHistory(Array.isArray(historyData) ? historyData : []);
    }).catch(() => {});
  }, []);

  // Touch swipe for hero
  const heroTouchStart = (e) => { touchStart.current = e.touches[0].clientX; };
  const heroTouchEnd = (e) => {
    const diff = touchStart.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) {
      if (diff > 0) setSlide(s => (s + 1) % HERO_SLIDES.length);
      else setSlide(s => (s - 1 + HERO_SLIDES.length) % HERO_SLIDES.length);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (search.trim()) router.push(`/discover?q=${encodeURIComponent(search.trim())}`);
  };

  // Continue reading from backend history, fallback to synthetic items
  const continueReading = continueHistory.length > 0
    ? continueHistory.slice(0, 6).map((h) => ({
      _id: h.story_id,
      title: h.title,
      cover_image: h.cover_image,
      progress: Math.round(h.progress_pct || 0),
      chapInfo: h.chapter_id ? `Chapter ${h.chapter_id}` : 'Continue reading',
    }))
    : stories.slice(0, 6).map((s, i) => ({
      ...s,
      progress: [35, 68, 12, 90, 47, 23][i] || 50,
      chapInfo: `Ch. ${[3, 8, 1, 12, 5, 2][i] || 1} of ${[12, 14, 8, 16, 10, 6][i] || 10}`,
    }));

  const filteredStories = stories.filter(s => {
    if (tab === 'trending') return true;
    if (tab === 'fantasy') return (s.genre || s.category || '').toLowerCase().includes('fantasy');
    if (tab === 'romance') return (s.genre || s.category || '').toLowerCase().includes('romance');
    if (tab === 'mystery') return (s.genre || s.category || '').toLowerCase().includes('mystery');
    return true;
  });

  // Fallback mock stories for display if API returns nothing
  const MOCK_STORIES = [
    { id: 1, title: 'The Last Kingdom of Stars', author_name: 'Elara Moonwhisper', genre: 'Fantasy', avg_rating: 5, badge: 'HOT' },
    { id: 2, title: 'Echoes of a Broken Sea', author_name: 'Caspian Drake', genre: 'Adventure', avg_rating: 4.5, badge: 'NEW' },
    { id: 3, title: 'Gilded Dust & Forgotten Vows', author_name: 'Seraphina Vale', genre: 'Romance', avg_rating: 4.8, badge: 'TRENDING' },
    { id: 4, title: 'When the Moon Forgets', author_name: 'Lyra Moon', genre: 'Fantasy', avg_rating: 4.7 },
    { id: 5, title: 'Dark Waters Rising', author_name: 'Kian Rivers', genre: 'Mystery', avg_rating: 4.6 },
    { id: 6, title: 'The Crimson Veil', author_name: 'Sera Wilde', genre: 'Horror', avg_rating: 4.9, badge: 'FEATURED' },
    { id: 7, title: 'Starfall Academy', author_name: 'Ash Stormwood', genre: 'Fantasy', avg_rating: 4.4 },
    { id: 8, title: 'Letters to Nobody', author_name: 'Elena Voss', genre: 'Drama', avg_rating: 4.8 },
  ];

  const displayStories = filteredStories.length > 0 ? filteredStories : MOCK_STORIES;
  const featuredStory = featured || MOCK_STORIES[0];

  return (
    <main>
      {/* -- Hero Slider -- */}
      <div className="bx-hero" ref={heroRef} onTouchStart={heroTouchStart} onTouchEnd={heroTouchEnd}>
        <div className="bx-hero-track" style={{ transform: `translateX(-${slide * 100}%)` }}>
          {HERO_SLIDES.map((s, i) => (
            <div key={s.id} className="bx-hero-slide">
              <div className="bx-hero-bg" style={{ background: s.bg }} />
              <div className="bx-hero-content">
                <div className="bx-hero-tag">{s.tag}</div>
                <h1 className="bx-hero-title">{s.title}</h1>
                <p className="bx-hero-desc">{s.desc}</p>
                <div className="bx-hero-actions">
                  <button className="bx-hero-btn-read" onClick={() => {
                    const story = stories[i];
                    router.push(story?._id ? `/read/${story._id}` : '/discover');
                  }}>Read Now</button>
                  <button className="bx-hero-btn-list" onClick={() => router.push('/library')}>+ Reading List</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Arrows */}
        <button className="bx-hero-arrow prev" onClick={() => setSlide(s => (s - 1 + HERO_SLIDES.length) % HERO_SLIDES.length)}>
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <button className="bx-hero-arrow next" onClick={() => setSlide(s => (s + 1) % HERO_SLIDES.length)}>
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M9 18l6-6-6-6"/></svg>
        </button>

        {/* Dots */}
        <div className="bx-hero-dots">
          {HERO_SLIDES.map((_, i) => (
            <button key={i} className={`bx-hero-dot${slide === i ? ' active' : ''}`} onClick={() => setSlide(i)} />
          ))}
        </div>
      </div>

      {/* -- Search -- */}
      <div className="bx-search-wrap">
        <form className="bx-search" onSubmit={handleSearch}>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search stories, authors, genres…"
          />
          <button type="submit" className="bx-search-btn">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          </button>
        </form>
      </div>

      {/* -- Stats bar -- */}
      <div className="bx-stats">
        <div className="bx-stat">
          <span className="bx-stat-num">82<span>M+</span></span>
          <span className="bx-stat-label">Stories Published</span>
        </div>
        <div className="bx-stat">
          <span className="bx-stat-num">4<span>B+</span></span>
          <span className="bx-stat-label">Monthly Reads</span>
        </div>
        <div className="bx-stat">
          <span className="bx-stat-num">97<span>M+</span></span>
          <span className="bx-stat-label">Active Readers</span>
        </div>
      </div>

      {/* -- Trending -- */}
      <section className="bx-section">
        <div className="bx-sec-header">
          <h2 className="bx-sec-title serif">Trending Stories</h2>
          <Link href="/discover?sort=popular" className="bx-sec-more">See all ?</Link>
        </div>

        <div className="bx-tabs">
          {['trending','fantasy','romance','mystery'].map(t => (
            <button key={t} className={`bx-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="bx-carousel">
          <div className="bx-book-scroll" ref={trendRef}>
            {displayStories.slice(0, 10).map((s, i) => <StoryCard key={s._id || s.id || i} story={s} index={i} />)}
          </div>
        </div>
      </section>

      {/* -- Featured -- */}
      <section className="bx-section" style={{paddingTop:0}}>
        <div className="bx-sec-header">
          <h2 className="bx-sec-title serif">Featured Pick</h2>
        </div>
        <div className="bx-featured-card" onClick={() => router.push(`/read/${featuredStory._id || featuredStory.id}`)}>
          <div className="bx-featured-cover">
            {featuredStory.cover_image ? (
              <img src={featuredStory.cover_image} alt={featuredStory.title} />
            ) : (
              <div className="bx-featured-fallback" style={{ background: 'linear-gradient(160deg,#1a0a2e,#3d1a5e)', height:'100%' }}>
                {featuredStory.title}
              </div>
            )}
          </div>
          <div className="bx-featured-info">
            <div className="bx-featured-tag">{featuredStory.genre || featuredStory.category || 'Fantasy'}</div>
            <div className="bx-featured-title">{featuredStory.title}</div>
            <p className="bx-featured-desc">{featuredStory.description || featuredStory.summary || 'An immersive story that will keep you reading through the night.'}</p>
            <div className="bx-featured-footer">
              <span className="bx-featured-status">{featuredStory.status || 'Ongoing'}</span>
              <button className="bx-btn-read" onClick={e => { e.stopPropagation(); router.push(`/read/${featuredStory._id || featuredStory.id}`); }}>
                Read Free ?
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* -- Genres -- */}
      <section className="bx-section" style={{paddingTop:0}}>
        <div className="bx-sec-header">
          <h2 className="bx-sec-title serif">Browse by Genre</h2>
          <Link href="/discover" className="bx-sec-more">All genres ?</Link>
        </div>
        <div className="bx-genre-grid">
          {GENRES.map(g => (
            <div key={g.name} className="bx-genre-card" style={{ background: g.bg }} onClick={() => router.push(`/discover?genre=${encodeURIComponent(g.name.toLowerCase())}`)}>
              <div className="bx-genre-overlay" />
              <span className="bx-genre-icon">{g.icon}</span>
              <span className="bx-genre-name">{g.name}</span>
            </div>
          ))}
        </div>
      </section>

      {/* -- Authors -- */}
      <section className="bx-section" style={{paddingTop:0}}>
        <div className="bx-sec-header">
          <h2 className="bx-sec-title serif">Popular Authors</h2>
          <Link href="/discover?view=authors" className="bx-sec-more">More authors ?</Link>
        </div>
        <div className="bx-authors-scroll">
          {MOCK_AUTHORS.map(a => (
            <div key={a.id} className="bx-author-card">
              <div className="bx-author-avatar-wrap">
                <div className="bx-author-avatar" style={{ background: a.bg }}>{a.init}</div>
                <button className="bx-author-follow-btn" title="Follow">+</button>
              </div>
              <span className="bx-author-name">{a.name}</span>
              <span className="bx-author-followers">{a.followers}</span>
            </div>
          ))}
        </div>
      </section>

      {/* -- Continue Reading -- */}
      {continueReading.length > 0 && (
        <section className="bx-section" style={{paddingTop:0}}>
          <div className="bx-sec-header">
            <h2 className="bx-sec-title serif">Continue Reading</h2>
            <Link href="/library" className="bx-sec-more">Library ?</Link>
          </div>
          <div className="bx-continue-scroll" ref={continueRef}>
            {continueReading.map((s, i) => (
              <div key={s._id || s.id || i} className="bx-continue-card" onClick={() => router.push(`/read/${s._id || s.id}`)}>
                <div className="bx-continue-cover" style={{ background: coverPalette(s._id || s.id) }}>
                  {s.cover_image && <img src={s.cover_image} alt={s.title} style={{width:'100%',height:'100%',objectFit:'cover'}} />}
                </div>
                <div className="bx-continue-info">
                  <div className="bx-continue-title">{s.title}</div>
                  <div className="bx-continue-author">{s.chapInfo}</div>
                  <div className="bx-continue-progress-wrap">
                    <div className="bx-continue-progress-bar">
                      <div className="bx-continue-progress-fill" style={{ width: `${s.progress}%` }} />
                    </div>
                    <span className="bx-continue-progress-label">{s.progress}%</span>
                  </div>
                </div>
                <button className="bx-continue-btn">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} style={{width:'14px',height:'14px'}}><path d="M9 18l6-6-6-6"/></svg>
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* -- New Releases -- */}
      <section className="bx-section" style={{paddingTop:0}}>
        <div className="bx-sec-header">
          <h2 className="bx-sec-title serif">New Releases</h2>
          <Link href="/discover?sort=new" className="bx-sec-more">See all ?</Link>
        </div>
        <div className="bx-carousel">
          <div className="bx-book-scroll">
            {displayStories.slice(4, 14).map((s, i) => <StoryCard key={s._id || s.id || i} story={{...s, badge: i < 3 ? 'NEW' : undefined}} index={i} />)}
          </div>
        </div>
      </section>

      {/* -- Reviews -- */}
      <section className="bx-section" style={{paddingTop:0}}>
        <div className="bx-sec-header">
          <h2 className="bx-sec-title serif">Reader Reviews</h2>
        </div>
        <div className="bx-reviews-list" ref={reviewRef}>
          {MOCK_REVIEWS.map(r => (
            <div key={r.id} className="bx-review-card">
              <div className="bx-review-top">
                <div className="bx-review-avatar" style={{ background: r.bg }}>{r.init}</div>
                <div>
                  <div className="bx-review-username">{r.user}</div>
                  <div className="bx-review-book">on <span>{r.book}</span></div>
                </div>
                <span className="bx-review-stars" style={{marginLeft:'auto'}}>{'?'.repeat(r.rating)}</span>
              </div>
              <p className="bx-review-text">{r.text}</p>
              <div className="bx-review-footer">
                <span className="bx-review-date">{r.date}</span>
                <button className="bx-review-helpful">?? Helpful</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* -- CTA Banner -- */}
      <div className="bx-cta-banner">
        <h2>Start Writing Your<br /><em>Next Great Story</em></h2>
        <p>Join millions of writers who share their voice with readers around the world.<br />Free to start. No credit card required.</p>
        <div className="bx-cta-btns">
          <Link href="/auth/signup">
            <button style={{background:'var(--gold)',color:'#0d0d12',border:'none',padding:'13px 32px',borderRadius:'10px',fontSize:'15px',fontWeight:'600',cursor:'pointer',fontFamily:'DM Sans,sans-serif',transition:'all 0.2s'}}>
              Start Writing Free
            </button>
          </Link>
          <Link href="/discover">
            <button style={{background:'none',border:'1px solid rgba(255,255,255,0.2)',color:'#fff',padding:'13px 28px',borderRadius:'10px',fontSize:'15px',cursor:'pointer',fontFamily:'DM Sans,sans-serif',backdropFilter:'blur(8px)',transition:'all 0.2s'}}>
              Explore Stories
            </button>
          </Link>
        </div>
      </div>

      <section className="bx-section" style={{paddingTop:0}}>
        <div style={{border:'1px solid var(--border)',borderRadius:'14px',background:'linear-gradient(135deg,rgba(201,169,110,0.08),rgba(45,212,192,0.08))',padding:'16px 18px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:'12px',flexWrap:'wrap'}}>
          <div>
            <div style={{fontSize:'11px',letterSpacing:'0.7px',textTransform:'uppercase',color:'var(--gold)',marginBottom:'5px'}}>Sponsored</div>
            <div style={{fontSize:'14px',color:'var(--text)'}}>Power your writing workflow with chapter planning templates and analytics.</div>
          </div>
          <button className="bx-btn-ghost" style={{fontSize:'12px',padding:'8px 14px'}}>View Offer</button>
        </div>
      </section>

      {/* -- Footer -- */}
      <footer className="bx-footer">
        <div className="bx-footer-grid">
          <div className="bx-footer-brand">
            <span className="bx-logo">Bi<span>x</span>bi</span>
            <p>The home for stories. Read, write, and connect with millions of readers and authors worldwide.</p>
          </div>
          <div className="bx-footer-col">
            <h4>Explore</h4>
            <Link href="/discover">Browse Stories</Link>
            <Link href="/discover?sort=popular">Trending</Link>
            <Link href="/discover?sort=new">New Releases</Link>
            <Link href="/discover?view=authors">Authors</Link>
          </div>
          <div className="bx-footer-col">
            <h4>Create</h4>
            <Link href="/write">Write a Story</Link>
            <Link href="/auth/signup">Join Free</Link>
            <Link href="/profile">My Works</Link>
          </div>
          <div className="bx-footer-col">
            <h4>Support</h4>
            <a href="#">Help Center</a>
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
            <a href="#">Contact</a>
          </div>
        </div>
        <div className="bx-footer-bottom">
          <p>© {new Date().getFullYear()} Bixbi. Read what you love.</p>
          <p style={{fontSize:'12px',color:'var(--muted)'}}>Made with ? for readers everywhere</p>
        </div>
      </footer>
    </main>
  );
}
