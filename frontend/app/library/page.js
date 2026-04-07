'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiRequest } from '@/lib/api';

const PALETTES = [
  'linear-gradient(160deg,#1a0a2e,#3d1a5e)',
  'linear-gradient(160deg,#0a1628,#1a3060)',
  'linear-gradient(160deg,#1a0a10,#5e1a2e)',
  'linear-gradient(160deg,#0a1a0a,#1a3c1a)',
  'linear-gradient(160deg,#1a140a,#5e3c0a)',
  'linear-gradient(160deg,#0a1a1a,#0a4040)',
];
const pal = (i) => PALETTES[Math.abs(i || 0) % PALETTES.length];

const MOCK = [
  {_id:'1',title:'The Last Kingdom of Stars',author_name:'Elara Moonwhisper',genre:'Fantasy',status:'ongoing',progress:68},
  {_id:'2',title:'Gilded Dust & Forgotten Vows',author_name:'Seraphina Vale',genre:'Romance',status:'ongoing',progress:35},
  {_id:'3',title:'Echoes of a Broken Sea',author_name:'Caspian Drake',genre:'Adventure',status:'completed',progress:100},
  {_id:'4',title:'Dark Waters Rising',author_name:'Kian Rivers',genre:'Mystery',status:'ongoing',progress:12},
  {_id:'5',title:'Starfall Academy',author_name:'Ash Stormwood',genre:'Fantasy',status:'ongoing',progress:47},
  {_id:'6',title:'Letters to Nobody',author_name:'Elena Voss',genre:'Drama',status:'completed',progress:100},
  {_id:'7',title:'The Crimson Veil',author_name:'Sera Wilde',genre:'Horror',status:'ongoing',progress:23},
  {_id:'8',title:'When the Moon Forgets',author_name:'Lyra Moon',genre:'Fantasy',status:'ongoing',progress:57},
];

const TABS = ['All','Reading','Completed','Saved'];

