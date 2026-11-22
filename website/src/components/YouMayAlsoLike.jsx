import { useEffect, useState } from "react";
import Shelf from "./Shelf";
import { getRecommendations, getStoryRecommendations } from "../api";

function recommendationsFrom(data, excludeId) {
  const seen = new Set([String(excludeId || "")]);
  return (Array.isArray(data?.items) ? data.items : []).filter((book) => {
    const id = book?.id;
    if (!id || seen.has(String(id))) return false;
    seen.add(String(id));
    return true;
  }).slice(0, 6);
}

export default function YouMayAlsoLike({ excludeId, title = "You may also like", compact = false }) {
  const [books, setBooks] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const request = excludeId
      ? getStoryRecommendations(excludeId)
      : getRecommendations();
    request.then((data) => {
      if (!cancelled) setBooks(recommendationsFrom(data, excludeId));
    }).catch(() => {
      if (!cancelled) setBooks([]);
    });
    return () => { cancelled = true; };
  }, [excludeId]);

  if (!books.length) return null;
  return <Shelf className={`recommendations-shelf${compact ? " recommendations-shelf--compact" : ""}`} title={title} books={books} seeAllTo="/" seeAllLabel="Browse stories →" />;
}
