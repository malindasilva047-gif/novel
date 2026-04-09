'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
// Social share icons SVGs
const SOCIAL_ICONS = {
  embed: <svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 18l-6-6 6-6M16 6l6 6-6 6" stroke="currentColor" strokeWidth="2" fill="none"/></svg>,
  whatsapp: <svg viewBox="0 0 24 24" width="22" height="22"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.472-.148-.67.15-.198.297-.767.967-.94 1.166-.173.198-.347.223-.644.075-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.372-.025-.52-.075-.149-.669-1.611-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.372-.01-.571-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.099 3.2 5.077 4.363.71.306 1.263.489 1.694.626.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.288.173-1.413-.074-.124-.272-.198-.57-.347z" fill="#25D366"/><circle cx="12" cy="12" r="10" stroke="#25D366" strokeWidth="2" fill="none"/></svg>,
  facebook: <svg viewBox="0 0 24 24" width="22" height="22"><path d="M17 2.1A9 9 0 1 0 21 12c0-4.97-4.03-9-9-9zm-1 16.9V12h2.5l.5-2H16V8.5c0-.6.2-1 .9-1H18V5.1c-.2 0-.9-.1-1.7-.1-2 0-3.3 1.2-3.3 3.4V10H10v2h2v6.9z" fill="#1877F3"/></svg>,
  x: <svg viewBox="0 0 24 24" width="22" height="22"><path d="M17.53 6.47a.75.75 0 0 0-1.06 0L12 10.94 7.53 6.47a.75.75 0 0 0-1.06 1.06L10.94 12l-4.47 4.47a.75.75 0 1 0 1.06 1.06L12 13.06l4.47 4.47a.75.75 0 0 0 1.06-1.06L13.06 12l4.47-4.47a.75.75 0 0 0 0-1.06z" fill="#000"/></svg>,
  email: <svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 4h16v16H4z" fill="#fff"/><path d="M4 4l8 8 8-8" stroke="#000" strokeWidth="2" fill="none"/></svg>,
  pinterest: <svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="10" fill="#E60023"/><path d="M12 7a5 5 0 0 0-1 9.9c-.14-.12-.27-.26-.37-.42-.1-.16-.18-.34-.23-.53-.05-.19-.07-.39-.07-.59 0-.2.02-.4.07-.59.05-.19.13-.37.23-.53.1-.16.23-.3.37-.42A5 5 0 1 1 12 7z" fill="#fff"/></svg>,
  linkedin: <svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="10" fill="#0077B5"/><rect x="7" y="10" width="2" height="7" fill="#fff"/><rect x="11" y="10" width="2" height="7" fill="#fff"/><rect x="15" y="10" width="2" height="7" fill="#fff"/></svg>,
  reddit: <svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="10" fill="#FF4500"/><circle cx="8.5" cy="13.5" r="1.5" fill="#fff"/><circle cx="15.5" cy="13.5" r="1.5" fill="#fff"/><ellipse cx="12" cy="16" rx="4" ry="2" fill="#fff"/></svg>,
  copy: <svg viewBox="0 0 24 24" width="22" height="22"><rect x="9" y="9" width="13" height="13" rx="2" fill="#eee" stroke="#888" strokeWidth="2"/><rect x="2" y="2" width="13" height="13" rx="2" fill="#fff" stroke="#888" strokeWidth="2"/></svg>,
};
function SharePopup({ open, onClose, url }) {
  const popupRef = useRef();
  useEffect(() => {
    function handleClick(e) {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        onClose();
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, onClose]);

  function handleCopy() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
    }
  }

  if (!open) return null;
  return (
    <div className="share-popup-overlay">
      <div className="share-popup" ref={popupRef}>
        <div className="share-popup-title">Share this story</div>
        <div className="share-popup-row">
          <button className="share-icon" title="Embed">{SOCIAL_ICONS.embed}</button>
          <button className="share-icon" title="WhatsApp">{SOCIAL_ICONS.whatsapp}</button>
          <button className="share-icon" title="Facebook">{SOCIAL_ICONS.facebook}</button>
          <button className="share-icon" title="X (Twitter)">{SOCIAL_ICONS.x}</button>
          <button className="share-icon" title="Email">{SOCIAL_ICONS.email}</button>
          <button className="share-icon" title="Pinterest">{SOCIAL_ICONS.pinterest}</button>
          <button className="share-icon" title="LinkedIn">{SOCIAL_ICONS.linkedin}</button>
          <button className="share-icon" title="Reddit">{SOCIAL_ICONS.reddit}</button>
        </div>
        <div className="share-popup-link-row">
          <input className="share-link-input" value={url} readOnly />
          <button className="share-icon" title="Copy link" onClick={handleCopy}>{SOCIAL_ICONS.copy}</button>
        </div>
        <button className="share-popup-close" onClick={onClose}>×</button>
      </div>
    </div>
  );
}
import { useParams, useRouter } from 'next/navigation';
import { apiRequest, readToken } from '@/lib/api';

const FALLBACK_TAGS = ['BxB', 'Mafia', 'Angst', 'Romance', 'Happy Ending', 'Mature'];

