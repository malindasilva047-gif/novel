import { Link } from "react-router-dom";
import ArrowCarousel from "./ArrowCarousel";
import BookCard from "./BookCard";
import StoryCardPack from "./StoryCardPack";

/** Responsive story grid with an optional horizontal carousel. */
export default function TrendingGrid({ title = "Trending Stories", subtitle = "", books = [], seeAllTo = "/", carousel = false, ranked = false, onRefresh, refreshing = false, deferUntilVisible = false }) {
  if (!books.length && !onRefresh) return null;
  const recommended = /recommended for you/i.test(title);
  const newRelease = /new releases?/i.test(title);
  const inkittCards = carousel && !recommended && !newRelease;

  return (
    <section className={`trending-section full-bleed${carousel ? " trending-section--carousel" : ""}${recommended ? " trending-section--recommended" : ""}${newRelease ? " trending-section--new-release" : ""}${inkittCards ? " trending-section--inkitt-cards" : ""}${ranked ? " trending-section--ranked" : ""}`}>
      <div className="full-bleed-inner">
        <div className="trending-header">
          <div className="trending-heading-copy"><h2 className="trending-title">{title}</h2>{subtitle ? <p className="trending-subtitle">{subtitle}</p> : null}</div>
          <div className="trending-header-actions">
            {onRefresh ? <button type="button" className="trending-refresh" onClick={onRefresh} disabled={refreshing} aria-busy={refreshing}><span aria-hidden="true">↻</span>{refreshing ? "Refreshing…" : "Refresh"}</button> : null}
            {seeAllTo ? <Link to={seeAllTo} className="trending-see-all">See all</Link> : null}
          </div>
        </div>
        {books.length ? (
          recommended && books.length >= 5 ? (
            <ArrowCarousel
              className="recommended-bento-track"
              itemClassName="recommended-bento-item"
              label={`${title} stories`}
              edgeGlow
              deferUntilVisible={deferUntilVisible}
              deferHeight={340}
            >
              {Array.from({ length: Math.floor(books.length / 5) }, (_, index) => {
                const pack = books.slice(index * 5, index * 5 + 5);
                return <StoryCardPack key={pack[0]?.id} books={pack} layout="bento" label={`${title} group ${index + 1}`} coverOnly />;
              })}
            </ArrowCarousel>
          ) : carousel ? (
            <ArrowCarousel
              className={`trending-grid trending-grid--carousel${ranked ? " trending-grid--ranked" : ""}`}
              itemClassName={`trending-cell home-story-card-slot${inkittCards ? " home-story-card-slot--inkitt" : ""}`}
              label={title}
              edgeGlow={!inkittCards}
              stepByItem={inkittCards}
              carouselClassName={inkittCards ? "arrow-carousel--inkitt-stories" : ""}
              deferUntilVisible={deferUntilVisible}
            >
              {books.map((book) => <BookCard key={book.id} book={book} variant="shelf" inkittStyle={inkittCards} />)}
            </ArrowCarousel>
          ) : (
            <div className="trending-grid">
              {books.map((book) => (
                <div key={book.id} className="trending-cell home-story-card-slot">
                  <BookCard book={book} variant="shelf" />
                </div>
              ))}
            </div>
          )
        ) : <p className="trending-empty">No stories to show yet. Refresh to check again.</p>}
      </div>
    </section>
  );
}
