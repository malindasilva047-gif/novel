import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAudiobooks } from "../api";

export default function AudiobooksPage() {
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setCatalog(await getAudiobooks());
    } catch (loadError) {
      setError(loadError?.message || "Could not check audiobook availability.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const items = Array.isArray(catalog?.items) ? catalog.items : [];
  const available = Boolean(catalog?.available);

  return (
    <main className="audio-page page-shell">
      <section className="audio-placeholder">
        <span className="eyebrow">AUDIO EDITIONS</span>
        <h1>{loading ? "Checking audio editions…" : available ? "Listen to a story." : "Audio is still in the works."}</h1>
        <p>
          {error
            ? error
            : catalog?.message ||
              (available
                ? "Explore the audiobook editions available in the Wingsaga catalog."
                : "Wingsaga does not have playable audio editions yet. Explore the written catalog while we build this feature around real recordings.")}
        </p>
        {error ? (
          <button className="btn btn-primary" type="button" onClick={load} disabled={loading}>
            {loading ? "Checking…" : "Try again"}
          </button>
        ) : null}
        {!error && !loading && available && items.length ? (
          <div className="audio-edition-list">
            {items.map((item) => (
              <Link key={item.id} className="audio-edition-link" to={`/stories/${item.book_id || item.story_id || item.id}`}>
                {item.title || item.book_title || "Listen to story"}
              </Link>
            ))}
          </div>
        ) : null}
        {!error ? (
          <Link className="btn btn-primary" to="/genres/Stories">
            Explore stories <span aria-hidden="true">→</span>
          </Link>
        ) : null}
      </section>
    </main>
  );
}
