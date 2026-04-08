'use client';

import { useRouter } from 'next/navigation';
import { readToken } from '@/lib/api';

const COVER_PALETTES = [
  'linear-gradient(160deg,#1a0a2e,#3d1a5e)',
  'linear-gradient(160deg,#0a1628,#1a3060)',
  'linear-gradient(160deg,#1a0a10,#5e1a2e)',
  'linear-gradient(160deg,#0a1a0a,#1a3c1a)',
  'linear-gradient(160deg,#1a140a,#5e3c0a)',
  'linear-gradient(160deg,#0a1a1a,#0a4040)',
];

function palette(seed) {
  return COVER_PALETTES[Math.abs(Number(seed) || 0) % COVER_PALETTES.length];
}

export default function StoryCard({ story, index = 0, onClick }) {
  const router = useRouter();
  const isPremium = !!story?.is_premium;
  const rating = Number(story?.avg_rating || 0);
  const genre = String(story?.genre || story?.categories?.[0] || "Fiction");

  function handleClick() {
    if (isPremium && !readToken()) {
      router.push(`/auth/signin?next=${encodeURIComponent(`/story/${story._id || story.id}`)}`);
      return;
    }

    if (onClick) {
      onClick(story);
      return;
    }
    router.push(`/story/${story._id || story.id}`);
  }

  return (
    <div className="bx-book-card" onClick={handleClick}>
      <div className="bx-book-cover">
        {story.cover_image ? (
          <img src={story.cover_image} alt={story.title} loading="eager" />
        ) : (
          <div className="bx-book-fallback" style={{ background: palette(story._id || story.id || index) }}>
            {story.title}
          </div>
        )}
        <div className="bx-book-overlay" />
        <div className="bx-book-top-meta">
          <span className="bx-book-genre-pill">{genre}</span>
          {rating > 0 ? <span className="bx-book-rating-pill">{rating.toFixed(1)} ★</span> : null}
        </div>
        {isPremium && <span className="bx-book-premium">PRO</span>}
        {isPremium && <div className="bx-book-locked">Premium</div>}
        <span className="bx-book-cta">Read Story</span>
      </div>
      <div className="bx-book-title">{story.title}</div>
      <div className="bx-book-author">{story.publisher || story.author_name || story.author || 'Unknown Author'}</div>
      <div className="bx-book-meta bx-book-meta-rich">
        <span>{Number(story.views || 0).toLocaleString()} views</span>
      </div>
    </div>
  );
}