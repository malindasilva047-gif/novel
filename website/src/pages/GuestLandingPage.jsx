import { useEffect, useMemo, useRef } from "react";
import { resolveAssetUrl } from "../api";

export default function GuestLandingPage({ stories = [], genres = [], stats = {}, error = "", loading = false }) {
  const frameRef = useRef(null);
  const landingData = useMemo(() => ({
    stories: (Array.isArray(stories) ? stories : []).filter((story) => story?.id != null).slice(0, 24).map((story) => ({
      id: story.id,
      title: story.title || "Untitled story",
      author: story.author || "Wingsaga author",
      genre: story.primary_genre || story.genre || story.secondary_genre || "Stories",
      cover: resolveAssetUrl(story.cover_path || story.coverPath || ""),
      accent: story.accent_hex || "#16785F",
      rating: story.rating,
      views: story.view_count || story.read_count || story.views || 0,
      completed: story.is_completed === true || Number(story.is_completed) === 1,
    })),
    genres: [...new Set((Array.isArray(genres) ? genres : []).map((genre) => String(genre || "").trim()).filter(Boolean))].slice(0, 24),
    stats: {
      stories: Number(stats?.stories) || 0,
      writers: Number(stats?.writers) || 0,
      comments: Number(stats?.comments) || 0,
    },
    error: Boolean(error),
    loading: Boolean(loading),
  }), [stories, genres, stats, error, loading]);

  useEffect(() => {
    frameRef.current?.contentWindow?.postMessage(
      { type: "novelhub:landing-data", payload: landingData },
      window.location.origin,
    );
  }, [landingData]);

  function sendLandingData() {
    frameRef.current?.contentWindow?.postMessage(
      { type: "novelhub:landing-data", payload: landingData },
      window.location.origin,
    );
  }

  return (
    <iframe
      ref={frameRef}
      className="guest-landing-reference"
      src="/novelhub-before-auth.html"
      title="Wingsaga stories and community"
      onLoad={sendLandingData}
    />
  );
}