function formatCompact(value) {
  const n = Number(value || 0);
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function renderTagClass(tag) {
  const key = String(tag || '').toLowerCase();
  if (key.includes('bxb')) return 'tag tag-bxb';
  if (key.includes('mafia')) return 'tag tag-mafia';
  if (key.includes('angst')) return 'tag tag-angst';
  if (key.includes('romance')) return 'tag tag-romance';
  if (key.includes('happy')) return 'tag tag-happy';
  if (key.includes('mature')) return 'tag tag-mature';
  return 'tag tag-angst';
}

export default function StoryDemoPage() {
    const [shareOpen, setShareOpen] = useState(false);
    const [currentUserId, setCurrentUserId] = useState(null);

    // Get current user id for author check
    useEffect(() => {
      const token = readToken();
      if (!token) return;
      apiRequest('/auth/me', { token })
        .then((me) => setCurrentUserId(me?.id || me?._id || null))
        .catch(() => setCurrentUserId(null));
    }, []);
  const params = useParams();
  const router = useRouter();
  const storyId = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const [loading, setLoading] = useState(true);
  const [story, setStory] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [recommended, setRecommended] = useState([]);
  const [bookmarkedStoryIds, setBookmarkedStoryIds] = useState(new Set());
  const [liked, setLiked] = useState(false);
  const [historyItem, setHistoryItem] = useState(null);
  const [activeTab, setActiveTab] = useState('summary');
  const [descExpanded, setDescExpanded] = useState(false);
  const [allStories, setAllStories] = useState([]);
  const [selectedSeriesTag, setSelectedSeriesTag] = useState('');
  const [reviewText, setReviewText] = useState('');
  const [reviewStars, setReviewStars] = useState(5);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!storyId) return;

    let mounted = true;
    async function loadData() {
      try {
        setLoading(true);
        const token = readToken();

        const [storyRes, chaptersRes, commentsRes, recoRes, historyRes, storiesRes, bookmarksRes] = await Promise.all([
          apiRequest(`/stories/${storyId}`, { token }).catch(() => null),
          apiRequest(`/stories/${storyId}/chapters`, { token }).catch(() => ({ chapters: [] })),
          apiRequest(`/engagement/stories/${storyId}/comments`, { token }).catch(() => []),
          apiRequest('/discovery/trending').catch(() => []),
          token ? apiRequest('/reader/history', { token }).catch(() => []) : Promise.resolve([]),
          apiRequest('/stories?limit=80').catch(() => ({ stories: [] })),
          token ? apiRequest('/reader/bookmarks', { token }).catch(() => []) : Promise.resolve([]),
        ]);

        if (!mounted) return;
        if (!storyRes) {
          setToast('Story not found.');
          setLoading(false);
          return;
        }

        const all = Array.isArray(storiesRes?.stories) ? storiesRes.stories : [];
        const bookmarks = new Set(
          (Array.isArray(bookmarksRes) ? bookmarksRes : []).map((item) => String(item.story_id)).filter(Boolean)
        );

        setStory(storyRes);
        setChapters(Array.isArray(chaptersRes?.chapters) ? chaptersRes.chapters : []);
        setReviews(Array.isArray(commentsRes) ? commentsRes : []);
        setRecommended((Array.isArray(recoRes) ? recoRes : []).filter((item) => String(item?.id || item?._id) !== String(storyId)).slice(0, 6));
        setAllStories(all);
        setBookmarkedStoryIds(bookmarks);

        const history = Array.isArray(historyRes) ? historyRes : [];
        const row = history.find((h) => String(h.story_id) === String(storyId));
        setHistoryItem(row || null);

        // Keep per-story like marker for UI feedback.
        const likedSet = new Set(JSON.parse(localStorage.getItem('story_likes') || '[]'));
        setLiked(likedSet.has(String(storyId)));

        const tagPool = Array.isArray(storyRes?.tags) && storyRes.tags.length ? storyRes.tags : (storyRes?.categories || FALLBACK_TAGS);
        const randomIndex = Math.floor(Math.random() * Math.max(1, tagPool.length));
        setSelectedSeriesTag(String(tagPool[randomIndex] || FALLBACK_TAGS[0]));
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadData();
    return () => {
      mounted = false;
    };
  }, [storyId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const tags = useMemo(() => {
    const raw = Array.isArray(story?.tags) && story.tags.length
      ? story.tags
      : (Array.isArray(story?.categories) ? story.categories : []);
    if (!raw.length) return FALLBACK_TAGS;
    return raw.slice(0, 8);
  }, [story]);

  const storyDescription = String(story?.description || 'No description available.').trim();
  const shouldShowReadMore = storyDescription.length > 280;

  const readMinutes = story?.estimated_read_minutes || Math.max(1, Math.round((chapters || []).reduce((s, ch) => s + Number(ch?.word_count || 0), 0) / 200));
  const readText = readMinutes >= 60 ? `${Math.floor(readMinutes / 60)}h ${readMinutes % 60}m read time` : `${readMinutes}m read time`;
  const rating = Number(story?.rating || story?.avg_rating || 0);
  const canShowContinue = Number(historyItem?.progress_pct || 0) > 0;

  const author = story?.author || {};
  const authorId = author?.id || story?.author_id;
  const authorName = author?.name || story?.author_name || 'Unknown Author';
  const authorHandle = `@${String(authorName).toLowerCase().replace(/\s+/g, '_')}`;
  const isGeeked = Boolean(author?.is_geeked);

  const isBookmarked = bookmarkedStoryIds.has(String(storyId));

  const seriesStories = useMemo(() => {
    if (!selectedSeriesTag) return [];
    const key = selectedSeriesTag.toLowerCase();
    return (Array.isArray(allStories) ? allStories : [])
      .filter((item) => String(item?.id || item?._id) !== String(storyId))
      .filter((item) => {
        const itemTags = Array.isArray(item?.tags) ? item.tags.map((t) => String(t).toLowerCase()) : [];
        const itemCats = Array.isArray(item?.categories) ? item.categories.map((t) => String(t).toLowerCase()) : [];
        return itemTags.includes(key) || itemCats.includes(key) || String(item?.genre || '').toLowerCase().includes(key);
      })
      .slice(0, 8);
  }, [allStories, selectedSeriesTag, storyId]);

  const alsoLikeStories = useMemo(() => {
    const fallback = (Array.isArray(allStories) ? allStories : [])
      .filter((item) => String(item?.id || item?._id) !== String(storyId))
      .slice(0, 12);
    const trend = (Array.isArray(recommended) ? recommended : [])
      .filter((item) => String(item?.id || item?._id) !== String(storyId));
    return [...trend, ...fallback]
      .filter((item, idx, arr) => idx === arr.findIndex((it) => String(it?.id || it?._id) === String(item?.id || item?._id)))
      .slice(0, 12);
  }, [allStories, recommended, storyId]);

  async function toggleGeekAuthor() {
    const token = readToken();
    if (!token) {
      router.push(`/auth/signin?next=${encodeURIComponent(`/story/${storyId}`)}`);
      return;
    }
    if (!authorId) {
      setToast('Author unavailable right now.');
      return;
    }

    try {
      const path = isGeeked ? `/users/${authorId}/unfollow` : `/users/${authorId}/follow`;
      const result = await apiRequest(path, { method: 'POST', token });
      setStory((prev) => {
        if (!prev) return prev;
        const prevAuthor = prev.author || {};
        const nextGeeked = !Boolean(prevAuthor.is_geeked);
        const prevCount = Number(prevAuthor.geeks || 0);
        const nextCount = Math.max(0, prevCount + (nextGeeked ? 1 : -1));
        return {
          ...prev,
          author: {
            ...prevAuthor,
            is_geeked: nextGeeked,
            geeks: nextCount,
          },
        };
      });
      setToast(result?.message || 'Updated author geek status.');
    } catch (err) {
      setToast(err?.message || 'Could not update geek status.');
    }
  }

  async function toggleLibrary(sourceLabel = 'Library') {
    const token = readToken();
    if (!token) {
      router.push(`/auth/signin?next=${encodeURIComponent(`/story/${storyId}`)}`);
      return;
    }

    try {
      const result = await apiRequest(`/reader/bookmarks/${storyId}`, { method: 'POST', token });
      setBookmarkedStoryIds((prev) => {
        const next = new Set(prev);
        if (String(result?.message || '').toLowerCase().includes('removed')) {
          next.delete(String(storyId));
        } else {
          next.add(String(storyId));
        }
        return next;
      });
      setToast(result?.message || `${sourceLabel} updated.`);
    } catch (err) {
      setToast(err?.message || `Could not update ${sourceLabel.toLowerCase()}.`);
    }
  }

  async function handleLike() {
    const token = readToken();
    if (!token) {
      router.push(`/auth/signin?next=${encodeURIComponent(`/story/${storyId}`)}`);
      return;
    }

    try {
      const result = await apiRequest(`/engagement/stories/${storyId}/like`, { method: 'POST', token });
      const wasLiked = liked;
      const nextLiked = !wasLiked;
      setLiked(nextLiked);
      setStory((prev) => {
        if (!prev) return prev;
        const delta = nextLiked ? 1 : -1;
        const nextLikes = Math.max(0, Number(prev.likes || 0) + delta);
        return {
          ...prev,
          likes: nextLikes,
          votes: nextLikes,
        };
      });

      const likedSet = new Set(JSON.parse(localStorage.getItem('story_likes') || '[]'));
      if (nextLiked) likedSet.add(String(storyId));
      else likedSet.delete(String(storyId));
      localStorage.setItem('story_likes', JSON.stringify([...likedSet]));

      setToast(result?.message || (nextLiked ? 'Story liked' : 'Like removed'));
    } catch (err) {
      setToast(err?.message || 'Could not like this story right now.');
    }
  }

  function handleShare() {
    setShareOpen(true);
  }

  async function submitReview() {
    const token = readToken();
    if (!token) {
      router.push(`/auth/signin?next=${encodeURIComponent(`/story/${storyId}`)}`);
      return;
    }

    if (reviewText.trim().length < 2) {
      setToast('Please write at least a short review.');
      return;
    }

    try {
      setSubmittingReview(true);
      await apiRequest(`/engagement/stories/${storyId}/comments`, {
        method: 'POST',
        token,
        body: {
          content: reviewText.trim(),
          rating: reviewStars,
        },
      });

      const fresh = await apiRequest(`/engagement/stories/${storyId}/comments`, { token }).catch(() => []);
      setReviews(Array.isArray(fresh) ? fresh : []);
      setReviewText('');
      setReviewStars(5);
      setToast('Review posted.');
    } catch (err) {
      setToast(err?.message || 'Could not post review.');
    } finally {
      setSubmittingReview(false);
    }
  }

  function renderStoryCard(item, idx, keyPrefix = 'card') {
    const id = item?.id || item?._id;
    if (!id) return null;
    return (
      <div
        key={`${keyPrefix}-${id}-${idx}`}
        className="bx-book-card"
        onClick={() => router.push(`/story/${id}`)}
      >
        <div className="bx-book-cover" style={{ backgroundColor: '#2f3f59' }}>
          {item?.cover_image ? <img src={item.cover_image} alt={item.title || 'Story cover'} loading="lazy" /> : <span>📘</span>}
        </div>
        <h4 className="bx-book-title">{item?.title || 'Story'}</h4>
        <p className="bx-book-author">{item?.author_name || item?.author || 'Unknown Author'}</p>
        <div className="bx-book-meta bx-book-meta-rich">
          <span>👁 {formatCompact(item?.views || 0)}</span>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="story-loading-wrap">
        <div className="story-loading-text">Loading story...</div>
      </div>
    );
  }

  if (!story) {
    return (
      <div className="story-loading-wrap">
        <div className="story-loading-text">Story not found.</div>
      </div>
    );
  }

  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';

  return (
    <main className="story-page-root">
      <SharePopup open={shareOpen} onClose={() => setShareOpen(false)} url={shareUrl} />
      <div className="hero-bg" />

      <section className="hero-section">
        <div className="cover-col">
          <div className="book-cover-wrap">
            <div className="cover-badge">#{String((story?.categories || [])[0] || 'Fiction').toUpperCase().replace(/\s+/g, '')}</div>
            <div className="book-cover">
              {story?.cover_image ? (
                <img src={story.cover_image} alt={story.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 62 }}>📕</span>
              )}
            </div>
            <div className="cover-rating">
              <span className="stars">★★★★★</span>
              <span>{rating.toFixed(1)}</span>
            </div>
          </div>

          <div className="cover-actions">
            {canShowContinue && (
              <button
                className="continue-bar"
                onClick={() => router.push(`/read/${storyId}`)}
                type="button"
              >
                <span>▶ Continue Reading</span>
                <div className="continue-progress">
                  <div className="continue-fill" style={{ width: `${Math.max(0, Math.min(100, Number(historyItem?.progress_pct || 0)))}%` }} />
                </div>
                <span>{Math.round(Number(historyItem?.progress_pct || 0))}%</span>
              </button>
            )}

            <button className="btn-primary" type="button" onClick={() => router.push(`/read/${storyId}`)}>▶ Start Reading</button>
            <button className="btn-secondary" type="button" onClick={() => toggleLibrary('Library')}>
              {isBookmarked ? '✓ In Library' : '＋ Add to Library'}
            </button>

            {/* Hide actions if current user is the author */}
            {(currentUserId && String(currentUserId) === String(authorId)) ? null : (
              <div className="mini-actions">
                <button className={`mini-btn${liked ? ' liked' : ''}`} type="button" onClick={handleLike} title="Like">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
                  <span>{liked ? 'Liked' : 'Like'}</span>
                </button>
                <button className={`mini-btn${isBookmarked ? ' bookmarked' : ''}`} type="button" onClick={() => toggleLibrary('Save')} title="Save">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
                  <span>{isBookmarked ? 'Saved' : 'Save'}</span>
                </button>
                <button className="mini-btn" type="button" onClick={handleShare} title="Share">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                  <span>Share</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="story-col">
          <div className="story-platform-tag">✦ Wattpad · Apollo_Exe</div>
          <h1 className="story-title">{story?.title}</h1>
          <p className="story-subtitle">A story of forbidden love, shadows, and unexpected truths.</p>

          <div className="author-row">
            <button className="author-avatar" type="button" onClick={() => router.push(authorId ? `/profile/${authorId}` : '/authors')}>
              {String(authorName).slice(0, 1).toUpperCase()}
            </button>
            <div className="author-name-wrap">
              <button className="author-name-btn" type="button" onClick={() => router.push(authorId ? `/profile/${authorId}` : '/authors')}>
                {authorName}
              </button>
              <div className="author-stories">{Number(author?.story_count || 0)} published stories</div>
            </div>
            <span className="author-sep">•</span>
            <span className="completed-badge">✓ {String(story?.status || '').toLowerCase() === 'published' ? 'Complete' : 'Ongoing'}</span>
          </div>

          <div className="stats-row">
            <div className="stat-item"><span className="icon">👁</span><span className="val">{formatCompact(story?.reads || story?.views)}</span> Reads</div>
            <div className="stat-item"><span className="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{verticalAlign:'middle',width:16,height:16}}><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg></span><span className="val">{formatCompact(story?.likes)}</span> Like</div>
            <div className="stat-item"><span className="icon">📄</span><span className="val">{story?.parts_count || chapters.length}</span> Parts</div>
            <div className="stat-item"><span className="icon">⭐</span><span className="val">{rating.toFixed(1)}</span> Rating</div>
            <div className="stat-item"><span className="icon">⏱</span><span className="val">{readText}</span></div>
          </div>

          <div className="tags-row">
            {tags.map((tag, idx) => (
              <span key={`${tag}-${idx}`} className={renderTagClass(tag)}>{tag}</span>
            ))}
          </div>

          <div className="story-desc">
            <p className={!descExpanded && shouldShowReadMore ? 'desc-truncated' : ''}>{storyDescription}</p>
            {shouldShowReadMore && (
              <button className="read-more-btn" type="button" onClick={() => setDescExpanded((v) => !v)}>
                {descExpanded ? '▲ Read less' : '▼ Read more'}
              </button>
            )}
          </div>

          <div className="story-details-grid">
            <article className="detail-card"><small>Started</small><strong>{story?.created_at ? new Date(story.created_at).toLocaleDateString() : 'March 27, 2025'}</strong></article>
            <article className="detail-card"><small>Completed</small><strong>{String(story?.status || '').toLowerCase() === 'published' ? (story?.updated_at ? new Date(story.updated_at).toLocaleDateString() : 'May 20, 2025') : 'Ongoing'}</strong></article>
            <article className="detail-card"><small>Language</small><strong>{story?.language || 'English'}</strong></article>
            <article className="detail-card"><small>Peak Rank</small><strong>#{String((story?.categories || [])[0] || 'LGBTFICTION').toUpperCase().replace(/\s+/g, '')}</strong></article>
          </div>
        </div>

        <aside className="right-col">
          <div className="author-card-side">
            <div className="author-card-banner" />
            <div className="author-card-body">
              <button className="author-card-avatar author-clickable" type="button" onClick={() => router.push(authorId ? `/profile/${authorId}` : '/authors')}>
                {String(authorName).slice(0, 1).toUpperCase()}
              </button>
              <button className="author-card-name author-clickable" type="button" onClick={() => router.push(authorId ? `/profile/${authorId}` : '/authors')}>{authorName}</button>
              <button className="author-card-handle author-clickable" type="button" onClick={() => router.push(authorId ? `/profile/${authorId}` : '/authors')}>{authorHandle}</button>
              <p className="author-card-bio">{author?.bio || 'Platform administrator account.'}</p>

              <div className="author-card-stats">
                <div><strong>{Number(author?.story_count || 0)}</strong><span>Stories</span></div>
                <div><strong>{formatCompact(author?.geeks || 0)}</strong><span>Geeks</span></div>
                <div><strong>{formatCompact(author?.total_reads || 0)}</strong><span>Reads</span></div>
              </div>

              <button className="btn-primary" type="button" onClick={toggleGeekAuthor}>
                {isGeeked ? '✓ Geeked Author' : '+ Geek Author'}
              </button>
            </div>
          </div>

          <div className="ad-card">
            <div className="ad-title">ADVERTISEMENT</div>
            <div className="ad-sub">Google Adsense</div>
            <div className="ad-sub">300 × 250</div>
            <button className="ad-btn" type="button">Learn More</button>
          </div>

          <div className="mini-list-card">
            <div className="mini-title">🔥 You May Also Like</div>
            {alsoLikeStories.slice(0, 4).map((item, idx) => (
              <button key={`${item.id || item._id}-${idx}`} className="mini-item" type="button" onClick={() => router.push(`/story/${item.id || item._id}`)}>
                <span className="mini-emoji">📘</span>
                <span>
                  <strong>{item.title}</strong>
                  <small>{formatCompact(item.views || 0)} reads</small>
                </span>
              </button>
            ))}
          </div>
        </aside>
      </section>

      <section className="tabs-section">
        <div className="tabs-offset" />
        <div className="tabs-main">
          <div className="tabs-nav">
            <button className={`tab-btn ${activeTab === 'summary' ? 'active' : ''}`} onClick={() => setActiveTab('summary')} type="button">📄 Summary</button>
            <button className={`tab-btn ${activeTab === 'parts' ? 'active' : ''}`} onClick={() => setActiveTab('parts')} type="button">📃 Parts ({chapters.length})</button>
            <button className={`tab-btn ${activeTab === 'reviews' ? 'active' : ''}`} onClick={() => setActiveTab('reviews')} type="button">⭐ Reviews</button>
          </div>

          {activeTab === 'summary' && (
            <div className="summary-full">
              <p>{storyDescription}</p>
            </div>
          )}

          {activeTab === 'parts' && (
            <div className="episode-list">
              {chapters.map((ch, idx) => (
                <button key={ch._id || ch.id || idx} className="episode-item" type="button" onClick={() => router.push(`/read/${storyId}`)}>
                  <span className="episode-num">{ch.chapter_number || idx + 1}</span>
                  <span className="episode-info">
                    <strong>{ch.title || `Chapter ${idx + 1}`}</strong>
                    <small>{Math.max(1, Math.round(Number(ch.word_count || 0) / 200))} min read</small>
                  </span>
                  <span className="episode-play">▶</span>
                </button>
              ))}
            </div>
          )}

          {activeTab === 'reviews' && (
            <div className="review-list">
              <div className="review-score">{rating.toFixed(1)} <span>Based on user interactions and comments</span></div>

              <div className="review-write-box">
                <h3>Write a review</h3>
                <div className="star-picker" role="radiogroup" aria-label="Review stars">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      className={`star-btn ${reviewStars >= star ? 'active' : ''}`}
                      type="button"
                      onClick={() => setReviewStars(star)}
                      aria-label={`${star} star`}
                    >
                      ★
                    </button>
                  ))}
                </div>
                <textarea
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  placeholder="Share your thoughts about this story..."
                  rows={4}
                  style={{ background: 'var(--surface2, #f0f0ea)', color: 'var(--text, #222)', borderRadius: 8, border: '1.5px solid var(--border, #ccc)', padding: 10 }}
                />
                <button className="btn-primary" type="button" onClick={submitReview} disabled={submittingReview}>
                  {submittingReview ? 'Posting...' : 'Post Review'}
                </button>
              </div>

              {reviews.map((row, idx) => {
                const stars = Math.max(1, Math.min(5, Number(row.rating || 0))) || 0;
                return (
                  <article key={row.id || idx} className="review-card" style={{ background: 'var(--surface, #fff)', color: 'var(--text, #222)', borderRadius: 12, border: '1px solid var(--border, #ccc)', marginBottom: 12 }}>
                    <div className="review-head">
                      <div className="review-avatar" style={{ background: 'linear-gradient(135deg,#1a1a0a,#2e2a08)', color: 'var(--gold, #c9a96e)' }}>{String(row.user_id || 'U').slice(0, 2).toUpperCase()}</div>
                      <div>
                        <strong>{row.user_id || 'Reader'}</strong>
                        <small>{row.created_at ? new Date(row.created_at).toLocaleDateString() : ''}</small>
                      </div>
                    </div>
                    {stars > 0 && <div className="review-stars">{'★'.repeat(stars)}{'☆'.repeat(5 - stars)}</div>}
                    <p style={{ color: 'var(--text2, #444)' }}>{row.content}</p>
                  </article>
                );
              })}
              {!reviews.length && <p className="empty-note">No reviews yet. Be the first Geek to review.</p>}
            </div>
          )}
        </div>
        <div className="tabs-right" />
      </section>

      <section className="below-section">
        <div className="below-wrap">
          {seriesStories.length > 0 && (
            <>
              <div className="section-head">
                <div className="section-copy">
                  <h2>{selectedSeriesTag ? `📚 The ${selectedSeriesTag} Series` : '📚 Story Series'}</h2>
                  <p>Stories connected by this theme</p>
                </div>
                <button type="button" onClick={() => router.push('/discover')}>View all →</button>
              </div>
              <div className="bx-carousel no-overflow story-home-row series-home-row">
                <div className="bx-book-scroll">
                {seriesStories.map((item, idx) => renderStoryCard(item, idx, 'series'))}
                </div>
              </div>
            </>
          )}

          <div className="section-head" style={{ marginTop: 26 }}>
            <div className="section-copy">
              <h2>✨ You May Also Like</h2>
              <p>Based on your reading history</p>
            </div>
            <button type="button" onClick={() => router.push('/discover')}>View all →</button>
          </div>
          <div className="bx-carousel no-overflow story-home-row likes-home-row">
            <div className="bx-book-scroll">
            {alsoLikeStories.map((item, idx) => renderStoryCard(item, idx, 'more'))}
            </div>
          </div>
        </div>
      </section>

      {toast && <div className="bx-toast show">{toast}</div>}

      <style jsx>{`
        .story-loading-wrap { min-height: calc(100vh - 60px); display: flex; align-items: center; justify-content: center; }
        .story-loading-text { color: var(--muted); font-size: 15px; }
        .story-page-root { position: relative; min-height: calc(100vh - 60px); padding-bottom: 30px; }
        .hero-bg {
          position: fixed; top: 60px; left: 0; right: 0; bottom: 0; z-index: 0;
          background:
            radial-gradient(ellipse 80% 60% at 20% 30%, rgba(124,109,240,0.12) 0%, transparent 60%),
            radial-gradient(ellipse 60% 50% at 80% 60%, rgba(244,63,94,0.07) 0%, transparent 50%),
            #0a0d14;
          pointer-events: none;
        }
        .hero-section {
          position: relative; z-index: 2; max-width: 1200px; margin: 0 auto;
          padding: 34px 24px 0;
          display: grid; grid-template-columns: 220px 1fr 300px; gap: 32px; align-items: start;
        }
        .cover-col { position: sticky; top: 82px; display: flex; flex-direction: column; gap: 12px; align-items: center; }
        .book-cover-wrap { width: 220px; position: relative; }
        .book-cover {
          width: 100%; aspect-ratio: 2/3; border-radius: 14px; overflow: hidden;
          background: linear-gradient(145deg,#1a0a2e 0%,#2d1060 40%,#4a1a7a 70%,#6b2d9e 100%);
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 24px 60px rgba(0,0,0,0.6);
        }
        .cover-badge {
          position: absolute; right: 10px; top: 10px; background: #f43f5e;
          color: #fff; font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 4px;
        }
        .cover-rating {
          position: absolute; left: 10px; right: 10px; bottom: 10px;
          background: rgba(0,0,0,0.55); border-radius: 8px; padding: 6px 10px;
          display: flex; align-items: center; gap: 8px; color: #f59e0b; font-size: 12px;
        }
        .stars { letter-spacing: -1px; }
        .cover-actions { display: flex; flex-direction: column; gap: 8px; }
        .btn-primary {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          background: linear-gradient(135deg, #7c6df0, #a855f7); color: #fff; border: none;
          border-radius: 8px; padding: 11px; font-size: 14px; font-weight: 700; cursor: pointer;
        }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .btn-secondary {
          background: rgba(124,109,240,0.08); color: #c8bfff; border: 1px solid rgba(124,109,240,0.25);
          border-radius: 8px; padding: 10px; font-size: 13px; font-weight: 600; cursor: pointer;
        }
        .mini-actions { display: flex; gap: 8px; }
        .mini-btn {
          flex: 1; background: #131826; border: 1px solid rgba(99,120,200,0.12); color: #9aa3b8;
          border-radius: 8px; padding: 8px 6px; font-size: 12px; cursor: pointer;
        }
        .continue-bar {
          width: 100%; background: linear-gradient(90deg,rgba(20,184,166,0.12),rgba(124,109,240,0.08));
          border: 1px solid rgba(20,184,166,0.2); border-radius: 8px; padding: 9px 11px;
          display: flex; align-items: center; gap: 8px; color: #2dd4bf; font-size: 12px; cursor: pointer;
        }
        .continue-progress { flex: 1; height: 3px; border-radius: 99px; background: rgba(255,255,255,0.08); overflow: hidden; }
        .continue-fill { height: 100%; background: #14b8a6; }
        .story-platform-tag {
          display: inline-flex; align-items: center; gap: 6px; margin-bottom: 14px;
          font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
          color: #c8bfff; background: rgba(124,109,240,0.1); border: 1px solid rgba(124,109,240,0.2);
          border-radius: 20px; padding: 4px 12px;
        }
        .story-title { font-family: 'Cormorant Garamond', serif; font-size: clamp(28px,4vw,50px); line-height: 1.08; color: #fff; margin-bottom: 8px; }
        .story-subtitle { font-style: italic; color: #5a6480; margin-bottom: 18px; }
        .author-row { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; flex-wrap: wrap; }
        .author-avatar {
          width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg,#7c6df0,#f43f5e);
          color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; border: none; cursor: pointer;
        }
        .author-name-btn {
          color: #e8eaf0; font-weight: 700; font-size: 14px; border: none; background: none; padding: 0; cursor: pointer;
        }
        .author-stories { color: #5a6480; font-size: 12px; }
        .author-sep { color: #5a6480; }
        .completed-badge { background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.2); color: #34d399; font-size: 11px; border-radius: 18px; padding: 3px 10px; }
        .stats-row { display: flex; gap: 18px; flex-wrap: wrap; margin-bottom: 18px; }
        .stat-item { color: #9aa3b8; font-size: 13px; display: flex; align-items: center; gap: 6px; }
        .stat-item .val { color: #e8eaf0; font-weight: 700; }
        .tags-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
        .tag { border-radius: 20px; padding: 4px 12px; font-size: 11px; font-weight: 600; border: 1px solid; }
        .tag-bxb { background: rgba(20,184,166,0.08); color: #2dd4bf; border-color: rgba(20,184,166,0.2); }
        .tag-mafia { background: rgba(244,63,94,0.08); color: #fb7185; border-color: rgba(244,63,94,0.2); }
        .tag-angst { background: rgba(124,109,240,0.08); color: #c8bfff; border-color: rgba(124,109,240,0.2); }
        .tag-romance { background: rgba(236,72,153,0.08); color: #f0abce; border-color: rgba(236,72,153,0.2); }
        .tag-happy { background: rgba(16,185,129,0.08); color: #34d399; border-color: rgba(16,185,129,0.2); }
        .tag-mature { background: rgba(245,158,11,0.1); color: #fcd34d; border-color: rgba(245,158,11,0.2); }
        .story-desc { color: #9aa3b8; line-height: 1.8; border-left: 2px solid rgba(124,109,240,0.3); padding-left: 16px; margin-bottom: 18px; }
        .desc-truncated { display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
        .read-more-btn { background: none; border: none; color: #a89cf5; padding: 4px 0; cursor: pointer; }
        .story-details-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; }
        .detail-card { background: #111827; border: 1px solid rgba(99,120,200,0.12); border-radius: 10px; padding: 10px 12px; display: grid; gap: 4px; }
        .detail-card small { color: #7f8ba3; font-size: 11px; }
        .detail-card strong { color: #f0f3fb; font-size: 14px; }
        .right-col { display: flex; flex-direction: column; gap: 12px; }
        .author-card-side { background: #0f1728; border: 1px solid rgba(99,120,200,0.18); border-radius: 14px; overflow: hidden; }
        .author-card-banner { height: 62px; background: linear-gradient(135deg,#3b1070,#6b2d9e); }
        .author-card-body { padding: 14px; }
        .author-card-avatar {
          width: 38px; height: 38px; border-radius: 50%; margin-top: -32px;
          background: linear-gradient(135deg,#7c6df0,#f43f5e); color: #fff;
          display: flex; align-items: center; justify-content: center; font-weight: 700; border: 2px solid #0f1728;
        }
        .author-clickable { border: none; cursor: pointer; }
        .author-card-name { color: #fff; font-weight: 700; margin-top: 8px; background: none; border: none; padding: 0; text-align: left; }
        .author-card-handle { color: #5a6480; font-size: 12px; margin-bottom: 8px; background: none; border: none; padding: 0; text-align: left; }
        .author-card-bio { color: #9aa3b8; font-size: 13px; line-height: 1.6; margin-bottom: 10px; }
        .author-card-stats { display: flex; gap: 14px; margin-bottom: 12px; }
        .author-card-stats div { display: grid; }
        .author-card-stats strong { color: #fff; font-size: 16px; }
        .author-card-stats span { color: #9aa3b8; font-size: 11px; }
        .ad-card {
          background: #131826; border: 1px solid rgba(99,120,200,0.12); border-radius: 14px;
          min-height: 220px; display: grid; place-content: center; text-align: center; gap: 6px;
        }
        .ad-title { color: #5a6480; font-size: 11px; letter-spacing: 0.08em; }
        .ad-sub { color: #7b879f; font-size: 13px; }
        .ad-btn { background: #1f2840; border: 1px solid rgba(99,120,200,0.18); border-radius: 8px; color: #a7b2c9; padding: 6px 10px; margin-top: 6px; }
        .mini-list-card { background: #111827; border: 1px solid rgba(99,120,200,0.1); border-radius: 12px; overflow: hidden; }
        .mini-title { padding: 12px; color: #fff; font-weight: 700; border-bottom: 1px solid rgba(99,120,200,0.1); }
        .mini-item { width: 100%; background: transparent; border: none; padding: 10px 12px; display: flex; align-items: center; gap: 8px; color: #d6deee; border-bottom: 1px solid rgba(99,120,200,0.08); cursor: pointer; }
        .mini-item:last-child { border-bottom: none; }
        .mini-item strong { display: block; font-size: 13px; text-align: left; }
        .mini-item small { color: #77839a; font-size: 11px; }
        .tabs-section {
          position: relative; z-index: 2; max-width: 1200px; margin: 26px auto 0; padding: 0 24px;
          display: grid; grid-template-columns: 220px 1fr 300px; gap: 32px;
        }
        .tabs-nav { display: flex; gap: 2px; background: #131826; border: 1px solid rgba(99,120,200,0.12); border-radius: 14px; padding: 4px; margin-bottom: 16px; }
        .tab-btn { flex: 1; border: none; background: transparent; color: #5a6480; border-radius: 10px; padding: 9px 12px; font-size: 13px; font-weight: 600; cursor: pointer; }
        .tab-btn.active { background: #181f30; color: #e8eaf0; }
        .summary-full { color: #9aa3b8; line-height: 1.85; }
        .episode-list { display: flex; flex-direction: column; gap: 8px; }
        .episode-item {
          background: #111827; border: 1px solid rgba(99,120,200,0.12); border-radius: 10px;
          color: #d9dfeb; display: flex; align-items: center; gap: 12px; padding: 12px 14px; cursor: pointer;
        }
        .episode-num { color: #78839a; font-weight: 700; width: 24px; }
        .episode-info { display: grid; gap: 2px; text-align: left; flex: 1; }
        .episode-info small { color: #66748f; }
        .episode-play { color: #cbd5e1; }
        .review-score { font-size: 46px; line-height: 1; color: #fff; margin-bottom: 12px; }
        .review-score span { display: block; color: #66748f; font-size: 12px; margin-top: 6px; }
        .review-list { display: grid; gap: 10px; }
        .review-write-box { background: #111827; border: 1px solid rgba(99,120,200,0.12); border-radius: 12px; padding: 12px; display: grid; gap: 10px; }
        .review-write-box h3 { margin: 0; color: #f0f3fb; font-size: 14px; }
        .star-picker { display: flex; gap: 4px; }
        .star-btn { border: 1px solid rgba(99,120,200,0.2); background: #171d2b; color: #7d8799; border-radius: 6px; padding: 4px 8px; cursor: pointer; }
        .star-btn.active { color: #f59e0b; border-color: rgba(245,158,11,0.5); }
        .review-write-box textarea { width: 100%; background: #0e1320; color: #cdd5e6; border: 1px solid rgba(99,120,200,0.2); border-radius: 8px; padding: 10px; resize: vertical; }
        .review-card { background: #111827; border: 1px solid rgba(99,120,200,0.12); border-radius: 12px; padding: 12px; }
        .review-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
        .review-avatar { width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg,#7c6df0,#f43f5e); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 11px; }
        .review-head strong { display: block; color: #fff; font-size: 13px; }
        .review-head small { color: #6d7b95; font-size: 11px; }
        .review-stars { color: #f59e0b; margin-bottom: 4px; font-size: 13px; }
        .review-card p { color: #9aa3b8; line-height: 1.65; }
        .empty-note { color: #7b879f; }
        .below-section { position: relative; z-index: 2; margin-top: 30px; }
        .below-wrap { max-width: 1200px; margin: 0 auto; padding: 0 24px; }
        .section-head { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 12px; gap: 14px; }
        .section-copy { display: grid; gap: 2px; }
        .section-head h2 { color: #f0f3fb; font-family: 'Cormorant Garamond', serif; font-size: 34px; margin: 0; line-height: 1.04; }
        .section-copy p { color: #78839a; font-size: 13px; margin: 0; }
        .section-head button { border: none; background: none; color: #a2acc2; cursor: pointer; }
        .story-home-row .bx-book-scroll { width: 100%; }
        .series-home-row .bx-book-card { flex: 0 0 calc((100% - 36px) / 4); max-width: calc((100% - 36px) / 4); }
        .likes-home-row .bx-book-card { flex: 0 0 calc((100% - 60px) / 6); max-width: calc((100% - 60px) / 6); }
        .story-home-row .bx-book-card { min-width: 160px; }

        @media (max-width: 1120px) {
          .hero-section, .tabs-section { grid-template-columns: 220px 1fr; }
          .right-col, .tabs-right { display: none; }
          .story-home-row .bx-book-scroll { overflow-x: auto; }
          .series-home-row .bx-book-card,
          .likes-home-row .bx-book-card {
            flex: 0 0 185px;
            max-width: 185px;
            scroll-snap-align: start;
          }
        }
        @media (max-width: 780px) {
          .hero-section, .tabs-section { grid-template-columns: 1fr; gap: 16px; }
          .cover-col { position: static; width: 100%; max-width: 320px; justify-self: center; }
          .book-cover-wrap { width: 100%; }
          .tabs-offset { display: none; }
          .story-details-grid { grid-template-columns: 1fr; }
          .section-head h2 { font-size: 30px; }
          .section-copy p { font-size: 12px; }
        }
        @media (max-width: 500px) {
          .hero-section, .tabs-section, .below-wrap { padding-left: 14px; padding-right: 14px; }
          .mini-actions { flex-direction: column; }
          .series-home-row .bx-book-card,
          .likes-home-row .bx-book-card {
            flex: 0 0 170px;
            max-width: 170px;
          }
          .section-head { align-items: center; }
          .section-head button { font-size: 12px; }
          .tabs-nav { flex-wrap: wrap; }
          .tab-btn { min-width: 110px; }
        }
      `}</style>
    </main>
  );
}
