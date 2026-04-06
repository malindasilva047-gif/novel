'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';

import { apiRequest, readToken } from '@/lib/api';

const FALLBACK_CHAPTERS = [
  {
    _id: 'fallback-chapter-1',
    chapter_number: 1,
    title: 'Chapter 1',
    word_count: 120,
    content:
      '<p>The story begins here...</p><p>Stories survive because somebody keeps reading. Until the database is fully available, this chapter keeps the reader experience intact.</p>',
  },
];

export default function ReadPage() {
  const { id } = useParams();
  const contentRef = useRef(null);

  const [story, setStory] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [recoStories, setRecoStories] = useState([]);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [chapterIndex, setChapterIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [theme, setTheme] = useState('dark');
  const [fontSize, setFontSize] = useState(18);
  const [liked, setLiked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    Promise.all([
      apiRequest(`/stories/${id}`).catch(() => null),
      apiRequest(`/stories/${id}/chapters`).catch(() => null),
      apiRequest(`/engagement/stories/${id}/comments`).catch(() => []),
      apiRequest('/discovery/trending').catch(() => []),
    ])
      .then(([storyData, chapterData, commentData, trendingData]) => {
        setStory(
          storyData || {
            title: 'Story Title',
            author_name: 'Author',
            genre: 'Fantasy',
          }
        );
        setChapters(chapterData?.chapters?.length ? chapterData.chapters : FALLBACK_CHAPTERS);
        setComments(Array.isArray(commentData) ? commentData : []);
        setRecoStories((Array.isArray(trendingData) ? trendingData : []).slice(0, 4));
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    const node = contentRef.current;
    if (!node) return;

    const progressBar = document.getElementById('bx-progress');
    const onScroll = () => {
      const scrollableHeight = node.scrollHeight - node.clientHeight;
      const nextProgress = scrollableHeight > 0 ? Math.min(100, Math.round((node.scrollTop / scrollableHeight) * 100)) : 0;
      setProgress(nextProgress);
      if (progressBar) {
        progressBar.style.width = `${nextProgress}%`;
      }
    };

    node.addEventListener('scroll', onScroll, { passive: true });
    return () => node.removeEventListener('scroll', onScroll);
  }, [loading]);

  useEffect(() => {
    if (!id || !chapters.length) return;
    const chapterId = chapters[chapterIndex]?._id || chapters[chapterIndex]?.id || null;
    apiRequest('/reader/history', {
      method: 'POST',
      body: {
        story_id: String(id),
        chapter_id: chapterId,
        progress_pct: progress,
      },
    }).catch(() => {});
  }, [chapterIndex, progress, id, chapters]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const reactAction = async () => {
    if (!readToken()) {
      setToast('Please sign in to react.');
      return;
    }
    try {
      const result = await apiRequest(`/engagement/stories/${id}/like`, { method: 'POST' });
      setLiked(result.message?.toLowerCase().includes('liked'));
      setToast(result.message || 'Updated');
    } catch {
      setToast('Could not update like right now.');
    }
  };

  const bookmarkAction = async () => {
    if (!readToken()) {
      setToast('Please sign in to bookmark.');
      return;
    }
    try {
      const result = await apiRequest(`/reader/bookmarks/${id}`, { method: 'POST' });
      setBookmarked(result.message?.toLowerCase().includes('bookmarked'));
      setToast(result.message || 'Updated');
    } catch {
      setToast('Could not update bookmark right now.');
    }
  };

  const submitComment = async () => {
    const content = commentText.trim();
    if (content.length < 2) return;
    if (!readToken()) {
      setToast('Please sign in to comment.');
      return;
    }
    try {
      await apiRequest(`/engagement/stories/${id}/comments`, {
        method: 'POST',
        body: { content },
      });
      const latest = await apiRequest(`/engagement/stories/${id}/comments`).catch(() => []);
      setComments(Array.isArray(latest) ? latest : comments);
      setCommentText('');
      setToast('Comment added');
    } catch (err) {
      setToast(err.message || 'Could not post comment.');
    }
  };

  const currentChapter = chapters[chapterIndex];
  const themeStyles = {
    dark: { bg: '#0d0d12', color: 'rgba(255,255,255,0.88)' },
    light: { bg: '#f4f4ef', color: 'rgba(0,0,0,0.82)' },
    sepia: { bg: '#f9f3e3', color: '#3a2f1f' },
  };
  const activeTheme = themeStyles[theme];

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ink)' }}>
        <div style={{ color: 'var(--muted)', fontSize: '15px' }}>Loading story...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: 'calc(100vh - 60px)', background: activeTheme.bg, transition: 'background 0.3s', position: 'relative' }}>
      <div id="bx-progress" />

      <div className="bx-reading-hero" style={{ height: '280px', flexShrink: 0 }}>
        <div className="bx-reading-hero-bg" />
        <div style={{ position: 'relative', zIndex: 2, padding: '0 24px 32px', maxWidth: '680px' }}>
          <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px' }}>
            {story?.genre || story?.categories?.[0] || 'Fiction'}
          </div>
          <h1 style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 'clamp(24px,5vw,42px)', fontWeight: 400, color: '#fff', lineHeight: 1.1, marginBottom: '8px' }}>
            {story?.title}
          </h1>
          <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.55)' }}>by {story?.author_name || 'Author'}</div>
        </div>
      </div>

      <div style={{ borderBottom: '1px solid rgba(128,128,128,0.2)', background: activeTheme.bg, padding: '10px 24px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <button className="bx-btn-ghost" style={{fontSize:'12px',padding:'7px 12px',borderColor:liked?'var(--rose)':'var(--border)',color:liked?'var(--rose)':'var(--text)'}} onClick={reactAction}>❤ {liked ? 'Liked' : 'Like'}</button>
        <button className="bx-btn-ghost" style={{fontSize:'12px',padding:'7px 12px',borderColor:bookmarked?'var(--teal)':'var(--border)',color:bookmarked?'var(--teal)':'var(--text)'}} onClick={bookmarkAction}>{bookmarked ? 'Saved' : 'Save'}</button>
        <button className="bx-btn-ghost" style={{fontSize:'12px',padding:'7px 12px'}} onClick={() => setToast('Share copied')}>Share</button>
        <div style={{marginLeft:'auto',fontSize:'12px',color:'var(--muted)'}}>{story?.views || 0} views · {story?.likes || 0} likes</div>
      </div>

      <div style={{ background: activeTheme.bg, borderBottom: '1px solid rgba(128,128,128,0.15)', padding: '8px 24px', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0, flexWrap: 'wrap' }}>
        <select
          value={chapterIndex}
          onChange={(event) => setChapterIndex(Number(event.target.value))}
          style={{ background: theme === 'dark' ? 'var(--surface)' : 'rgba(0,0,0,0.05)', border: '1px solid rgba(128,128,128,0.2)', color: activeTheme.color, padding: '5px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', outline: 'none', fontFamily: 'DM Sans,sans-serif' }}
        >
          {chapters.map((chapter, index) => (
            <option key={chapter._id || chapter.id || index} value={index}>
              Ch. {chapter.chapter_number} - {chapter.title}
            </option>
          ))}
        </select>

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button onClick={() => setFontSize((value) => Math.max(14, value - 1))} style={{ width: '28px', height: '28px', background: 'none', border: '1px solid rgba(128,128,128,0.2)', borderRadius: '6px', cursor: 'pointer', color: activeTheme.color }}>-</button>
          <span style={{ fontSize: '12px', color: activeTheme.color, opacity: 0.6, minWidth: '30px', textAlign: 'center' }}>{fontSize}px</span>
          <button onClick={() => setFontSize((value) => Math.min(28, value + 1))} style={{ width: '28px', height: '28px', background: 'none', border: '1px solid rgba(128,128,128,0.2)', borderRadius: '6px', cursor: 'pointer', color: activeTheme.color }}>+</button>
        </div>

        <div style={{ display: 'flex', gap: '4px' }}>
          {[
            ['dark', 'Dark'],
            ['light', 'Light'],
            ['sepia', 'Sepia'],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              style={{ width: '54px', height: '30px', border: '1px solid rgba(128,128,128,0.2)', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', background: theme === value ? 'rgba(201,169,110,0.15)' : 'none', borderColor: theme === value ? 'rgba(201,169,110,0.4)' : 'rgba(128,128,128,0.2)', color: activeTheme.color }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr',gap:'22px',maxWidth:'1220px',margin:'0 auto',padding:'22px 16px 90px'}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr',gap:'16px'}}>
          <div ref={contentRef} style={{ background: theme === 'dark' ? 'var(--surface)' : '#fff', border:'1px solid rgba(128,128,128,0.15)', borderRadius:'14px', maxHeight:'68vh', overflowY: 'auto', scrollBehavior: 'smooth' }}>
            {currentChapter ? (
              <div style={{ maxWidth: '720px', margin: '0 auto', padding: '40px 24px 60px', fontFamily: 'Lora,Georgia,serif', fontSize: `${fontSize}px`, lineHeight: 1.9, color: activeTheme.color }}>
            <h2 style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 'clamp(22px,4vw,32px)', fontWeight: 400, marginBottom: '32px', textAlign: 'center', opacity: 0.9 }}>
              Chapter {currentChapter.chapter_number}: {currentChapter.title}
            </h2>
            <div dangerouslySetInnerHTML={{ __html: currentChapter.content || '<p>Chapter content coming soon.</p>' }} />
            <div style={{marginTop:'36px',padding:'16px',border:'1px solid rgba(128,128,128,0.2)',borderRadius:'12px',background:theme==='dark'?'rgba(201,169,110,0.08)':'rgba(0,0,0,0.04)'}}>
              <div style={{fontSize:'11px',letterSpacing:'0.7px',textTransform:'uppercase',color:'var(--gold)',marginBottom:'6px',fontFamily:'DM Sans,sans-serif'}}>Sponsored</div>
              <div style={{fontSize:'14px',fontFamily:'DM Sans,sans-serif',lineHeight:1.5}}>Enjoyed this chapter? Support independent writers with premium writing tools.</div>
            </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '60px 24px', color: activeTheme.color, opacity: 0.5 }}>No chapter content available.</div>
            )}
          </div>

          <div style={{background: theme === 'dark' ? 'var(--surface)' : '#fff', border:'1px solid rgba(128,128,128,0.15)', borderRadius:'14px', padding:'14px 16px'}}>
            <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:'22px',color:'var(--text)',marginBottom:'10px'}}>Comments</div>
            <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Write a comment..." style={{width:'100%',minHeight:'70px',border:'1px solid rgba(128,128,128,0.2)',borderRadius:'10px',background:'transparent',color:'var(--text)',padding:'10px 12px',fontFamily:'DM Sans,sans-serif',resize:'vertical'}} />
            <div style={{display:'flex',justifyContent:'flex-end',marginTop:'8px'}}>
              <button className="bx-btn-primary" style={{fontSize:'12px',padding:'8px 14px'}} onClick={submitComment}>Post</button>
            </div>
            <div style={{display:'grid',gap:'10px',marginTop:'12px'}}>
              {comments.slice(0, 6).map((c) => (
                <div key={c.id || c._id} style={{borderTop:'1px solid rgba(128,128,128,0.12)',paddingTop:'10px'}}>
                  <div style={{fontSize:'12px',color:'var(--muted)',marginBottom:'4px'}}>{c.user_id || 'Reader'}</div>
                  <div style={{fontSize:'13px',color:'var(--text)',lineHeight:1.6}}>{c.content}</div>
                </div>
              ))}
              {comments.length === 0 && <div style={{fontSize:'12px',color:'var(--muted)'}}>No comments yet.</div>}
            </div>
          </div>
        </div>

        <aside style={{background: theme === 'dark' ? 'var(--surface)' : '#fff', border:'1px solid rgba(128,128,128,0.15)', borderRadius:'14px', padding:'14px 16px'}}>
          <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:'22px',color:'var(--text)',marginBottom:'8px'}}>Chapter List</div>
          <div style={{display:'grid',gap:'6px',maxHeight:'220px',overflowY:'auto',marginBottom:'14px'}}>
            {chapters.map((ch, idx) => (
              <button key={ch._id || ch.id || idx} onClick={() => setChapterIndex(idx)} style={{textAlign:'left',background:idx===chapterIndex?'rgba(201,169,110,0.12)':'transparent',border:'1px solid rgba(128,128,128,0.15)',borderRadius:'8px',padding:'8px 10px',color:'var(--text)',cursor:'pointer',fontSize:'12px'}}>
                Ch. {ch.chapter_number}: {ch.title}
              </button>
            ))}
          </div>

          <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:'22px',color:'var(--text)',marginBottom:'8px'}}>You Might Like</div>
          <div style={{display:'grid',gap:'10px'}}>
            {recoStories.map((rs, i) => (
              <a key={`${rs.id || rs._id}-${i}`} href={`/read/${rs.id || rs._id}`} style={{display:'grid',gridTemplateColumns:'54px 1fr',gap:'9px',textDecoration:'none',color:'inherit'}}>
                <div style={{height:'72px',borderRadius:'6px',overflow:'hidden',background:'linear-gradient(160deg,#1a0a2e,#3d1a5e)'}}>
                  {rs.cover_image && <img src={rs.cover_image} alt={rs.title} style={{width:'100%',height:'100%',objectFit:'cover'}} />}
                </div>
                <div>
                  <div style={{fontSize:'13px',color:'var(--text)',lineHeight:1.3}}>{rs.title}</div>
                  <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'3px'}}>{(rs.categories || [])[0] || 'Fiction'}</div>
                </div>
              </a>
            ))}
          </div>
        </aside>
      </div>

      <div className="bx-ch-nav-bar" style={{ position:'fixed', left:0, right:0, bottom:0, background: theme === 'dark' ? 'rgba(13,13,18,0.95)' : theme === 'light' ? 'rgba(244,244,239,0.95)' : 'rgba(249,243,227,0.95)' }}>
        <button className="bx-ch-nav-btn" onClick={() => { setChapterIndex((value) => Math.max(0, value - 1)); contentRef.current?.scrollTo(0, 0); }} disabled={chapterIndex === 0}>
          Prev
        </button>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: '12px', color: activeTheme.color, opacity: 0.5 }}>{progress}% complete</div>
          <div style={{ width: '100%', maxWidth: '160px', height: '2px', background: 'rgba(128,128,128,0.15)', borderRadius: '1px', margin: '4px auto 0', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: 'var(--teal)', transition: 'width 0.3s', borderRadius: '1px' }} />
          </div>
        </div>
        <button className="bx-ch-nav-btn next" onClick={() => { setChapterIndex((value) => Math.min(chapters.length - 1, value + 1)); contentRef.current?.scrollTo(0, 0); }} disabled={chapterIndex === chapters.length - 1}>
          Next
        </button>
      </div>

      {toast && (
        <div style={{position:'fixed',right:'18px',bottom:'68px',zIndex:700,background:'var(--surface)',border:'1px solid var(--border)',padding:'9px 12px',borderRadius:'8px',fontSize:'12px',color:'var(--text)'}}>
          {toast}
        </div>
      )}
    </div>
  );
}