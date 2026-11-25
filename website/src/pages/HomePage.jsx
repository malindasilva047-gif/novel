import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import Shelf from "../components/Shelf";
import TrendingGrid from "../components/TrendingGrid";
import ArrowCarousel from "../components/ArrowCarousel";
import ReadingListsRow from "../components/ReadingListsRow";
import ImageCarousel from "../components/ImageCarousel";
import BookCard from "../components/BookCard";
import DiscoverStorySections from "../components/DiscoverStorySections";
import { usePageMeta } from "../components/PageMeta";
import { getBootstrap, getBookChapters, getContests, getGenreStoryCounts, getGenres, getHomeHeroImages, getLibrary, getPublicLandingStats, getPublicReadingLists, getPublicReviews, getRecommendations, getTagBooks, getTags, getToken, resolveAssetUrl, saveLibraryProgress, saveSearchHistory, searchStories, searchUsers } from "../api";
import { isGuestUser } from "../utils/guest";
import GuestLandingPage from "./GuestLandingPage";
import { getReadingProgressPercent } from "../utils/readingProgress";

const GENRE_SHELVES = [
  "Contemporary Romance",
  "Dark Romance",
  "Thriller",
  "Sci-Fi",
  "LGBTQ+",
  "Werewolves & Shifters",
  "Fantasy",
  "Horror",
];

const HOME_HERO_SLIDES = [
  { image: "/assets/hero-romance-moon.jpg", genre: "Romance", kicker: "WELCOME TO WINGSAGA", title: "Find Your Next Great Story", description: "Read, write, and be part of a global community of passionate storytellers.", to: "/", linkLabel: "Explore Stories" },
  { image: "/assets/story-purple-moon.jpg", genre: "Fantasy", kicker: "A WORLD BEYOND THE PAGE", title: "Step Into Another World", description: "Find unforgettable characters, new adventures, and stories to follow.", to: "/genres/Fantasy", linkLabel: "Explore Fantasy" },
  { image: "/assets/story-gothic-castle.jpg", genre: "Mystery", kicker: "YOUR NEXT FAVORITE AWAITS", title: "Every Story Starts Somewhere", description: "Meet new authors and find the stories readers cannot stop talking about.", to: "/", linkLabel: "Start Exploring" },
];

const GUEST_HIGHLIGHTS = [
  {
    icon: "✦",
    title: "Find new voices",
    description: "Browse stories from emerging authors and find a world that feels made for you.",
    to: "/",
    linkLabel: "Explore stories",
  },
  {
    icon: "♡",
    title: "Keep your favourites close",
    description: "Save the stories and authors you love so every visit starts exactly where you left off.",
    to: "/login",
    linkLabel: "Join for free",
  },
  {
    icon: "✎",
    title: "Share your story",
    description: "Turn the ideas in your head into the next story readers cannot put down.",
    to: "/write",
    linkLabel: "Start writing",
  },
];

function collectBooks(boot) {
  if (!boot) return [];
  const map = new Map();
  const add = (value, sectionName = "") => {
    const items = Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
    items.forEach((b) => {
      const title = String(b?.title || "").trim();
      if (b && b.id != null && Number(b.id) > 0 && title && !/^no featured story available$/i.test(title)) {
        const key = String(b.id);
        const existing = map.get(key);
        const sectionNames = [...new Set([
          ...(existing?.section_names || []),
          existing?.section_name,
          ...(Array.isArray(b.section_names) ? b.section_names : []),
          b.section_name,
          sectionName,
        ].map((name) => String(name || "").trim().toLowerCase()).filter(Boolean))];
        map.set(key, {
          ...existing,
          ...b,
          section_name: b.section_name || existing?.section_name || sectionName,
          section_names: sectionNames,
        });
      }

    });
  };
  add(boot.books);
  add(boot.trending, "trending");
  add(boot.discover_books);
  add(boot.recently_updated, "recently_updated");
  add(boot.recently_completed, "recently_completed");
  add(boot.featured, "featured");
  add(boot.featured_book, "featured");
  add(boot.recommendations);
  if (Array.isArray(boot.sections)) {
    boot.sections.forEach((s) => {
      const sectionName = s.name || s.title || "";
      const items = (s.books || s.items || []).map((book) => ({
        ...book,
        section_name: book.section_name || sectionName,
      }));
      add(items);
    });
  }
  if (boot.categories && typeof boot.categories === "object") {
    Object.values(boot.categories).forEach((v) => {
      if (Array.isArray(v)) add(v);
      else if (v?.books) add(v.books);
    });
  }
  return [...map.values()];
}

function isReadingCompleted(entry) {
  const status = String(entry.reading_status || "").toLowerCase().trim();
  const total = Number(entry.chapters || 0);
  return ["completed", "complete", "finished", "done", "history"].includes(status)
    || getReadingProgressPercent(entry) >= 100
    || (total > 0 && Number(entry.chapters_read || 0) >= total);
}

