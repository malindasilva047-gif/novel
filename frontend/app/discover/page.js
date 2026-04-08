'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiRequest } from '@/lib/api';
import { Suspense } from 'react';
import StoryCard from '@/components/StoryCard';

const GENRES = ['All','Fantasy','Romance','Mystery','Sci-Fi','Horror','Adventure','Drama','Teen Fiction','Fan Fiction','Poetry'];
const SORT_OPTS = [
  { value: 'popular', label: 'Most Popular' },
  { value: 'new', label: 'Newest First' },
  { value: 'rating', label: 'Highest Rated' },
  { value: 'views', label: 'Most Views' },
];

const MOCK_STORIES = Array.from({length:24},(_,i)=>({
  _id: String(i+1),
  title: ['The Last Kingdom','Echoes of the Sea','Gilded Dust','Crimson Veil','Dark Waters','Starfall Academy','Letters to Nobody','The Forgotten Prince','When Stars Fall','Ember & Ash','Tides of Fate','Silver Shadows','The Iron Crown','Whisper of Wings','Beyond the Veil','Midnight Bloom','The Dragon Pact','Sea of Souls','Broken Chains','Night Garden','The Lost Heir','Curse of Gold','Forever After','Fire & Ice'][i],
  author_name: ['Elena Voss','Kian Rivers','Lyra Moon','Sera Wilde','Ash Stormwood','Elara Moonwhisper','Caspian Drake','Seraphina Vale','Callum Grey','Isolde Fae','Phoenix Reed','Luna Starr'][i % 12],
  genre: GENRES.slice(1)[i % (GENRES.length-1)],
  avg_rating: (4.2 + (i % 8)*0.1).toFixed(1),
  reads: `${((i+1)*14.7).toFixed(1)}K`,
  status: i % 3 === 0 ? 'completed' : 'ongoing',
}));

function applyFilters(items, currentQuery, currentGenre) {
  let next = Array.isArray(items) ? items : [];

  if (currentGenre !== 'All') {
    const selectedGenre = currentGenre.toLowerCase();
    next = next.filter((item) => {
      const genreText = String(item.genre || '').toLowerCase();
      const categories = Array.isArray(item.categories) ? item.categories.map((c) => String(c).toLowerCase()) : [];
      return genreText === selectedGenre || categories.includes(selectedGenre);
    });
  }

  if (currentQuery) {
    const needle = currentQuery.toLowerCase();
    next = next.filter((item) => {
      const title = String(item.title || '').toLowerCase();
      const author = String(item.author_name || item.author || '').toLowerCase();
      const genreText = String(item.genre || '').toLowerCase();
      const categories = Array.isArray(item.categories) ? item.categories.join(' ').toLowerCase() : '';
      return `${title} ${author} ${genreText} ${categories}`.includes(needle);
    });
  }

  return next;
}

function DiscoverInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [genre, setGenre] = useState(searchParams.get('genre') || 'All');
  const [sort, setSort] = useState(searchParams.get('sort') || 'popular');
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [selected, setSelected] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const LIMIT = 18;

  // Sync state when URL params change (navbar links, back/forward navigation)
  useEffect(() => {
    const urlSort = searchParams.get('sort') || 'popular';
    const rawGenre = searchParams.get('genre') || '';
    const urlQ = searchParams.get('q') || '';
    const matchedGenre = rawGenre
      ? GENRES.find(g => g.toLowerCase() === rawGenre.toLowerCase()) || 'All'
      : 'All';
    setSort(urlSort);
    setGenre(matchedGenre);
    setQ(urlQ);
    setSearch(urlQ);
    setPage(1);
  }, [searchParams]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(LIMIT), skip: String((page-1)*LIMIT), sort_by: sort });
    if (q) params.set('q', q);
    if (genre !== 'All') params.set('genre', genre);
    apiRequest(`/stories?${params}`).then(data => {
      const rawItems = Array.isArray(data) ? data : data?.stories || [];
      const filteredItems = applyFilters(rawItems, q, genre);
      setStories((prev) => (page === 1 ? filteredItems : [...prev, ...filteredItems]));
      setHasMore(rawItems.length === LIMIT);
    }).catch(() => {
      const fallbackItems = applyFilters(MOCK_STORIES, q, genre);
      setStories((prev) => (page === 1 ? fallbackItems : [...prev, ...fallbackItems]));
      setHasMore(false);
    }).finally(() => setLoading(false));
  }, [genre, sort, q, page]);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const payload = await apiRequest('/stories?limit=120&sort_by=views');
        const rows = Array.isArray(payload?.stories) ? payload.stories : [];
        if (!rows.length) return;

        const viewMap = new Map(rows.map((item) => [String(item._id || item.id), Number(item.views || 0)]));
        setStories((prev) =>
          (Array.isArray(prev) ? prev : []).map((item) => {
            const key = String(item._id || item.id || '');
            if (!viewMap.has(key)) return item;
            return { ...item, views: viewMap.get(key) };
          })
        );
      } catch {
        // Ignore polling errors
      }
    }, 8000);

    return () => clearInterval(interval);
  }, []);

  const doSearch = (e) => { e.preventDefault(); setQ(search); setPage(1); };

  const displayStories = stories;

  return (
    <main style={{minHeight:'100vh'}}>
      {/* Hero */}
      <div style={{background:'linear-gradient(to bottom,rgba(13,13,18,0),var(--ink))',paddingTop:'40px'}}>
        <section className="bx-section" style={{paddingBottom:'0',borderTop:'none'}}>
          <h1 className="bx-sec-title serif" style={{fontSize:'clamp(28px,5vw,44px)',marginBottom:'6px'}}>Discover Stories</h1>
          <p style={{color:'var(--muted)',fontSize:'15px',marginBottom:'28px'}}>Find your next favourite read from millions of stories</p>

          <form onSubmit={doSearch} className="bx-search" style={{maxWidth:'600px',marginBottom:'24px'}}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search stories, authors, genres…" />
            <button type="submit" className="bx-search-btn">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            </button>
          </form>

          {/* Genre tabs */}
          <div id="genres" className="bx-tabs" style={{marginBottom:'0', scrollMarginTop:'88px'}}>
            {GENRES.map(g => (
              <button key={g} className={`bx-tab${genre === g ? ' active' : ''}`} onClick={() => { setGenre(g); setPage(1); }}>{g}</button>
            ))}
          </div>
        </section>
      </div>

      {/* Sort + grid */}
      <section className="bx-section" style={{paddingTop:'24px',borderTop:'1px solid var(--border)'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'24px',flexWrap:'wrap',gap:'12px'}}>
          <p style={{fontSize:'13px',color:'var(--muted)'}}>
            {loading ? 'Loading…' : `${displayStories.length}+ stories`}
            {genre !== 'All' && <span style={{color:'var(--gold)'}}> in {genre}</span>}
          </p>
          <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
            <span style={{fontSize:'12px',color:'var(--muted)'}}>Sort:</span>
            <select value={sort} onChange={e => { setSort(e.target.value); setPage(1); }} className="bx-select-control"
              style={{padding:'6px 12px'}}>
              {SORT_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:'16px'}}>
            {Array.from({length:12}).map((_,i) => (
              <div key={i} style={{background:'var(--surface)',borderRadius:'10px',overflow:'hidden',opacity:0.5,animation:'bxFadeIn 1s infinite alternate'}}>
                <div style={{aspectRatio:'2/3',background:'rgba(255,255,255,0.05)'}} />
                <div style={{padding:'10px 12px'}}>
                  <div style={{height:'12px',background:'rgba(255,255,255,0.07)',borderRadius:'4px',marginBottom:'6px'}} />
                  <div style={{height:'10px',background:'rgba(255,255,255,0.05)',borderRadius:'4px',width:'70%'}} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:'16px'}}>
            {displayStories.map((s, i) => (
              <div key={`${s._id || i}-row`} style={{display:'contents'}}>
                <div style={{flex:'none',width:'100%'}}>
                  <StoryCard
                    story={{ ...s, badge: s.status === 'completed' ? 'COMPLETE' : s.badge }}
                    index={i}
                    onClick={() => setSelected(s)}
                  />
                </div>
                {(i + 1) % 8 === 0 && (
                  <div style={{gridColumn:'1 / -1',border:'1px solid var(--border)',background:'linear-gradient(135deg,rgba(201,169,110,0.08),rgba(45,212,192,0.08))',borderRadius:'12px',padding:'14px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:'12px'}}>
                    <div>
                      <div style={{fontSize:'11px',letterSpacing:'0.7px',textTransform:'uppercase',color:'var(--gold)',marginBottom:'4px'}}>Sponsored</div>
                      <div style={{fontSize:'14px',color:'var(--text)'}}>Discover writing tools to level up your next chapter.</div>
                    </div>
                    <button className="bx-btn-ghost" style={{fontSize:'12px',padding:'8px 14px'}}>Learn More</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {!loading && displayStories.length === 0 && (
          <div style={{textAlign:'center',marginTop:'20px',color:'var(--muted)',fontSize:'13px'}}>
            No stories matched your filters.
          </div>
        )}

        {!loading && hasMore && (
          <div style={{textAlign:'center',marginTop:'32px'}}>
            <button onClick={() => setPage(p => p+1)} className="bx-btn-ghost" style={{padding:'12px 36px',fontSize:'14px'}}>
              Load more
            </button>
          </div>
        )}
      </section>

      {/* Story modal */}
      {selected && (
        <div className="bx-modal-overlay open" onClick={e => e.target === e.currentTarget && setSelected(null)}>
          <div className="bx-modal">
            <div className="bx-modal-drag" />
            <button className="bx-modal-close" onClick={() => setSelected(null)}>
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
            <div className="bx-modal-inner">
              <div className="bx-modal-cover">
                {selected.cover_image ? (
                  <img src={selected.cover_image} alt={selected.title} loading="eager" />
                ) : (
                  <div style={{width:'100%',height:'100%',background:'linear-gradient(160deg,#1a0a2e,#3d1a5e)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Cormorant Garamond,serif',fontSize:'14px',fontWeight:600,color:'#fff',textAlign:'center',padding:'10px',lineHeight:1.3}}>
                    {selected.title}
                  </div>
                )}
              </div>
              <div>
                <div className="bx-modal-genre-tag">{selected.genre || selected.category || 'Fiction'}</div>
                <div className="bx-modal-title">{selected.title}</div>
                <div className="bx-modal-author">by {selected.author_name || 'Unknown'}</div>
                <div className="bx-modal-stats">
                  <span className="bx-modal-stat">? {Number(selected.avg_rating || 4.5).toFixed(1)}</span>
                  <span className="bx-modal-stat">{Number(selected.views || 0).toLocaleString()} views</span>
                  <span className="bx-modal-stat" style={{color: selected.status === 'completed' ? 'var(--gold)' : 'var(--teal)'}}>{selected.status || 'Ongoing'}</span>
                </div>
              </div>
            </div>
            <p className="bx-modal-desc">{selected.description || selected.summary || 'An immersive story waiting to be discovered. Start reading today!'}</p>
            <div className="bx-modal-actions">
              <button className="bx-modal-btn-read" onClick={() => router.push(`/read/${selected._id || selected.id}`)}>Read Now</button>
              <button className="bx-modal-btn-save" onClick={() => setSelected(null)}>+ Save</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function DiscoverPage() {
  return (
    <Suspense fallback={<div style={{height:'100vh',background:'var(--ink)'}} />}>
      <DiscoverInner />
    </Suspense>
  );
}
