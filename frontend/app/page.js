'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiRequest, fetchSiteSettings, readToken } from '@/lib/api';

/* ═══════════════════════════════════════════════════════
   MOCK DATA & CONSTANTS
═══════════════════════════════════════════════════════ */

const HERO_SLIDES = [
  {
    id: 1,
    tag: '⭐ Featured',
    title: 'The Chronicles of <em>Aeloria</em>',
    desc: 'A sweeping fantasy epic spanning continents, with intricate magic systems and unforgettable characters.',
    bg: 'linear-gradient(135deg, #1a0a0a 0%, #2a0a0a 50%, #1a0a2e 100%)',
  },
  {
    id: 2,
    tag: '🔥 Trending',
    title: 'Whispers in the <em>Shadows</em>',
    desc: 'A thrilling paranormal mystery that blurs the line between reality and the supernatural.',
    bg: 'linear-gradient(135deg, #0a1a2e 0%, #16213e 50%, #0f3460 100%)',
  },
  {
    id: 3,
    tag: '💕 Romance',
    title: 'Hearts <em>Entwined</em>',
    desc: 'An intimate love story that transcends time and challenges everything they believe in.',
    bg: 'linear-gradient(135deg, #2e0a1a 0%, #3e0a1a 50%, #2e1a2e 100%)',
  },
  {
    id: 4,
    tag: '🚀 Sci-Fi',
    title: 'Beyond the <em>Stars</em>',
    desc: 'Humanity\'s struggle for survival in a vast and hostile universe awaits discovery.',
    bg: 'linear-gradient(135deg, #0a1a2e 0%, #1a3a4e 50%, #0a2a4e 100%)',
  },
];

const GENRES = [
  { name: 'Fantasy', icon: '🧙', bg: '#1a0a2e' },
  { name: 'Romance', icon: '💕', bg: '#2e0a1a' },
  { name: 'Paranormal', icon: '👻', bg: '#0a2a2e' },
  { name: 'Thriller', icon: '⚡', bg: '#2e2a0a' },
  { name: 'Sci-Fi', icon: '🚀', bg: '#0a1a2e' },
  { name: 'Mystery', icon: '🔍', bg: '#1a0a1a' },
  { name: 'Drama', icon: '🎭', bg: '#2a1a0a' },
  { name: 'Adventure', icon: '🗺️', bg: '#0a2a1a' },
  { name: 'Comedy', icon: '😄', bg: '#2a0a2a' },
];

const MOCK_STORIES = [
  {
    id: 1,
    title: 'The Lost Kingdom',
    author: 'Elena Rose',
    genre: 'Fantasy',
    rating: 4.8,
    reviews: 2341,
    image: 'https://picsum.photos/seed/wingsaga-1/320/480',
    badge: 'New',
  },
  {
    id: 2,
    title: 'Midnight Echoes',
    author: 'Marcus Stone',
    genre: 'Thriller',
    rating: 4.6,
    reviews: 1892,
    image: 'https://picsum.photos/seed/wingsaga-2/320/480',
    badge: null,
  },
  {
    id: 3,
    title: 'Love in the Time of Stars',
    author: 'Aurora Sky',
    genre: 'Romance',
    rating: 4.9,
    reviews: 3124,
    image: 'https://picsum.photos/seed/wingsaga-3/320/480',
    badge: null,
  },
  {
    id: 4,
    title: 'The Ghost Protocol',
    author: 'Blake Morgan',
    genre: 'Paranormal',
    rating: 4.5,
    reviews: 1456,
    image: 'https://picsum.photos/seed/wingsaga-4/320/480',
    badge: 'Trending',
  },
  {
    id: 5,
    title: 'Nexus Prime',
    author: 'Dr. Kepler',
    genre: 'Sci-Fi',
    rating: 4.7,
    reviews: 2108,
    image: 'https://picsum.photos/seed/wingsaga-5/320/480',
    badge: null,
  },
  {
    id: 6,
    title: 'When Autumn Falls',
    author: 'James Chen',
    genre: 'Drama',
    rating: 4.4,
    reviews: 987,
    image: 'https://picsum.photos/seed/wingsaga-6/320/480',
    badge: null,
  },
  {
    id: 7,
    title: 'Ashes of the Crown',
    author: 'Mina Vale',
    genre: 'Fantasy',
    rating: 4.7,
    reviews: 1743,
    image: 'https://picsum.photos/seed/wingsaga-7/320/480',
    badge: 'Trending',
  },
  {
    id: 8,
    title: 'Silent Meridian',
    author: 'Noah Rivera',
    genre: 'Sci-Fi',
    rating: 4.6,
    reviews: 1598,
    image: 'https://picsum.photos/seed/wingsaga-8/320/480',
    badge: 'New',
  },
  {
    id: 9,
    title: 'Velvet Storm',
    author: 'Iris Lane',
    genre: 'Romance',
    rating: 4.9,
    reviews: 2810,
    image: 'https://picsum.photos/seed/wingsaga-9/320/480',
    badge: null,
  },
  {
    id: 10,
    title: 'The Ninth Corridor',
    author: 'Reed Hawkins',
    genre: 'Mystery',
    rating: 4.5,
    reviews: 1322,
    image: 'https://picsum.photos/seed/wingsaga-10/320/480',
    badge: null,
  },
  {
    id: 11,
    title: 'Neon Hollow',
    author: 'Aria Winters',
    genre: 'Thriller',
    rating: 4.4,
    reviews: 1104,
    image: 'https://picsum.photos/seed/wingsaga-11/320/480',
    badge: 'Trending',
  },
  {
    id: 12,
    title: 'The Last Orchard',
    author: 'Ruth Everly',
    genre: 'Drama',
    rating: 4.7,
    reviews: 1689,
    image: 'https://picsum.photos/seed/wingsaga-12/320/480',
    badge: null,
  },
];

