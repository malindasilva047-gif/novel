'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { apiRequest, readToken, trackUserActivity } from '@/lib/api';
import ShareModal from '@/components/ShareModal';

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

function getInitials(name) {
  if (!name) return 'AU';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getHandle(name) {
  if (!name) return '@author';
  return '@' + name.toLowerCase().replace(/\s+/g, '');
}

function formatCount(n) {
  const num = Number(n || 0);
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(num);
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ReadPage() {
  const { id } = useParams();
  const storyId = Array.isArray(id) ? id[0] : id;
  const isNumericDemoId = /^\d+$/.test(String(storyId || ''));
  const router = useRouter();

  const [story, setStory] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [recoStories, setRecoStories] = useState([]);
  const [comments, setComments] = useState([]);
  const [commentLikes, setCommentLikes] = useState({});
  const [commentText, setCommentText] = useState('');
  const [chapterIndex, setChapterIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [theme, setTheme] = useState('light');
  const [fontSize, setFontSize] = useState(19);
  const [fontFamily, setFontFamily] = useState('lora');
  const [lineHeight, setLineHeight] = useState(195);
  const [liked, setLiked] = useState(false);
  const [geeked, setGeeked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);
  const [accessChecked, setAccessChecked] = useState(false);
  const [hasPremiumAccess, setHasPremiumAccess] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scrollTopVisible, setScrollTopVisible] = useState(false);
  const [showCommentSubmit, setShowCommentSubmit] = useState(false);
  const [isManagingStory, setIsManagingStory] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const lastHistoryWriteRef = useRef({ chapterId: '', progressBucket: -1 });
  const viewTrackedRef = useRef(false);
  const toastTimerRef = useRef(null);
  const settingsPanelRef = useRef(null);

  useEffect(() => {
    if (!storyId) return;
    if (isNumericDemoId) {
      setStory({ id: storyId, title: `Story ${storyId}`, author_name: 'Bixbi Author', genre: 'Fiction' });
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
    ]).then(([storyData, chapterData, commentData, trendingData]) => {
      setStory(storyData || { title: 'Story Title', author_name: 'Author', genre: 'Fantasy' });
      setChapters(chapterData?.chapters?.length ? chapterData.chapters : FALLBACK_CHAPTERS);
      setComments(Array.isArray(commentData) ? commentData : []);
      setRecoStories((Array.isArray(trendingData) ? trendingData : []).slice(0, 4));
      if (storyData?.author?.is_geeked) setGeeked(true);
    }).finally(() => setLoading(false));
  }, [storyId, isNumericDemoId]);

  useEffect(() => {
    if (!storyId || isNumericDemoId) return;
    const interval = setInterval(async () => {
      try {
        const updated = await apiRequest(`/stories/${storyId}`).catch(() => null);
        if (updated) setStory(prev => ({ ...prev, views: updated.views, likes: updated.likes, comments_count: updated.comments_count }));
      } catch { }
    }, 8000);
    return () => clearInterval(interval);
  }, [storyId, isNumericDemoId]);

  useEffect(() => {
    const token = readToken();
    if (!token) { setCurrentUser(null); return; }
    apiRequest('/users/me', { token }).then(setCurrentUser).catch(() => setCurrentUser(null));
  }, []);

  useEffect(() => {
    if (!storyId || isNumericDemoId || viewTrackedRef.current) return;
    const token = readToken();
    if (!token) return;
    viewTrackedRef.current = true;
    trackUserActivity({ postId: storyId, actionType: 'view', readTime: 0, scrollDepth: 0, token }).catch(() => {});
  }, [storyId, isNumericDemoId]);

  useEffect(() => {
    if (!story?.is_premium) { setAccessChecked(true); setHasPremiumAccess(true); return; }
    const token = readToken();
    if (!token) { setAccessChecked(true); setHasPremiumAccess(false); return; }
    apiRequest('/users/me', { token })
      .then(me => {
        const isAuthor = me?.id && story?.author_id && me.id === story.author_id;
        setHasPremiumAccess(!!(me?.is_subscribed || me?.is_admin || me?.role === 'admin' || isAuthor));
      })
      .catch(() => setHasPremiumAccess(false))
      .finally(() => setAccessChecked(true));
  }, [story]);

  useEffect(() => {
    const onScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
      setProgress(Math.min(100, Math.round(pct)));
      setScrollTopVisible(scrollTop > 400);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!storyId || !chapters.length) return;
    const token = readToken();
    if (!token) return;
    const chapterId = chapters[chapterIndex]?._id || chapters[chapterIndex]?.id || null;
    const totalChapters = Math.max(1, chapters.length);
    const overallProgress = Math.min(100, Math.max(0, Math.round((((Math.max(0, chapterIndex) + (progress / 100)) / totalChapters) * 100))));
    const progressBucket = Math.floor(overallProgress / 10);
    const lastWrite = lastHistoryWriteRef.current;
    if (lastWrite.chapterId === String(chapterId || '') && lastWrite.progressBucket === progressBucket) return;
    lastHistoryWriteRef.current = { chapterId: String(chapterId || ''), progressBucket };
    apiRequest('/reader/history', { method: 'POST', token, body: { story_id: String(storyId), chapter_id: chapterId, progress_pct: overallProgress } }).catch(() => {});
  }, [chapterIndex, progress, storyId, chapters]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(''), 2600);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (!settingsPanelRef.current?.contains(e.target) && !e.target.closest('#settingsBtn')) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const reactAction = async () => {
    const token = readToken();
    if (!token) { showToast('Please sign in to like.'); return; }
    try {
      const result = await apiRequest(`/engagement/stories/${storyId}/like`, { method: 'POST', token });
      const isLiked = result.message?.toLowerCase().includes('liked') && !result.message?.toLowerCase().includes('removed');
      setLiked(isLiked);
      setStory(prev => ({ ...prev, likes: isLiked ? (prev?.likes || 0) + 1 : Math.max(0, (prev?.likes || 0) - 1) }));
      showToast(isLiked ? 'Liked' : 'Like removed');
    } catch { showToast('Could not update like.'); }
  };

  const bookmarkAction = async () => {
    const token = readToken();
    if (!token) { showToast('Please sign in to bookmark.'); return; }
    try {
      const result = await apiRequest(`/reader/bookmarks/${storyId}`, { method: 'POST', token });
      const isSaved = result.message?.toLowerCase().includes('bookmarked') && !result.message?.toLowerCase().includes('removed');
      setBookmarked(isSaved);
      if (isSaved) {
        showToast('Saved to your library');
      } else {
        showToast('Bookmark removed');
      }
    } catch { showToast('Could not update bookmark.'); }
  };

  const geekAction = async () => {
    const token = readToken();
    if (!token) { showToast('Please sign in to geek.'); return; }
    const authorId = story?.author_id || story?.author?.id;
    if (!authorId) return;
    try {
      if (geeked) {
        await apiRequest(`/users/${authorId}/unfollow`, { method: 'POST', token });
        setGeeked(false);
        setStory(prev => ({ ...prev, author: { ...prev?.author, geeks: Math.max(0, (prev?.author?.geeks || 0) - 1) } }));
        showToast('Ungeek-ed');
      } else {
        await apiRequest(`/users/${authorId}/follow`, { method: 'POST', token });
        setGeeked(true);
        setStory(prev => ({ ...prev, author: { ...prev?.author, geeks: (prev?.author?.geeks || 0) + 1 } }));
        showToast('Now geeking this author');
      }
    } catch { showToast('Could not update.'); }
  };

  const submitComment = async () => {
    const content = commentText.trim();
    if (content.length < 2) return;
    const token = readToken();
    if (!token) { showToast('Please sign in to comment.'); return; }
    try {
      await apiRequest(`/engagement/stories/${storyId}/comments`, { method: 'POST', token, body: { content } });
      const latest = await apiRequest(`/engagement/stories/${storyId}/comments`).catch(() => []);
      setComments(Array.isArray(latest) ? latest : comments);
      setCommentText('');
      setShowCommentSubmit(false);
      showToast('Comment posted');
      setStory(prev => ({ ...prev, comments_count: (prev?.comments_count || 0) + 1 }));
    } catch (err) { showToast(err.message || 'Could not post comment.'); }
  };

  const handleTogglePublishStatus = async () => {
    if (!story?.id) return;
    try {
      setIsManagingStory(true);
      const nextDraft = story?.status === 'published';
      await apiRequest(`/stories/${story.id || story._id}`, { method: 'PATCH', body: { is_draft: nextDraft } });
      setStory(prev => ({ ...prev, status: nextDraft ? 'draft' : 'published' }));
      showToast(nextDraft ? 'Story moved to draft.' : 'Story published.');
    } catch (err) { showToast(err.message || 'Could not update.'); } finally { setIsManagingStory(false); }
  };

  const handleDeleteStory = async () => {
    if (!story?.id) return;
    if (!window.confirm('Delete this story and all chapters?')) return;
    try {
      setIsManagingStory(true);
      await apiRequest(`/stories/${story.id || story._id}`, { method: 'DELETE' });
      router.push('/write');
    } catch (err) { showToast(err.message || 'Could not delete.'); } finally { setIsManagingStory(false); }
  };

  const likeComment = (commentId) => {
    setCommentLikes(prev => ({ ...prev, [commentId]: !prev[commentId] }));
  };

  const goToChapter = (idx) => {
    setChapterIndex(idx);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const currentChapter = chapters[chapterIndex];
  const canManageStory = !!(currentUser && story && currentUser.id === story.author_id);
  const wordCount = currentChapter?.word_count || 0;
  const readMinutes = Math.max(1, Math.ceil(wordCount / 200));
  const readLeft = Math.max(0, Math.ceil(wordCount * (1 - progress / 100) / 200));
  const authorName = story?.author?.name || story?.author_name || 'Author';
  const authorBio = story?.author?.bio || '';
  const authorGeeks = story?.author?.geeks || 0;
  const authorInitials = getInitials(authorName);
  const authorHandle = getHandle(authorName);
  const coverImage = story?.cover_image || '';

  const fontFamilyMap = {
    lora: "'Lora', Georgia, serif",
    cormorant: "'Cormorant Garamond', Georgia, serif",
    sans: "'DM Sans', sans-serif",
  };

  const css = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400;1,500&family=Lora:ital,wght@0,400;0,500;1,400;1,500&family=DM+Sans:wght@300;400;500&display=swap');
.bxr-root{--gold:#c9a96e;--gold-light:#e8c98a;--gold-soft:rgba(201,169,110,0.15);--crimson:#8B1A1A;--crimson-bright:#c0392b;--rose:#e8748a;--teal:#2dd4c0;--tr:0.25s ease;--font-read:'Lora',Georgia,serif;--font-display:'Cormorant Garamond',serif;--font-ui:'DM Sans',sans-serif;font-size:15px;font-family:var(--font-ui);}
.bxr-root[data-theme="light"]{--bg:#faf8f4;--bg2:#f2ede4;--surface:#ffffff;--surface2:#f7f3ee;--border:rgba(0,0,0,0.08);--border2:rgba(0,0,0,0.12);--text:#1a1410;--text2:#3d3228;--muted:rgba(0,0,0,0.45);--hbg:rgba(250,248,244,0.94);--shadow:rgba(0,0,0,0.1);--shadow-deep:rgba(0,0,0,0.18);--reading-bg:#ffffff;--reading-text:#1e1812;--reading-muted:#6b5f54;--ink-line:rgba(0,0,0,0.06);}
.bxr-root[data-theme="dark"]{--bg:#0e0b08;--bg2:#14110d;--surface:#1c1712;--surface2:#231e18;--border:rgba(255,255,255,0.07);--border2:rgba(255,255,255,0.11);--text:rgba(255,255,255,0.9);--text2:rgba(255,255,255,0.7);--muted:rgba(255,255,255,0.4);--hbg:rgba(14,11,8,0.94);--shadow:rgba(0,0,0,0.5);--shadow-deep:rgba(0,0,0,0.7);--reading-bg:#1c1712;--reading-text:rgba(255,255,255,0.87);--reading-muted:rgba(255,255,255,0.5);--ink-line:rgba(255,255,255,0.05);}
.bxr-root[data-theme="sepia"]{--bg:#f4ead8;--bg2:#ede0c8;--surface:#fdf5e6;--surface2:#f7ebcf;--border:rgba(120,80,20,0.12);--border2:rgba(120,80,20,0.18);--text:#3b2a0e;--text2:#5a3e1a;--muted:rgba(80,50,10,0.5);--hbg:rgba(244,234,216,0.96);--shadow:rgba(80,40,0,0.12);--shadow-deep:rgba(80,40,0,0.2);--reading-bg:#fdf5e6;--reading-text:#3b2a0e;--reading-muted:#7a5a2a;--ink-line:rgba(80,50,10,0.07);}
.bxr-root{background:var(--bg);color:var(--text);transition:background var(--tr),color var(--tr);min-height:100vh;overflow-x:hidden;}
#bxr-progress{position:fixed;top:0;left:0;height:3px;z-index:1001;background:linear-gradient(90deg,var(--crimson),var(--gold),var(--crimson-bright));box-shadow:0 0 10px rgba(192,57,43,0.5);transition:width 0.1s linear;pointer-events:none;}
.bxr-header{position:sticky;top:0;z-index:400;background:var(--hbg);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-bottom:1px solid var(--border);height:54px;display:flex;align-items:center;padding:0 16px;gap:10px;transition:background var(--tr);}
@media(min-width:640px){.bxr-header{padding:0 24px;}}
.bxr-logo{font-family:var(--font-display);font-size:22px;font-weight:600;color:var(--text);text-decoration:none;flex-shrink:0;}
.bxr-logo span{color:var(--gold);}
.bxr-breadcrumb{flex:1;display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);overflow:hidden;min-width:0;}
.bxr-breadcrumb a{color:var(--muted);text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color 0.2s;}
.bxr-breadcrumb a:hover{color:var(--gold);}
.bxr-breadcrumb .sep{flex-shrink:0;opacity:0.4;}
.bxr-breadcrumb .current{color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500;}
@media(max-width:480px){.bxr-breadcrumb{display:none;}}
.bxr-hdr-right{display:flex;align-items:center;gap:4px;margin-left:auto;flex-shrink:0;}
.bxr-hico{background:none;border:none;color:var(--muted);width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.2s;flex-shrink:0;}
.bxr-hico:hover{color:var(--text);background:var(--surface2);}
.bxr-hico svg{width:17px;height:17px;}
.bxr-settings-panel{position:absolute;top:calc(100% + 8px);right:16px;background:var(--surface);border:1px solid var(--border2);border-radius:16px;padding:20px;width:280px;box-shadow:0 12px 40px var(--shadow-deep);z-index:500;animation:bxrFadeDown 0.18s ease;transition:background var(--tr);}
@media(min-width:640px){.bxr-settings-panel{right:24px;}}
@keyframes bxrFadeDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
.bxr-sp-title{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:8px;font-family:var(--font-ui);}
.bxr-theme-pills{display:flex;gap:8px;margin-bottom:18px;}
.bxr-tpill{flex:1;padding:8px 6px;border-radius:10px;border:2px solid transparent;cursor:pointer;font-size:11px;font-family:var(--font-ui);font-weight:500;text-align:center;transition:all 0.2s;}
.bxr-tpill.light{background:#faf8f4;color:#1a1410;border-color:rgba(0,0,0,0.1);}
.bxr-tpill.dark{background:#1c1712;color:rgba(255,255,255,0.85);border-color:rgba(255,255,255,0.1);}
.bxr-tpill.sepia{background:#fdf5e6;color:#3b2a0e;border-color:rgba(120,80,20,0.15);}
.bxr-tpill.active{border-color:var(--gold)!important;box-shadow:0 0 0 1px var(--gold);}
.bxr-font-row{display:flex;align-items:center;gap:12px;margin-bottom:16px;}
.bxr-sp-lbl{font-size:12.5px;color:var(--text);flex:1;}
.bxr-font-btns{display:flex;gap:6px;}
.bxr-fbtn{width:32px;height:32px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:var(--font-display);color:var(--text);transition:all 0.2s;}
.bxr-fbtn:hover{border-color:var(--gold);color:var(--gold);}
.bxr-ff-row{display:flex;gap:8px;margin-bottom:16px;}
.bxr-ffbtn{flex:1;padding:8px 4px;border:1.5px solid var(--border);border-radius:8px;background:none;cursor:pointer;font-size:11.5px;color:var(--muted);text-align:center;transition:all 0.2s;}
.bxr-ffbtn.active{border-color:var(--gold);color:var(--gold);background:var(--gold-soft);}
.bxr-lh-row{display:flex;align-items:center;gap:10px;}
.bxr-lh-slider{flex:1;-webkit-appearance:none;height:3px;border-radius:2px;background:var(--border2);outline:none;}
.bxr-lh-slider::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:var(--gold);cursor:pointer;}
.bxr-hero{position:relative;height:360px;overflow:hidden;display:flex;align-items:flex-end;}
@media(min-width:640px){.bxr-hero{height:440px;}}
@media(min-width:1024px){.bxr-hero{height:500px;}}
.bxr-hero-bg{position:absolute;inset:0;background:radial-gradient(ellipse at 30% 60%,rgba(139,26,26,0.55) 0%,transparent 60%),radial-gradient(ellipse at 75% 30%,rgba(30,10,5,0.8) 0%,transparent 55%),linear-gradient(160deg,#0e0402 0%,#1a0505 40%,#110808 70%,#0a0604 100%);}
.bxr-particles{position:absolute;inset:0;overflow:hidden;pointer-events:none;}
.bxr-p{position:absolute;border-radius:50%;background:radial-gradient(circle,rgba(201,169,110,0.6),transparent);animation:bxrFloat linear infinite;}
.bxr-p1{width:3px;height:3px;left:15%;bottom:-10px;animation-duration:8s;animation-delay:0s}
.bxr-p2{width:2px;height:2px;left:35%;bottom:-10px;animation-duration:11s;animation-delay:2s}
.bxr-p3{width:4px;height:4px;left:55%;bottom:-10px;animation-duration:9s;animation-delay:1s}
.bxr-p4{width:2px;height:2px;left:70%;bottom:-10px;animation-duration:13s;animation-delay:3s}
.bxr-p5{width:3px;height:3px;left:85%;bottom:-10px;animation-duration:10s;animation-delay:0.5s}
.bxr-p6{width:2px;height:2px;left:25%;bottom:-10px;animation-duration:12s;animation-delay:4s}
@keyframes bxrFloat{0%{transform:translateY(0) scale(1);opacity:0}10%{opacity:1}90%{opacity:0.6}100%{transform:translateY(-400px) scale(0.3);opacity:0}}
.bxr-hero-cover-wrap{position:absolute;top:50%;left:50%;transform:translate(-50%,-60%);z-index:2;filter:drop-shadow(0 20px 60px rgba(0,0,0,0.8));}
.bxr-hero-cover{width:120px;height:180px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-family:var(--font-display);color:rgba(201,169,110,0.9);font-size:13px;font-weight:600;text-align:center;line-height:1.4;padding:12px;border:1px solid rgba(201,169,110,0.2);position:relative;overflow:hidden;background:linear-gradient(160deg,#2a1a0a,#4a2a0a);}
.bxr-hero-cover img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:8px;}
@media(min-width:640px){.bxr-hero-cover{width:150px;height:225px;font-size:15px}}
.bxr-hero-cover::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(201,169,110,0.12) 0%,transparent 60%);pointer-events:none;}
.bxr-hero-cover::after{content:'';position:absolute;inset:-3px;border-radius:10px;background:conic-gradient(from 0deg,transparent 0%,rgba(201,169,110,0.3) 25%,transparent 50%,rgba(201,169,110,0.2) 75%,transparent 100%);animation:bxrGlowRot 6s linear infinite;filter:blur(4px);z-index:-1;}
@keyframes bxrGlowRot{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
.bxr-hero-glow{position:absolute;top:50%;left:50%;transform:translate(-50%,-60%);width:250px;height:250px;border-radius:50%;background:radial-gradient(circle,rgba(139,26,26,0.35) 0%,transparent 70%);filter:blur(30px);z-index:1;animation:bxrGlowPulse 4s ease-in-out infinite;}
@keyframes bxrGlowPulse{0%,100%{opacity:0.7;transform:translate(-50%,-60%) scale(1)}50%{opacity:1;transform:translate(-50%,-60%) scale(1.1)}}
.bxr-hero-bottom-grad{position:absolute;bottom:0;left:0;right:0;height:160px;background:linear-gradient(to top,var(--bg) 0%,transparent 100%);z-index:3;}
@media(min-width:640px){.bxr-hero-bottom-grad{height:200px}}
.bxr-hero-info{position:relative;z-index:4;padding:0 16px 20px;width:100%;text-align:center;}
@media(min-width:640px){.bxr-hero-info{padding:0 24px 28px}}
.bxr-chapter-badge{display:inline-flex;align-items:center;gap:6px;background:rgba(139,26,26,0.75);border:1px solid rgba(201,169,110,0.3);backdrop-filter:blur(8px);color:var(--gold-light);font-size:11px;font-weight:500;padding:4px 12px;border-radius:20px;margin-bottom:8px;letter-spacing:0.5px;text-transform:uppercase;}
.bxr-hero-story-title{font-family:var(--font-display);font-size:26px;font-weight:400;color:#fff;line-height:1.15;margin-bottom:4px;text-shadow:0 2px 20px rgba(0,0,0,0.8);}
@media(min-width:640px){.bxr-hero-story-title{font-size:34px}}
.bxr-hero-ch-title{font-family:var(--font-display);font-size:15px;font-style:italic;color:var(--gold-light);opacity:0.9;text-shadow:0 1px 10px rgba(0,0,0,0.6);}
@media(min-width:640px){.bxr-hero-ch-title{font-size:17px}}
.bxr-meta-bar{background:var(--surface);border-bottom:1px solid var(--border);padding:14px 16px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;transition:background var(--tr);}
@media(min-width:640px){.bxr-meta-bar{padding:14px 24px;gap:16px}}
.bxr-author-pill{display:flex;align-items:center;gap:8px;cursor:pointer;text-decoration:none;}
.bxr-author-av{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#1a1a0a,#2e2a08);display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:13px;font-weight:600;color:var(--gold);border:2px solid var(--border2);flex-shrink:0;}
.bxr-author-name{font-size:13px;font-weight:500;color:var(--text);}
.bxr-author-handle{font-size:11px;color:var(--muted);}
.bxr-meta-div{width:1px;height:30px;background:var(--border2);flex-shrink:0;}
@media(max-width:480px){.bxr-meta-div{display:none}}
.bxr-meta-stats{display:flex;gap:14px;flex-wrap:wrap;}
.bxr-mstat{display:flex;align-items:center;gap:5px;font-size:12px;color:var(--muted);}
.bxr-mstat svg{width:13px;height:13px;}
.bxr-meta-actions{display:flex;gap:8px;margin-left:auto;flex-shrink:0;}
.bxr-act-btn{display:flex;align-items:center;gap:5px;padding:7px 13px;border-radius:20px;border:1.5px solid var(--border2);background:none;color:var(--text);font-size:12.5px;font-family:var(--font-ui);cursor:pointer;transition:all 0.2s;white-space:nowrap;}
.bxr-act-btn svg{width:13px;height:13px;}
.bxr-act-btn:hover{border-color:rgba(139,26,26,0.4);color:var(--crimson-bright);}
.bxr-act-btn.liked{background:rgba(232,116,138,0.12);border-color:var(--rose);color:var(--rose);}
.bxr-act-btn.geeked{background:rgba(201,169,110,0.12);border-color:var(--gold);color:var(--gold);}
.bxr-act-btn.bookmarked{background:rgba(45,212,192,0.1);border-color:var(--teal);color:var(--teal);}
@media(max-width:520px){.bxr-act-btn .bxr-btn-lbl{display:none}.bxr-act-btn{padding:7px 10px}}
.bxr-manage-bar{background:var(--surface2);border-bottom:1px solid var(--border);padding:8px 16px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
@media(min-width:640px){.bxr-manage-bar{padding:8px 24px}}
.bxr-manage-lbl{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;}
.bxr-manage-btn{padding:5px 12px;border-radius:8px;border:1.5px solid var(--border2);background:none;font-size:12px;font-family:var(--font-ui);cursor:pointer;color:var(--text);transition:all 0.2s;}
.bxr-manage-btn:hover{border-color:var(--gold);color:var(--gold);}
.bxr-manage-btn.danger{color:var(--rose);border-color:rgba(232,116,138,0.4);}
.bxr-manage-btn.danger:hover{background:rgba(232,116,138,0.1);}
.bxr-main{display:grid;grid-template-columns:1fr;gap:0;max-width:1180px;margin:0 auto;padding:24px 16px;}
@media(min-width:640px){.bxr-main{padding:28px 24px}}
@media(min-width:1024px){.bxr-main{grid-template-columns:1fr 300px;gap:32px;padding:36px 40px;align-items:start}}
.bxr-reading-wrap{min-width:0;}
.bxr-reading-container{background:var(--reading-bg);border:1px solid var(--border);border-radius:16px;padding:32px 24px;box-shadow:0 4px 24px var(--shadow);transition:background var(--tr),border-color var(--tr);position:relative;overflow:hidden;}
@media(min-width:640px){.bxr-reading-container{padding:44px 48px;border-radius:20px}}
@media(min-width:1024px){.bxr-reading-container{padding:52px 60px}}
.bxr-reading-container::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,transparent,var(--crimson),var(--gold),var(--crimson),transparent);opacity:0.6;}
.bxr-ch-header{text-align:center;margin-bottom:36px;padding-bottom:28px;border-bottom:1px solid var(--ink-line);position:relative;}
.bxr-ch-header::after{content:'cross';position:absolute;bottom:-10px;left:50%;transform:translateX(-50%);background:var(--reading-bg);padding:0 12px;color:var(--gold);font-size:12px;transition:background var(--tr);}
.bxr-ch-number{font-family:var(--font-ui);font-size:11px;font-weight:500;color:var(--crimson-bright);text-transform:uppercase;letter-spacing:2px;margin-bottom:10px;display:block;}
.bxr-ch-title{font-family:var(--font-display);font-size:28px;font-weight:400;font-style:italic;color:var(--reading-text);line-height:1.2;}
@media(min-width:640px){.bxr-ch-title{font-size:34px}}
.bxr-ch-meta{font-size:12px;color:var(--reading-muted);margin-top:8px;display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap;}
.bxr-reading-body{color:var(--reading-text);transition:color var(--tr);}
.bxr-reading-body p{margin-bottom:1.4em;text-align:justify;text-justify:inter-character;}
@media(max-width:480px){.bxr-reading-body p{text-align:left}}
.bxr-reading-body h1,.bxr-reading-body h2,.bxr-reading-body h3{font-family:var(--font-display);color:var(--reading-text);margin-bottom:16px;font-weight:400;}
.bxr-inline-ad{margin:32px 0;padding:16px 20px;background:var(--surface2);border:1px solid var(--border);border-radius:12px;display:flex;align-items:center;gap:14px;position:relative;overflow:hidden;transition:background var(--tr);}
.bxr-inline-ad::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--gold-soft),rgba(201,169,110,0.3),var(--gold-soft));}
.bxr-ad-label{position:absolute;top:6px;right:10px;font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:0.6px;opacity:0.6;}
.bxr-ad-img{width:60px;min-width:60px;height:80px;border-radius:6px;background:linear-gradient(135deg,#1a1a0a,#3a2a0a);display:flex;align-items:center;justify-content:center;font-size:22px;}
.bxr-ad-tagline{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:4px;}
.bxr-ad-title{font-family:var(--font-display);font-size:16px;color:var(--text);font-weight:500;margin-bottom:6px;}
.bxr-ad-sub{font-size:12px;color:var(--muted);margin-bottom:10px;}
.bxr-ad-cta{display:inline-flex;align-items:center;gap:5px;background:linear-gradient(135deg,var(--crimson),#6b0f0f);color:#fff;font-size:12px;font-weight:500;padding:6px 14px;border-radius:20px;text-decoration:none;border:none;cursor:pointer;font-family:var(--font-ui);transition:opacity 0.2s;}
.bxr-ad-cta:hover{opacity:0.85;}
.bxr-ch-end{margin-top:40px;padding-top:32px;border-top:1px solid var(--ink-line);text-align:center;}
.bxr-ch-end-ornament{font-size:18px;color:var(--gold);letter-spacing:20px;opacity:0.6;margin-bottom:20px;}
.bxr-ch-end-msg{font-family:var(--font-display);font-size:17px;font-style:italic;color:var(--reading-muted);margin-bottom:28px;line-height:1.6;}
.bxr-nav-btns{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;}
.bxr-nav-btn{display:flex;align-items:center;gap:8px;padding:12px 22px;border-radius:10px;font-size:14px;font-weight:500;cursor:pointer;font-family:var(--font-ui);transition:all 0.22s;text-decoration:none;border:none;}
.bxr-nav-btn-prev{background:var(--surface2);color:var(--text);border:1.5px solid var(--border2);}
.bxr-nav-btn-prev:hover{border-color:var(--gold);color:var(--gold);}
.bxr-nav-btn-next{background:linear-gradient(135deg,var(--crimson) 0%,#6b0f0f 100%);color:#fff;box-shadow:0 4px 20px rgba(139,26,26,0.4);}
.bxr-nav-btn-next:hover{transform:translateY(-2px);box-shadow:0 6px 28px rgba(139,26,26,0.5);}
.bxr-nav-btn svg{width:15px;height:15px;}
.bxr-end-ad{margin:28px 0;padding:20px;background:linear-gradient(135deg,rgba(139,26,26,0.06),rgba(201,169,110,0.06));border:1px solid rgba(139,26,26,0.15);border-radius:14px;text-align:center;position:relative;}
.bxr-end-ad-lbl{font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:8px;opacity:0.6;display:inline-block;}
.bxr-end-ad-title{font-family:var(--font-display);font-size:20px;color:var(--text);margin-bottom:6px;}
.bxr-end-ad-sub{font-size:13px;color:var(--muted);margin-bottom:14px;}
.bxr-comments{margin-top:28px;background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden;transition:background var(--tr);}
@media(min-width:640px){.bxr-comments{border-radius:20px}}
.bxr-comments-head{padding:18px 20px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;}
@media(min-width:640px){.bxr-comments-head{padding:20px 24px 16px}}
.bxr-comments-title{font-family:var(--font-display);font-size:19px;font-weight:400;color:var(--text);}
.bxr-comments-count{font-size:12px;color:var(--muted);}
.bxr-comment-input-row{padding:14px 20px;border-bottom:1px solid var(--border);display:flex;gap:10px;align-items:flex-start;}
@media(min-width:640px){.bxr-comment-input-row{padding:16px 24px;gap:12px}}
.bxr-comment-av{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#1a1a0a,#2e2a08);display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:12px;color:var(--gold);flex-shrink:0;}
.bxr-comment-input-wrap{flex:1;}
.bxr-comment-input{width:100%;background:var(--surface2);border:1.5px solid var(--border);color:var(--text);padding:10px 14px;border-radius:10px;font-size:13.5px;font-family:var(--font-ui);outline:none;resize:none;min-height:42px;max-height:120px;transition:border-color 0.2s,background var(--tr);overflow-y:hidden;box-sizing:border-box;}
.bxr-comment-input:focus{border-color:rgba(139,26,26,0.4);}
.bxr-comment-input::placeholder{color:var(--muted);}
.bxr-comment-submit{background:linear-gradient(135deg,var(--crimson),#6b0f0f);color:#fff;border:none;padding:7px 16px;border-radius:8px;font-size:12.5px;font-weight:500;cursor:pointer;font-family:var(--font-ui);margin-top:8px;transition:opacity 0.2s;}
.bxr-comment-submit:hover{opacity:0.85;}
.bxr-comment-list{padding:8px 0;}
.bxr-comment-item{display:flex;gap:10px;padding:14px 20px;border-bottom:1px solid var(--border);transition:background 0.15s;}
@media(min-width:640px){.bxr-comment-item{padding:14px 24px;gap:12px}}
.bxr-comment-item:last-child{border-bottom:none;}
.bxr-comment-item:hover{background:rgba(128,128,128,0.03);}
.bxr-comment-item-av{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:12px;font-weight:600;color:#fff;flex-shrink:0;background:linear-gradient(135deg,#1a0510,#3d0a22);}
.bxr-comment-body{flex:1;min-width:0;}
.bxr-comment-meta{display:flex;align-items:center;gap:8px;margin-bottom:5px;flex-wrap:wrap;}
.bxr-comment-author{font-size:13px;font-weight:500;color:var(--text);}
.bxr-comment-time{font-size:11px;color:var(--muted);}
.bxr-comment-text{font-size:13.5px;color:var(--text2);line-height:1.6;}
.bxr-comment-actions{display:flex;gap:14px;margin-top:8px;}
.bxr-cact{background:none;border:none;font-size:12px;color:var(--muted);cursor:pointer;font-family:var(--font-ui);display:flex;align-items:center;gap:4px;transition:color 0.2s;padding:0;}
.bxr-cact:hover{color:var(--crimson-bright);}
.bxr-cact svg{width:12px;height:12px;}
.bxr-cact.liked{color:var(--rose);}
.bxr-show-more{width:100%;background:none;border:none;border-top:1px solid var(--border);color:var(--gold);font-size:13px;font-family:var(--font-ui);padding:14px;cursor:pointer;transition:background 0.2s;}
.bxr-show-more:hover{background:var(--surface2);}
.bxr-sidebar{display:none;}
@media(min-width:1024px){.bxr-sidebar{display:flex;flex-direction:column;gap:20px;position:sticky;top:78px}}
.bxr-sc{background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden;transition:background var(--tr);}
.bxr-sc-head{padding:16px 18px 12px;border-bottom:1px solid var(--border);font-family:var(--font-display);font-size:16px;font-weight:400;color:var(--text);display:flex;align-items:center;gap:6px;}
.bxr-rec-list{padding:8px 0;}
.bxr-rec-item{display:flex;gap:10px;padding:10px 16px;cursor:pointer;transition:background 0.15s;text-decoration:none;}
.bxr-rec-item:hover{background:var(--surface2);}
.bxr-rec-cov{width:42px;min-width:42px;height:60px;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:8px;font-family:var(--font-display);font-weight:600;color:rgba(201,169,110,0.8);text-align:center;line-height:1.3;padding:4px;overflow:hidden;}
.bxr-rec-cov img{width:100%;height:100%;object-fit:cover;border-radius:5px;}
.bxr-rec-info{flex:1;min-width:0;}
.bxr-rec-title{font-size:13px;font-weight:500;color:var(--text);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.bxr-rec-author{font-size:11px;color:var(--muted);margin-bottom:4px;}
.bxr-rec-stats{display:flex;gap:8px;font-size:11px;color:var(--muted);}
.bxr-sidebar-ad{background:linear-gradient(160deg,rgba(139,26,26,0.05),rgba(201,169,110,0.05));border:1px solid rgba(139,26,26,0.18);border-radius:16px;padding:18px;text-align:center;transition:background var(--tr);}
.bxr-sa-label{font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:10px;opacity:0.6;}
.bxr-sa-img{font-size:40px;margin-bottom:10px;}
.bxr-sa-title{font-family:var(--font-display);font-size:16px;color:var(--text);margin-bottom:5px;}
.bxr-sa-sub{font-size:12px;color:var(--muted);margin-bottom:14px;line-height:1.55;}
.bxr-sa-cta{display:inline-flex;align-items:center;gap:5px;width:100%;justify-content:center;background:linear-gradient(135deg,var(--crimson),#6b0f0f);color:#fff;font-size:13px;font-weight:500;padding:10px;border-radius:10px;border:none;cursor:pointer;font-family:var(--font-ui);transition:opacity 0.2s;}
.bxr-sa-cta:hover{opacity:0.85;}
.bxr-author-sidebar{padding:16px 18px;}
.bxr-as-row{display:flex;align-items:center;gap:12px;margin-bottom:12px;}
.bxr-as-av{width:46px;height:46px;border-radius:50%;background:linear-gradient(135deg,#1a1a0a,#2e2a08);display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:17px;font-weight:600;color:var(--gold);border:2px solid var(--border2);flex-shrink:0;}
.bxr-as-name{font-size:14px;font-weight:500;color:var(--text);}
.bxr-as-handle{font-size:11px;color:var(--muted);}
.bxr-as-bio{font-size:12.5px;color:var(--muted);line-height:1.6;margin-bottom:12px;}
.bxr-as-geek{width:100%;background:linear-gradient(135deg,#1a1a0a 0%,#2e2a08 100%);color:var(--gold-light);border:1.5px solid rgba(201,169,110,0.3);padding:9px;border-radius:10px;font-size:13px;font-weight:500;cursor:pointer;font-family:var(--font-ui);transition:all 0.2s;}
.bxr-as-geek:hover,.bxr-as-geek.geeked{border-color:var(--gold);box-shadow:0 0 16px rgba(201,169,110,0.15);}
.bxr-as-geek.geeked{background:linear-gradient(135deg,rgba(201,169,110,0.2),rgba(201,169,110,0.1));color:var(--gold);}
.bxr-toolbar{display:flex;position:fixed;bottom:0;left:0;right:0;background:var(--hbg);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-top:1px solid var(--border);padding:8px 16px;gap:0;z-index:300;transition:background var(--tr);justify-content:space-around;}
@media(min-width:1024px){.bxr-toolbar{display:none}}
.bxr-tb-btn{display:flex;flex-direction:column;align-items:center;gap:3px;background:none;border:none;color:var(--muted);font-size:10px;font-family:var(--font-ui);cursor:pointer;padding:6px 12px;border-radius:8px;transition:all 0.2s;flex:1;}
.bxr-tb-btn:hover,.bxr-tb-btn.active{color:var(--crimson-bright);}
.bxr-tb-btn svg{width:20px;height:20px;}
.bxr-tb-btn.liked{color:var(--rose);}
.bxr-tb-btn.bookmarked{color:var(--teal);}
@media(max-width:1023px){.bxr-main{padding-bottom:80px;}}
.bxr-scroll-top{position:fixed;bottom:80px;right:16px;width:40px;height:40px;background:var(--surface);border:1px solid var(--border2);border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--muted);box-shadow:0 4px 14px var(--shadow);transition:all 0.2s;z-index:200;}
@media(min-width:1024px){.bxr-scroll-top{bottom:24px;right:24px}}
.bxr-scroll-top:hover{color:var(--gold);border-color:var(--gold);transform:translateY(-2px);}
.bxr-scroll-top svg{width:16px;height:16px;}
.bxr-toast{position:fixed;bottom:72px;left:50%;transform:translateX(-50%) translateY(70px);background:var(--surface);border:1px solid var(--border2);color:var(--text);font-size:13px;padding:10px 20px;border-radius:10px;box-shadow:0 8px 24px var(--shadow-deep);z-index:999;transition:transform 0.3s ease;white-space:nowrap;font-family:var(--font-ui);pointer-events:none;}
.bxr-toast.show{transform:translateX(-50%) translateY(0);}
@media(min-width:1024px){.bxr-toast{bottom:20px}}
.bxr-root ::selection{background:rgba(139,26,26,0.2);color:var(--reading-text);}
`;

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0e0b08', color: 'rgba(255,255,255,0.4)', fontFamily: "'DM Sans',sans-serif", fontSize: '15px' }}>
        Loading story...
      </div>
    );
  }

  const premiumLocked = story?.is_premium && accessChecked && !hasPremiumAccess;
  if (premiumLocked) {
    return (
      <div style={{ minHeight: 'calc(100vh - 60px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ maxWidth: '520px', width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '26px' }}>
          <div style={{ fontSize: '12px', letterSpacing: '0.6px', textTransform: 'uppercase', color: '#c9a96e', marginBottom: '8px' }}>Premium Story</div>
          <h1 style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: '36px', marginBottom: '8px' }}>{story?.title}</h1>
          <p style={{ color: 'var(--muted)', marginBottom: '16px', lineHeight: 1.6 }}>
            {readToken() ? 'This story requires an active subscription.' : 'Sign in to unlock this premium story.'}
          </p>
          <button style={{ background: 'linear-gradient(135deg,#8B1A1A,#6b0f0f)', color: '#fff', border: 'none', borderRadius: '10px', padding: '12px 24px', cursor: 'pointer', fontSize: '14px', fontFamily: "'DM Sans',sans-serif" }}
            onClick={() => router.push(readToken() ? '/profile' : `/auth/signin?next=${encodeURIComponent(`/read/${storyId}`)}`)}
          >
            {readToken() ? 'Manage Subscription' : 'Sign In To Continue'}
          </button>
        </div>
      </div>
    );
  }

  if (story?.is_premium && !accessChecked) {
    return <div style={{ minHeight: 'calc(100vh - 60px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ color: 'var(--muted)' }}>Checking access...</div></div>;
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="bxr-root" data-theme={theme}>

        <div id="bxr-progress" style={{ width: `${progress}%` }} />

        <header className="bxr-header">
          <a href="/" className="bxr-logo">Bi<span>x</span>bi</a>
          <div className="bxr-breadcrumb">
            <a href={`/story/${storyId}`}>{story?.title || 'Story'}</a>
            <span className="sep">&#8250;</span>
            <span className="current">
              {currentChapter ? `Chapter ${currentChapter.chapter_number}: ${currentChapter.title}` : 'Reading'}
            </span>
          </div>
          <div className="bxr-hdr-right">
            <button className="bxr-hico" id="settingsBtn" onClick={() => setSettingsOpen(v => !v)} title="Reading Settings">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M1 12h2M21 12h2M4.93 19.07l1.41-1.41M19.07 19.07l-1.41-1.41M12 1v2M12 21v2"/></svg>
            </button>
            <button className="bxr-hico" onClick={bookmarkAction} title="Bookmark" style={{ color: bookmarked ? 'var(--teal)' : '' }}>
              <svg viewBox="0 0 24 24" fill={bookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
            </button>
            <button className="bxr-hico" onClick={() => setShareModalOpen(true)} title="Share">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            </button>
          </div>

          {settingsOpen && (
            <div className="bxr-settings-panel" ref={settingsPanelRef}>
              <div className="bxr-sp-title" style={{ marginBottom: '14px' }}>Reading Settings</div>
              <div className="bxr-sp-title">Theme</div>
              <div className="bxr-theme-pills">
                {[['light', 'Light'], ['dark', 'Dark'], ['sepia', 'Sepia']].map(([t, label]) => (
                  <button key={t} className={`bxr-tpill ${t}${theme === t ? ' active' : ''}`}
                    onClick={() => { setTheme(t); showToast(label + ' theme'); }}>{label}</button>
                ))}
              </div>
              <div className="bxr-sp-title">Font Size</div>
              <div className="bxr-font-row">
                <span className="bxr-sp-lbl">{fontSize}px</span>
                <div className="bxr-font-btns">
                  <button className="bxr-fbtn" style={{ fontSize: '11px' }} onClick={() => setFontSize(v => Math.max(14, v - 1))}>A</button>
                  <button className="bxr-fbtn" style={{ fontSize: '16px' }} onClick={() => setFontSize(v => Math.min(26, v + 1))}>A</button>
                </div>
              </div>
              <div className="bxr-sp-title">Font Family</div>
              <div className="bxr-ff-row">
                {[['lora', 'Lora', "'Lora',serif"], ['cormorant', 'Garamond', "'Cormorant Garamond',serif"], ['sans', 'Sans', "'DM Sans',sans-serif"]].map(([key, label, ff]) => (
                  <button key={key} className={`bxr-ffbtn${fontFamily === key ? ' active' : ''}`} style={{ fontFamily: ff }}
                    onClick={() => setFontFamily(key)}>{label}</button>
                ))}
              </div>
              <div className="bxr-sp-title">Line Height</div>
              <div className="bxr-lh-row">
                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Tight</span>
                <input type="range" className="bxr-lh-slider" min="140" max="240" value={lineHeight}
                  onChange={e => setLineHeight(Number(e.target.value))} />
                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Loose</span>
              </div>
            </div>
          )}
        </header>

        <div className="bxr-hero">
          <div className="bxr-hero-bg" />
          <div className="bxr-particles">
            {['bxr-p1','bxr-p2','bxr-p3','bxr-p4','bxr-p5','bxr-p6'].map(c => <div key={c} className={`bxr-p ${c}`} />)}
          </div>
          <div className="bxr-hero-glow" />
          <div className="bxr-hero-cover-wrap">
            <div className="bxr-hero-cover">
              {coverImage
                ? <img src={coverImage} alt={story?.title} />
                : <span style={{ position: 'relative', zIndex: 1 }}>{story?.title || 'Story'}</span>}
            </div>
          </div>
          <div className="bxr-hero-bottom-grad" />
          <div className="bxr-hero-info">
            <div className="bxr-chapter-badge">Chapter {currentChapter?.chapter_number || 1} of {chapters.length || 1}</div>
            <div className="bxr-hero-story-title">{story?.title || 'Story'}</div>
            <div className="bxr-hero-ch-title">{currentChapter?.title || 'Chapter'}</div>
          </div>
        </div>

        <div className="bxr-meta-bar">
          <a href={`/profile/${story?.author_id}`} className="bxr-author-pill">
            <div className="bxr-author-av">{authorInitials}</div>
            <div>
              <div className="bxr-author-name">{authorName}</div>
              <div className="bxr-author-handle">{authorHandle}</div>
            </div>
          </a>
          <div className="bxr-meta-div" />
          <div className="bxr-meta-stats">
            <div className="bxr-mstat">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              {formatCount(story?.views)}
            </div>
            <div className="bxr-mstat">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
              {formatCount(story?.likes)}
            </div>
            <div className="bxr-mstat">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
              {formatCount(story?.comments_count)}
            </div>
            {readMinutes > 0 && (
              <div className="bxr-mstat">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                {readLeft > 0 ? `${readLeft} min left` : 'Done!'}
              </div>
            )}
          </div>
          <div className="bxr-meta-actions">
            <button className={`bxr-act-btn${liked ? ' liked' : ''}`} onClick={reactAction}>
              <svg viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
              <span className="bxr-btn-lbl">{formatCount(story?.likes)}</span>
            </button>
            <button className={`bxr-act-btn${geeked ? ' geeked' : ''}`} onClick={geekAction}>
              <span>&#129299;</span>
              <span className="bxr-btn-lbl">Geek</span>
            </button>
            <button className={`bxr-act-btn${bookmarked ? ' bookmarked' : ''}`} onClick={bookmarkAction}>
              <svg viewBox="0 0 24 24" fill={bookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
              <span className="bxr-btn-lbl">Save</span>
            </button>
            <button className="bxr-act-btn" onClick={() => setShareModalOpen(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              <span className="bxr-btn-lbl">Share</span>
            </button>
          </div>
        </div>

        {canManageStory && (
          <div className="bxr-manage-bar">
            <span className="bxr-manage-lbl">Author Tools</span>
            <button className="bxr-manage-btn" onClick={() => router.push(`/write?storyId=${encodeURIComponent(String(story?.id || story?._id || ''))}`)} disabled={isManagingStory}>Edit Story</button>
            <button className="bxr-manage-btn" onClick={handleTogglePublishStatus} disabled={isManagingStory}>
              {story?.status === 'published' ? 'Move to Draft' : 'Publish'}
            </button>
            <button className="bxr-manage-btn danger" onClick={handleDeleteStory} disabled={isManagingStory}>Delete</button>
          </div>
        )}

        <div className="bxr-main">
          <div className="bxr-reading-wrap">
            <div className="bxr-reading-container">
              <div className="bxr-ch-header">
                <span className="bxr-ch-number">Chapter {currentChapter?.chapter_number || 1}</span>
                <h1 className="bxr-ch-title">{currentChapter?.title || 'Chapter'}</h1>
                <div className="bxr-ch-meta">
                  {wordCount > 0 && <span>~{wordCount.toLocaleString()} words</span>}
                  {wordCount > 0 && <span>&middot;</span>}
                  {readMinutes > 0 && <span>{readMinutes} min read</span>}
                </div>
              </div>

              <div
                className="bxr-reading-body"
                style={{ fontFamily: fontFamilyMap[fontFamily], fontSize: `${fontSize}px`, lineHeight: lineHeight / 100 }}
                dangerouslySetInnerHTML={{ __html: currentChapter?.content || '<p>Chapter content coming soon.</p>' }}
              />

              <div className="bxr-inline-ad">
                <div className="bxr-ad-label">Sponsored</div>
                <div className="bxr-ad-img">&#128218;</div>
                <div className="bxr-ad-text">
                  <div className="bxr-ad-tagline">You might also love</div>
                  <div className="bxr-ad-title">{recoStories[0]?.title || 'Discover More Stories'}</div>
                  <div className="bxr-ad-sub">
                    {recoStories[0]
                      ? `By ${recoStories[0].author_name || 'Author'} · ${formatCount(recoStories[0].views)} reads`
                      : 'Find your next favourite story on Bixbi'}
                  </div>
                  {recoStories[0] && (
                    <button className="bxr-ad-cta" onClick={() => router.push(`/story/${recoStories[0].id || recoStories[0]._id}`)}>
                      Read Now &#8594;
                    </button>
                  )}
                </div>
              </div>

              <div className="bxr-ch-end">
                <div className="bxr-ch-end-ornament">&#10022;&#160;&#160;&#10022;&#160;&#160;&#10022;</div>
                <div className="bxr-ch-end-msg">
                  End of Chapter {currentChapter?.chapter_number || 1}<br />
                  <em style={{ fontSize: '0.85em', opacity: 0.7 }}>Thank you for reading {story?.title}</em>
                </div>
                <div className="bxr-end-ad">
                  <div className="bxr-end-ad-lbl">Sponsored</div>
                  <div className="bxr-end-ad-title">Unlock Bixbi Premium</div>
                  <div className="bxr-end-ad-sub">Ad-free reading, offline chapters, early access, and exclusive author content.</div>
                  <button className="bxr-ad-cta" style={{ margin: '0 auto' }}>&#10024; Try 7 Days Free</button>
                </div>
                <div className="bxr-nav-btns">
                  {chapterIndex > 0 && (
                    <button className="bxr-nav-btn bxr-nav-btn-prev" onClick={() => goToChapter(chapterIndex - 1)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                      Chapter {chapters[chapterIndex - 1]?.chapter_number || chapterIndex}
                    </button>
                  )}
                  {chapterIndex < chapters.length - 1 ? (
                    <button className="bxr-nav-btn bxr-nav-btn-next" onClick={() => goToChapter(chapterIndex + 1)}>
                      Chapter {chapters[chapterIndex + 1]?.chapter_number || chapterIndex + 2}
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                  ) : (
                    <button className="bxr-nav-btn bxr-nav-btn-next" style={{ cursor: 'default', opacity: 0.7 }}>
                      Final Chapter &#127881;
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="bxr-comments" id="bxr-comments">
              <div className="bxr-comments-head">
                <div className="bxr-comments-title">Comments</div>
                <div className="bxr-comments-count">{(story?.comments_count || comments.length).toLocaleString()} comments</div>
              </div>
              <div className="bxr-comment-input-row">
                <div className="bxr-comment-av">
                  {currentUser ? getInitials(currentUser.full_name || currentUser.username || 'U') : '?'}
                </div>
                <div className="bxr-comment-input-wrap">
                  <textarea
                    className="bxr-comment-input"
                    placeholder="Share your thoughts on this chapter..."
                    rows="1"
                    value={commentText}
                    onChange={e => {
                      setCommentText(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = e.target.scrollHeight + 'px';
                    }}
                    onFocus={() => setShowCommentSubmit(true)}
                  />
                  {showCommentSubmit && (
                    <button className="bxr-comment-submit" onClick={submitComment}>Post Comment</button>
                  )}
                </div>
              </div>
              <div className="bxr-comment-list">
                {comments.slice(0, 10).map((c, i) => {
                  const authorStr = c.user_id || 'Reader';
                  const initials = getInitials(authorStr);
                  const bgColors = [
                    'linear-gradient(135deg,#1a0510,#3d0a22)',
                    'linear-gradient(135deg,#051a10,#0a3d22)',
                    'linear-gradient(135deg,#0a0a1a,#1a1040)',
                    'linear-gradient(135deg,#1a0505,#3a0f0f)',
                    'linear-gradient(135deg,#051510,#0a3328)',
                  ];
                  return (
                    <div key={c.id || c._id || i} className="bxr-comment-item">
                      <div className="bxr-comment-item-av" style={{ background: bgColors[i % bgColors.length] }}>{initials}</div>
                      <div className="bxr-comment-body">
                        <div className="bxr-comment-meta">
                          <span className="bxr-comment-author">{authorStr}</span>
                          <span className="bxr-comment-time">{timeAgo(c.created_at)}</span>
                        </div>
                        <div className="bxr-comment-text">{c.content}</div>
                        <div className="bxr-comment-actions">
                          <button className={`bxr-cact${commentLikes[c.id || c._id] ? ' liked' : ''}`} onClick={() => likeComment(c.id || c._id)}>
                            <svg viewBox="0 0 24 24" fill={commentLikes[c.id || c._id] ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
                            {commentLikes[c.id || c._id] ? 1 : 0}
                          </button>
                          <button className="bxr-cact" onClick={() => showToast('Reply coming soon!')}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                            Reply
                          </button>
                          <button className="bxr-cact" onClick={() => showToast('Reported')}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
                            Report
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {comments.length === 0 && (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: '14px', fontFamily: "'DM Sans',sans-serif" }}>
                    Be the first to comment on this chapter.
                  </div>
                )}
              </div>
              {comments.length > 10 && (
                <button className="bxr-show-more" onClick={() => showToast('Loading more...')}>
                  Load more comments &#8595;
                </button>
              )}
            </div>
          </div>

          <aside className="bxr-sidebar">
            <div className="bxr-sc">
              <div className="bxr-sc-head">About the Author</div>
              <div className="bxr-author-sidebar">
                <div className="bxr-as-row">
                  <div className="bxr-as-av">{authorInitials}</div>
                  <div>
                    <div className="bxr-as-name">{authorName}</div>
                    <div className="bxr-as-handle">{authorHandle} &middot; {formatCount(authorGeeks)} Geeks</div>
                  </div>
                </div>
                {authorBio && <div className="bxr-as-bio">{authorBio}</div>}
                <button className={`bxr-as-geek${geeked ? ' geeked' : ''}`} onClick={geekAction}>
                  {geeked ? '&#129299; Geeking This Author' : '&#129299; Geek This Author'}
                </button>
              </div>
            </div>

            <div className="bxr-sidebar-ad">
              <div className="bxr-sa-label">Advertisement</div>
              <div className="bxr-sa-img">&#10024;</div>
              <div className="bxr-sa-title">Bixbi Premium</div>
              <div className="bxr-sa-sub">Read without ads. Download chapters. Support your favourite authors directly.</div>
              <button className="bxr-sa-cta">Get Premium &#8212; Free Trial</button>
            </div>

            <div className="bxr-sc">
              <div className="bxr-sc-head">&#10022; You Might Like</div>
              <div className="bxr-rec-list">
                {recoStories.length > 0 ? recoStories.map((rs, i) => {
                  const gradients = [
                    'linear-gradient(160deg,#1a0505,#3d1010)',
                    'linear-gradient(160deg,#050a1a,#0e1f3d)',
                    'linear-gradient(160deg,#0a0a1a,#1a1030)',
                    'linear-gradient(160deg,#081420,#122840)',
                  ];
                  return (
                    <a key={rs.id || rs._id || i} className="bxr-rec-item" href={`/story/${rs.id || rs._id}`}>
                      <div className="bxr-rec-cov" style={{ background: gradients[i % gradients.length] }}>
                        {rs.cover_image
                          ? <img src={rs.cover_image} alt={rs.title} />
                          : <span style={{ position: 'relative', zIndex: 1, fontSize: '9px' }}>{rs.title}</span>}
                      </div>
                      <div className="bxr-rec-info">
                        <div className="bxr-rec-title">{rs.title}</div>
                        <div className="bxr-rec-author">{rs.author_name || 'Author'}</div>
                        <div className="bxr-rec-stats">
                          <span>{formatCount(rs.views)} reads</span>
                        </div>
                      </div>
                    </a>
                  );
                }) : (
                  <div style={{ padding: '14px 16px', fontSize: '12px', color: 'var(--muted)' }}>Loading recommendations...</div>
                )}
              </div>
            </div>

            <div className="bxr-sidebar-ad" style={{ background: 'linear-gradient(160deg,rgba(45,212,192,0.06),rgba(45,212,192,0.02))', borderColor: 'rgba(45,212,192,0.15)' }}>
              <div className="bxr-sa-label">Advertisement</div>
              <div className="bxr-sa-img">&#128214;</div>
              <div className="bxr-sa-title">Reading Challenge</div>
              <div className="bxr-sa-sub">Join 50K readers in this month&#39;s fantasy reading challenge. Earn badges. Win prizes.</div>
              <button className="bxr-sa-cta" style={{ background: 'linear-gradient(135deg,#1a8a7a,#0e6b5e)' }}>Join Challenge &#8594;</button>
            </div>
          </aside>
        </div>

        <div className="bxr-toolbar">
          <button className={`bxr-tb-btn${liked ? ' liked' : ''}`} onClick={reactAction}>
            <svg viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
            Like
          </button>
          <button className={`bxr-tb-btn${geeked ? ' active' : ''}`} onClick={geekAction}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a4 4 0 014-4h4a4 4 0 014 4v2"/></svg>
            Geek
          </button>
          <button className={`bxr-tb-btn${bookmarked ? ' bookmarked' : ''}`} onClick={bookmarkAction}>
            <svg viewBox="0 0 24 24" fill={bookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
            Save
          </button>
          <button className="bxr-tb-btn" onClick={() => document.getElementById('bxr-comments')?.scrollIntoView({ behavior: 'smooth' })}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            Comments
          </button>
          <button className="bxr-tb-btn" onClick={() => setSettingsOpen(v => !v)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M1 12h2M21 12h2M4.93 19.07l1.41-1.41M19.07 19.07l-1.41-1.41M12 1v2M12 21v2"/></svg>
            Settings
          </button>
        </div>

        {scrollTopVisible && (
          <button className="bxr-scroll-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="18 15 12 9 6 15"/></svg>
          </button>
        )}

        <div className={`bxr-toast${toast ? ' show' : ''}`}>{toast}</div>
      </div>

      <ShareModal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        url={typeof window !== 'undefined' ? window.location.href : ''}
        title={story?.title}
        chapterLabel={currentChapter ? `Chapter ${currentChapter.chapter_number}` : null}
      />
    </>
  );
}
