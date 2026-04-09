export const GENRES = [
  { name: 'Fantasy', icon: '🧙‍♂️', color: '#a3cef1' },
  { name: 'Sci-Fi', icon: '🚀', color: '#f9d923' },
  { name: 'Romance', icon: '💖', color: '#ffb4a2' },
  { name: 'Mystery', icon: '🕵️‍♀️', color: '#b5ead7' },
  { name: 'Adventure', icon: '🏔️', color: '#f7a072' },
  { name: 'Horror', icon: '👻', color: '#cdb4db' },
  { name: 'Drama', icon: '🎭', color: '#f28482' },
  { name: 'Comedy', icon: '😂', color: '#ffd6a5' },
  { name: 'Historical', icon: '🏺', color: '#b0a8b9' },
  { name: 'Thriller', icon: '🔪', color: '#bdb2ff' },
  { name: 'Non-Fiction', icon: '📚', color: '#caff70' },
];
export const MOCK_REVIEWS = [
  {
    id: 1,
    user: 'Alice',
    avatar: '🦉',
    book: 'City of Neon Monsoon',
    rating: 5,
    text: 'Absolutely loved the world-building and characters! Highly recommended.',
    date: '2026-04-01',
    bg: '#f9d923',
  },
  {
    id: 2,
    user: 'Bob',
    avatar: '🐉',
    book: 'Whispers in the Mango Forest',
    rating: 4,
    text: 'A magical journey with twists and turns. Great read!',
    date: '2026-03-28',
    bg: '#a3cef1',
  },
  {
    id: 3,
    user: 'Carol',
    avatar: '🦄',
    book: 'Letters from a Paper Moon',
    rating: 5,
    text: 'Heartfelt and beautifully written. Couldn’t put it down.',
    date: '2026-03-15',
    bg: '#ffb4a2',
  },
];
export const spotlightStories = [
  {
    id: "s1",
    title: "City of Neon Monsoon",
    genre: "Sci-Fi",
    image:
      "https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=1300&q=80",
    likes: 1984,
    chapters: 34
  },
  {
    id: "s2",
    title: "Whispers in the Mango Forest",
    genre: "Fantasy",
    image:
      "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1300&q=80",
    likes: 1567,
    chapters: 18
  },
  {
    id: "s3",
    title: "Letters from a Paper Moon",
    genre: "Romance",
    image:
      "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=1300&q=80",
    likes: 2301,
    chapters: 42
  },
  {
    id: "s4",
    title: "Ashes of the Golden Throne",
    genre: "Epic",
    image:
      "https://images.unsplash.com/photo-1464863979621-258859e62245?auto=format&fit=crop&w=1300&q=80",
    likes: 3110,
    chapters: 55
  }
];

export const featureCards = [
  {
    title: "Writer Studio",
    text: "Craft chapters with autosave drafts, tags, category control, and cinematic cover uploads."
  },
  {
    title: "Reader Galaxy",
    text: "Bookmark, react, comment, and jump across chapters with immersive reading history."
  },
  {
    title: "Discovery Engine",
    text: "Trending, latest, category filters, and blazing search to find your next obsession."
  },
  {
    title: "Creator Badges",
    text: "Unlock visual badges from first story to verified writer and top-author milestones."
  }
];

export const adSlots = [
  "Homepage footer banner",
  "Between story list slots",
  "End-of-chapter banner",
  "No popups, no auto-play videos"
];
