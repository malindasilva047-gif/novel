import BookCard from "./BookCard";
import { Link } from "react-router-dom";

const PACK_SIZES = {
  bento: 5,
  "three-pack": 3,
  "four-pack": 4,
  "single-feature": 1,
};

function genreOf(book) {
  return book.secondary_genre || book.genre || book.primary_genre || "Story";
}

function viewsOf(book) {
  const views = Number(book.view_count || book.read_count || book.reads || 0);
  return views ? `${views.toLocaleString()} ${views === 1 ? "view" : "views"}` : "New";
}

function statusOf(book) {
  const status = String(book.publication_status || book.status || book.work_status || book.status_text || "");
  const completed = book.is_completed === true
    || Number(book.is_completed) === 1
    || /complete|finished/i.test(status);
  return completed ? "Completed" : "Ongoing";
}

export default function StoryCardPack({ books = [], layout = "four-pack", label, coverOnly = false }) {
  if (!books.length) return null;

  if (layout === "single-feature" || (layout === "bento" && books.length === 1)) {
    return (
      <div className="story-card-pack story-card-pack--single-feature" role="group" aria-label={label}>
        <BookCard book={books[0]} variant="shelf" />
      </div>
    );
  }

  const partialBento = layout === "bento" && books.length < PACK_SIZES.bento
    ? ` story-card-pack--partial-${books.length}`
    : "";
  const renderCaption = (book) => (
    <span className="story-pack-caption">
      <strong>{book.title || "Untitled story"}</strong>
      <small>{book.author ? `by ${book.author}` : "Wingsaga author"}</small>
      <span className="story-pack-details">
        <Link to={`/genres/${encodeURIComponent(genreOf(book))}`} onClick={(event) => event.stopPropagation()}>{genreOf(book)}</Link>
        <small>{viewsOf(book)}</small>
      </span>
      <span className={`story-pack-status${statusOf(book) === "Completed" ? " story-pack-status--completed" : ""}`}>
        {statusOf(book)}
      </span>
    </span>
  );

  return (
    <div className={`story-card-pack story-card-pack--${layout}${partialBento}`} role="group" aria-label={label}>
      {books.slice(0, PACK_SIZES[layout] || PACK_SIZES["four-pack"]).map((book, index) => (
        <div className={`story-pack-tile story-pack-tile--${index}`} key={book.id || book.title}>
          <BookCard
            book={book}
            variant="mini"
            coverOverlay={coverOnly ? null : renderCaption(book)}
            showRating={!coverOnly}
          />
        </div>
      ))}
    </div>
  );
}
