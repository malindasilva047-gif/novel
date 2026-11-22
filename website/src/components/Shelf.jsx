import { Link } from "react-router-dom";
import ArrowCarousel from "./ArrowCarousel";
import BookCard from "./BookCard";

export default function Shelf({ title, books = [], seeAllTo, seeAllLabel = "View All →", className = "", inkittStyle = false, deferUntilVisible = false }) {
  if (!books.length) return null;

  return (
    <section className={`shelf shelf--inkitt ${className}`.trim()}>
      <div className="shelf-inner">
        <div className="shelf-header">
          <h2>{title}</h2>
          <div className="shelf-actions">
            {seeAllTo ? (
              <Link to={seeAllTo} className="see-all">
                {seeAllLabel}
              </Link>
            ) : null}
          </div>
        </div>
        <div className="shelf-track-wrap">
          <ArrowCarousel
            className="shelf-track"
            itemClassName={`shelf-item home-story-card-slot${inkittStyle ? " home-story-card-slot--inkitt" : ""}`}
            label={`${title} stories`}
            previousLabel={`Previous ${title} stories`}
            nextLabel={`Next ${title} stories`}
            edgeGlow={!inkittStyle}
            stepByItem={inkittStyle}
            carouselClassName={inkittStyle ? "arrow-carousel--inkitt-stories" : ""}
            deferUntilVisible={deferUntilVisible}
          >
            {books.map((b) => (
              <BookCard key={b.id} book={b} variant="shelf" inkittStyle={inkittStyle} />
            ))}
          </ArrowCarousel>
        </div>
      </div>
    </section>
  );
}