const MOCK_REVIEWS = [
  {
    id: 1,
    user: 'Sophie L.',
    book: 'The Lost Kingdom',
    rating: 5,
    text: '"A masterpiece! The world-building is incredible and I couldn\'t put it down. Elena Rose is a genius."',
    date: '2 weeks ago',
    avatar: 'SL',
    bg: '#E91E63',
  },
  {
    id: 2,
    user: 'Thomas K.',
    book: 'Midnight Echoes',
    rating: 4,
    text: '"Gripping from start to finish. The twist at the end completely blindsided me. Highly recommend!"',
    date: '1 week ago',
    avatar: 'TK',
    bg: '#2196F3',
  },
  {
    id: 3,
    user: 'Maya P.',
    book: 'Love in the Time of Stars',
    rating: 5,
    text: '"The most beautiful love story I\'ve read in years. Aurora captured my heart completely. Perfection!"',
    date: '3 days ago',
    avatar: 'MP',
    bg: '#FF69B4',
  },
];

/* ═══════════════════════════════════════════════════════
   CUSTOM HOOKS & UTILITIES
═══════════════════════════════════════════════════════ */

function useDragScroll(ref) {
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollStart, setScrollStart] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const handleMouseDown = (e) => {
      setIsDragging(true);
      setStartX(e.clientX);
      setScrollStart(element.scrollLeft);
      element.classList.add('dragging');
    };

    const handleMouseMove = (e) => {
      if (!isDragging) return;
      const diff = e.clientX - startX;
      element.scrollLeft = scrollStart - diff;
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      element.classList.remove('dragging');
    };

    element.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      element.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, startX, scrollStart]);
}

function scrollCarousel(ref, direction) {
  if (!ref.current) return;
  const scrollAmount = 300;
  const newScroll = ref.current.scrollLeft + (direction === 'right' ? scrollAmount : -scrollAmount);
  ref.current.scrollTo({ left: newScroll, behavior: 'smooth' });
}

function getScrollState(ref) {
  const node = ref?.current;
  if (!node) {
    return { left: false, right: false };
  }
  const left = node.scrollLeft > 1;
  const right = node.scrollLeft + node.clientWidth < node.scrollWidth - 1;
  return { left, right };
}

function getDeterministicProgress(story, idx) {
  const historyProgress = Number(story?.progress_pct ?? story?.progress_percent ?? story?.overall_progress ?? NaN);
  if (Number.isFinite(historyProgress)) {
    return Math.max(0, Math.min(100, Math.floor(historyProgress)));
  }
  const raw = Number(story?.id ?? idx + 1);
  return 20 + ((raw * 17) % 71);
}

function toFixedLengthStories(list, length) {
  if (!Array.isArray(list) || list.length === 0) {
    return [];
  }
  const output = [];
  for (let i = 0; i < length; i += 1) {
    output.push(list[i % list.length]);
  }
  return output;
}

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════ */

