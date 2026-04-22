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
    localCover: '/story-covers/838a5bd1-9865-4b1d-a43f-d9031def487f.jpg',
  },
  {
    id: 2,
    tag: '🔥 Trending',
    title: 'Whispers in the <em>Shadows</em>',
    desc: 'A thrilling paranormal mystery that blurs the line between reality and the supernatural.',
    bg: 'linear-gradient(135deg, #0a1a2e 0%, #16213e 50%, #0f3460 100%)',
    localCover: '/story-covers/3afa73d3-a7fd-4461-94a2-f27ecb4f5ce5.jpg',
  },
  {
    id: 3,
    tag: '💕 Romance',
    title: 'Hearts <em>Entwined</em>',
    desc: 'An intimate love story that transcends time and challenges everything they believe in.',
    bg: 'linear-gradient(135deg, #2e0a1a 0%, #3e0a1a 50%, #2e1a2e 100%)',
    localCover: '/story-covers/6005008f-8a71-488e-a3cb-7338786e318b.jpg',
  },
  {
    id: 4,
    tag: '🚀 Sci-Fi',
    title: 'Beyond the <em>Stars</em>',
    desc: 'Humanity\'s struggle for survival in a vast and hostile universe awaits discovery.',
    bg: 'linear-gradient(135deg, #0a1a2e 0%, #1a3a4e 50%, #0a2a4e 100%)',
    localCover: '/story-covers/8a117e79-24fc-4545-b020-bd5d697e4a71.jpg',
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

function dedupeStoriesById(list) {
  if (!Array.isArray(list)) {
    return [];
  }
  const seen = new Set();
  const output = [];
  for (const item of list) {
    const key = String(item?.id || item?._id || '');
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(item);
  }
  return output;
}

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════ */

export default function Home() {
  const router = useRouter();
  const isLoggedIn = Boolean(readToken());

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
  const [seeMoreOpen, setSeeMoreOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sliderNav, setSliderNav] = useState({
    recommended: { left: false, right: false },
    popular: { left: false, right: false },
    newReleases: { left: false, right: false },
    trending: { left: false, right: false },
    romance: { left: false, right: false },
    mystery: { left: false, right: false },
    adventure: { left: false, right: false },
    subscription: { left: false, right: false },
    continue: { left: false, right: false },
    readingList: { left: false, right: false },
    reviews: { left: false, right: false },
    genres: { left: false, right: false },
    fantasy: { left: false, right: false },
    scifi: { left: false, right: false },
    thriller: { left: false, right: false },
    drama: { left: false, right: false },
    paranormal: { left: false, right: false },
  });

  // CAROUSEL REFS
  const recommendedRef = useRef(null);
  const popularRef = useRef(null);
  const newReleasesRef = useRef(null);
  const trendingRef = useRef(null);
  const romanceRef = useRef(null);
  const mysteryRef = useRef(null);
  const adventureRef = useRef(null);
  const subscriptionRef = useRef(null);
  const continueRef = useRef(null);
  const readingListRef = useRef(null);
  const reviewsRef = useRef(null);
  const genresRef = useRef(null);
  const fantasyRef = useRef(null);
  const scifiRef = useRef(null);
  const thrillerRef = useRef(null);
  const dramaRef = useRef(null);
  const paranormalRef = useRef(null);

  // DRAG SCROLLING
  useDragScroll(recommendedRef);
  useDragScroll(popularRef);
  useDragScroll(newReleasesRef);
  useDragScroll(trendingRef);
  useDragScroll(romanceRef);
  useDragScroll(mysteryRef);
  useDragScroll(adventureRef);
  useDragScroll(subscriptionRef);
  useDragScroll(continueRef);
  useDragScroll(readingListRef);
  useDragScroll(reviewsRef);
  useDragScroll(genresRef);
  useDragScroll(fantasyRef);
  useDragScroll(scifiRef);
  useDragScroll(thrillerRef);
  useDragScroll(dramaRef);
  useDragScroll(paranormalRef);

  useEffect(() => {
    const refs = {
      recommended: recommendedRef,
      popular: popularRef,
      newReleases: newReleasesRef,
      trending: trendingRef,
      romance: romanceRef,
      mystery: mysteryRef,
      adventure: adventureRef,
      subscription: subscriptionRef,
      continue: continueRef,
      readingList: readingListRef,
      reviews: reviewsRef,
      genres: genresRef,
      fantasy: fantasyRef,
      scifi: scifiRef,
      thriller: thrillerRef,
      drama: dramaRef,
      paranormal: paranormalRef,
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
          const mergedStories = dedupeStoriesById([...trendingStories, ...feedStories]).map((story, idx) => ({
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
      if (document.hidden) {
        return;
      }
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
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  // Hero auto-play – dep uses `stories.length` (state var) to avoid TDZ:
  // `displayStories` is a derived const declared later in the render body.
  useEffect(() => {
    const slideCount = Math.max(1, stories.length ? Math.min(stories.length, 4) : HERO_SLIDES.length);
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slideCount);
    }, 5000);
    return () => clearInterval(interval);
  }, [stories.length]);

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
  const recommendedStories = dedupeStoriesById(recommended.length > 0 ? recommended : displayStories).slice(0, 12);
  const popularStories = dedupeStoriesById(byViewsDesc).slice(0, 12);
  const newReleases = dedupeStoriesById(byCreatedDesc).slice(0, 12);
  const trendingStories = dedupeStoriesById(byLikesDesc).slice(0, 12);
  const subscriptionStories = dedupeStoriesById(displayStories.filter((item) => item?.is_premium)).slice(0, 12);
  const werewolfStories = dedupeStoriesById(displayStories.filter((item) =>
    String(item?.genre || '').toLowerCase().includes('werewolf')
    || (Array.isArray(item?.categories) && item.categories.some((cat) => String(cat).toLowerCase().includes('werewolf')))
  )).slice(0, 12);
  const romanceStories = dedupeStoriesById(displayStories.filter((item) =>
    String(item?.genre || '').toLowerCase().includes('romance')
    || (Array.isArray(item?.categories) && item.categories.some((cat) => String(cat).toLowerCase().includes('romance')))
  )).slice(0, 12);
  const mysteryStories = dedupeStoriesById(displayStories.filter((item) =>
    String(item?.genre || '').toLowerCase().includes('mystery')
    || (Array.isArray(item?.categories) && item.categories.some((cat) => String(cat).toLowerCase().includes('mystery')))
  )).slice(0, 12);
  const adventureStories = dedupeStoriesById(displayStories.filter((item) =>
    String(item?.genre || '').toLowerCase().includes('adventure')
    || (Array.isArray(item?.categories) && item.categories.some((cat) => String(cat).toLowerCase().includes('adventure')))
  )).slice(0, 12);
  const fantasyStories = dedupeStoriesById(displayStories.filter((item) =>
    String(item?.genre || '').toLowerCase().includes('fantasy')
    || (Array.isArray(item?.categories) && item.categories.some((cat) => String(cat).toLowerCase().includes('fantasy')))
  )).slice(0, 12);
  const scifiStories = dedupeStoriesById(displayStories.filter((item) =>
    ['sci', 'sf', 'space'].some((kw) => String(item?.genre || '').toLowerCase().includes(kw))
    || (Array.isArray(item?.categories) && item.categories.some((cat) => ['sci', 'sf', 'space'].some((kw) => String(cat).toLowerCase().includes(kw))))
  )).slice(0, 12);
  const thrillerStories = dedupeStoriesById(displayStories.filter((item) =>
    String(item?.genre || '').toLowerCase().includes('thriller')
    || (Array.isArray(item?.categories) && item.categories.some((cat) => String(cat).toLowerCase().includes('thriller')))
  )).slice(0, 12);
  const dramaStories = dedupeStoriesById(displayStories.filter((item) =>
    String(item?.genre || '').toLowerCase().includes('drama')
    || (Array.isArray(item?.categories) && item.categories.some((cat) => String(cat).toLowerCase().includes('drama')))
  )).slice(0, 12);
  const paranormalStories = dedupeStoriesById(displayStories.filter((item) =>
    String(item?.genre || '').toLowerCase().includes('paranormal')
    || (Array.isArray(item?.categories) && item.categories.some((cat) => String(cat).toLowerCase().includes('paranormal')))
  )).slice(0, 12);

  const heroSlides = displayStories.length
    ? displayStories.slice(0, 4).map((item, idx) => ({
        id: idx + 1,
        tag: idx === 0 ? '⭐ Recommended' : idx === 1 ? '🔥 Trending' : idx === 2 ? '📚 New Release' : '✨ Featured',
        title: `${item?.title || 'Story'} by <em>${item?.author_name || item?.author || 'Author'}</em>`,
        desc: item?.description || 'Discover your next binge-worthy story from the community.',
        bg: 'linear-gradient(135deg, #0a1a2e 0%, #1a0a2e 50%, #2e0a1a 100%)',
      }))
    : HERO_SLIDES;

  // Hero handlers
  const handlePrevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + heroSlides.length) % heroSlides.length);
  };

  const handleNextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % heroSlides.length);
  };

  const handleToggleGeek = (followKey) => {
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

  const hasOverflow = (key) => Boolean(sliderNav[key]?.left || sliderNav[key]?.right);

  const showContinueSection = isLoggedIn && continueReading.length > 0;
  const showReadingListSection = isLoggedIn && readingList.length > 0;

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

  const getStoryIdentity = (story, idx, prefix) => `${prefix}-${story?.id || story?._id || `story-${idx}`}-${idx}`;

  const storyCoverSrc = (story) => story?.image || story?.cover_image || '';

  const MIXED_PATTERN_BY_SECTION = {
    // Top picks: repeating single + 4-split cluster.
    recommended: [1, 4, 1, 4, 1, 4, 1, 4],
    // Community row: repeating 3-split + 4-split cluster.
    popular: [3, 4, 3, 4, 3, 4, 3, 4],
    newReleases: [3, 4, 3, 4, 1, 3, 4],
    trending: [3, 4, 3, 4, 3, 4, 1],
    // Bottom rails: mostly single cards, rare split clusters.
    romance: [1, 1, 1, 4, 1, 1, 3, 1],
    mystery: [1, 1, 1, 3, 1, 1, 4, 1],
    adventure: [1, 1, 1, 4, 1, 1, 3, 1],
    subscription: [1, 1, 1, 4, 1, 1, 3, 1],
  };

  const buildMixedStoryItems = (list, sectionKey = 'recommended') => {
    const source = Array.isArray(list) ? list : [];
    const pattern = MIXED_PATTERN_BY_SECTION[sectionKey] || MIXED_PATTERN_BY_SECTION.recommended;
    const items = [];
    let cursor = 0;
    let patternIndex = 0;

    while (cursor < source.length) {
      const remaining = source.length - cursor;
      const slot = pattern[patternIndex % pattern.length];
      patternIndex += 1;

      if (slot === 4 && remaining >= 4) {
        items.push({ type: 'cluster', variant: 'four', stories: source.slice(cursor, cursor + 4) });
        cursor += 4;
        continue;
      }

      if (slot === 3 && remaining >= 3) {
        items.push({ type: 'cluster', variant: 'three', stories: source.slice(cursor, cursor + 3) });
        cursor += 3;
        continue;
      }

      items.push({ type: 'single', story: source[cursor] });
      cursor += 1;
    }

    return items;
  };

  const renderSingleStoryCard = (story, idx, prefix, tone, isPremium = false) => (
    <div
      key={getStoryIdentity(story, idx, `${prefix}-single`)}
      className="bx-book-card bx-book-card-mixed"
      onClick={() => router.push(`/story/${story.id || story._id}`)}
    >
      <div className="bx-book-cover" style={{ backgroundColor: tone }}>
        {storyCoverSrc(story) ? (
          <img
            src={storyCoverSrc(story)}
            alt={story.title}
            loading="lazy"
            onError={(event) => {
              event.currentTarget.style.display = 'none';
              const fallback = event.currentTarget.parentElement?.querySelector('.bx-img-fallback');
              if (fallback) fallback.style.display = 'flex';
            }}
          />
        ) : null}
        <div className="bx-book-fallback bx-img-fallback" style={{ display: storyCoverSrc(story) ? 'none' : 'flex' }}>
          {story.title}
        </div>
        {isPremium ? <span className="bx-book-sub-badge">PRO</span> : null}
      </div>
      <h4 className="bx-book-title">{story.title}</h4>
      <p className="bx-book-author">{story.publisher || story.author_name || story.author || 'Unknown Author'}</p>
      <div className="bx-book-meta bx-book-meta-rich">
        <span>👁 {Number(story.views || 0).toLocaleString()}</span>
      </div>
    </div>
  );

  const renderClusterStoryCard = (item, itemIdx, prefix, tone, isPremium = false) => (
    <div
      key={`${prefix}-cluster-${item.variant}-${itemIdx}`}
      className={`bx-cluster-card bx-cluster-${item.variant}`}
    >
      <div className="bx-cluster-grid">
        {item.stories.map((story, storyIdx) => (
          <div
            key={getStoryIdentity(story, storyIdx, `${prefix}-cluster-item`)}
            className="bx-cluster-story"
            onClick={() => router.push(`/story/${story.id || story._id}`)}
          >
            <div className="bx-cluster-cover" style={{ backgroundColor: tone }}>
              {storyCoverSrc(story) ? (
                <img
                  src={storyCoverSrc(story)}
                  alt={story.title}
                  loading="lazy"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                    const fallback = event.currentTarget.parentElement?.querySelector('.bx-img-fallback');
                    if (fallback) fallback.style.display = 'flex';
                  }}
                />
              ) : null}
              <div className="bx-book-fallback bx-img-fallback" style={{ display: storyCoverSrc(story) ? 'none' : 'flex' }}>
                {story.title}
              </div>
              {isPremium ? <span className="bx-cluster-pro">PRO</span> : null}
              <div className="bx-cluster-meta">
                <h5 className="bx-cluster-title">{story.title}</h5>
                <p className="bx-cluster-author">{story.publisher || story.author_name || story.author || 'Unknown Author'}</p>
                <span className="bx-cluster-views">👁 {Number(story.views || 0).toLocaleString()}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const fmtViews = (n) => {
    const num = Number(n || 0);
    if (num >= 1e9) return (num / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(num);
  };

  const renderWpRow = (list, prefix) =>
    list.map((story, idx) => (
      <div
        key={getStoryIdentity(story, idx, prefix)}
        className="bx-book-card"
        onClick={() => router.push(`/story/${story.id || story._id}`)}
      >
        <div className="bx-book-cover">
          {storyCoverSrc(story) ? (
            <img
              src={storyCoverSrc(story)}
              alt={story.title}
              loading="lazy"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          ) : (
            <div className="bx-book-fallback">{story.title}</div>
          )}
        </div>
        <h4 className="bx-book-title">{story.title}</h4>
        <div className="bx-book-meta"><span>👁 {fmtViews(story.views)}</span></div>
      </div>
    ));

  const renderMixedStoryCards = (storiesList, sectionKey, tone, isPremium = false) => {
    const items = buildMixedStoryItems(storiesList, sectionKey);
    return items.map((item, idx) => {
      if (item.type === 'cluster') {
        return renderClusterStoryCard(item, idx, sectionKey, tone, isPremium);
      }
      return renderSingleStoryCard(item.story, idx, sectionKey, tone, isPremium);
    });
  };

  // Slide tag styles
  const slideTagClass = (idx) => {
    if (idx === 0) return 'wp-slide-tag wp-slide-tag-featured';
    if (idx === 1) return 'wp-slide-tag wp-slide-tag-editors';
    return 'wp-slide-tag wp-slide-tag-trending';
  };

  return (
    <main className="wp-home">
      {/* ───────────────────────────────────────────────────
          1. HERO SLIDESHOW (Wingsaga style)
      ─────────────────────────────────────────────────── */}
      <section style={{ marginTop: '8px' }}>
        <div className="wp-hero">
          {heroSlides.map((slide, idx) => {
            const story = getHeroStoryByIndex(idx);
            const coverSrc = story?.cover_image || story?.image || slide.localCover || '';
            return (
              <div
                key={slide.id}
                className={`wp-slide${idx === currentSlide ? ' active' : ''}`}
              >
                {coverSrc ? (
                  <img src={coverSrc} alt={slide.tag} />
                ) : (
                  <div style={{ width: '100%', height: '100%', background: slide.bg }} />
                )}
                <div className="wp-slide-overlay" />
                <div className="wp-slide-content">
                  <div className="wp-slide-inner">
                    <span className={slideTagClass(idx)}>{slide.tag}</span>
                    <h3 className="wp-slide-title" dangerouslySetInnerHTML={{ __html: slide.title }} />
                    <div className="wp-slide-stats">
                      {story?.avg_rating > 0 && (
                        <>
                          <div className="wp-slide-rating">
                            ★ {Number(story.avg_rating).toFixed(1)}
                          </div>
                          <div className="wp-slide-divider" />
                        </>
                      )}
                      {story?.views > 0 && (
                        <div className="wp-slide-views">
                          👁 {fmtViews(story.views)} Reads
                        </div>
                      )}
                    </div>
                    <p className="wp-slide-desc">{slide.desc}</p>
                    <button
                      className="wp-slide-btn"
                      onClick={() => {
                        const targetId = story?.id || story?._id;
                        if (targetId) router.push(`/story/${targetId}`);
                      }}
                    >
                      Start Reading
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Dots */}
          <div className="wp-slide-dots">
            {heroSlides.map((_, idx) => (
              <button
                key={idx}
                className={`wp-slide-dot${idx === currentSlide ? ' active' : ''}`}
                onClick={() => setCurrentSlide(idx)}
                aria-label={`Slide ${idx + 1}`}
              />
            ))}
          </div>

          {/* Prev / Next arrows */}
          <button className="wp-slide-arrow prev" onClick={handlePrevSlide} aria-label="Previous">‹</button>
          <button className="wp-slide-arrow next" onClick={handleNextSlide} aria-label="Next">›</button>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────
          2. SECRET OBSESSIONS
      ─────────────────────────────────────────────────── */}
      <div className="wp-section-new">
        <div className="wp-sec-header-new" onClick={() => router.push('/discover')}>
          <h2 className="wp-sec-title-new">Secret obsessions</h2>
          <span className="wp-sec-chevron">›</span>
        </div>
        <div className="wp-scroll-wrap">
          <button className="wp-carousel-arrow-new left" onClick={() => scrollCarousel(recommendedRef, 'left')}>‹</button>
          <div className="wp-scroll-row-new" ref={recommendedRef}>
            {recommendedStories.map((story, idx) => (
              <div
                key={getStoryIdentity(story, idx, 'secret')}
                className="wp-book-card-new"
                onClick={() => router.push(`/story/${story.id || story._id}`)}
              >
                <div className="wp-book-cover-new">
                  {storyCoverSrc(story) ? (
                    <img src={storyCoverSrc(story)} alt={story.title} loading="lazy"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  ) : (
                    <div className="wp-book-fallback-new">{story.title}</div>
                  )}
                  {idx % 3 === 0 && <span className="wp-badge-hot">Hot</span>}
                  {idx % 5 === 1 && <span className="wp-badge-new">New</span>}
                </div>
                <p className="wp-book-title-new">{story.title}</p>
                <p className="wp-book-meta-new">{story.genre} · {fmtViews(story.views)} reads</p>
                <div className="wp-tag-bar-new">
                  {(story.categories || []).slice(0, 2).map((tag) => (
                    <span key={tag} className="wp-tag-pill-new">#{tag}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button className="wp-carousel-arrow-new right" onClick={() => scrollCarousel(recommendedRef, 'right')}>›</button>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────
          3. TOP PICKS FOR YOU
      ─────────────────────────────────────────────────── */}
      <div className="wp-section-new">
        <div className="wp-sec-header-new" onClick={() => router.push('/discover')}>
          <h2 className="wp-sec-title-new">Top picks for you</h2>
          <span className="wp-sec-chevron">›</span>
        </div>
        <div className="wp-scroll-wrap">
          <button className="wp-carousel-arrow-new left" onClick={() => scrollCarousel(popularRef, 'left')}>‹</button>
          <div className="wp-scroll-row-new" ref={popularRef}>
            {popularStories.map((story, idx) => (
              <div
                key={getStoryIdentity(story, idx, 'toppick')}
                className="wp-book-card-new"
                onClick={() => router.push(`/story/${story.id || story._id}`)}
              >
                <div className="wp-book-cover-new">
                  {storyCoverSrc(story) ? (
                    <img src={storyCoverSrc(story)} alt={story.title} loading="lazy"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  ) : (
                    <div className="wp-book-fallback-new">{story.title}</div>
                  )}
                  {idx === 0 && <span className="wp-badge-hot">Hot</span>}
                  {idx % 4 === 3 && <span className="wp-badge-new">New</span>}
                  {/* reading progress bar for top picks */}
                  <div className="wp-reading-bar" style={{ width: `${30 + ((idx * 13) % 60)}%` }} />
                </div>
                <p className="wp-book-title-new">{story.title}</p>
                <p className="wp-book-meta-new">{story.genre} · {fmtViews(story.views)} reads</p>
              </div>
            ))}
          </div>
          <button className="wp-carousel-arrow-new right" onClick={() => scrollCarousel(popularRef, 'right')}>›</button>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────
          4. AD BANNER
      ─────────────────────────────────────────────────── */}
      <div style={{ marginTop: '20px' }}>
        <div className="wp-ad-banner-new">
          <div style={{ flex: 1 }}>
            <p className="wp-ad-label">Sponsored</p>
            <p className="wp-ad-title">Midterms? Ignored.</p>
            <p className="wp-ad-sub">Study dates that turn into something else..</p>
            <button className="wp-ad-btn" onClick={() => router.push('/discover')}>Read Now</button>
          </div>
          <div className="wp-ad-cover">
            <img src="/story-covers/4305a7ac-1647-4986-bb2c-8abca47a90b5.jpg" alt="Ad" loading="lazy"
              onError={(e) => { e.currentTarget.src = 'https://picsum.photos/seed/adbanner/140/210'; }} />
          </div>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────
          5. CONTINUE READING (logged-in only, new dark card style)
      ─────────────────────────────────────────────────── */}
      {showContinueSection && (
        <div className="wp-section-new">
          <div className="wp-sec-header-new">
            <h2 className="wp-sec-title-new">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#ff6a00" strokeWidth={2} style={{ flexShrink: 0 }}>
                <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
              </svg>
              Continue Reading
            </h2>
            <span className="wp-sec-see-all" onClick={() => router.push('/library')}>See all</span>
          </div>
          <div className="wp-scroll-wrap">
            <button className="wp-carousel-arrow-new left" onClick={() => scrollCarousel(continueRef, 'left')}>‹</button>
            <div className="wp-scroll-row-new" ref={continueRef}>
              {continueReading.map((story, idx) => {
                const progress = getDeterministicProgress(story, idx);
                return (
                  <div
                    key={`continue-wp-${idx}`}
                    className="wp-continue-card-new"
                    onClick={() => router.push(`/story/${story.id || story._id}`)}
                  >
                    <div className="wp-continue-thumb">
                      {story.cover_image || story.image ? (
                        <img src={story.cover_image || story.image} alt={story.title} loading="eager" />
                      ) : (
                        <div className="wp-book-fallback-new" style={{ fontSize: '9px' }}>{story.title}</div>
                      )}
                      <div className="wp-continue-progress" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="wp-continue-info">
                      <div>
                        <p className="wp-continue-title-new">{story.title}</p>
                        <p className="wp-continue-author-new">by {story.author_name || story.author || 'Unknown'}</p>
                        <p className="wp-continue-views-new">👁 {fmtViews(story.views)} views</p>
                      </div>
                      <div className="wp-continue-footer">
                        <span className="wp-continue-chapter">{story.chapter_id || 'Chapter 1'}</span>
                        <span className="wp-continue-time">{progress}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <button className="wp-carousel-arrow-new right" onClick={() => scrollCarousel(continueRef, 'right')}>›</button>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────
          6. BINGEABLE READS
      ─────────────────────────────────────────────────── */}
      <div className="wp-section-new">
        <div className="wp-sec-header-new" onClick={() => router.push('/discover?sort=new')}>
          <h2 className="wp-sec-title-new">Bingeable reads for you</h2>
          <span className="wp-sec-chevron">›</span>
        </div>
        <div className="wp-scroll-wrap">
          <button className="wp-carousel-arrow-new left" onClick={() => scrollCarousel(newReleasesRef, 'left')}>‹</button>
          <div className="wp-scroll-row-new" ref={newReleasesRef}>
            {newReleases.map((story, idx) => (
              <div
                key={getStoryIdentity(story, idx, 'binge')}
                className="wp-book-card-new"
                onClick={() => router.push(`/story/${story.id || story._id}`)}
              >
                <div className="wp-book-cover-new">
                  {storyCoverSrc(story) ? (
                    <img src={storyCoverSrc(story)} alt={story.title} loading="lazy"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  ) : (
                    <div className="wp-book-fallback-new">{story.title}</div>
                  )}
                </div>
                <p className="wp-book-title-new">{story.title}</p>
                <p className="wp-book-meta-new">{story.genre} · {fmtViews(story.views)} reads</p>
              </div>
            ))}
          </div>
          <button className="wp-carousel-arrow-new right" onClick={() => scrollCarousel(newReleasesRef, 'right')}>›</button>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────
          7. READING LISTS FROM THE COMMUNITY
      ─────────────────────────────────────────────────── */}
      <div className="wp-section-new">
        <div className="wp-sec-header-new" onClick={() => router.push('/discover')}>
          <h2 className="wp-sec-title-new">Reading Lists</h2>
          <span className="wp-sec-chevron">›</span>
        </div>
        <div className="wp-scroll-wrap">
          <button className="wp-carousel-arrow-new left" onClick={() => scrollCarousel(readingListRef, 'left')}>‹</button>
          <div className="wp-scroll-row-new" ref={readingListRef}>
            {(readingList.length > 0 ? readingList : popularStories.slice(0, 6)).map((story, idx) => {
              const geekKey = `rl-${story.id || story._id || idx}`;
              const tags = [['#slowburn','#drama'],['#romance','#family'],['#fantasy','#magic'],['#friends'],['#mafia'],['#alpha']];
              return (
                <div key={`rl-wp-${idx}`} className="wp-list-card-new"
                  onClick={() => router.push(`/story/${story.id || story._id}`)}
                >
                  <div className="wp-list-body">
                    <div className="wp-list-cover-row">
                      <div className="wp-list-thumb">
                        {storyCoverSrc(story) ? (
                          <img src={storyCoverSrc(story)} alt={story.title} loading="lazy"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                        ) : (
                          <div className="wp-book-fallback-new" style={{ fontSize: '9px' }}>{story.title}</div>
                        )}
                      </div>
                      <div className="wp-list-meta-col">
                        <p className="wp-list-title-new">{story.title}</p>
                        <p className="wp-list-user">{story.author_name || story.author || 'Reader'}</p>
                      </div>
                    </div>
                    <div className="wp-list-stats">
                      <span className="wp-list-count">{4 + idx} stories</span>
                      <span className="wp-list-reads">{fmtViews(story.views)} reads</span>
                    </div>
                    <div className="wp-tag-bar-new" style={{ marginBottom: '8px' }}>
                      {(tags[idx % tags.length]).map((t) => (
                        <span key={t} className="wp-tag-pill-new">{t}</span>
                      ))}
                    </div>
                    <button
                      className={`wp-geek-btn-new${followed.has(geekKey) ? ' geeking' : ''}`}
                      onClick={(e) => { e.stopPropagation(); handleToggleGeek(geekKey); }}
                    >
                      {followed.has(geekKey) ? 'Geeking' : 'Geek'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <button className="wp-carousel-arrow-new right" onClick={() => scrollCarousel(readingListRef, 'right')}>›</button>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────
          8. BROWSE BY CATEGORY
      ─────────────────────────────────────────────────── */}
      <div className="wp-section-new">
        <div className="wp-sec-header-new" onClick={() => router.push('/discover')}>
          <h2 className="wp-sec-title-new">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#ff6a00" strokeWidth={2} style={{ flexShrink: 0 }}>
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
            Browse by Category
          </h2>
          <span className="wp-sec-chevron">›</span>
        </div>
        <div className="wp-scroll-wrap">
          <button className="wp-carousel-arrow-new left" onClick={() => scrollCarousel(genresRef, 'left')}>‹</button>
          <div className="wp-scroll-row-new" ref={genresRef} style={{ gap: '10px' }}>
            {[
              { name: 'Romance',     count: '2.4M', img: '/story-covers/3afa73d3-a7fd-4461-94a2-f27ecb4f5ce5.jpg' },
              { name: 'Werewolf',    count: '890K', img: '/story-covers/35d59c07-2bd9-47d0-b626-b7427e456a1a.jpg' },
              { name: 'Teen Fiction',count: '1.1M', img: '/story-covers/1c6b14e2-33a5-4896-a1ea-a7087f9d2978.jpg' },
              { name: 'Vampire',     count: '456K', img: '/story-covers/4c4a664c-b1f0-4f0e-b698-aea3bfe370fb.jpg' },
              { name: 'Thriller',    count: '670K', img: '/story-covers/59d66543-1da3-471d-af95-6725f0299b73.jpg' },
              { name: 'Fantasy',     count: '1.3M', img: '/story-covers/6005008f-8a71-488e-a3cb-7338786e318b.jpg' },
              { name: 'Horror',      count: '340K', img: '/story-covers/69feb672-c82a-4a27-b674-73ee9381f97e.jpg' },
              { name: 'Dark Romance',count: '620K', img: '/story-covers/838a5bd1-9865-4b1d-a43f-d9031def487f.jpg' },
              { name: 'Sci-Fi',      count: '230K', img: '/story-covers/8a117e79-24fc-4545-b020-bd5d697e4a71.jpg' },
              { name: 'Mystery',     count: '510K', img: '/story-covers/94e1eac8-3c87-44ec-ab90-0e92680c768a.jpg' },
            ].map((cat) => (
              <div
                key={cat.name}
                className="wp-cat-card-new"
                onClick={() => router.push(`/discover?genre=${encodeURIComponent(cat.name.toLowerCase())}`)}
              >
                <img src={cat.img} alt={cat.name} loading="lazy"
                  onError={(e) => { e.currentTarget.src = `https://picsum.photos/seed/${cat.name}/210/280`; }} />
                <div className="wp-cat-label-new">
                  <span className="wp-cat-name-new">{cat.name}</span>
                  <span className="wp-cat-count-new">{cat.count}</span>
                </div>
              </div>
            ))}
          </div>
          <button className="wp-carousel-arrow-new right" onClick={() => scrollCarousel(genresRef, 'right')}>›</button>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────
          9. POPULAR IN WEREWOLF
      ─────────────────────────────────────────────────── */}
      <div className="wp-section-new">
        <div className="wp-sec-header-new" onClick={() => router.push('/discover?genre=werewolf')}>
          <h2 className="wp-sec-title-new">Popular in Werewolf</h2>
          <span className="wp-sec-chevron">›</span>
        </div>
        <div className="wp-scroll-wrap">
          <button className="wp-carousel-arrow-new left" onClick={() => scrollCarousel(romanceRef, 'left')}>‹</button>
          <div className="wp-scroll-row-new" ref={romanceRef}>
            {(werewolfStories.length > 0 ? werewolfStories : popularStories).map((story, idx) => (
              <div
                key={getStoryIdentity(story, idx, 'wolf')}
                className="wp-book-card-new"
                onClick={() => router.push(`/story/${story.id || story._id}`)}
              >
                <div className="wp-book-cover-new">
                  {storyCoverSrc(story) ? (
                    <img src={storyCoverSrc(story)} alt={story.title} loading="lazy"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  ) : (
                    <div className="wp-book-fallback-new">{story.title}</div>
                  )}
                  {idx === 0 && <span className="wp-badge-hot">Hot</span>}
                </div>
                <p className="wp-book-title-new">{story.title}</p>
                <p className="wp-book-meta-new">{story.genre} · {fmtViews(story.views)} reads</p>
              </div>
            ))}
          </div>
          <button className="wp-carousel-arrow-new right" onClick={() => scrollCarousel(romanceRef, 'right')}>›</button>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────
          10. TRENDING NOW
      ─────────────────────────────────────────────────── */}
      <div className="wp-section-new">
        <div className="wp-sec-header-new" onClick={() => router.push('/discover?sort=trending')}>
          <h2 className="wp-sec-title-new">Trending now 🔥</h2>
          <span className="wp-sec-chevron">›</span>
        </div>
        <div className="wp-scroll-wrap">
          <button className="wp-carousel-arrow-new left" onClick={() => scrollCarousel(trendingRef, 'left')}>‹</button>
          <div className="wp-scroll-row-new" ref={trendingRef}>
            {trendingStories.map((story, idx) => (
              <div
                key={getStoryIdentity(story, idx, 'trend')}
                className="wp-book-card-new"
                onClick={() => router.push(`/story/${story.id || story._id}`)}
              >
                <div className="wp-book-cover-new">
                  {storyCoverSrc(story) ? (
                    <img src={storyCoverSrc(story)} alt={story.title} loading="lazy"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  ) : (
                    <div className="wp-book-fallback-new">{story.title}</div>
                  )}
                  {idx === 0
                    ? <span className="wp-badge-rank">#1</span>
                    : idx < 5
                      ? <span className="wp-badge-rank-plain">#{idx + 1}</span>
                      : null
                  }
                </div>
                <p className="wp-book-title-new">{story.title}</p>
                <p className="wp-book-meta-new">{story.genre} · {fmtViews(story.views)} reads</p>
              </div>
            ))}
          </div>
          <button className="wp-carousel-arrow-new right" onClick={() => scrollCarousel(trendingRef, 'right')}>›</button>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────
          11. WINGSAGA PREMIUM
      ─────────────────────────────────────────────────── */}
      <div className="wp-section-new">
        <div className="wp-sec-header-new" onClick={() => router.push('/auth/signup')}>
          <h2 className="wp-sec-title-new">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#e0a800" style={{ flexShrink: 0 }}>
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            Wingsaga Premium
          </h2>
          <span className="wp-sec-chevron">›</span>
        </div>
        <div className="wp-scroll-wrap">
          <button className="wp-carousel-arrow-new left" onClick={() => scrollCarousel(subscriptionRef, 'left')}>‹</button>
          <div className="wp-scroll-row-new" ref={subscriptionRef}>
            {(subscriptionStories.length > 0 ? subscriptionStories : popularStories).map((story, idx) => (
              <div
                key={getStoryIdentity(story, idx, 'prem')}
                className="wp-prem-card-new"
                onClick={() => router.push(`/story/${story.id || story._id}`)}
              >
                <div className="wp-book-cover-new">
                  {storyCoverSrc(story) ? (
                    <img src={storyCoverSrc(story)} alt={story.title} loading="lazy"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  ) : (
                    <div className="wp-book-fallback-new">{story.title}</div>
                  )}
                  <span className="wp-badge-prem">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                    Premium
                  </span>
                </div>
                <p className="wp-book-title-new">{story.title}</p>
                <p className="wp-book-meta-new" style={{ fontSize: '9px' }}>
                  {story.genre} · {fmtViews(story.views)} reads
                </p>
              </div>
            ))}
          </div>
          <button className="wp-carousel-arrow-new right" onClick={() => scrollCarousel(subscriptionRef, 'right')}>›</button>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────
          12. HASHTAG SECTION
      ─────────────────────────────────────────────────── */}
      <div className="wp-section-new">
        <div className="wp-sec-header-new">
          <h2 className="wp-sec-title-new">
            <span style={{ color: 'var(--wp-orange)' }}>#</span>Hashtag
          </h2>
          <span className="wp-sec-see-all" onClick={() => router.push('/discover')}>See all</span>
        </div>
        <div className="wp-scroll-wrap">
          <button className="wp-carousel-arrow-new left" onClick={() => scrollCarousel(mysteryRef, 'left')}>‹</button>
          <div className="wp-scroll-row-new" ref={mysteryRef}>
            {[
              { tag: '#BadBoy',         count: '1.2K', keys: ['h1a','h1b','h1c'], gk: 'hash-badboy' },
              { tag: '#AlphaMate',      count: '3.4K', keys: ['h2a','h2b','h2c'], gk: 'hash-alphamate' },
              { tag: '#EnemiesToLovers',count: '890',  keys: ['h3a','h3b','h3c'], gk: 'hash-enemies' },
              { tag: '#DarkRomance',    count: '2.1K', keys: ['h4a','h4b','h4c'], gk: 'hash-darkromance' },
              { tag: '#SlowBurn',       count: '1.5K', keys: ['h5a','h5b','h5c'], gk: 'hash-slowburn' },
              { tag: '#Mafia',          count: '980',  keys: ['h6a','h6b','h6c'], gk: 'hash-mafia' },
            ].map((item) => (
              <div
                key={item.tag}
                className="wp-hash-card-new"
                onClick={() => router.push(`/discover?q=${encodeURIComponent(item.tag)}`)}
              >
                <div className="wp-hash-covers">
                  {item.keys.map((k, i) => (
                    <div key={k} className="wp-hash-cover" style={{ zIndex: 3 - i }}>
                      <img
                        src={`https://picsum.photos/seed/${k}/96/144`}
                        alt=""
                        loading="lazy"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    </div>
                  ))}
                </div>
                <p className="wp-hash-name-new">{item.tag}</p>
                <p className="wp-hash-count">{item.count} stories</p>
                <button
                  className={`wp-geek-btn-new${followed.has(item.gk) ? ' geeking' : ''}`}
                  onClick={(e) => { e.stopPropagation(); handleToggleGeek(item.gk); }}
                >
                  {followed.has(item.gk) ? 'Geeking' : 'Geek'}
                </button>
              </div>
            ))}
          </div>
          <button className="wp-carousel-arrow-new right" onClick={() => scrollCarousel(mysteryRef, 'right')}>›</button>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────
          13. STATS SECTION — UNCHANGED
      ─────────────────────────────────────────────────── */}
      <section className="bx-stats">
        <div className="bx-stat">
          <span className="bx-stat-icon">✦</span>
          <span className="bx-stat-num"><span>12M+</span></span>
          <span className="bx-stat-label">Stories Published</span>
        </div>
        <div className="bx-stat">
          <span className="bx-stat-icon">◉</span>
          <span className="bx-stat-num"><span>450K+</span></span>
          <span className="bx-stat-label">Active Readers</span>
        </div>
        <div className="bx-stat">
          <span className="bx-stat-icon">◆</span>
          <span className="bx-stat-num"><span>195</span></span>
          <span className="bx-stat-label">Countries</span>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────
          14. BROWSE GENRES — UNCHANGED
      ─────────────────────────────────────────────────── */}
      <section className="bx-section">
        <div className="bx-sec-header">
          <h2 className="bx-sec-title">Browse Genres</h2>
        </div>
        <div className={`bx-carousel ${hasOverflow('genres') ? 'has-overflow' : 'no-overflow'}`}>
          <button className="bx-carousel-arrow left" onClick={() => scrollCarousel(genresRef, 'left')} disabled={isArrowDisabled('genres', 'left')}>‹</button>
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
          <button className="bx-carousel-arrow right" onClick={() => scrollCarousel(genresRef, 'right')} disabled={isArrowDisabled('genres', 'right')}>›</button>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────
          15. CTA BANNER — UNCHANGED
      ─────────────────────────────────────────────────── */}
      <section className="bx-section bx-section-cta">
        <div className="bx-cta-banner">
          <h2 style={{ color: '#ffffff' }}>Your story deserves to be heard</h2>
          <p style={{ color: '#ffffff' }}>
            Join thousands of authors sharing their creative works with the world. Start writing today
            and connect with millions of readers.
          </p>
          <div className="bx-cta-btns">
            <button
              className="bx-btn-primary"
              onClick={() => router.push(readToken() ? '/write' : '/auth/signin?next=%2Fwrite')}
              style={{ background: 'var(--gold)', color: '#0d0d12', padding: '11px 28px' }}
            >
              Start Writing
            </button>
            <button
              className="bx-btn-ghost"
              onClick={() => router.push('/discover')}
              style={{ border: '1px solid rgba(201,169,110,0.3)', color: '#fff', padding: '11px 28px' }}
            >
              Explore Stories
            </button>
          </div>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────
          16. MOBILE BOTTOM NAV
      ─────────────────────────────────────────────────── */}
      <nav className="wp-bottom-nav-new">
        <div className="wp-bottom-nav-inner">
          <button className="wp-nav-btn-new active" onClick={() => router.push('/')}>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <span>Home</span>
          </button>
          <button className="wp-nav-btn-new" onClick={() => router.push('/discover')}>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <span>Explore</span>
          </button>
          <button className="wp-nav-btn-new" onClick={() => router.push('/library')}>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
            </svg>
            <span>Library</span>
          </button>
          <button className="wp-nav-btn-new" onClick={() => router.push(isLoggedIn ? '/profile' : '/auth/signin')}>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span>Profile</span>
          </button>
        </div>
      </nav>

      {toast && <div className="bx-toast show">{toast}</div>}
    </main>
  );
}
