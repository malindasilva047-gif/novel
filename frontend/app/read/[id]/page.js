
'use client';

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
  const storyId = Array.isArray(id) ? id[0] : id;
  const isNumericDemoId = /^\d+$/.test(String(storyId || ''));
  const router = useRouter();
  const contentRef = useRef(null);

  // Share icon style (must be outside JSX)
  const shareIconStyle = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 12, background: 'var(--surface2)', color: 'var(--text)', fontSize: 22, border: '2px solid transparent', cursor: 'pointer', transition: 'all 0.18s', textDecoration: 'none', outline: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
  };

  const [story, setStory] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [recoStories, setRecoStories] = useState([]);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [chapterIndex, setChapterIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [theme, setTheme] = useState('light');
  const [fontSize, setFontSize] = useState(18);
  const [liked, setLiked] = useState(false);

  };

  const currentChapter = chapters[chapterIndex];
  const canManageStory = !!(
    currentUser && story && currentUser.id === story.author_id
  );

  const handleTogglePublishStatus = async () => {
    if (!canManageStory || !story?.id) return;
    try {
      setIsManagingStory(true);
      const nextDraft = story?.status === 'published';
      await apiRequest(`/stories/${story.id || story._id}`, {
        method: 'PATCH',
        body: { is_draft: nextDraft },
      });
      setStory((prev) => ({ ...prev, status: nextDraft ? 'draft' : 'published' }));
      setToast(nextDraft ? 'Story moved to draft.' : 'Story published.');
    } catch (err) {
      setToast(err.message || 'Could not update story status.');
    } finally {
      setIsManagingStory(false);
    }
  };

  const handleDeleteStory = async () => {
    if (!canManageStory || !story?.id) return;
    if (!window.confirm('Delete this story and all chapters?')) return;
    try {
      setIsManagingStory(true);
      await apiRequest(`/stories/${story.id || story._id}`, { method: 'DELETE' });
      router.push('/write');
    } catch (err) {
      setToast(err.message || 'Could not delete story.');
    } finally {
      setIsManagingStory(false);
    }
  };

  const themeStyles = {
    dark: { bg: '#0d0d12', color: 'rgba(255,255,255,0.88)' },
    light: { bg: '#f4f4ef', color: 'rgba(0,0,0,0.82)' },
    sepia: { bg: '#f9f3e3', color: '#3a2f1f' },
  };
  const activeTheme = themeStyles[theme];

  const readCount = Number(story?.views || 0);
  const voteCount = Number(story?.likes || 0);
  const partCount = Number(chapters?.length || 0);
  const estimatedMinutes = Math.max(4, Math.round(((chapters || []).reduce((acc, ch) => acc + Number(ch?.word_count || 0), 0) || 900) / 200));


  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ color: 'var(--muted)', fontSize: '15px' }}>Loading story...</div>
      </div>
    );
  }
  // Main reading layout (HTML reference style)
  return (
    <div className="bixbi-read-root" style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh' }}>
      {/* Hero Section */}
      <div className="hero" style={{ position: 'relative', height: 360, display: 'flex', alignItems: 'flex-end', background: 'var(--surface2)' }}>
        <div className="hero-bg" style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 30% 60%, rgba(139,26,26,0.55) 0%, transparent 60%),radial-gradient(ellipse at 75% 30%, rgba(30,10,5,0.8) 0%, transparent 55%),linear-gradient(160deg, #0e0402 0%, #1a0505 40%, #110808 70%, #0a0604 100%)' }} />
        <div className="hero-cover-wrap" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -60%)', zIndex: 2, filter: 'drop-shadow(0 20px 60px rgba(0,0,0,0.8))' }}>
          <div className="hero-cover" style={{ width: 120, height: 180, borderRadius: 8, background: 'linear-gradient(160deg, #2a1a0a, #4a2a0a)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cormorant Garamond,serif', color: 'rgba(201,169,110,0.9)', fontSize: 13, fontWeight: 600, textAlign: 'center', lineHeight: 1.4, padding: 12, border: '1px solid rgba(201,169,110,0.2)', position: 'relative', overflow: 'hidden' }}>
            {story?.cover_image ? <img src={story.cover_image} alt={story?.title || 'Story cover'} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} /> : (story?.title || 'No Cover')}
          </div>
        </div>
        <div style={{ flex: 1 }} />
      </div>
      {/* Story Info & Actions */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 16px 0' }}>
        <h1 style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 36, marginBottom: 8 }}>{story?.title}</h1>
        <div style={{ color: 'var(--muted)', marginBottom: 12 }}>{story?.description}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <span style={{ color: 'var(--gold)', fontWeight: 600 }}>{story?.genre || story?.categories?.[0]}</span>
          <span style={{ color: 'var(--muted)' }}>{readCount.toLocaleString()} reads</span>
          <span style={{ color: 'var(--muted)' }}>{voteCount.toLocaleString()} Likes</span>
          <span style={{ color: 'var(--muted)' }}>{partCount} Parts</span>
          <span style={{ color: 'var(--muted)' }}>{estimatedMinutes} min read</span>
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
          <button className="icon-btn" onClick={reactAction} title="Like" style={{ color: liked ? '#e8748a' : 'var(--muted)' }}>
            {liked ? <FaHeart /> : <FaRegHeart />}
            <span style={{ marginLeft: 4 }}>Like</span>
          </button>
          <button className="icon-btn" onClick={bookmarkAction} title="Save" style={{ color: bookmarked ? '#c9a96e' : 'var(--muted)' }}>
            {bookmarked ? <FaBookmark /> : <FaRegBookmark />}
            <span style={{ marginLeft: 4 }}>Save</span>
          </button>
          <button className="icon-btn" onClick={() => setShowShare(true)} title="Share">
            <FaShareAlt />
            <span style={{ marginLeft: 4 }}>Share</span>
          </button>
                {/* Share Popup */}
                {showShare && (
                  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.32)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowShare(false)}>
                    <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, minWidth: 340, maxWidth: '90vw', boxShadow: '0 8px 32px rgba(0,0,0,0.18)', position: 'relative' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => setShowShare(false)} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', fontSize: 22, color: 'var(--muted)', cursor: 'pointer' }} aria-label="Close share popup"><IoMdClose /></button>
                      <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 18 }}>Share this story</h3>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 18 }}>
                        <a href={`mailto:?subject=Check%20out%20this%20story!&body=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer" title="Email" style={shareIconStyle}><FaEnvelope /></a>
                        <a href={`https://wa.me/?text=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer" title="WhatsApp" style={shareIconStyle}><FaWhatsapp color="#25D366" /></a>
                        <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer" title="Facebook" style={shareIconStyle}><FaFacebook color="#1877F3" /></a>
                        <a href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer" title="X" style={shareIconStyle}><FaXTwitter color="#000" /></a>
                        <a href={`https://www.pinterest.com/pin/create/button/?url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer" title="Pinterest" style={shareIconStyle}><FaPinterest color="#E60023" /></a>
                        <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer" title="LinkedIn" style={shareIconStyle}><FaLinkedin color="#0A66C2" /></a>
                        <a href={`https://www.reddit.com/submit?url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer" title="Reddit" style={shareIconStyle}><FaReddit color="#FF4500" /></a>
                        <button onClick={() => {navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(()=>setCopied(false), 1500);}} title="Copy link" style={{ ...shareIconStyle, border: copied ? '2px solid var(--gold)' : '2px solid transparent', background: copied ? 'var(--gold-soft)' : 'var(--surface2)' }}><FaLink />{copied && <span style={{ marginLeft: 6, fontSize: 13, color: 'var(--gold)' }}>Copied!</span>}</button>
                        <button onClick={() => setToast('<iframe src=\"' + shareUrl + '\" width=\"400\" height=\"300\"></iframe>')} title="Embed" style={shareIconStyle}><FaCode /></button>
                      </div>
                      <div style={{ color: 'var(--muted)', fontSize: 13 }}>Share this story on your favorite platform or copy the link.</div>
                    </div>
                  </div>
                )}
          {/* Share icon style is now at the top of the function */}
        </div>
        {/* About the Author Section */}
        <div className="author-section" style={{ marginBottom: 18, background: 'var(--surface2)', borderRadius: 10, padding: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div className="author-avatar" style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--gold-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 22, color: 'var(--gold)' }}>
            {story?.author_name?.[0] || 'A'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 16 }}>{story?.author_name}</div>
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>@{story?.author_username || 'author'} · {story?.author_followers || 0} followers</div>
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>{story?.author_bio || 'Fantasy & paranormal romance writer.'}</div>
            <button className="cta ghost small" style={{ marginTop: 6 }} onClick={() => router.push(`/profile/${story?.author_id}`)}>🤓 Geek This Author</button>
          </div>
        </div>
        {/* End About the Author */}
      </div>
      {/* Story Content */}
      <div ref={contentRef} style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px', background: activeTheme.bg, color: activeTheme.color, borderRadius: 12, minHeight: 300 }}>
        <div dangerouslySetInnerHTML={{ __html: currentChapter?.content || '<p>No content.</p>' }} />
      </div>
      {/* Comments Section */}
      <div style={{ maxWidth: 900, margin: '32px auto', padding: '0 16px' }}>
        <h3 style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 18, marginBottom: 10 }}>Comments</h3>
        <form onSubmit={e => { e.preventDefault(); submitComment(); }} style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          <input
            type="text"
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            placeholder="Write a comment..."
            style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 15 }}
            minLength={2}
            maxLength={1000}
            required
          />
          <button type="submit" className="cta primary" style={{ padding: '0 18px', borderRadius: 8, fontWeight: 600 }}>Post</button>
        </form>
        <div>
          {comments.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 14 }}>No comments yet.</div>}
          {comments.map((item, idx) => (
            <div key={item._id || idx} style={{ background: 'var(--surface2)', borderRadius: 8, padding: 12, marginBottom: 10, color: 'var(--text)' }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{item.username || item.user_id || 'User'}</div>
              <div style={{ fontSize: 14 }}>{item.content}</div>
            </div>
          ))}
        </div>
      </div>
      {/* Toast Message */}
      {toast && <div style={{ position: 'fixed', bottom: 32, left: 0, right: 0, margin: '0 auto', maxWidth: 320, background: 'var(--surface)', color: 'var(--text)', borderRadius: 8, boxShadow: '0 2px 16px rgba(0,0,0,0.13)', padding: 16, textAlign: 'center', zIndex: 9999 }}>{toast}</div>}
    </div>
  );

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
        {canManageStory && (
          <>
            <button className="bx-btn-ghost" style={{fontSize:'12px',padding:'7px 12px'}} onClick={() => router.push(`/write?storyId=${encodeURIComponent(String(story?.id || story?._id || ''))}`)}>
              Edit
            </button>
            <button className="bx-btn-ghost" style={{fontSize:'12px',padding:'7px 12px',borderColor:'var(--teal)',color:'var(--teal)'}} onClick={handleTogglePublishStatus} disabled={isManagingStory}>
              {story?.status === 'published' ? 'Unpublish' : 'Publish'}
            </button>
            <button className="bx-btn-ghost" style={{fontSize:'12px',padding:'7px 12px',borderColor:'var(--rose)',color:'var(--rose)'}} onClick={handleDeleteStory} disabled={isManagingStory}>
              Delete
            </button>
          </>
        )}
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
              <a key={`${rs.id || rs._id}-${i}`} href={`/story/${rs.id || rs._id}`} style={{display:'grid',gridTemplateColumns:'54px 1fr',gap:'9px',textDecoration:'none',color:'inherit'}}>
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
          <div style={{ fontSize: '12px', color: activeTheme.color, opacity: 0.5 }}>{overallProgress}% complete</div>
          <div style={{ width: '100%', maxWidth: '160px', height: '2px', background: 'rgba(128,128,128,0.15)', borderRadius: '1px', margin: '4px auto 0', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${overallProgress}%`, background: 'var(--teal)', transition: 'width 0.3s', borderRadius: '1px' }} />
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