function ContinueReadingCard({ book, onResume, resuming }) {
  const cover = resolveAssetUrl(book.cover_path || book.coverPath || "");
  const chapter = Math.max(1, Number(book.last_chapter_number || 1));
  const totalChapters = Number(book.chapters || book.published_chapter_count || book.chapter_count || 0);
  const progress = getReadingProgressPercent(book);

  return (
    <article className="continue-reading-card">
      <Link to={`/stories/${book.id}`} className="continue-reading-cover" aria-label={`Open ${book.title || "story"}`}>
        {cover ? <img src={cover} alt="" loading="lazy" decoding="async" /> : <span aria-hidden="true">{String(book.title || "W").slice(0, 1)}</span>}
      </Link>
      <div className="continue-reading-copy">
        <span className="continue-reading-chapter">Chapter {chapter}{totalChapters ? ` / ${totalChapters}` : ""}</span>
        <Link to={`/stories/${book.id}`} className="continue-reading-title">{book.title || "Untitled story"}</Link>
        <span className="continue-reading-author">by {book.author || "Wingsaga author"}</span>
        <div className="continue-reading-progress">
          <span
            className="continue-reading-meter"
            role="progressbar"
            aria-label={`${progress}% read`}
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={progress}
          >
            <span style={{ width: `${progress}%` }} />
          </span>
          <div>
            <span>{progress}% read</span>
            <button type="button" onClick={() => onResume(book)} disabled={resuming}>
              {resuming ? "Opening…" : <>Continue reading <span aria-hidden="true">→</span></>}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function ContinueReadingShelf({ books, to = "/library", onResume, resumingId = "", resumeMessage = "", member = false }) {
  if (!books.length) return null;
  return (
    <section className={`continue-reading-shelf${member ? " continue-reading-shelf--member" : ""}`} aria-label="Continue Reading">
      <div className="continue-reading-heading">
        <div><h2>Continue Reading</h2><p>Resume your recent chapter progress</p></div>
        {to ? <Link to={to}>View library <span aria-hidden="true">→</span></Link> : null}
      </div>
      <ArrowCarousel
        className="continue-reading-carousel-track"
        itemClassName="continue-reading-slide"
        label="Continue reading stories"
        previousLabel="Previous continue reading stories"
        nextLabel="Next continue reading stories"
        stepByItem
        deferUntilVisible
      >
        {books.slice(0, 12).map((book) => (
          <ContinueReadingCard key={book.id} book={book} onResume={onResume} resuming={String(book.id) === String(resumingId)} />
        ))}
      </ArrowCarousel>
      {resumeMessage ? <p className="continue-reading-message" role="status">{resumeMessage}</p> : null}
    </section>
  );
}

function shuffleBooks(books, previousFirstId) {
  const shuffled = [...books];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  if (shuffled.length > 1 && String(shuffled[0].id) === String(previousFirstId)) {
    const differentFirst = shuffled.findIndex((book) => String(book.id) !== String(previousFirstId));
    if (differentFirst > 0) [shuffled[0], shuffled[differentFirst]] = [shuffled[differentFirst], shuffled[0]];
  }
  return shuffled;
}

function normalizedTagName(value) {
  return String(value || "").trim().replace(/^#/, "").toLocaleLowerCase();
}

function capSearchHistory(entries) {
  const counts = new Map();
  const seen = new Set();
  const capped = [];
  for (const entry of entries) {
    const term = String(entry?.term || "").trim();
    const scope = ["title", "tag", "profile"].includes(entry?.scope) ? entry.scope : "title";
    const key = `${scope}:${term.toLocaleLowerCase()}`;
    if (!term || seen.has(key) || (counts.get(scope) || 0) >= 5) continue;
    seen.add(key);
    counts.set(scope, (counts.get(scope) || 0) + 1);
    capped.push({ term, scope });
  }
  return capped;
}

function byGenre(books, genre) {
  const g = genre.toLowerCase();
  return books.filter((b) => {
    const fields = [b.genre, b.primary_genre, b.secondary_genre, b.section_name]
      .filter(Boolean)
      .map((x) => String(x).toLowerCase());
    return fields.some((f) => f.includes(g.split(" ")[0]) || g.includes(f) || f.includes(g));
  });
}

function normalizeTags(raw) {
  const items = Array.isArray(raw) ? raw : [];
  const unique = new Map();
  items.forEach((item) => {
    const tag = typeof item === "string" ? { name: item } : item;
    const name = String(tag?.name || "").trim();
    if (name && !unique.has(name.toLocaleLowerCase())) {
      unique.set(name.toLocaleLowerCase(), { ...tag, name });
    }
  });
  return [...unique.values()].slice(0, 20);
}

function HomePromoBanner({ contest }) {
  const title = contest?.title || "Level Up";
  const detail = contest?.theme || "Join the Wingsaga writing challenge";
  return (
    <section className="home-promo-banner" aria-label="Featured writing contest">
      <div className="home-promo-art" aria-hidden="true" />
      <div className="home-promo-copy">
        <span className="home-promo-kicker">NEW CHALLENGE AVAILABLE</span>
        <h1>{title}</h1>
        <p>{detail}</p>
        {contest?.deadline ? <small>Entries close {contest.deadline}</small> : null}
      </div>
      <Link to="/contests" className="home-promo-action">Enter now <span aria-hidden="true">→</span></Link>
    </section>
  );
}

function HomeFeatureHero({ user, readingBook }) {
  const canWrite = Boolean(user && !isGuestUser(user));
  return (
    <section className="home-feature-hero" aria-label="Featured stories">
      <ImageCarousel slides={HOME_HERO_SLIDES} label="Featured stories" className="home-feature-carousel" showCaptions={false} />
      <div className="home-feature-copy">
        <span className="home-feature-kicker">WELCOME TO WINGSAGA</span>
        <h1>Find Your<br /><em>Next Great Story</em></h1>
        <p>Read, write, and be part of a global community of passionate storytellers.</p>
        <div className="home-feature-actions">
          <Link to={readingBook?.id ? `/stories/${readingBook.id}` : "/"} className="home-feature-primary"><span aria-hidden="true">▣</span>Start Reading</Link>
          <Link to={canWrite ? "/write" : "/login"} state={canWrite ? undefined : { returnTo: "/write/new" }} className="home-feature-secondary"><span aria-hidden="true">✎</span>Start Writing</Link>
        </div>
      </div>
    </section>
  );
}

function PopularTagsRow({ tags = [], tagCovers = {} }) {
  const popular = tags.filter((tag) => Number(tag.book_count || 0) > 0).slice(0, 12);
  if (!popular.length) return null;
  return (
    <section className="home-tag-section" aria-labelledby="home-tags-title">
      <div className="home-section-inner">
        <div className="home-section-heading">
          <div className="home-tags-heading-copy">
            <h2 id="home-tags-title">Explore Hashtags</h2>
            <p>Discover trending stories by hashtag</p>
          </div>
        </div>
        <ArrowCarousel
          className="home-tag-carousel-track"
          itemClassName="home-tag-carousel-item"
          label="Popular hashtags"
        >
          {popular.map((tag) => {
            const images = tagCovers[normalizedTagName(tag.name)] || [];
            const collageImages = [0, 1, 2].map((index) => images[index] || images[0] || "");
            return (
              <Link className="home-tag-card" to={`/tags/${encodeURIComponent(tag.name)}`} key={tag.id || tag.name} aria-label={`#${tag.name}, ${Number(tag.book_count || 0).toLocaleString()} stories`}>
                <span className="home-tag-collage" aria-hidden="true">
                  <span className="home-tag-collage-main">
                    {collageImages[0] ? <img src={collageImages[0]} alt="" loading="lazy" /> : <span className="home-tag-collage-placeholder" />}
                  </span>
                  <span className="home-tag-collage-side">
                    {[1, 2].map((index) => (
                      <span className="home-tag-collage-small" key={index}>
                        {collageImages[index] ? <img src={collageImages[index]} alt="" loading="lazy" /> : <span className="home-tag-collage-placeholder" />}
                      </span>
                    ))}
                  </span>
                </span>
                <span className="home-tag-details">
                  <strong>#{tag.name}</strong>
                  <small><span className="home-tag-badge">{String(tag.name || "#").replace(/^#/, "").slice(0, 1).toUpperCase()}</span>{Number(tag.book_count || 0).toLocaleString()} stories</small>
                </span>
              </Link>
            );
          })}
        </ArrowCarousel>
      </div>
    </section>
  );
}

function TopReviewsRow({ reviews = [] }) {
  if (!reviews.length) return null;
  return (
    <section className="home-reviews-section" aria-labelledby="home-reviews-title">
      <div className="home-section-inner">
        <div className="home-section-heading">
          <h2 id="home-reviews-title">Top Reviews</h2>
          <Link to="/reviews">Read more <span aria-hidden="true">→</span></Link>
        </div>
        <div className="home-reviews-track">
          {reviews.slice(0, 8).map((review) => {
            const cover = resolveAssetUrl(review.cover_path || "");
            const photo = resolveAssetUrl(review.photo_url || "");
            const rating = Math.max(0, Math.min(5, Math.round(Number(review.rating || 0))));
            return (
              <Link className="home-review-card" to={`/stories/${review.book_id}`} key={review.id}>
                {cover ? <img className="home-review-cover" src={cover} alt="" loading="lazy" /> : <span className="home-review-cover home-review-cover--empty">N</span>}
                <span className="home-review-copy">
                  <span className="home-review-stars" aria-label={`${rating} out of 5 stars`}>{"★".repeat(rating)}{"☆".repeat(5 - rating)}</span>
                  <strong>{review.book_title}</strong>
                  <span className="home-review-author">by {review.book_author || "Wingsaga author"}</span>
                  <span className="home-review-comment">{review.comment}</span>
                  <span className="home-review-reader">
                    {photo ? <img src={photo} alt="" loading="lazy" /> : <i aria-hidden="true">{String(review.display_name || "R").slice(0, 1).toUpperCase()}</i>}
                    {review.display_name || "Reader"}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function getSectionBooks(data, name) {
  const sections = Array.isArray(data?.sections) ? data.sections : [];
  const section = sections.find((item) => String(item?.name || item?.title || "").toLowerCase() === name);
  const books = section?.books || section?.items;
  return Array.isArray(books) ? books : [];
}

function MemberBookRail({ books, label }) {
  return (
    <ArrowCarousel className="member-card-row" itemClassName="member-card home-story-card-slot" label={label} edgeGlow stepByItem deferUntilVisible>
      {books.map((book) => <BookCard key={book.id} book={book} variant="shelf" />)}
    </ArrowCarousel>
  );
}

function MemberStoryShelf({
  title,
  books,
  to,
  onRefresh,
  refreshing = false,
  refreshMessage = "",
}) {
  if (!books.length) return null;
  return (
    <section className="member-shelf-section" aria-label={title}>
      <div className="member-section-heading">
        <h2>{title}</h2>
        <div className="member-shelf-heading-actions">
          {onRefresh ? (
            <button type="button" className="member-refresh-button" onClick={onRefresh} disabled={refreshing} aria-busy={refreshing}>
              <span aria-hidden="true">↻</span> {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          ) : null}
          {to ? <Link to={to}>See more <span aria-hidden="true">→</span></Link> : null}
        </div>
      </div>
      <MemberBookRail books={books.slice(0, 16)} label={`${title} stories`} />
      {refreshMessage ? <p className="member-refresh-message" role="status">{refreshMessage}</p> : null}
    </section>
  );
}

function MemberBrowseHome({
  data,
  books,
  tagCovers,
  continueReading,
  genres,
  tags,
  reviews,
  onRefresh,
  refreshing,
  refreshMessage,
  onResume,
  resumingId,
  resumeMessage,
}) {
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [reviewTab, setReviewTab] = useState("top");
  const memberTagsTrackRef = useRef(null);

  const discoverBooks = books;
  const recommended = discoverBooks.slice(0, 12);
  const trending = discoverBooks.length > 4
    ? discoverBooks.slice(4, 12)
    : discoverBooks.slice(0, 8);
  const sectionNamesOf = (book) => [...new Set([
    ...(Array.isArray(book.section_names) ? book.section_names : []),
    book.section_name,
  ].map((name) => String(name || "").trim().toLowerCase()).filter(Boolean))];
  const featuredBooks = [
    ...getSectionBooks(data, "featured"),
    ...(data?.featured_book?.id ? [data.featured_book] : []),
    ...discoverBooks.filter((book) => sectionNamesOf(book).includes("featured")),
  ].filter((book, index, list) => book?.id && list.findIndex((item) => String(item.id) === String(book.id)) === index);
  const featured = featuredBooks.length ? featuredBooks.slice(0, 4) : discoverBooks.slice(0, 4);
  const feature = featured[featuredIndex % Math.max(featured.length, 1)];
  const orderedReviews = [...reviews].sort((a, b) => {
    if (reviewTab === "latest") return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    if (reviewTab === "helpful") return Number(b.helpful_count || b.likes_count || 0) - Number(a.helpful_count || a.likes_count || 0);
    return Number(b.rating || 0) - Number(a.rating || 0);
  });
  const featureCover = resolveAssetUrl(feature?.cover_path || feature?.coverPath || "");
  const genreList = (genres.length ? genres : [...new Set(discoverBooks.map((book) => book.primary_genre || book.genre).filter(Boolean))]);
  const popularTags = tags.filter((tag) => tag.name).slice(0, 16);
  const sectionBooks = (predicate) => discoverBooks.filter(predicate);
  const recentlyUpdated = sectionBooks((book) => sectionNamesOf(book).includes("recently_updated"));
  const recentlyCompleted = sectionBooks((book) =>
    sectionNamesOf(book).includes("recently_completed")
    || Number(book.is_completed) === 1
    || /complete|finished/i.test(String(book.status_text || book.status || "")),
  );
  const topRated = [...discoverBooks].sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0));
  const dynamicShelves = [
    { title: "Featured", books: sectionBooks((book) => sectionNamesOf(book).includes("featured") || Number(book.rating || 0) >= 4.8) },
    { title: "Hot Right Now", books: sectionBooks((book) => sectionNamesOf(book).some((name) => ["trending", "hot"].includes(name))).length
      ? sectionBooks((book) => sectionNamesOf(book).some((name) => ["trending", "hot"].includes(name)))
      : topRated },
    { title: "New Releases", books: sectionBooks((book) => sectionNamesOf(book).some((name) => ["new_releases", "new"].includes(name))).length
      ? sectionBooks((book) => sectionNamesOf(book).some((name) => ["new_releases", "new"].includes(name)))
      : recentlyUpdated },
    { title: "Recently Updated", books: recentlyUpdated },
    { title: "Recently Completed", books: recentlyCompleted },
    { title: "Editors’ Picks", books: sectionBooks((book) => sectionNamesOf(book).some((name) => ["editor_picks", "editors_picks"].includes(name))) },
    { title: "Fantasy & Magic", books: sectionBooks((book) => /fantasy|magical|mythic/i.test(`${book.primary_genre || ""} ${book.secondary_genre || ""}`)) },
    { title: "Romance & Drama", books: sectionBooks((book) => /romance|drama/i.test(`${book.primary_genre || book.genre || ""} ${book.secondary_genre || ""}`)) },
    { title: "Sci-Fi & Future", books: sectionBooks((book) => /scifi|science|cyber|futuristic/i.test(`${book.primary_genre || ""} ${book.secondary_genre || ""}`)) },
    { title: "Mystery & Thrillers", books: sectionBooks((book) => /mystery|thriller/i.test(`${book.primary_genre || ""} ${book.secondary_genre || ""}`)) },
    { title: "Horror & Paranormal", books: sectionBooks((book) => /horror|paranormal/i.test(`${book.primary_genre || ""} ${book.secondary_genre || ""}`)) },
    { title: "Action & Adventure", books: sectionBooks((book) => /action|adventure/i.test(`${book.primary_genre || ""} ${book.secondary_genre || ""}`)) },
  ];
  const reservedSectionNames = new Set([
    "", "recently_updated", "recently_completed", "featured", "trending", "hot",
    "popular", "discover", "new", "new_releases", "editor_picks", "editors_picks",
  ]);
  const customSectionNames = [...new Set(discoverBooks.flatMap(sectionNamesOf)
    .filter((name) => !reservedSectionNames.has(name)))].sort();
  customSectionNames.forEach((name) => dynamicShelves.push({
    title: name.split("_").map((word) => word ? `${word[0].toUpperCase()}${word.slice(1)}` : "").join(" "),
    books: sectionBooks((book) => sectionNamesOf(book).includes(name)),
  }));
  const visibleDynamicShelves = dynamicShelves
    .filter((section) => section.books.length >= 3)
    .map((section) => ({ ...section, books: section.books.slice(0, 12) }));

  return (
    <main className="member-home" aria-label="Browse stories">
      <section className="member-featured" aria-label="Featured stories">
        {feature ? (
          <>
            <div className="member-featured-art" aria-hidden="true">
              {featureCover ? <img src={featureCover} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : null}
            </div>
            <div className="member-featured-copy">
              <span className="member-featured-kicker">✦ &nbsp;WINGSAGA FEATURED</span>
              <h2>{feature.title}</h2>
              <p className="member-featured-byline">By {feature.author || "Wingsaga author"} · {feature.genre || feature.primary_genre || "Story"}{feature.rating ? ` · ★ ${Number(feature.rating).toFixed(1)}` : ""}</p>
              <p className="member-featured-description">{feature.description || "Find a new story and follow its next chapter."}</p>
              <Link className="member-button member-button--light" to={`/stories/${feature.id}`}>Read story <span aria-hidden="true">→</span></Link>
            </div>
            {featured.length > 1 ? (
              <div className="member-featured-controls" aria-label="Featured story controls">
                <button type="button" aria-label="Previous featured story" onClick={() => setFeaturedIndex((featuredIndex + featured.length - 1) % featured.length)}>‹</button>
                <span>{featured.map((book, index) => <button key={book.id} type="button" aria-label={`Show featured story ${index + 1}`} aria-current={index === featuredIndex} className={index === featuredIndex ? "active" : ""} onClick={() => setFeaturedIndex(index)} />)}</span>
                <button type="button" aria-label="Next featured story" onClick={() => setFeaturedIndex((featuredIndex + 1) % featured.length)}>›</button>
              </div>
            ) : null}
          </>
        ) : <p className="member-empty">Featured stories will appear here when available.</p>}
      </section>

      <MemberStoryShelf
        title="Recommended For You"
        books={recommended}
        to="/"
        emptyMessage="New recommendations will appear here as you explore stories."
        onRefresh={onRefresh}
        refreshing={refreshing}
        refreshMessage={refreshMessage}
      />

      <ContinueReadingShelf books={continueReading} onResume={onResume} resumingId={resumingId} resumeMessage={resumeMessage} member />

      <section className="member-section member-genres" aria-labelledby="member-genres-title">
        <div className="member-section-heading member-section-heading--start">
          <h2 id="member-genres-title">Top Genres</h2>
        </div>
        <ArrowCarousel
          className="member-genre-track"
          itemClassName="member-genre-slide"
          label="Top genres"
          previousLabel="Previous top genres"
          nextLabel="Next top genres"
          stepByItem
        >
          {genreList.map((genre, index) => (
            <Link to={`/genres/${encodeURIComponent(genre)}`} className="member-genre-card" key={genre}>
              <span aria-hidden="true">{["✦", "♡", "◈", "⌘", "☾", "✧", "➶"][index % 7]}</span>
              <strong>{genre}</strong>
              <small>{byGenre(discoverBooks, genre).length} stories</small>
            </Link>
          ))}
        </ArrowCarousel>
      </section>

      <MemberStoryShelf title="Trending Now" books={trending} to="/" emptyMessage="Trending stories will appear here as readers find them." />

      {visibleDynamicShelves.map((section) => (
        <MemberStoryShelf
          key={section.title}
          title={section.title}
          books={section.books}
          to={section.title.includes("Fantasy") ? "/genres/Fantasy" : section.title.includes("Romance") ? "/genres/Romance" : "/discover"}
        />
      ))}

      <section className="member-section member-reviews" aria-labelledby="member-reviews-title">
        <div className="member-section-heading">
          <div><h2 id="member-reviews-title">Top Reviews</h2><p>What readers are saying</p></div>
          <Link to="/reviews">Read more <span aria-hidden="true">→</span></Link>
        </div>
        <div className="member-tabs" role="tablist" aria-label="Review filters">
          {[["top", "Top Reviews"], ["latest", "Latest Reviews"], ["helpful", "Most Helpful"]].map(([id, label]) => <button type="button" role="tab" aria-selected={reviewTab === id} className={reviewTab === id ? "active" : ""} key={id} onClick={() => setReviewTab(id)}>{label}</button>)}
        </div>
        <div className="member-review-layout">
          <div className="member-review-grid">
            {orderedReviews.slice(0, 6).map((review) => {
              const bookId = review.book_id || review.story_id;
              return (
                <article className="member-review-card" key={review.id || `${bookId}-${review.display_name}`}>
                  <strong>{review.book_title || "Reader review"}</strong>
                  <span className="member-review-stars" aria-label={`${review.rating || 0} out of 5 stars`}>{"★".repeat(Math.max(0, Math.min(5, Math.round(Number(review.rating || 0)))))}</span>
                  <p>{review.comment || "A story worth sharing with other readers."}</p>
                  <small>— {review.display_name || "Reader"}</small>
                  {bookId ? <Link to={`/stories/${bookId}`}>View story →</Link> : null}
                </article>
              );
            })}
            {!orderedReviews.length ? <p className="member-empty">Reader reviews will appear here.</p> : null}
          </div>
          <aside className="member-activity">
            <h3>Reader Community</h3>
            {orderedReviews.slice(0, 4).map((review, index) => <p key={review.id || index}><strong>{review.display_name || "A reader"}</strong> reviewed <span>{review.book_title || "a story"}</span></p>)}
            {!orderedReviews.length ? <p>Join the community and share what you are reading.</p> : null}
          </aside>
        </div>
      </section>

      <section className="member-section" aria-labelledby="member-tags-title">
        <div className="member-section-heading">
          <div><h2 id="member-tags-title">Popular Tags</h2><p>Find your next obsession</p></div>
          <div className="member-tag-controls" aria-label="Popular tags carousel controls">
            <button type="button" aria-label="Previous popular tags" onClick={() => memberTagsTrackRef.current?.scrollBy({ left: -280, behavior: "smooth" })}>←</button>
            <button type="button" aria-label="Next popular tags" onClick={() => memberTagsTrackRef.current?.scrollBy({ left: 280, behavior: "smooth" })}>→</button>
          </div>
          <Link to="/">Explore all <span aria-hidden="true">→</span></Link>
        </div>
        <div className="member-tag-grid member-tag-track" ref={memberTagsTrackRef}>
          {popularTags.map((tag) => {
            const images = tagCovers[normalizedTagName(tag.name)] || [];
            const collageImages = [0, 1, 2].map((index) => images[index] || images[0] || "");
            return (
              <Link to={`/tags/${encodeURIComponent(tag.name)}`} className="member-tag-card" key={tag.id || tag.name}>
                <span className="member-tag-collage" aria-hidden="true">
                  <span className="member-tag-collage-main">{collageImages[0] ? <img src={collageImages[0]} alt="" loading="lazy" /> : null}</span>
                  <span className="member-tag-collage-side">
                    {[1, 2].map((index) => <span className="member-tag-collage-small" key={index}>{collageImages[index] ? <img src={collageImages[index]} alt="" loading="lazy" /> : null}</span>)}
                  </span>
                </span>
                <strong>#{tag.name}</strong>
                <small><span className="member-tag-badge">{String(tag.name || "#").replace(/^#/, "").slice(0, 1).toUpperCase()}</span>{Number(tag.book_count || 0).toLocaleString()} {Number(tag.book_count || 0) === 1 ? "story" : "stories"}</small>
              </Link>
            );
          })}
          {!popularTags.length ? <p className="member-empty">Popular tags will appear here.</p> : null}
        </div>
      </section>

      <section className="member-author-promo">
        <div><h2>Got a story in you?</h2><p>Draft chapters in Write Studio, publish when you are ready, and keep writing. Readers love a story that keeps growing.</p></div>
        <Link className="member-button member-button--light" to="/write">Open Write Studio</Link>
      </section>
    </main>
  );
}

function mergeUniqueBooks(...groups) {
  const booksById = new Map();
  groups.flat().forEach((book) => {
    if (book?.id != null && !booksById.has(String(book.id))) booksById.set(String(book.id), book);
  });
  return [...booksById.values()];
}

function DiscoveryHero({ books, curated, guest, libraryIds, onSave, savingId, saveError }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [backgroundImages, setBackgroundImages] = useState([]);
  const [heroPaused, setHeroPaused] = useState(false);
  const slides = books.slice(0, 5);
  const slideIndex = activeIndex % Math.max(slides.length, 1);
  const feature = slides[slideIndex];
  const genre = feature?.secondary_genre || feature?.primary_genre || feature?.genre || "Story";
  const matchingBackground = backgroundImages.find((image) =>
    String(image.story_id || image.book_id || "") === String(feature?.id || "")
    || (image.title && String(image.title).trim().toLowerCase() === String(feature?.title || "").trim().toLowerCase()));
  const backgroundImage = feature?.hero_image_path
    || feature?.hero_image
    || feature?.background_image_path
    || feature?.background_image
    || feature?.background_path
    || matchingBackground?.image_path
    || feature?.cover_path
    || feature?.coverPath
    || "";
  const accent = "var(--site-brand)";
  const reads = Number(feature?.view_count || feature?.read_count || feature?.reads || 0);
  const rating = Number(feature?.rating || 0);
  const completed = feature?.is_completed === true || Number(feature?.is_completed) === 1
    || /complete|finished/i.test(String(feature?.publication_status || feature?.status || ""));
  const saved = feature?.id != null && libraryIds.has(String(feature.id));

  useEffect(() => {
    let active = true;
    getHomeHeroImages()
      .then((result) => {
        if (active) setBackgroundImages(Array.isArray(result?.items) ? result.items.slice(0, 5) : []);
      })
      .catch(() => {
        if (active) setBackgroundImages([]);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (heroPaused || slides.length < 2) return undefined;
    const timer = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % slides.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [heroPaused, slides.length, activeIndex]);

  return (
    <section
      className={`discovery-hero${feature ? ` discovery-hero--slide-${slideIndex % 3}` : " discovery-hero--empty"}`}
      aria-label={feature ? "Featured story" : "Home story"}
      aria-roledescription={feature && slides.length > 1 ? "carousel" : undefined}
      data-story-id={feature?.id}
      style={feature ? { "--discovery-hero-accent": accent } : undefined}
      onMouseEnter={() => setHeroPaused(true)}
      onMouseLeave={() => setHeroPaused(false)}
      onFocusCapture={() => setHeroPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHeroPaused(false);
      }}
    >
      {feature ? (
        <Fragment key={feature.id}>
          {backgroundImage ? (
            <div className="discovery-hero-background" aria-hidden="true">
              <img src={resolveAssetUrl(backgroundImage)} alt="" />
            </div>
          ) : null}
          <div className="discovery-hero-copy" aria-live="polite">
            <span className="discovery-eyebrow">{curated ? "WINGSAGA EDITORIAL" : "A STORY TO GET LOST IN"}</span>
            <h1>{feature.title}</h1>
            <p className="discovery-hero-byline">By {feature.author || "Wingsaga author"}</p>
            <p className="discovery-hero-description">{feature.description || "Meet a new voice, step into a new world, and find the next story you’ll want to share."}</p>
            <div className="discovery-hero-facts">
              <span>{genre}</span>
              {rating > 0 ? <span><b aria-hidden="true">★</b> {rating.toFixed(1)}</span> : null}
              {reads > 0 ? <span>{reads.toLocaleString()} reads</span> : null}
              <span className={completed ? "is-completed" : ""}>{completed ? "Completed" : "Ongoing"}</span>
            </div>
            <div className="discovery-hero-actions">
              <Link className="discovery-button discovery-button--primary" to={`/stories/${feature.id}`}>Read now <span aria-hidden="true">→</span></Link>
              {guest ? (
                <Link className="discovery-button discovery-button--secondary" to="/login" state={{ returnTo: "/" }}>Add to library <span aria-hidden="true">＋</span></Link>
              ) : saved ? (
                <Link className="discovery-button discovery-button--secondary" to="/library">In your library <span aria-hidden="true">✓</span></Link>
              ) : (
                <button className="discovery-button discovery-button--secondary" type="button" disabled={savingId === String(feature.id)} onClick={() => onSave(feature)}>
                  {savingId === String(feature.id) ? "Adding…" : "Add to library"} <span aria-hidden="true">＋</span>
                </button>
              )}
            </div>
            {saveError ? <p className="discovery-save-error" role="alert">{saveError}</p> : null}
          </div>
          <Link className="discovery-hero-cover" to={`/stories/${feature.id}`} aria-label={`Read ${feature.title}`}>
            <BookCard
              book={feature}
              variant="mini"
              link={false}
              coverOverlay={(
                <span className="discovery-hero-book-label">
                  <strong>{feature.title}</strong>
                  <small>BY {(feature.author || "WINGSAGA AUTHOR").toLocaleUpperCase()}</small>
                </span>
              )}
            />
          </Link>
        </Fragment>
      ) : (
        <div className="discovery-empty-copy">
          <span className="discovery-eyebrow">A HOME FOR EVERY STORY</span>
          <h1>Find the words that stay with you.</h1>
          <p>Explore new voices, follow a world beyond the page, and find your next favorite read.</p>
          <Link className="discovery-button discovery-button--primary" to="/genres/Stories">Explore stories <span aria-hidden="true">→</span></Link>
        </div>
      )}
      {slides.length > 1 ? (
        <div className="discovery-hero-controls" aria-label="Featured story controls">
          <button type="button" aria-label="Previous featured story" onClick={() => setActiveIndex((index) => (index - 1 + slides.length) % slides.length)}>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m14.5 5-7 7 7 7" /></svg>
          </button>
          <div>{slides.map((slide, index) => <button key={slide.id} type="button" aria-label={`Show featured story ${index + 1}: ${slide.title}`} aria-current={index === slideIndex} className={index === slideIndex ? "active" : ""} onClick={() => setActiveIndex(index)} />)}</div>
          <button type="button" aria-label="Next featured story" onClick={() => setActiveIndex((index) => (index + 1) % slides.length)}>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m9.5 5 7 7-7 7" /></svg>
          </button>
        </div>
      ) : null}
    </section>
  );
}

function EditorialShowcase({ book, supportingBooks, curated }) {
  if (!book) return null;
  const cover = resolveAssetUrl(book.cover_path || book.coverPath || "");
  return (
    <section className="discovery-editorial" aria-labelledby="discovery-editorial-title">
      <div className="discovery-editorial-heading">
        <div>
          <span className="discovery-eyebrow">{curated ? "FROM THE WINGSAGA EDITORS" : "A READER FAVORITE"}</span>
          <h2 id="discovery-editorial-title">{curated ? "The story everyone should know" : "A story worth your time"}</h2>
        </div>
        <Link to={`/stories/${book.id}`}>Meet the story <span aria-hidden="true">→</span></Link>
      </div>
      <div className="discovery-editorial-layout">
        <article className="discovery-editorial-feature">
          <Link className="discovery-editorial-art" to={`/stories/${book.id}`} tabIndex={-1} aria-hidden="true">
            {cover ? <img src={cover} alt="" loading="lazy" decoding="async" /> : <span aria-hidden="true">W</span>}
            <span className="discovery-editorial-shade" />
          </Link>
          <div className="discovery-editorial-copy">
            <span>{book.primary_genre || book.genre || "Featured story"}</span>
            <h3><Link to={`/stories/${book.id}`}>{book.title}</Link></h3>
            <p>By {book.author || "Wingsaga author"}</p>
            <Link className="discovery-text-link" to={`/stories/${book.id}`}>Explore this story <span aria-hidden="true">→</span></Link>
          </div>
        </article>
        <div className="discovery-editorial-support" aria-label="More stories to explore">
          {supportingBooks.slice(0, 3).map((story) => <div className="discovery-editorial-support-card home-story-card-slot" key={story.id}><BookCard book={story} variant="shelf" /></div>)}
          {!supportingBooks.length ? <Link className="discovery-editorial-browse" to="/"><span>Explore beyond the familiar</span><strong>Find a new voice, genre, or world.</strong><span>Browse all stories →</span></Link> : null}
        </div>
      </div>
    </section>
  );
}

function GenreSpotlight({ genre, books, genres }) {
  if (!genre || !books.length) return null;
  return (
    <section className="discovery-genre-section" aria-labelledby="discovery-genre-title">
      <div className="discovery-genre-intro">
        <span className="discovery-eyebrow">GENRE SPOTLIGHT</span>
        <h2 id="discovery-genre-title">{genre}</h2>
        <p>Follow the feeling, then see where the story takes you.</p>
        <Link to={`/genres/${encodeURIComponent(genre)}`}>Explore {genre} <span aria-hidden="true">→</span></Link>
        {genres.length > 1 ? (
          <nav className="discovery-genre-switcher" aria-label="Explore another genre">
            {genres.slice(0, 5).filter((item) => item !== genre).map((item) => <Link key={item} to={`/genres/${encodeURIComponent(item)}`}>{item}</Link>)}
          </nav>
        ) : null}
      </div>
      <MemberBookRail books={books.slice(0, 8)} label={`${genre} stories`} />
    </section>
  );
}

function CommunitySpotlight({ reviews, reviewTab, setReviewTab }) {
  if (!reviews.length) return null;
  return (
    <section className="member-section discovery-community" aria-labelledby="member-reviews-title">
      <div className="member-section-heading">
        <div><span className="discovery-eyebrow">COMMUNITY VOICES</span><h2 id="member-reviews-title">Stories readers are talking about</h2><p>Real reactions from the Wingsaga community</p></div>
        <Link to="/reviews">Read more <span aria-hidden="true">→</span></Link>
      </div>
      <div className="member-tabs" role="tablist" aria-label="Review filters">
        {[["top", "Top reviews"], ["latest", "Latest"], ["helpful", "Most helpful"]].map(([id, label]) => <button type="button" role="tab" aria-selected={reviewTab === id} className={reviewTab === id ? "active" : ""} key={id} onClick={() => setReviewTab(id)}>{label}</button>)}
      </div>
      <div className="discovery-community-grid">
        {reviews.slice(0, 4).map((review) => {
          const bookId = review.book_id || review.story_id;
          const rating = Math.max(0, Math.min(5, Math.round(Number(review.rating || 0))));
          return (
            <article className="discovery-community-card" key={review.id || `${bookId}-${review.display_name}`}>
              <div className="discovery-community-rating" aria-label={`${rating} out of 5 stars`}>{"★".repeat(rating)}<span>{"☆".repeat(5 - rating)}</span></div>
              <p>{review.comment || "A story worth sharing with other readers."}</p>
              <div><strong>{review.display_name || "A Wingsaga reader"}</strong>{bookId ? <Link to={`/stories/${bookId}`}>{review.book_title || "View story"} →</Link> : <span>{review.book_title || "Reader review"}</span>}</div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function StoryDiscoveryHome({
  data,
  books,
  continueReading,
  readingLists,
  guest,
  libraryIds,
  onSaveFeatured,
  savingId,
  saveError,
  genres,
  tags,
  reviews,
  onRefresh,
  refreshing,
  refreshMessage,
  loading,
  loadError,
}) {
  const [reviewTab, setReviewTab] = useState("top");
  const sectionNamesOf = (book) => [...new Set([
    ...(Array.isArray(book.section_names) ? book.section_names : []),
    book.section_name,
  ].map((name) => String(name || "").trim().toLowerCase()).filter(Boolean))];
  const featuredBooks = mergeUniqueBooks(
    getSectionBooks(data, "featured"),
    getSectionBooks(data, "editor_picks"),
    getSectionBooks(data, "editors_picks"),
    data?.featured_book ? [data.featured_book] : [],
    books.filter((book) => sectionNamesOf(book).includes("featured")),
  );
  const trending = mergeUniqueBooks(
    Array.isArray(data?.trending) ? data.trending : [],
    books.filter((book) => sectionNamesOf(book).some((name) => ["trending", "hot", "popular"].includes(name))),
  ).sort((a, b) => Number(b.view_count || b.read_count || b.reads || 0) - Number(a.view_count || a.read_count || a.reads || 0)
    || Number(b.rating || 0) - Number(a.rating || 0));
  const rankedTrending = (trending.length ? trending : [...books]).slice(0, 16);
  const heroBooks = (featuredBooks.length ? featuredBooks : rankedTrending).slice(0, 5);
  const recommended = mergeUniqueBooks(
    Array.isArray(data?.recommendations) ? data.recommendations : [],
    [...books].sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0)
      || Number(b.view_count || b.read_count || 0) - Number(a.view_count || a.read_count || 0)),
  );
  const editorialBook = mergeUniqueBooks(
    getSectionBooks(data, "editor_picks"),
    getSectionBooks(data, "editors_picks"),
    featuredBooks.slice(1),
    recommended,
  ).find((book) => !heroBooks.length || String(book.id) !== String(heroBooks[0].id))
    || rankedTrending.find((book) => !heroBooks.length || String(book.id) !== String(heroBooks[0].id));
  const editorialSupport = recommended
    .filter((book) => String(book.id) !== String(editorialBook?.id))
    .slice(0, 3);
  const updatedBooks = mergeUniqueBooks(
    Array.isArray(data?.recently_updated) ? data.recently_updated : [],
    books.filter((book) => sectionNamesOf(book).includes("recently_updated")),
  );
  const genreList = [...new Set([
    ...(genres || []),
    ...books.map((book) => book.primary_genre || book.genre).filter(Boolean),
  ])].slice(0, 10);
  const genre = genreList.find((item) => byGenre(books, item).length >= 3) || genreList[0];
  const orderedReviews = [...reviews].sort((a, b) => {
    if (reviewTab === "latest") return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    if (reviewTab === "helpful") return Number(b.helpful_count || b.likes_count || 0) - Number(a.helpful_count || a.likes_count || 0);
    return Number(b.rating || 0) - Number(a.rating || 0);
  });
  const popularTags = (tags || []).filter((tag) => tag.name).slice(0, 10);
  const isCurated = featuredBooks.some((book) => String(book.id) === String(heroBooks[0]?.id));
  const isEditorialPick = [...getSectionBooks(data, "editor_picks"), ...getSectionBooks(data, "editors_picks")]
    .some((book) => String(book.id) === String(editorialBook?.id));

  return (
    <main className="member-home discovery-home" aria-label="Browse stories">
      <DiscoveryHero books={heroBooks} curated={isCurated} guest={guest} libraryIds={libraryIds} onSave={onSaveFeatured} savingId={savingId} saveError={saveError} />
      <ContinueReadingShelf books={continueReading} onResume={onResume} resumingId={resumingId} resumeMessage={resumeMessage} member />
      <EditorialShowcase book={editorialBook} supportingBooks={editorialSupport} curated={isEditorialPick} />
      <MemberStoryShelf title="Trending this week" books={rankedTrending} to="/" onRefresh={onRefresh} refreshing={refreshing} refreshMessage={refreshMessage} />
      {readingLists.length ? <ReadingListsRow lists={readingLists} /> : null}
      <GenreSpotlight genre={genre} books={genre ? byGenre(books, genre) : []} genres={genreList} />
      <MemberStoryShelf title="Fresh from the writers" books={updatedBooks} to="/?sort=newest" />
      <CommunitySpotlight reviews={orderedReviews} reviewTab={reviewTab} setReviewTab={setReviewTab} />
      {popularTags.length ? (
        <section className="member-section discovery-tag-section" aria-labelledby="member-tags-title">
          <div className="member-section-heading">
            <div><span className="discovery-eyebrow">FOLLOW A THEME</span><h2 id="member-tags-title">Explore by tag</h2></div>
            <Link to="/">Browse all <span aria-hidden="true">→</span></Link>
          </div>
          <div className="discovery-tag-grid">
            {popularTags.map((tag) => (
              <Link to={`/tags/${encodeURIComponent(tag.name)}`} className="discovery-tag-card" key={tag.id || tag.name}>
                <span aria-hidden="true">#</span><strong>{tag.name}</strong><small>{Number(tag.book_count || 0).toLocaleString()} stories</small>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
      <section className={`discovery-author-promo${guest ? " discovery-author-promo--guest" : ""}`}>
        <div><span className="discovery-eyebrow">{guest ? "YOUR NEXT CHAPTER STARTS HERE" : "FOR THE STORYTELLERS"}</span><h2>{guest ? "Find a story that feels like yours." : "There’s a story in you, too."}</h2><p>{guest ? "Create a free account to save your reads, follow writers, and keep your place across devices." : "Shape a story in Write Studio, publish when you’re ready, and meet the readers waiting for it."}</p></div>
        <Link className="discovery-button discovery-button--primary" to={guest ? "/login" : "/write"}>{guest ? "Join Wingsaga" : "Open Write Studio"} <span aria-hidden="true">→</span></Link>
      </section>
      {!books.length ? (
        <section className={`discovery-empty-shelves${loading ? " is-loading" : ""}`} aria-live="polite">
          {loading ? (
            <><div className="discovery-loading-cards" aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <span key={index} />)}</div><p>Gathering stories for you…</p></>
          ) : (
            <><span aria-hidden="true">✦</span><h2>New stories are on their way</h2>
              <p>{loadError ? "We couldn’t load the story shelves just now. Please try again in a moment." : "There are no stories to show just yet. Explore a genre and check back soon."}</p>
              <Link to="/genres/Stories">Browse all stories <span aria-hidden="true">→</span></Link>
              {loadError ? <p role="status">{loadError}</p> : null}
            </>
          )}
        </section>
      ) : null}
    </main>
  );
}

export default function HomePage({ user }) {
  const guest = isGuestUser(user);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [continueReading, setContinueReading] = useState([]);
  const [resumingId, setResumingId] = useState("");
  const [resumeMessage, setResumeMessage] = useState("");
  const [libraryIds, setLibraryIds] = useState(() => new Set());
  const [savingFeaturedId, setSavingFeaturedId] = useState("");
  const [saveFeaturedError, setSaveFeaturedError] = useState("");
  const [homeReadingLists, setHomeReadingLists] = useState([]);
  const [tags, setTags] = useState([]);
  const [tagCovers, setTagCovers] = useState({});
  const [genres, setGenres] = useState([]);
  const [genreStoryCounts, setGenreStoryCounts] = useState([]);
  const [genreCountError, setGenreCountError] = useState("");
  const [publicStats, setPublicStats] = useState(null);
  const [contests, setContests] = useState([]);
  const [topReviews, setTopReviews] = useState([]);
  const [shuffledBooks, setShuffledBooks] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState("");
  const homeBooksRef = useRef([]);
  const firstShuffledBookRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = (searchParams.get("q") || "").trim();
  const searchScope = ["tag", "profile"].includes(searchParams.get("type")) ? searchParams.get("type") : "title";
  const genreFilter = (searchParams.get("genre") || "").trim();
  const statusFilter = (searchParams.get("status") || "all").toLowerCase();
  const sortFilter = (searchParams.get("sort") || "popular").toLowerCase();
  const [searchResults, setSearchResults] = useState(null);
  const [tagResults, setTagResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const recordedSearchRef = useRef("");
  const userKey = guest ? "guest" : String(user?.user_id || user?.id || user?.email || "account");
  const personalizationKey = `${guest ? "guest" : "user"}:${user?.user_id || user?.id || user?.email || "anonymous"}`;
  const historyStorageKey = `novelhub_search_history:${userKey}`;

  function shuffleHomeBooks(books) {
    const shuffled = shuffleBooks(books, firstShuffledBookRef.current);
    firstShuffledBookRef.current = shuffled[0]?.id ?? null;
    setShuffledBooks(shuffled);
  }

  async function resumeReading(book) {
    if (!book?.id || resumingId) return;
    setResumingId(String(book.id));
    setResumeMessage("");
    try {
      const response = await getBookChapters(book.id);
      const chapters = response?.items || response?.chapters || [];
      const wantedChapter = Number(book.last_chapter_number || 1);
      const matchingChapter = chapters.find((chapter) => Number(chapter.chapter_number) === wantedChapter);
      const chapter = matchingChapter || chapters[0];
      if (!chapter?.id) {
        setResumeMessage("This story has no readable chapters yet.");
        return;
      }
      const savedParagraph = Number(book.last_paragraph_index || 0);
      const paragraph = matchingChapter && Number.isFinite(savedParagraph) ? Math.max(0, Math.floor(savedParagraph)) : 0;
      navigate(`/stories/${book.id}/chapters/${chapter.id}?paragraph=${paragraph}`);
    } catch (resumeError) {
      setResumeMessage(`Could not resume this story: ${resumeError.message || "Please try again."}`);
    } finally {
      setResumingId("");
    }
  }

  function applyHomeBootstrap(boot, recommendationRes) {
    const nextData = { ...boot, recommendations: recommendationRes?.items || [] };
    const books = collectBooks(nextData);
    if (!books.length && homeBooksRef.current.length) {
      shuffleHomeBooks(homeBooksRef.current);
      return;
    }
    homeBooksRef.current = books;
    setData(nextData);
    shuffleHomeBooks(books);
  }

  async function refreshHome() {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshMessage("");
    try {
      const [boot, recommendationRes] = await Promise.all([
        getBootstrap(),
        getRecommendations().catch(() => ({ items: [] })),
      ]);
      applyHomeBootstrap(boot, recommendationRes);
    } catch (refreshError) {
      setRefreshMessage(`Could not refresh stories: ${refreshError.message || "Please try again."}`);
    } finally {
      setRefreshing(false);
    }
  }

  async function addFeaturedToLibrary(book) {
    if (guest || !getToken()) {
      navigate("/login", { state: { returnTo: "/" } });
      return;
    }
    if (!book?.id || savingFeaturedId) return;
    const bookId = String(book.id);
    setSavingFeaturedId(bookId);
    setSaveFeaturedError("");
    try {
      await saveLibraryProgress({
        book_id: Number(book.id),
        reading_status: "Reading",
        chapters: Number(book.published_chapter_count || book.chapter_count || book.chapters_count || 0),
        last_chapter_number: 0,
        last_paragraph_index: 0,
        chapters_read: 0,
        reading_progress_percent: 0,
        primary_genre: book.primary_genre || book.genre || "",
        title: book.title || "Story",
        author: book.author || "Author",
        cover_path: book.cover_path || book.coverPath || "",
        author_user_id: book.author_user_id || null,
      });
      setLibraryIds((current) => new Set([...current, bookId]));
      setContinueReading((current) => mergeUniqueBooks([{ ...book, reading_status: "Reading" }], current));
    } catch (saveError) {
      setSaveFeaturedError(saveError.message || "Could not add this story to your library. Please try again.");
    } finally {
      setSavingFeaturedId("");
    }
  }

  useEffect(() => {
    if (!query) {
      setSearchResults(null);
      setTagResults([]);
      setSearchLoading(false);
      return undefined;
    }
    let active = true;
    setSearchLoading(true);
    const searchRequest = searchScope === "profile"
      ? searchUsers(query)
      : searchScope === "tag"
        ? getTags(query)
      : searchStories(query, genreFilter);
    searchRequest.then((response) => {
      const items = response?.items || response?.books || response || [];
      if (active) {
        setSearchResults(Array.isArray(items) ? items : []);
        if (searchScope === "tag") setTagResults(Array.isArray(items) ? items : []);
      }
    }).catch(() => {
      if (active) setSearchResults(null);
    }).finally(() => {
      if (active) setSearchLoading(false);
    });
    return () => { active = false; };
  }, [query, genreFilter, searchScope]);

  useEffect(() => {
    if (!query) {
      recordedSearchRef.current = "";
      return;
    }
    const key = `${searchScope}:${query.toLocaleLowerCase()}`;
    if (recordedSearchRef.current === key) return;
    recordedSearchRef.current = key;
    let previous = [];
    try {
      const stored = JSON.parse(localStorage.getItem(historyStorageKey) || "[]");
      if (Array.isArray(stored)) previous = stored;
    } catch {
      previous = [];
    }
    const next = capSearchHistory([{ term: query, scope: searchScope }, ...previous.filter(
      (entry) => entry.term?.toLocaleLowerCase() !== query.toLocaleLowerCase() || entry.scope !== searchScope,
    )]);
    localStorage.setItem(historyStorageKey, JSON.stringify(next));
    if (!guest && getToken()) saveSearchHistory(query, searchScope).catch(() => {});
  }, [query, searchScope, historyStorageKey, guest]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [boot, recommendationRes, tagRes, contestRes, genreRes, genreCountRes, statsRes, reviewRes, listRes] = await Promise.all([
          getBootstrap(),
          getRecommendations().catch(() => ({ items: [] })),
          getTags().catch(() => ({ items: [] })),
          getContests().catch(() => ({ items: [] })),
          getGenres().catch(() => ({ items: [] })),
          getGenreStoryCounts().catch((countError) => ({ items: [], error: countError.message || "Genre counts could not load." })),
          getPublicLandingStats().catch(() => null),
          getPublicReviews().catch(() => ({ items: [] })),
          getPublicReadingLists(),
        ]);
        if (!cancelled) {
          applyHomeBootstrap(boot, recommendationRes);
          setContests(contestRes?.items || []);
          const genreItems = genreRes?.items || genreRes || [];
          setGenres([...new Set((Array.isArray(genreItems) ? genreItems : [])
            .map((item) => typeof item === "string" ? item : item?.name)
            .filter(Boolean))]);
          const genreCountItems = Array.isArray(genreCountRes?.items) ? genreCountRes.items : [];
          setGenreStoryCounts(genreCountItems.filter((item) => item?.name && Number(item.story_count) > 0));
          setGenreCountError(genreCountRes?.error || "");
          setPublicStats(statsRes && typeof statsRes === "object" ? statsRes : null);
          const raw = tagRes?.items || tagRes || [];
          setTags(normalizeTags(raw));
          setTopReviews(reviewRes?.items || []);
          const publicLists = Array.isArray(listRes?.items) ? listRes.items : [];
          setHomeReadingLists(publicLists.filter((list) => Number(list?.story_count || 0) > 0));
        }
      } catch (e) {
        if (!cancelled) setError(String(e.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [personalizationKey]);

  useEffect(() => {
    const popularTags = tags
      .filter((tag) => Number(tag.book_count || 0) > 0)
      .slice(0, 8);
    if (!popularTags.length) {
      setTagCovers({});
      return undefined;
    }

    let active = true;
    Promise.all(popularTags.map(async (tag) => {
      const response = await getTagBooks(tag.name, "top");
      const books = Array.isArray(response?.items)
        ? response.items
        : Array.isArray(response?.books) ? response.books : [];
      // Home hashtag collage: only related story covers (not admin hashtag hero/cover_path)
      const covers = [...new Set(
        books
          .map((book) => resolveAssetUrl(
            book?.cover_path
            || book?.coverPath
            || book?.cover_url
            || book?.coverUrl
            || ""
          ))
          .filter(Boolean),
      )].slice(0, 3);
      while (covers.length > 0 && covers.length < 3) covers.push(covers[covers.length - 1]);
      return [normalizedTagName(tag.name), covers];
    })).then((entries) => {
      if (active) setTagCovers(Object.fromEntries(entries));
    }).catch((error) => {
      console.warn("Could not load popular tag cover collages:", error);
      if (active) setTagCovers({});
    });

    return () => { active = false; };
  }, [tags]);

  useEffect(() => {
    setContinueReading([]);
    if (!getToken() || !user) {
      setContinueReading([]);
      return undefined;
    }
    let active = true;
    (async () => {
      try {
        const response = await getLibrary();
        const entries = Array.isArray(response) ? response : response?.items || response?.books || [];
        const stories = entries.map((entry) => {
          const book = entry?.book || entry?.story || entry;
          const id = book?.id ?? entry?.book_id ?? entry?.story_id;
          return id == null ? null : {
            ...book,
            id,
            reading_status: entry?.reading_status || book?.reading_status || "Reading",
            chapters: entry?.chapters ?? book?.chapters ?? 0,
            last_chapter_number: entry?.last_chapter_number ?? book?.last_chapter_number ?? 1,
            last_paragraph_index: entry?.last_paragraph_index ?? book?.last_paragraph_index ?? 0,
            chapters_read: entry?.chapters_read ?? book?.chapters_read ?? 0,
            reading_progress_percent: entry?.reading_progress_percent ?? book?.reading_progress_percent ?? null,
          };
        }).filter(Boolean);
        if (active) {
          setLibraryIds(new Set(stories.map((book) => String(book.id))));
          setContinueReading(stories.filter((book) => !isReadingCompleted(book)));
        }
      } catch {
        if (active) {
          setLibraryIds(new Set());
          setContinueReading([]);
        }
      }
    })();
    return () => { active = false; };
  }, [user?.user_id, user?.id, user?.email]);

  const allBooks = useMemo(() => collectBooks(data), [data]);
  const discoveryBooks = shuffledBooks.length ? shuffledBooks : allBooks;
  const qParam = query.toLowerCase();
  const isFiltered = Boolean(qParam || genreFilter || statusFilter !== "all" || sortFilter !== "popular");
  const filteredBooks = useMemo(() => {
    const source = qParam && Array.isArray(searchResults) ? searchResults : allBooks;
    const filtered = source.filter((book) => {
      const status = String(book.status_text || book.status || "").toLowerCase();
      const completed = book.is_completed === true || Number(book.is_completed) === 1 || /complete|finished/.test(status);
      if (statusFilter === "complete" && !completed) return false;
      if (statusFilter === "ongoing" && completed) return false;
      const genre = `${book.genre || ""} ${book.primary_genre || ""} ${book.secondary_genre || ""}`.toLowerCase();
      if (genreFilter && genre && !genre.includes(genreFilter.toLowerCase())) return false;
      if (qParam && !Array.isArray(searchResults)) {
        const blob = `${book.title || ""} ${book.author || ""} ${genre} ${book.description || ""}`.toLowerCase();
        if (!blob.includes(qParam)) return false;
      }
      return true;
    });
    return filtered.sort((a, b) => {
      if (sortFilter === "newest") return String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || ""));
      if (sortFilter === "rating") return Number(b.rating || 0) - Number(a.rating || 0);
      return Number(b.view_count || b.read_count || 0) - Number(a.view_count || a.read_count || 0);
    });
  }, [allBooks, searchResults, qParam, genreFilter, statusFilter, sortFilter]);
  const authorResults = searchScope === "profile" && Array.isArray(searchResults) ? searchResults : [];

  const trending = useMemo(() => {
    const apiTrending = !isFiltered && Array.isArray(data?.trending) ? data.trending : [];
    const sectionTrending = !isFiltered
      ? discoveryBooks.filter((book) => String(book.section_name || "").toLowerCase() === "trending")
      : [];
    const source = qParam && Array.isArray(searchResults) ? searchResults : filteredBooks;
    const ranked = apiTrending.length
      ? apiTrending
      : sectionTrending.length
        ? sectionTrending
        : [...source].sort((a, b) =>
          Number(b.view_count || 0) - Number(a.view_count || 0) || Number(b.rating || 0) - Number(a.rating || 0)
        );
    return ranked.slice(0, 16);
  }, [data, discoveryBooks, filteredBooks, isFiltered, qParam, searchResults]);

  const recommendedBooks = useMemo(() => {
    const source = Array.isArray(data?.recommendations) ? data.recommendations : [];
    const trendingIds = new Set(trending.map((book) => String(book.id)));
    return source.filter((book) => book?.id != null && !trendingIds.has(String(book.id))).slice(0, 16);
  }, [data?.recommendations, trending]);
  const recommendedShelfBooks = useMemo(
    () => mergeUniqueBooks(recommendedBooks, discoveryBooks).slice(0, 15),
    [recommendedBooks, discoveryBooks],
  );
  const featuredBooks = mergeUniqueBooks(
    getSectionBooks(data, "featured"),
    getSectionBooks(data, "editor_picks"),
    getSectionBooks(data, "editors_picks"),
    data?.featured_book ? [data.featured_book] : [],
  );
  const heroBooks = mergeUniqueBooks(
    featuredBooks,
    Array.isArray(data?.trending) ? data.trending : [],
    discoveryBooks,
  ).slice(0, 5);
  const topGenres = genreStoryCounts;

  usePageMeta({
    title: qParam ? `Search results for "${qParam}" | Wingsaga` : genreFilter ? `${genreFilter} Stories | Wingsaga` : "Home | Free Stories on Wingsaga",
    description: "Find free novels and stories. Read trending books, follow authors, and start writing on Wingsaga.",
    canonicalPath: "/",
    noIndex: Boolean(qParam),
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Wingsaga",
      url: "https://wingsaga.com/",
      potentialAction: {
        "@type": "SearchAction",
        target: "https://wingsaga.com/?q={search_term_string}",
        "query-input": "required name=search_term_string",
      },
    },
  });

  const renderGenreShelf = (genre, layout = "standard") => {
    const books = byGenre(discoveryBooks, genre);
    if (books.length < 3) return null;
    return (
      <Shelf
        key={genre}
        title={genre}
        books={books.slice(0, 14)}
        seeAllTo={`/genres/${encodeURIComponent(genre.split(" ")[0])}`}
        className={`shelf--${layout}`}
        inkittStyle
        deferUntilVisible
      />
    );
  };

  if (loading && (!guest || qParam)) return <main className="home-loading page-shell" aria-live="polite"><span className="eyebrow">OPENING THE STORY SHELVES</span><div className="home-loading-line" /><div className="home-loading-grid">{Array.from({ length: 5 }, (_, index) => <div className="home-loading-cover" key={index} />)}</div></main>;
  if (error && !guest) return <main className="container page home-error"><span className="eyebrow">WINGSAGA</span><h1>Your next story is just around the page.</h1><p className="meta">We couldn’t load the shelves right now. Check your connection and try again.</p><button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Try again</button></main>;
  // Non-logged-in (guest) users get the full marketing landing page
  if (guest && location.pathname === "/" && !qParam && !isFiltered) {
    return (
      <GuestLandingPage
        stories={discoveryBooks}
        genres={genres}
        stats={publicStats || {}}
        error={error}
        loading={loading}
      />
    );
  }

  if (location.pathname === "/" && !qParam && !isFiltered) {
    return (
      <main className={`home-wattpad home-page home-page--minimal${guest ? " home-page--guest" : ""}`}>
        <div className="discovery-home discovery-home--hero-only">
          <DiscoveryHero
            books={heroBooks}
            curated={featuredBooks.some((book) => String(book.id) === String(heroBooks[0]?.id))}
            guest={guest}
            libraryIds={libraryIds}
            onSave={addFeaturedToLibrary}
            savingId={savingFeaturedId}
            saveError={saveFeaturedError}
          />
          <section className="home-parity-section" aria-label="Recommended stories">
            <TrendingGrid title="Recommended For You" books={recommendedShelfBooks} seeAllTo={null} carousel deferUntilVisible />
          </section>
          <ContinueReadingShelf books={continueReading} onResume={resumeReading} resumingId={resumingId} resumeMessage={resumeMessage} />
          {topGenres.length || genreCountError ? (
            <section className="home-top-genres trending-section full-bleed" aria-labelledby="home-top-genres-title">
              <div className="full-bleed-inner">
                <div className="trending-header">
                  <div className="trending-heading-copy">
                    <h2 id="home-top-genres-title" className="trending-title">Top Genres</h2>
                  </div>
                </div>
                {topGenres.length ? (
                  <ArrowCarousel
                    className="home-top-genres-track"
                    itemClassName="home-top-genre-slide"
                    label="Top genres"
                    previousLabel="Previous top genres"
                    nextLabel="Next top genres"
                    stepByItem
                  >
                    {topGenres.map((genre) => (
                      <Link to={`/genres/${encodeURIComponent(genre.name)}`} className="home-top-genre" key={genre.name}>
                        <strong>{genre.name}</strong>
                        <small>{Number(genre.story_count).toLocaleString()} {Number(genre.story_count) === 1 ? "story" : "stories"}</small>
                      </Link>
                    ))}
                  </ArrowCarousel>
                ) : <p className="meta" role="status">Story counts are temporarily unavailable.</p>}
              </div>
            </section>
          ) : null}
          <section className="home-parity-section" aria-label="Trending stories">
            <TrendingGrid title="Trending Now" books={trending} seeAllTo={null} carousel deferUntilVisible />
          </section>
          {homeReadingLists.length ? <ReadingListsRow lists={homeReadingLists} /> : null}
          <DiscoverStorySections books={discoveryBooks} />
          <PopularTagsRow tags={tags} tagCovers={tagCovers} />
        </div>
      </main>
    );
  }
  return (
    <main className={`home-wattpad home-page${guest ? " home-page--guest" : ""}${qParam ? " home-page--searching" : ""}`}>
      <div className="home-dashboard">
      <div className="home-dashboard-content">
      {!isFiltered && !qParam ? (
        <div className="discovery-home discovery-home--hero-only">
          <DiscoveryHero
            books={heroBooks}
            curated={featuredBooks.some((book) => String(book.id) === String(heroBooks[0]?.id))}
            guest={guest}
            libraryIds={libraryIds}
            onSave={addFeaturedToLibrary}
            savingId={savingFeaturedId}
            saveError={saveFeaturedError}
          />
        </div>
      ) : null}
      {!qParam ? (
        <div className="home-feed-toolbar">
          <details className="home-feed-filter">
            <summary aria-label="Filter stories">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16l-6.2 7.2v5.1l-3.6 1.8v-6.9L4 5Z" /></svg>
              <span>Filter:</span><span className="home-feed-filter-current">{statusFilter === "complete" ? "Completed" : sortFilter === "newest" ? "Recently updated" : "Popular"}</span>
              <span className="home-feed-filter-chevron" aria-hidden="true">⌄</span>
            </summary>
            <div className="home-feed-filter-menu" role="group" aria-label="Story sorting">
              {[['popular', 'Popular'], ['newest', 'Recently updated'], ['complete', 'Completed']].map(([value, label]) => {
                const active = value === 'complete' ? statusFilter === 'complete' : statusFilter !== 'complete' && sortFilter === value;
                return <button key={label} type="button" className={active ? 'active' : ''} onClick={(event) => {
                  const next = new URLSearchParams(searchParams);
                  if (value === 'complete') { next.set('status', 'complete'); next.delete('sort'); }
                  else { next.delete('status'); if (value === 'popular') next.delete('sort'); else next.set('sort', value); }
                  setSearchParams(next);
                  event.currentTarget.closest('details')?.removeAttribute('open');
                }}>{label}</button>;
              })}
            </div>
          </details>
        </div>
      ) : null}
      {error && guest ? <p className="guest-data-notice" role="status">Live story shelves are temporarily unavailable. The landing preview and navigation are still available. <button type="button" onClick={() => window.location.reload()}>Try again</button></p> : null}

      {qParam ? (
        <div className="home-search-heading">
          <div className="search-scope-tabs" role="tablist" aria-label="Search results">
            {[['title', 'Titles'], ['tag', 'Tags'], ['profile', 'Profiles']].map(([scope, label]) => (
              <button key={scope} type="button" role="tab" aria-selected={searchScope === scope} className={searchScope === scope ? 'active' : ''} onClick={() => {
                const next = new URLSearchParams(searchParams);
                if (scope === 'title') next.delete('type'); else next.set('type', scope);
                setSearchParams(next);
              }}>{label}</button>
            ))}
          </div>
          <p className="meta">{searchLoading ? 'Searching…' : searchScope === 'profile' ? `${authorResults.length} people found` : searchScope === 'tag' ? `${tagResults.length} tags found` : `${trending.length} stories found`}</p>
          <Link className="btn btn-ghost btn-sm" to="/">Clear search</Link>
        </div>
      ) : null}

      {qParam && searchScope === 'profile' ? (
        <section className="home-search-results" aria-label="Author search results">
          {authorResults.length ? <div className="author-search-grid">{authorResults.map((author) => {
            const authorName = author.display_name || author.username || 'Author';
            const photo = author.photo_url || author.avatar_url || '';
            return <Link className="author-search-card" key={author.id} to={`/authors/${author.id}`}><span className="author-search-avatar">{photo ? <img src={resolveAssetUrl(photo)} alt="" /> : authorName.slice(0, 1).toUpperCase()}</span><span className="author-search-copy"><strong>{authorName}</strong><small>{author.username || 'Wingsaga author'}</small>{author.bio ? <span>{author.bio}</span> : null}</span></Link>;
          })}</div> : <div className="card-panel search-empty"><h2>No people found</h2><p className="meta">Try another author name or username.</p></div>}
        </section>
      ) : null}
      {qParam && searchScope === 'tag' ? (
        <section className="home-search-results" aria-label="Tag search results">
          {tagResults.length ? <div className="author-search-grid">{tagResults.map((tag) => { const name = typeof tag === 'string' ? tag : tag?.name; return name ? <Link className="author-search-card" key={name} to={`/tags/${encodeURIComponent(name)}`}><span className="author-search-avatar">#</span><span className="author-search-copy"><strong>#{name.replace(/^#/, '')}</strong><small>{tag.book_count || 0} stories</small></span></Link> : null; })}</div> : <div className="card-panel search-empty"><h2>No tags found</h2><p className="meta">Try a different tag.</p></div>}
        </section>
      ) : null}
      {(!qParam || searchScope === 'title') ? <TrendingGrid title={qParam ? `Results for “${searchParams.get('q') || ''}”` : genreFilter ? `${genreFilter} stories` : statusFilter === 'complete' ? 'Completed stories' : sortFilter === 'newest' ? 'Recently updated stories' : isFiltered ? 'Trending Now' : 'Top 10 Trending Stories'} subtitle={!qParam ? 'The most popular stories this week' : ''} books={isFiltered ? trending : trending.slice(0, 10)} seeAllTo={null} carousel={!qParam} ranked={!isFiltered} onRefresh={!isFiltered ? refreshHome : undefined} refreshing={refreshing} deferUntilVisible={!isFiltered && !qParam} /> : null}
      {qParam && searchScope === 'title' && !searchLoading && trending.length === 0 ? <div className="home-search-results card-panel search-empty"><h2>No stories found</h2><p className="meta">Try another title, author, or genre.</p></div> : null}

      {!isFiltered && !qParam ? <TrendingGrid title="Recommended For You" subtitle="Based on your reading history" books={recommendedBooks} seeAllTo={null} carousel deferUntilVisible /> : null}
      {!isFiltered && !qParam ? <ReadingListsRow lists={homeReadingLists} /> : null}
      {!isFiltered && !qParam ? <PopularTagsRow tags={tags} tagCovers={tagCovers} /> : null}
      {!isFiltered && !qParam ? renderGenreShelf('Contemporary Romance', 'compact') : null}
      {!isFiltered && !qParam ? renderGenreShelf('Thriller') : null}
      {!isFiltered && !qParam ? renderGenreShelf('Sci-Fi') : null}
      {!isFiltered && !qParam ? <TopReviewsRow reviews={topReviews} /> : null}
      {!isFiltered && !qParam ? renderGenreShelf('Dark Romance', 'spotlight') : null}
      {!isFiltered && !qParam ? renderGenreShelf('LGBTQ+') : null}
      {!isFiltered && !qParam ? renderGenreShelf('Werewolves & Shifters') : null}
      {!isFiltered && !qParam ? renderGenreShelf('Horror') : null}
      {!isFiltered && !qParam ? renderGenreShelf('Fantasy', 'spotlight') : null}
      {!isFiltered && !qParam ? <ContinueReadingShelf books={continueReading} onResume={resumeReading} resumingId={resumingId} resumeMessage={resumeMessage} /> : null}
      {!isFiltered && !qParam && Array.isArray(data?.recently_updated) && data.recently_updated.length ? <Shelf title="Recently Updated" books={data.recently_updated} seeAllTo="/?sort=newest" inkittStyle deferUntilVisible /> : null}
      {!isFiltered && !qParam && Array.isArray(data?.recently_completed) && data.recently_completed.length ? <Shelf title="Completed Stories" books={data.recently_completed} seeAllTo="/?status=complete" inkittStyle deferUntilVisible /> : null}
      {!isFiltered && !qParam && guest ? <section className="home-join-strip"><div><span>READ, WRITE, AND FOLLOW ALONG</span><h2>Find your next favorite story.</h2></div><Link className="btn btn-primary" to="/login">Join Wingsaga</Link></section> : null}
        </div>
      </div>
    </main>
  );
}