export default function Home() {
  const router = useRouter();

  // HEROES & HERO NAV
  const [currentSlide, setCurrentSlide] = useState(0);
  const [stories, setStories] = useState([]);
  const [recommended, setRecommended] = useState([]);
  const [recommendationMeta, setRecommendationMeta] = useState({ reason: 'Based on what readers love', location_hint: '' });
  const [continueHistory, setContinueHistory] = useState([]);
  const [branding, setBranding] = useState({ site_name: 'Wingsaga', logo_url: '' });
  const [followed, setFollowed] = useState(new Set());
  const [bookmarkedStoryIds, setBookmarkedStoryIds] = useState(new Set());
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);
  const [sliderNav, setSliderNav] = useState({
    recommended: { left: false, right: true },
    popular: { left: false, right: true },
    newReleases: { left: false, right: true },
    trending: { left: false, right: true },
    subscription: { left: false, right: true },
    continue: { left: false, right: true },
    readingList: { left: false, right: true },
    reviews: { left: false, right: true },
    genres: { left: false, right: true },
  });

  // CAROUSEL REFS
  const recommendedRef = useRef(null);
  const popularRef = useRef(null);
  const newReleasesRef = useRef(null);
  const trendingRef = useRef(null);
  const subscriptionRef = useRef(null);
  const continueRef = useRef(null);
  const readingListRef = useRef(null);
  const reviewsRef = useRef(null);
  const genresRef = useRef(null);

  // DRAG SCROLLING
  useDragScroll(recommendedRef);
  useDragScroll(popularRef);
  useDragScroll(newReleasesRef);
  useDragScroll(trendingRef);
  useDragScroll(subscriptionRef);
  useDragScroll(continueRef);
  useDragScroll(readingListRef);
  useDragScroll(reviewsRef);
  useDragScroll(genresRef);

  useEffect(() => {
    const refs = {
      recommended: recommendedRef,
      popular: popularRef,
      newReleases: newReleasesRef,
      trending: trendingRef,
      subscription: subscriptionRef,
      continue: continueRef,
      readingList: readingListRef,
      reviews: reviewsRef,
      genres: genresRef,
    };

    const updateKey = (key) => {
      setSliderNav((prev) => ({
        ...prev,
        [key]: getScrollState(refs[key]),
      }));
    };

    const cleanups = Object.entries(refs).map(([key, ref]) => {
      const node = ref.current;
      if (!node) return () => {};
      const onScroll = () => updateKey(key);
      node.addEventListener('scroll', onScroll, { passive: true });
      setTimeout(() => updateKey(key), 0);
      return () => node.removeEventListener('scroll', onScroll);
    });

    const onResize = () => {
      Object.keys(refs).forEach((key) => updateKey(key));
    };
    window.addEventListener('resize', onResize);

    return () => {
      cleanups.forEach((cleanup) => cleanup());
      window.removeEventListener('resize', onResize);
    };
  }, [stories, continueHistory]);

  // FETCH DATA
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);

        // Fetch branding
        const brandData = await fetchSiteSettings();
        setBranding(brandData);

        // Fetch recommendations, trending & feed
        try {
          const [recommendationRes, trendingRes, feedRes] = await Promise.all([
            apiRequest('/discovery/recommendations').catch(() => ({ stories: [] })),
            apiRequest('/discovery/trending'),
            apiRequest('/discovery/feed'),
          ]);

          const recommendedStories = Array.isArray(recommendationRes?.stories) ? recommendationRes.stories : [];
          setRecommended(recommendedStories);
          setRecommendationMeta({
            reason: recommendationRes?.reason || 'Based on what readers love',
            location_hint: recommendationRes?.location_hint || '',
          });

          const trendingStories = Array.isArray(trendingRes) ? trendingRes : (trendingRes?.stories || []);
          const feedStories = Array.isArray(feedRes) ? feedRes : (feedRes?.stories || []);
          const mergedStories = [...trendingStories, ...feedStories].map((story, idx) => ({
            id: story?.id || story?._id || `api-story-${idx}`,
            _id: story?.id || story?._id || `api-story-${idx}`,
            title: story?.title || `Story ${idx + 1}`,
            author: story?.author_name || story?.author || 'Wingsaga',
            author_name: story?.author_name || story?.author || 'Wingsaga',
            genre: story?.genre || (Array.isArray(story?.categories) && story.categories[0]) || 'Fiction',
            categories: Array.isArray(story?.categories) ? story.categories : [],
            views: Number(story?.views || 0),
            likes: Number(story?.likes || 0),
            avg_rating: Number(story?.avg_rating || 0),
            created_at: story?.created_at || story?.updated_at || null,
            is_premium: Boolean(story?.is_premium),
            image: story?.cover_image || story?.image || '',
            cover_image: story?.cover_image || story?.image || '',
          }));
          setStories(mergedStories);
        } catch (err) {
          setStories([]);
          setRecommended([]);
        }

        // Fetch continue reading history
        const token = readToken();
        if (token) {
          try {
            const historyRes = await apiRequest('/reader/history', { token });
            setContinueHistory(Array.isArray(historyRes) ? historyRes : (historyRes?.history || []));
          } catch (err) {
            setContinueHistory([]);
          }
        } else {
          setContinueHistory([]);
        }
      } catch (err) {
        console.error('Error loading data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  // REAL-TIME POLLING FOR CONTINUE READING UPDATES
  useEffect(() => {
    const token = readToken();
    if (!token) return;

    const interval = setInterval(async () => {
      try {
        const historyRes = await apiRequest('/reader/history', { token });
        const updated = Array.isArray(historyRes) ? historyRes : (historyRes?.history || []);
        setContinueHistory(updated);
      } catch (err) {
        // Silently fail on polling errors
      }
    }, 10000); // Poll every 10 seconds

    return () => clearInterval(interval);
  }, []);

  // REAL-TIME STORY METRICS POLLING (views/likes from live stories endpoint)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const livePayload = await apiRequest('/stories?limit=80&sort_by=views');
        const liveStories = Array.isArray(livePayload?.stories) ? livePayload.stories : [];
        if (!liveStories.length) return;

        const liveMap = new Map(
          liveStories.map((item) => [
            String(item.id || item._id),
            {
              views: Number(item.views || 0),
              likes: Number(item.likes || 0),
              cover_image: item.cover_image,
            },
          ])
        );

        setStories((prev) =>
          (Array.isArray(prev) ? prev : []).map((story) => {
            const key = String(story.id || story._id || '');
            const live = liveMap.get(key);
            if (!live) return story;
            return {
              ...story,
              views: live.views,
              likes: live.likes,
              image: story.image || live.cover_image || '',
            };
          })
        );

        setRecommended((prev) =>
          (Array.isArray(prev) ? prev : []).map((story) => {
            const key = String(story.id || story._id || '');
            const live = liveMap.get(key);
            if (!live) return story;
            return {
              ...story,
              views: live.views,
              likes: live.likes,
              cover_image: story.cover_image || live.cover_image || '',
            };
          })
        );
      } catch {
        // Ignore polling errors
      }
    }, 8000);

    return () => clearInterval(interval);
  }, []);

  // Hero auto-play
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % HERO_SLIDES.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!readToken()) {
      setBookmarkedStoryIds(new Set());
      return;
    }

    apiRequest('/reader/bookmarks')
      .then((items) => {
        const ids = new Set(
          (Array.isArray(items) ? items : [])
            .map((item) => item?.story_id)
            .filter(Boolean)
        );
        setBookmarkedStoryIds(ids);
      })
      .catch(() => setBookmarkedStoryIds(new Set()));
  }, []);

  const allStories = stories;
  const displayStories = allStories;

  const byViewsDesc = [...displayStories].sort((a, b) => Number(b?.views || 0) - Number(a?.views || 0));
  const byLikesDesc = [...displayStories].sort((a, b) => Number(b?.likes || 0) - Number(a?.likes || 0));
  const byCreatedDesc = [...displayStories].sort((a, b) => {
    const aTs = new Date(a?.created_at || 0).getTime() || 0;
    const bTs = new Date(b?.created_at || 0).getTime() || 0;
    return bTs - aTs;
  });

  // DATA FOR SECTIONS
  const continueReading = continueHistory;
  const readingList = continueHistory.slice(0, 4);
  const recommendedStories = toFixedLengthStories(recommended.length > 0 ? recommended : displayStories, 10);
  const popularStories = toFixedLengthStories(byViewsDesc, 12);
  const newReleases = toFixedLengthStories(byCreatedDesc, 10);
  const trendingStories = toFixedLengthStories(byLikesDesc, 10);
  const subscriptionStories = toFixedLengthStories(displayStories.filter((item) => item?.is_premium), 12);

  // Hero handlers
  const handlePrevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + HERO_SLIDES.length) % HERO_SLIDES.length);
  };

  const handleNextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % HERO_SLIDES.length);
  };

  const handleToggleFollow = (followKey) => {
    setFollowed((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(followKey)) {
        newSet.delete(followKey);
      } else {
        newSet.add(followKey);
      }
      return newSet;
    });
  };

  const isArrowDisabled = (key, direction) => {
    if (direction === 'left') {
      return !sliderNav[key]?.left;
    }
    return !sliderNav[key]?.right;
  };

  const getActiveHeroStory = () => {
    if (!displayStories.length) return null;
    return displayStories[currentSlide % displayStories.length];
  };

  const getHeroStoryByIndex = (index) => {
    if (!displayStories.length) return null;
    return displayStories[index % displayStories.length];
  };

  const handleHeroSaveToList = async () => {
    const activeStory = getActiveHeroStory();
    const storyId = activeStory?.id || activeStory?._id;

    if (!storyId) {
      setToast('No story available to save right now.');
      return;
    }

    if (!readToken()) {
      router.push(`/auth/signin?next=${encodeURIComponent('/')}`);
      return;
    }

    try {
      const result = await apiRequest(`/reader/bookmarks/${storyId}`, { method: 'POST' });
      setBookmarkedStoryIds((prev) => {
        const next = new Set(prev);
        if (result?.message?.toLowerCase().includes('removed')) {
          next.delete(storyId);
        } else {
          next.add(storyId);
        }
        return next;
      });
      setToast(result?.message || 'Reading list updated');
    } catch {
      setToast('Could not update your reading list right now.');
    }
  };

  return (
    <main>
      {/* ───────────────────────────────────────────────────
          1. HERO SLIDER
      ─────────────────────────────────────────────────── */}
      <section className="bx-hero">
        <div
          className="bx-hero-track"
          style={{
            transform: `translateX(-${currentSlide * 100}%)`,
          }}
        >
          {HERO_SLIDES.map((slide, idx) => (
            <div key={slide.id} className="bx-hero-slide" style={{ backgroundImage: slide.bg }}>
              <div className="bx-hero-bg" style={{ backgroundImage: slide.bg }} />
              <div className="bx-hero-content">
                <span className="bx-hero-tag">{slide.tag}</span>
                <h1 className="bx-hero-title" dangerouslySetInnerHTML={{ __html: slide.title }} />
                <p className="bx-hero-desc">{slide.desc}</p>
                <div className="bx-hero-actions">
                  <button
                    className="bx-hero-btn-read"
                    onClick={() => {
                      const targetStory = getHeroStoryByIndex(idx);
                      const targetId = targetStory?.id || targetStory?._id;
                      if (targetId) {
                        router.push(`/read/${targetId}`);
                      }
                    }}
                  >
                    Start Reading
                  </button>
                  <button className="bx-hero-btn-list" onClick={handleHeroSaveToList}>
                    {(() => {
                      const activeStory = getActiveHeroStory();
                      const storyId = activeStory?.id || activeStory?._id;
                      const isSaved = storyId ? bookmarkedStoryIds.has(storyId) : false;
                      return isSaved ? 'Saved' : 'Save to List';
                    })()}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Hero Arrows */}
        <button className="bx-hero-arrow prev" onClick={handlePrevSlide} aria-label="Previous slide">
          ‹
        </button>
        <button className="bx-hero-arrow next" onClick={handleNextSlide} aria-label="Next slide">
          ›
        </button>

        {/* Hero Dots */}
        <div className="bx-hero-dots">
          {HERO_SLIDES.map((_, idx) => (
            <button
              key={idx}
              className={`bx-hero-dot ${idx === currentSlide ? 'active' : ''}`}
              onClick={() => setCurrentSlide(idx)}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>
      </section>

      {/* ───────────────────────────────────────────────────
          2. RECOMMENDED FOR YOU
      ─────────────────────────────────────────────────── */}
      <section className="bx-section">
        <div className="bx-sec-header">
          <div>
            <h2 className="bx-sec-title">Recommended for You</h2>
            <p className="bx-sec-subtitle">
              {recommendationMeta.reason}
              {recommendationMeta.location_hint ? ` • ${recommendationMeta.location_hint}` : ''}
            </p>
          </div>
        </div>

        <div className="bx-carousel">
          <button
            className="bx-carousel-arrow left"
            onClick={() => scrollCarousel(recommendedRef, 'left')}
            aria-label="Scroll left"
            disabled={isArrowDisabled('recommended', 'left')}
          >
            ‹
          </button>
          <div className="bx-book-scroll" ref={recommendedRef}>
            {recommendedStories.map((story, idx) => (
              <div
                key={`recommended-${story.id || story._id || 'story'}-${idx}`}
                className="bx-book-card"
                onClick={() => router.push(`/read/${story.id || story._id}`)}
              >
                <div className="bx-book-cover" style={{ backgroundColor: '#3f7a6a' }}>
                  {story.image || story.cover_image ? (
                    <img src={story.image || story.cover_image} alt={story.title} loading="eager" />
                  ) : (
                    <div className="bx-book-fallback">{story.title}</div>
                  )}
                </div>
                <h4 className="bx-book-title">{story.title}</h4>
                <p className="bx-book-author">{story.publisher || story.author_name || story.author || 'Unknown Author'}</p>
                <div className="bx-book-meta bx-book-meta-rich">
                  <span>👁 {Number(story.views || 0).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
          <button
            className="bx-carousel-arrow right"
            onClick={() => scrollCarousel(recommendedRef, 'right')}
            aria-label="Scroll right"
            disabled={isArrowDisabled('recommended', 'right')}
          >
            ›
          </button>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────
          5. POPULAR RIGHT NOW CAROUSEL
      ─────────────────────────────────────────────────── */}
      <section className="bx-section">
        <div className="bx-sec-header">
          <h2 className="bx-sec-title">Popular Right Now</h2>
        </div>

        <div className="bx-carousel">
          <button
            className="bx-carousel-arrow left"
            onClick={() => scrollCarousel(popularRef, 'left')}
            aria-label="Scroll left"
            disabled={isArrowDisabled('popular', 'left')}
          >
            ‹
          </button>
          <div className="bx-book-scroll" ref={popularRef}>
            {popularStories.map((story, idx) => (
              <div
                key={`popular-${story.id || story._id || 'story'}-${idx}`}
                className="bx-book-card"
                onClick={() => router.push(`/read/${story.id || story._id}`)}
              >
                <div className="bx-book-cover" style={{ backgroundColor: '#2F4F4F' }}>
                  {story.image ? (
                    <img src={story.image} alt={story.title} loading="eager" />
                  ) : (
                    <div className="bx-book-fallback">{story.title}</div>
                  )}
                </div>
                <h4 className="bx-book-title">{story.title}</h4>
                <p className="bx-book-author">{story.publisher || story.author_name || story.author || 'Unknown Author'}</p>
                <div className="bx-book-meta bx-book-meta-rich">
                  <span>👁 {Number(story.views || 0).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
          <button
            className="bx-carousel-arrow right"
            onClick={() => scrollCarousel(popularRef, 'right')}
            aria-label="Scroll right"
            disabled={isArrowDisabled('popular', 'right')}
          >
            ›
          </button>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────
          6. NEW RELEASES CAROUSEL
      ─────────────────────────────────────────────────── */}
      <section className="bx-section">
        <div className="bx-sec-header">
          <h2 className="bx-sec-title">New Releases</h2>
        </div>

        <div className="bx-carousel">
          <button
            className="bx-carousel-arrow left"
            onClick={() => scrollCarousel(newReleasesRef, 'left')}
            aria-label="Scroll left"
            disabled={isArrowDisabled('newReleases', 'left')}
          >
            ‹
          </button>
          <div className="bx-book-scroll" ref={newReleasesRef}>
            {newReleases.map((story, idx) => (
              <div
                key={`new-${story.id || story._id || 'story'}-${idx}`}
                className="bx-book-card"
                onClick={() => router.push(`/read/${story.id || story._id}`)}
              >
                <div className="bx-book-cover" style={{ backgroundColor: '#663399' }}>
                  {story.image ? (
                    <img src={story.image} alt={story.title} loading="eager" />
                  ) : (
                    <div className="bx-book-fallback">{story.title}</div>
                  )}
                </div>
                <h4 className="bx-book-title">{story.title}</h4>
                <p className="bx-book-author">{story.publisher || story.author_name || story.author || 'Unknown Author'}</p>
                <div className="bx-book-meta bx-book-meta-rich">
                  <span>👁 {Number(story.views || 0).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
          <button
            className="bx-carousel-arrow right"
            onClick={() => scrollCarousel(newReleasesRef, 'right')}
            aria-label="Scroll right"
            disabled={isArrowDisabled('newReleases', 'right')}
          >
            ›
          </button>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────
          7. TRENDING THIS WEEK CAROUSEL
      ─────────────────────────────────────────────────── */}
      <section className="bx-section">
        <div className="bx-sec-header">
          <h2 className="bx-sec-title">🔥 Trending This Week</h2>
        </div>

        <div className="bx-carousel">
          <button
            className="bx-carousel-arrow left"
            onClick={() => scrollCarousel(trendingRef, 'left')}
            aria-label="Scroll left"
            disabled={isArrowDisabled('trending', 'left')}
          >
            ‹
          </button>
          <div className="bx-book-scroll" ref={trendingRef}>
            {trendingStories.map((story, idx) => (
              <div
                key={`trend-${story.id || story._id || 'story'}-${idx}`}
                className="bx-book-card"
                onClick={() => router.push(`/read/${story.id || story._id}`)}
              >
                <div className="bx-book-cover" style={{ backgroundColor: '#DC143C' }}>
                  {story.image ? (
                    <img src={story.image} alt={story.title} loading="eager" />
                  ) : (
                    <div className="bx-book-fallback">{story.title}</div>
                  )}
                </div>
                <h4 className="bx-book-title">{story.title}</h4>
                <p className="bx-book-author">{story.publisher || story.author_name || story.author || 'Unknown Author'}</p>
                <div className="bx-book-meta bx-book-meta-rich">
                  <span>👁 {Number(story.views || 0).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
          <button
            className="bx-carousel-arrow right"
            onClick={() => scrollCarousel(trendingRef, 'right')}
            aria-label="Scroll right"
            disabled={isArrowDisabled('trending', 'right')}
          >
            ›
          </button>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────
          9. SUBSCRIPTION STORIES SECTION
      ─────────────────────────────────────────────────── */}
      <section className="bx-section">
        <div className="bx-sub-banner">
          <div>
            <div className="bx-sub-banner-title">♛ Subscription Stories</div>
            <p className="bx-sub-banner-desc">Unlock exclusive premium content & full access</p>
          </div>
          <button className="bx-sub-banner-btn" onClick={() => router.push('/auth/signup')}>
            Upgrade
          </button>
        </div>

        <div className="bx-carousel">
          <button
            className="bx-carousel-arrow left"
            onClick={() => scrollCarousel(subscriptionRef, 'left')}
            aria-label="Scroll left"
            disabled={isArrowDisabled('subscription', 'left')}
          >
            ‹
          </button>
          <div className="bx-book-scroll" ref={subscriptionRef}>
            {subscriptionStories.map((story, idx) => (
              <div
                key={`sub-${story.id}-${idx}`}
                className="bx-book-card"
                onClick={() => router.push(`/read/${story.id || story._id}`)}
              >
                <div className="bx-book-cover" style={{ backgroundColor: '#4169E1' }}>
                  <span className="bx-book-sub-badge">PRO</span>
                  {story.image ? (
                    <img src={story.image} alt={story.title} loading="eager" />
                  ) : (
                    <div className="bx-book-fallback">{story.title}</div>
                  )}
                  <div className="bx-book-locked">
                    <span className="bx-book-locked-icon">🔒</span>
                  </div>
                </div>
                <h4 className="bx-book-title">{story.title}</h4>
                <p className="bx-book-author">{story.publisher || story.author_name || story.author || 'Unknown Author'}</p>
                <div className="bx-book-meta bx-book-meta-rich">
                  <span>👁 {Number(story.views || 0).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
          <button
            className="bx-carousel-arrow right"
            onClick={() => scrollCarousel(subscriptionRef, 'right')}
            aria-label="Scroll right"
            disabled={isArrowDisabled('subscription', 'right')}
          >
            ›
          </button>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────
          10. CONTINUE READING SECTION
      ─────────────────────────────────────────────────── */}
      <section className="bx-section">
        <div className="bx-sec-header">
          <h2 className="bx-sec-title">▶ Continue Reading</h2>
        </div>

        <div className="bx-carousel">
          <button
            className="bx-carousel-arrow left"
            onClick={() => scrollCarousel(continueRef, 'left')}
            aria-label="Scroll left"
            disabled={isArrowDisabled('continue', 'left')}
          >
            ‹
          </button>
          <div className="bx-continue-scroll" ref={continueRef}>
            {continueReading.map((story, idx) => (
              (() => {
                const progress = getDeterministicProgress(story, idx);
                return (
              <div
                key={`continue-${idx}`}
                className="bx-book-card bx-continue-card-flat"
                onClick={() => router.push(`/read/${story.id || story._id}`)}
              >
                <div className="bx-book-cover" style={{ backgroundColor: '#8B4513' }}>
                  {story.cover_image || story.image ? (
                    <img src={story.cover_image || story.image} alt={story.title} loading="eager" />
                  ) : (
                    <div className="bx-book-fallback" style={{ fontSize: '10px' }}>
                      {story.title}
                    </div>
                  )}
                </div>
                <div className="bx-book-info">
                  <h4 className="bx-book-title">{story.title}</h4>
                  <p className="bx-book-author">{story.publisher || story.author_name || story.author || 'Unknown Author'}</p>
                  <p className="bx-book-progress">Last read part: {story.chapter_id || 'Chapter 1'}</p>
                  <p className="bx-book-progress">👁 {Number(story.views || 0).toLocaleString()}</p>
                  <div className="bx-continue-progress-wrap">
                    <div className="bx-continue-progress-bar">
                      <div
                        className="bx-continue-progress-fill"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="bx-continue-progress-label">
                      {progress}%
                    </span>
                  </div>
                </div>
              </div>
                );
              })()
            ))}
          </div>
          <button
            className="bx-carousel-arrow right"
            onClick={() => scrollCarousel(continueRef, 'right')}
            aria-label="Scroll right"
            disabled={isArrowDisabled('continue', 'right')}
          >
            ›
          </button>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────
          11. MY READING LIST SECTION
      ─────────────────────────────────────────────────── */}
      <section className="bx-section">
        <div className="bx-sec-header">
          <h2 className="bx-sec-title">🔖 My Reading List</h2>
        </div>

        <div className="bx-carousel">
          <button
            className="bx-carousel-arrow left"
            onClick={() => scrollCarousel(readingListRef, 'left')}
            aria-label="Scroll left"
            disabled={isArrowDisabled('readingList', 'left')}
          >
            ‹
          </button>
          <div className="bx-readlist-scroll" ref={readingListRef}>
            {readingList.map((story, idx) => (
              (() => {
                const followKey = `author-${story.author || idx}`;
                return (
              <div
                key={`readlist-${idx}`}
                className="bx-readlist-card"
                onClick={() => router.push(`/read/${story.id || story._id}`)}
              >
                <div className="bx-readlist-cover" style={{ backgroundColor: '#2F4F4F' }}>
                  {story.image ? (
                    <img src={story.image} alt={story.title} loading="eager" />
                  ) : (
                    <div className="bx-book-fallback">{story.title}</div>
                  )}
                </div>
                <div className="bx-readlist-info">
                  <h4 className="bx-readlist-title">{story.title}</h4>
                  <p className="bx-readlist-meta">{story.author}</p>
                  <p className="bx-readlist-meta">👁 {Number(story.views || 0).toLocaleString()}</p>
                  <span className={`bx-readlist-status ${idx % 2 === 0 ? 'ongoing' : 'complete'}`}>
                    {idx % 2 === 0 ? 'Ongoing' : 'Complete'}
                  </span>
                  <button
                    className={`bx-readlist-follow ${followed.has(followKey) ? 'followed' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleFollow(followKey);
                    }}
                  >
                    {followed.has(followKey) ? 'Following' : 'Follow'}
                  </button>
                </div>
              </div>
                );
              })()
            ))}
          </div>
          <button
            className="bx-carousel-arrow right"
            onClick={() => scrollCarousel(readingListRef, 'right')}
            aria-label="Scroll right"
            disabled={isArrowDisabled('readingList', 'right')}
          >
            ›
          </button>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────
          12. TOP REVIEWS SECTION
      ─────────────────────────────────────────────────── */}
      <section className="bx-section">
        <div className="bx-sec-header">
          <h2 className="bx-sec-title">⭐ Top Reviews</h2>
        </div>

        <div className="bx-carousel">
          <button
            className="bx-carousel-arrow left"
            onClick={() => scrollCarousel(reviewsRef, 'left')}
            aria-label="Scroll left"
            disabled={isArrowDisabled('reviews', 'left')}
          >
            ‹
          </button>
          <div className="bx-reviews-list" ref={reviewsRef}>
            {MOCK_REVIEWS.map((review) => (
              <div key={review.id} className="bx-review-card">
                <div className="bx-review-top">
                  <div
                    className="bx-review-avatar"
                    style={{ backgroundColor: review.bg }}
                  >
                    {review.avatar}
                  </div>
                  <div>
                    <p className="bx-review-username">{review.user}</p>
                    <p className="bx-review-book">
                      on <span>{review.book}</span>
                    </p>
                  </div>
                </div>
                <div className="bx-review-stars">
                  {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
                </div>
                <p className="bx-review-text">{review.text}</p>
                <div className="bx-review-footer">
                  <span className="bx-review-date">{review.date}</span>
                  <button className="bx-review-helpful" onClick={() => setToast('Thanks for your feedback!')}>👍 Helpful</button>
                </div>
              </div>
            ))}
          </div>
          <button
            className="bx-carousel-arrow right"
            onClick={() => scrollCarousel(reviewsRef, 'right')}
            aria-label="Scroll right"
            disabled={isArrowDisabled('reviews', 'right')}
          >
            ›
          </button>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────
          13. STATS SECTION (3 columns)
      ─────────────────────────────────────────────────── */}
      <section className="bx-stats">
        <div className="bx-stat">
          <span className="bx-stat-icon">✦</span>
          <span className="bx-stat-num">
            <span>12M+</span>
          </span>
          <span className="bx-stat-label">Stories Published</span>
        </div>
        <div className="bx-stat">
          <span className="bx-stat-icon">◉</span>
          <span className="bx-stat-num">
            <span>450K+</span>
          </span>
          <span className="bx-stat-label">Active Readers</span>
        </div>
        <div className="bx-stat">
          <span className="bx-stat-icon">◆</span>
          <span className="bx-stat-num">
            <span>195</span>
          </span>
          <span className="bx-stat-label">Countries</span>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────
          14. BROWSE GENRES GRID
      ─────────────────────────────────────────────────── */}
      <section className="bx-section">
        <div className="bx-sec-header">
          <h2 className="bx-sec-title">Browse Genres</h2>
        </div>

        <div className="bx-carousel">
          <button
            className="bx-carousel-arrow left"
            onClick={() => scrollCarousel(genresRef, 'left')}
            aria-label="Scroll left"
            disabled={isArrowDisabled('genres', 'left')}
          >
            ‹
          </button>
          <div className="bx-genres-row" ref={genresRef}>
            {GENRES.map((genre) => (
              <div
                key={genre.name}
                className="bx-genre-card"
                style={{ backgroundColor: genre.bg }}
                onClick={() => router.push(`/discover?genre=${encodeURIComponent(genre.name.toLowerCase())}`)}
              >
                <div className="bx-genre-overlay" />
                <span className="bx-genre-icon">{genre.icon}</span>
                <span className="bx-genre-name">{genre.name}</span>
              </div>
            ))}
          </div>
          <button
            className="bx-carousel-arrow right"
            onClick={() => scrollCarousel(genresRef, 'right')}
            aria-label="Scroll right"
            disabled={isArrowDisabled('genres', 'right')}
          >
            ›
          </button>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────
          15. CTA BANNER
      ─────────────────────────────────────────────────── */}
      <section className="bx-section">
        <div className="bx-cta-banner">
          <h2>Your story deserves to be <em>heard</em></h2>
          <p>
            Join thousands of authors sharing their creative works with the world. Start writing today
            and connect with millions of readers.
          </p>
          <div className="bx-cta-btns">
            <button
              className="bx-btn-primary"
              onClick={() => router.push(readToken() ? '/write' : '/auth/signin?next=%2Fwrite')}
              style={{
                background: 'var(--gold)',
                color: '#0d0d12',
                padding: '11px 28px',
              }}
            >
              Start Writing
            </button>
            <button
              className="bx-btn-ghost"
              onClick={() => router.push('/discover')}
              style={{
                border: '1px solid rgba(201,169,110,0.3)',
                color: 'var(--text)',
                padding: '11px 28px',
              }}
            >
              Explore Stories
            </button>
          </div>
        </div>
      </section>

      {toast && (
        <div className="bx-toast show">{toast}</div>
      )}
    </main>
  );
}