export default function LibraryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const requestedTabRaw = searchParams.get('tab') || searchParams.get('filter') || 'All';
  const requestedTab = TABS.find((t) => t.toLowerCase() === requestedTabRaw.toLowerCase()) || 'All';

  const [tab, setTab] = useState(requestedTab);
  const [books, setBooks] = useState([]);
  const [following, setFollowing] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTab(requestedTab);
  }, [requestedTab]);

  useEffect(() => {
    Promise.all([
      apiRequest('/reader/history').catch(() => []),
      apiRequest('/reader/bookmarks').catch(() => []),
    ])
      .then(([historyData, bookmarksData]) => {
        const history = Array.isArray(historyData)
          ? historyData.map((item) => ({
              ...item,
              _id: item.story_id || item._id,
              progress: Math.round(item.progress_pct ?? item.progress ?? 0),
              source: 'history',
            }))
          : [];

        const mergedByStoryId = new Map(history.map((item) => [item.story_id || item._id, item]));

        const bookmarks = Array.isArray(bookmarksData)
          ? bookmarksData.map((item) => ({
              _id: item.story_id,
              story_id: item.story_id,
              title: item.title,
              cover_image: item.cover_image,
              author_name: item.author_name || 'Author',
              genre: item.genre || 'Fiction',
              progress: 0,
              status: 'saved',
              source: 'bookmark',
            }))
          : [];

        bookmarks.forEach((bookmark) => {
          if (!mergedByStoryId.has(bookmark.story_id)) {
            mergedByStoryId.set(bookmark.story_id, bookmark);
          }
        });

        const merged = Array.from(mergedByStoryId.values());
        setBooks(merged.length ? merged : MOCK);
      })
      .catch(() => setBooks(MOCK))
      .finally(() => setLoading(false));
  }, []);

  const filtered = books.filter(b => {
    if (tab === 'All') return true;
    if (tab === 'Completed') return b.status === 'completed' || (b.progress || 0) === 100;
    if (tab === 'Reading') return (b.progress || 0) > 0 && (b.progress || 0) < 100;
    if (tab === 'Saved') return b.source === 'bookmark' || (b.progress || 0) === 0;
    return true;
  });

  const followAuthor = async (authorId) => {
    if (!authorId) return;
    try {
      await apiRequest(`/users/${authorId}/follow`, { method: 'POST' });
      setFollowing((prev) => ({ ...prev, [authorId]: true }));
    } catch {}
  };

  return (
    <main style={{minHeight:'100vh',paddingBottom:'60px'}}>
      <section className="bx-section">
        <div style={{marginBottom:'28px'}}>
          <h1 className="bx-sec-title serif" style={{fontSize:'clamp(26px,5vw,40px)',marginBottom:'6px'}}>My Library</h1>
          <p style={{color:'var(--muted)',fontSize:'14px'}}>{books.length} stories in your collection</p>
        </div>

        <div className="bx-tabs" style={{marginBottom:'28px'}}>
          {TABS.map(t => (
            <button key={t} className={`bx-tab${tab===t?' active':''}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>

        {loading ? (
          <div className="bx-library-grid">
            {Array.from({length:8}).map((_,i) => (
              <div key={i} style={{background:'var(--surface)',borderRadius:'12px',overflow:'hidden',opacity:0.5}}>
                <div style={{aspectRatio:'2/3',background:'rgba(255,255,255,0.05)'}} />
                <div style={{padding:'10px 12px'}}>
                  <div style={{height:'12px',background:'rgba(255,255,255,0.07)',borderRadius:'4px',marginBottom:'6px'}} />
                  <div style={{height:'10px',background:'rgba(255,255,255,0.05)',borderRadius:'4px',width:'60%'}} />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <div className="bx-library-grid">
            {filtered.map((b, i) => (
              <div key={b.story_id || b._id || i} className="bx-lib-card" onClick={() => router.push(`/read/${b.story_id || b._id}`)}>
                <div className="bx-lib-cover" style={{background: pal(i), display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Cormorant Garamond,serif',fontSize:'13px',fontWeight:600,color:'#fff',textAlign:'center',padding:'10px',lineHeight:1.3}}>
                  {b.cover_image ? <img src={b.cover_image} alt={b.title} style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}} /> : b.title}
                </div>
                <div className="bx-lib-info">
                  <div className="bx-lib-title">{b.title}</div>
                  <div className="bx-lib-meta">{b.author_name || b.author || 'Author'}</div>
                  {!!b.author_id && (
                    <button
                      className="bx-btn-ghost"
                      style={{ fontSize: '11px', padding: '6px 10px', marginBottom: '8px' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        followAuthor(b.author_id);
                      }}
                    >
                      {following[b.author_id] ? 'Following' : 'Follow'}
                    </button>
                  )}
                  {(b.progress !== undefined) && b.progress < 100 && (
                    <div style={{marginBottom:'6px'}}>
                      <div style={{height:'3px',background:'rgba(255,255,255,0.07)',borderRadius:'2px',overflow:'hidden'}}>
                        <div style={{height:'100%',width:`${b.progress}%`,background:'var(--teal)',borderRadius:'2px'}} />
                      </div>
                      <span style={{fontSize:'10px',color:'var(--muted)',marginTop:'2px',display:'block'}}>{b.progress}% read</span>
                    </div>
                  )}
                  <span className={`bx-lib-status ${(b.progress || 0) >= 100 || b.status === 'completed' ? 'complete' : 'ongoing'}`}>
                    {(b.progress || 0) >= 100 || b.status === 'completed' ? 'Finished' : 'Reading'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{textAlign:'center',padding:'60px 0'}}>
            <div style={{fontSize:'48px',marginBottom:'16px'}}>??</div>
            <p style={{color:'var(--muted)',fontSize:'16px',marginBottom:'20px'}}>
              {tab === 'All' ? 'Your library is empty' : `No ${tab.toLowerCase()} books`}
            </p>
            <button className="bx-btn-primary" onClick={() => router.push('/discover')}>Discover Stories</button>
          </div>
        )}
      </section>
    </main>
  );
}
