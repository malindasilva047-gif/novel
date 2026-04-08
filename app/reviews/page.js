'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest } from '@/lib/api';

const FALLBACK_REVIEWS = [
  {
    id: 'r-1',
    user: 'Sophie L.',
    story_id: 'demo-story-coral-kingdom',
    story_title: 'Coral Kingdom Archive',
    content: 'A masterpiece with beautiful pacing and vivid characters. Could not stop reading.',
    created_at: '2026-01-10T12:00:00Z',
  },
  {
    id: 'r-2',
    user: 'Thomas K.',
    story_id: 'demo-story-clockwork-heart',
    story_title: 'Clockwork Heartline',
    content: 'Great twists and very cinematic scenes. The ending was excellent.',
    created_at: '2026-01-08T12:00:00Z',
  },
  {
    id: 'r-3',
    user: 'Maya P.',
    story_id: 'demo-story-sky-garden',
    story_title: 'The Last Sky Garden',
    content: 'Smart world building and emotional beats. Highly recommended.',
    created_at: '2026-01-05T12:00:00Z',
  },
];

function formatRelativeDate(isoDate) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return 'recently';
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 30) return `${diffDays} days ago`;
  const months = Math.floor(diffDays / 30);
  if (months === 1) return '1 month ago';
  return `${months} months ago`;
}

export default function ReviewsPage() {
  const router = useRouter();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadReviews() {
      try {
        const storiesResponse = await apiRequest('/stories/?limit=8&skip=0&sort_by=popular').catch(() => ({ stories: [] }));
        const stories = Array.isArray(storiesResponse) ? storiesResponse : storiesResponse?.stories || [];

        if (!stories.length) {
          setReviews(FALLBACK_REVIEWS);
          return;
        }

        const commentBatches = await Promise.all(
          stories.map(async (story) => {
            const storyId = story?.id || story?._id;
            if (!storyId) return [];
            const comments = await apiRequest(`/engagement/stories/${storyId}/comments`).catch(() => []);
            const list = Array.isArray(comments) ? comments : [];
            return list.slice(0, 4).map((comment, idx) => ({
              id: comment.id || comment._id || `${storyId}-comment-${idx}`,
              user: comment.user_id || 'Reader',
              story_id: storyId,
              story_title: story.title || 'Story',
              content: comment.content || '',
              created_at: comment.created_at || new Date().toISOString(),
            }));
          })
        );

        const merged = commentBatches.flat().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        setReviews(merged.length ? merged : FALLBACK_REVIEWS);
      } finally {
        setLoading(false);
      }
    }

    loadReviews();
  }, []);

  const grouped = useMemo(() => reviews.slice(0, 60), [reviews]);

  return (
    <main style={{ minHeight: '100vh' }}>
      <section className="bx-section">
        <div style={{ marginBottom: '24px' }}>
          <h1 className="bx-sec-title serif" style={{ fontSize: 'clamp(28px,5vw,42px)', marginBottom: '6px' }}>All Reviews</h1>
          <p style={{ color: 'var(--muted)', fontSize: '14px' }}>Reader feedback across the most active stories.</p>
        </div>

        {loading ? (
          <div style={{ color: 'var(--muted)', fontSize: '14px' }}>Loading reviews...</div>
        ) : grouped.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: '14px' }}>No reviews yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: '12px' }}>
            {grouped.map((review) => (
              <article
                key={review.id}
                style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px', background: 'var(--surface)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                  <div style={{ fontSize: '13px', color: 'var(--text)' }}>
                    <strong>{review.user}</strong> on{' '}
                    <button
                      className="bx-btn-link"
                      onClick={() => router.push(`/read/${review.story_id}`)}
                      style={{ border: 'none', background: 'none', color: 'var(--gold)', cursor: 'pointer', padding: 0 }}
                    >
                      {review.story_title}
                    </button>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{formatRelativeDate(review.created_at)}</div>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.6 }}>{review.content}</div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
