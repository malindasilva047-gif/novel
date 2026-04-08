'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { apiRequest, readToken, trackUserActivity } from '@/lib/api';

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
  const [bookmarked, setBookmarked] = useState(false);
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [accessChecked, setAccessChecked] = useState(false);
  const [hasPremiumAccess, setHasPremiumAccess] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [isManagingStory, setIsManagingStory] = useState(false);
  const lastHistoryWriteRef = useRef({ chapterId: '', progressBucket: -1 });
  const sessionStartRef = useRef(Date.now());
  const viewTrackedRef = useRef(false);

  useEffect(() => {
    if (!storyId) return;
    setIsReadingMode(false);

    if (isNumericDemoId) {
      setStory({
        id: storyId,
        title: `Story ${storyId}`,
        author_name: 'Wingsaga Author',
        genre: 'Fiction',
      });
      setChapters(FALLBACK_CHAPTERS);
      setComments([]);
      setRecoStories([]);
      setLoading(false);
      return;
    }

    Promise.all([
      apiRequest(`/stories/${storyId}`).catch(() => null),
      apiRequest(`/stories/${storyId}/chapters`).catch(() => null),
      apiRequest(`/engagement/stories/${storyId}/comments`).catch(() => []),
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
  }, [storyId, isNumericDemoId]);

  // REAL-TIME VIEW COUNT & ENGAGEMENT POLLING
  useEffect(() => {
    if (!storyId || isNumericDemoId) return;

    const interval = setInterval(async () => {
      try {
        const updated = await apiRequest(`/stories/${storyId}`).catch(() => null);
        if (updated) {
          setStory((prev) => ({
            ...prev,
            views: updated.views,
            likes: updated.likes,
            bookmarks: updated.bookmarks,
            comments_count: updated.comments_count,
          }));
        }
      } catch (err) {
        // Silently fail on polling errors
      }
    }, 8000); // Poll every 8 seconds for view/engagement updates

    return () => clearInterval(interval);
  }, [storyId, isNumericDemoId]);

  useEffect(() => {
    const token = readToken();
    if (!token) {
      setCurrentUser(null);
      return;
    }
    apiRequest('/users/me', { token }).then(setCurrentUser).catch(() => setCurrentUser(null));
  }, []);

  useEffect(() => {
    if (!storyId || isNumericDemoId || viewTrackedRef.current) return;
    const token = readToken();
    if (!token) return;

    viewTrackedRef.current = true;
    trackUserActivity({
      postId: storyId,
      actionType: 'view',
      readTime: 0,
      scrollDepth: 0,
      token,
    }).catch(() => {});
  }, [storyId, isNumericDemoId]);

  useEffect(() => {
    if (!story?.is_premium) {
      setAccessChecked(true);
      setHasPremiumAccess(true);
      return;
    }

    const token = readToken();
    if (!token) {
      setAccessChecked(true);
      setHasPremiumAccess(false);
      return;
    }

    apiRequest('/users/me', { token })
      .then((me) => {
        const isAuthor = me?.id && story?.author_id && me.id === story.author_id;
        const canAccess = !!(me?.is_subscribed || me?.is_admin || me?.role === 'admin' || isAuthor);
        setHasPremiumAccess(canAccess);
      })
      .catch(() => setHasPremiumAccess(false))
      .finally(() => setAccessChecked(true));
  }, [story]);

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

  const chapterProgress = Math.max(0, Math.min(100, Number(progress || 0)));
  const totalChapters = Math.max(1, chapters.length || 1);
  const overallProgress = Math.min(
    100,
    Math.max(
      0,
      Math.round((((Math.max(0, chapterIndex) + (chapterProgress / 100)) / totalChapters) * 100))
    )
  );

  useEffect(() => {
    if (!storyId || !chapters.length) return;
    const token = readToken();
    if (!token) return;

    const chapterId = chapters[chapterIndex]?._id || chapters[chapterIndex]?.id || null;
    const progressBucket = Math.floor(Number(overallProgress || 0) / 10);
    const lastWrite = lastHistoryWriteRef.current;
    if (lastWrite.chapterId === String(chapterId || '') && lastWrite.progressBucket === progressBucket) {
      return;
    }

    lastHistoryWriteRef.current = {
      chapterId: String(chapterId || ''),
      progressBucket,
    };

    apiRequest('/reader/history', {
      method: 'POST',
      token,
      body: {
        story_id: String(storyId),
        chapter_id: chapterId,
        progress_pct: overallProgress,
      },
    }).catch(() => {});
  }, [chapterIndex, overallProgress, storyId, chapters]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const reactAction = async () => {
    const token = readToken();
    if (!token) {
      setToast('Please sign in to react.');
      return;
    }
    try {
      const result = await apiRequest(`/engagement/stories/${storyId}/like`, { method: 'POST' });
      setLiked(result.message?.toLowerCase().includes('liked'));
      if (result.message?.toLowerCase().includes('liked')) {
        await trackUserActivity({
          postId: storyId,
          actionType: 'like',
          readTime: Math.floor((Date.now() - sessionStartRef.current) / 1000),
          scrollDepth: progress,
          token,
        }).catch(() => {});
      }
      setToast(result.message || 'Updated');
    } catch {
      setToast('Could not update like right now.');
    }
  };

  const bookmarkAction = async () => {
    const token = readToken();
    if (!token) {
      setToast('Please sign in to bookmark.');
      return;
    }
    try {
      const result = await apiRequest(`/reader/bookmarks/${storyId}`, { method: 'POST' });
      setBookmarked(result.message?.toLowerCase().includes('bookmarked'));
      if (result.message?.toLowerCase().includes('bookmarked')) {
        await trackUserActivity({
          postId: storyId,
          actionType: 'bookmark',
          readTime: Math.floor((Date.now() - sessionStartRef.current) / 1000),
          scrollDepth: progress,
          token,
        }).catch(() => {});
      }
      setToast(result.message || 'Updated');
    } catch {
      setToast('Could not update bookmark right now.');
    }
  };

  const submitComment = async () => {
    const content = commentText.trim();
    if (content.length < 2) return;
    const token = readToken();
    if (!token) {
      setToast('Please sign in to comment.');
      return;
    }
    try {
      await apiRequest(`/engagement/stories/${storyId}/comments`, {
        method: 'POST',
        body: { content },
      });
      await trackUserActivity({
        postId: storyId,
        actionType: 'comment',
        readTime: Math.floor((Date.now() - sessionStartRef.current) / 1000),
        scrollDepth: progress,
        token,
      }).catch(() => {});
      const latest = await apiRequest(`/engagement/stories/${storyId}/comments`).catch(() => []);
      setComments(Array.isArray(latest) ? latest : comments);
      setCommentText('');
      setToast('Comment added');
    } catch (err) {
      setToast(err.message || 'Could not post comment.');
    }
  };

  const currentChapter = chapters[chapterIndex];
  const canManageStory = !!(
    currentUser && story && (currentUser.is_admin || currentUser.role === 'admin' || currentUser.id === story.author_id)
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
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ink)' }}>
        <div style={{ color: 'var(--muted)', fontSize: '15px' }}>Loading story...</div>
      </div>
    );
  }

  const premiumLocked = story?.is_premium && accessChecked && !hasPremiumAccess;
  if (premiumLocked) {
    return (
      <div style={{ minHeight: 'calc(100vh - 60px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ maxWidth: '520px', width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '26px' }}>
          <div style={{ fontSize: '12px', letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '8px' }}>Premium Story</div>
          <h1 style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: '36px', marginBottom: '8px' }}>{story?.title}</h1>
          <p style={{ color: 'var(--muted)', marginBottom: '16px', lineHeight: 1.6 }}>
            {readToken()
              ? 'This chapter requires an active subscription. Upgrade your account to continue reading.'
              : 'Sign in to unlock this premium chapter and continue reading on Wingsaga.'}
          </p>
          <button
            className="bx-btn-primary"
            onClick={() => {
              if (!readToken()) {
                router.push(`/auth/signin?next=${encodeURIComponent(`/read/${storyId}`)}`);
                return;
              }
              router.push('/profile');
            }}
          >
            {readToken() ? 'Manage Subscription' : 'Sign In To Continue'}
          </button>
        </div>
      </div>
    );
  }

  if (story?.is_premium && !accessChecked) {
    return (
      <div style={{ minHeight: 'calc(100vh - 60px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--muted)', fontSize: '15px' }}>Checking access...</div>
      </div>
    );
  }

  if (!isReadingMode) {
    return (
      <div style={{ minHeight: 'calc(100vh - 60px)', background: '#f5f5f7' }}>
        <div style={{ maxWidth: '1180px', margin: '0 auto', padding: '28px 20px 40px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 300px) 1fr', gap: '26px', alignItems: 'start' }}>
            <div style={{ borderRadius: '10px', overflow: 'hidden', boxShadow: '0 14px 30px rgba(0,0,0,0.16)', background: '#fff' }}>
              {story?.cover_image ? (
                <img src={story.cover_image} alt={story?.title || 'Story cover'} style={{ width: '100%', display: 'block', aspectRatio: '2 / 3', objectFit: 'cover' }} />
              ) : (
                <div style={{ aspectRatio: '2 / 3', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(160deg,#1a0a2e,#3d1a5e)', color: '#fff', padding: '16px', textAlign: 'center', fontFamily: 'Cormorant Garamond,serif', fontSize: '28px' }}>
                  {story?.title || 'Story'}
                </div>
              )}
            </div>

            <div>
              <h1 style={{ fontSize: '48px', lineHeight: 1.1, fontWeight: 700, color: '#0f1420', marginBottom: '16px' }}>{story?.title}</h1>
              <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', color: '#4a5568', fontSize: '14px', marginBottom: '18px' }}>
                <span>👁 Reads <strong style={{ color: '#111827', marginLeft: '6px' }}>{readCount.toLocaleString()}</strong></span>
                <span>☆ Votes <strong style={{ color: '#111827', marginLeft: '6px' }}>{voteCount.toLocaleString()}</strong></span>
                <span>☰ Parts <strong style={{ color: '#111827', marginLeft: '6px' }}>{partCount}</strong></span>
                <span>⏱ Time <strong style={{ color: '#111827', marginLeft: '6px' }}>{estimatedMinutes} min</strong></span>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginBottom: '22px' }}>
                <button
                  onClick={() => {
                    setIsReadingMode(true);
                    setChapterIndex(0);
                  }}
                  style={{
                    background: '#0d1117',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '999px',
                    padding: '14px 26px',
                    fontWeight: 700,
                    fontSize: '16px',
                    cursor: 'pointer'
                  }}
                >
                  Start Reading
                </button>
                <button onClick={bookmarkAction} style={{ border: '1px solid #d0d7de', background: '#fff', borderRadius: '999px', padding: '14px 18px', cursor: 'pointer', fontWeight: 600 }}>+ Add</button>
              </div>

              <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: '#111827', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '12px' }}>
                    {(story?.author_name || 'AU').slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ color: '#111827', fontWeight: 600 }}>{story?.author_name || 'Unknown Author'}</div>
                </div>
                <p style={{ color: '#1f2937', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{story?.description || 'No description available yet.'}</p>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
                {(story?.tags || []).map((tag) => (
                  <span key={tag} style={{ background: '#eceff4', color: '#1f2937', borderRadius: '999px', padding: '5px 10px', fontSize: '12px' }}>#{tag}</span>
                ))}
                {(story?.categories || []).map((category) => (
                  <span key={category} style={{ background: '#eef6ff', color: '#16467b', borderRadius: '999px', padding: '5px 10px', fontSize: '12px' }}>{category}</span>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr minmax(260px, 300px)', gap: '24px', marginTop: '26px' }}>
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              <div style={{ padding: '18px 18px 12px', fontWeight: 700, color: '#111827', fontSize: '28px', fontFamily: 'Cormorant Garamond, serif' }}>Table of Contents</div>
              <div>
                {(chapters || []).map((chapter, idx) => (
                  <button
                    key={chapter?._id || chapter?.id || idx}
                    onClick={() => {
                      setChapterIndex(idx);
                      setIsReadingMode(true);
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      textAlign: 'left',
                      border: 'none',
                      borderTop: '1px solid #f0f2f5',
                      background: '#fff',
                      padding: '14px 18px',
                      cursor: 'pointer'
                    }}
                  >
                    <span style={{ color: '#0f172a', fontWeight: 500 }}>Ch. {chapter?.chapter_number || idx + 1}: {chapter?.title || `Chapter ${idx + 1}`}</span>
                    <span style={{ color: '#6b7280', fontSize: '12px' }}>{chapter?.word_count ? `${chapter.word_count} words` : ''}</span>
                  </button>
                ))}
              </div>
            </div>

            <aside style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '14px' }}>
              <div style={{ fontWeight: 700, fontSize: '36px', lineHeight: 1, fontFamily: 'Cormorant Garamond, serif', color: '#0f172a', marginBottom: '12px' }}>You may also like</div>
              <div style={{ display: 'grid', gap: '12px' }}>
                {recoStories.map((rs, i) => (
                  <a key={`${rs.id || rs._id}-${i}`} href={`/read/${rs.id || rs._id}`} style={{ display: 'grid', gridTemplateColumns: '68px 1fr', gap: '10px', textDecoration: 'none', color: 'inherit' }}>
                    <div style={{ borderRadius: '8px', overflow: 'hidden', background: 'linear-gradient(160deg,#1a0a2e,#3d1a5e)', height: '94px' }}>
                      {rs.cover_image ? <img src={rs.cover_image} alt={rs.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
                    </div>
                    <div>
                      <div style={{ color: '#0f172a', fontWeight: 700, fontSize: '14px', lineHeight: 1.3 }}>{rs.title}</div>
                      <div style={{ color: '#6b7280', fontSize: '12px', marginTop: '4px' }}>{(rs.categories || [])[0] || 'Fiction'}</div>
                    </div>
                  </a>
                ))}
              </div>
            </aside>
          </div>
        </div>
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
}