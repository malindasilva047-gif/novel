'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
  const [tab, setTab] = useState('All');
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest('/reader/history').then(data => {
      if (Array.isArray(data)) setBooks(data);
      else setBooks(MOCK);
    }).catch(() => setBooks(MOCK)).finally(() => setLoading(false));
  }, []);

  const filtered = books.filter(b => {
    if (tab === 'All') return true;
    if (tab === 'Completed') return b.status === 'completed' || (b.progress || 0) === 100;
    if (tab === 'Reading') return b.status !== 'completed' && (b.progress || 0) < 100 && (b.progress || 0) > 0;
    return true;
  });

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
              <div key={b._id || i} className="bx-lib-card" onClick={() => router.push(`/read/${b._id}`)}>
                <div className="bx-lib-cover" style={{background: pal(i), display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Cormorant Garamond,serif',fontSize:'13px',fontWeight:600,color:'#fff',textAlign:'center',padding:'10px',lineHeight:1.3}}>
                  {b.cover_image ? <img src={b.cover_image} alt={b.title} style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}} /> : b.title}
                </div>
                <div className="bx-lib-info">
                  <div className="bx-lib-title">{b.title}</div>
                  <div className="bx-lib-meta">{b.author_name || b.author || 'Author'}</div>
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
