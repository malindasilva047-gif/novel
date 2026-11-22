import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import BookCard from "../components/BookCard";
import Shelf from "../components/Shelf";
import { getBootstrap } from "../api";

function collectBooks(boot) {
  if (!boot) return [];
  const map = new Map();
  const add = (arr) => {
    (arr || []).forEach((b) => {
      if (b?.id != null) map.set(String(b.id), b);
    });
  };
  add(boot.books);
  add(boot.trending);
  add(boot.featured);
  add(boot.recently_updated);
  if (Array.isArray(boot.sections)) boot.sections.forEach((s) => add(s.books || s.items));
  return [...map.values()];
}

export default function GalateaPage() {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBootstrap()
      .then((b) => setBooks(collectBooks(b)))
      .catch(() => setBooks([]))
      .finally(() => setLoading(false));
  }, []);

  const top = useMemo(
    () => [...books].sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0)).slice(0, 16),
    [books]
  );

  return (
    <div className="galatea-page">
      <section className="galatea-hero">
        <div className="galatea-hero-inner">
          <p className="galatea-kicker">PREMIUM COLLECTION</p>
          <h1>Galatea Stories</h1>
          <p className="lead">
            Curated reads from the same Wingsaga catalog — romance, fantasy, and more. Full chapters
            stay on Wingsaga; this shelf highlights standout titles.
          </p>
          <Link className="btn btn-primary" to="/">
            Explore Free Books
          </Link>
        </div>
      </section>

      {loading ? (
        <div className="container page">Loading…</div>
      ) : (
        <>
          <Shelf title="Galatea Picks" books={top} seeAllTo="/" />
          <div className="container page">
            <h2>Newest collections</h2>
            <div className="collection-links">
              {["Friendship", "Dark", "Magic", "Love Story", "Supernatural", "Romance/Drama"].map(
                (name) => (
                  <Link key={name} to={`/genres/${encodeURIComponent(name)}`}>
                    {name}
                  </Link>
                )
              )}
            </div>
            <div className="audiobook-grid" style={{ marginTop: 24 }}>
              {top.map((b) => (
                <BookCard key={b.id} book={b} variant="shelf" />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
