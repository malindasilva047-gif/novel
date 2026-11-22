import ArrowCarousel from "./ArrowCarousel";
import BookCard from "./BookCard";
import StoryCardPack from "./StoryCardPack";

const DISCOVER_SECTION_ORDER = [
  { title: "Featured", keys: ["featured"] },
  { title: "Hot Right Now", keys: ["trending", "hot"], fallback: "top-rated" },
  { title: "New Releases", keys: ["new_releases", "new"], fallback: "recently-updated" },
  { title: "Recently Updated", keys: ["recently_updated"] },
  { title: "Recently Completed", keys: ["recently_completed"], fallback: "completed" },
  { title: "Editors’ Picks", keys: ["editor_picks", "editors_picks"] },
  { title: "Fantasy & Magic", match: /fantasy|magical|mythic/i },
  { title: "Romance & Drama", match: /romance|drama/i },
  { title: "Sci-Fi & Future", match: /scifi|science|cyber|futuristic/i },
  { title: "Mystery & Thrillers", match: /mystery|thriller/i },
  { title: "Horror & Paranormal", match: /horror|paranormal/i },
  { title: "Action & Adventure", match: /action|adventure/i },
];

const RESERVED_SECTION_NAMES = new Set([
  "featured",
  "trending",
  "hot",
  "popular",
  "new",
  "new_releases",
  "recently_updated",
  "recently_completed",
  "editor_picks",
  "editors_picks",
  "discover",
]);

function sectionNames(book) {
  return [...new Set([
    ...(Array.isArray(book.section_names) ? book.section_names : []),
    book.section_name,
  ].map((name) => String(name || "").trim().toLowerCase()).filter(Boolean))];
}

function isCompleted(book) {
  return book.is_completed === true
    || Number(book.is_completed) === 1
    || /complete|finished|published/i.test(String(book.status_text || book.status || ""));
}

function updatedAt(book) {
  return Date.parse(book.updated_at || book.last_updated || book.last_updated_at || book.created_at || "") || 0;
}

function distinctBooks(books) {
  const seen = new Set();
  return books.filter((book) => {
    const key = String(book.id ?? book.title ?? "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildSections(books) {
  const allBooks = distinctBooks(books);
  const topRated = [...allBooks].sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0));
  const recentlyUpdated = allBooks
    .filter((book) => sectionNames(book).includes("recently_updated"))
    .sort((a, b) => updatedAt(b) - updatedAt(a));
  const completed = allBooks.filter(isCompleted);
  const sections = DISCOVER_SECTION_ORDER.map((section) => {
    let matches;
    if (section.keys) {
      matches = allBooks.filter((book) => sectionNames(book).some((name) => section.keys.includes(name)));
      if (!matches.length && section.fallback === "top-rated") matches = topRated;
      if (!matches.length && section.fallback === "recently-updated") matches = recentlyUpdated;
      if (!matches.length && section.fallback === "completed") matches = completed;
    } else {
      matches = allBooks.filter((book) => section.match.test(
        `${book.primary_genre || book.genre || ""} ${book.secondary_genre || ""}`,
      ));
    }
    if (section.title === "Featured" && !matches.length) {
      matches = allBooks.filter((book) => Number(book.rating || 0) >= 4.8);
    }
    return { title: section.title, books: distinctBooks(matches).slice(0, 12) };
  });

  const customNames = [...new Set(allBooks.flatMap(sectionNames)
    .filter((name) => !RESERVED_SECTION_NAMES.has(name)))].sort();
  for (const name of customNames) {
    sections.push({
      title: name.split("_").map((word) => word
        ? `${word[0].toLocaleUpperCase()}${word.slice(1)}`
        : "").join(" "),
      books: allBooks.filter((book) => sectionNames(book).includes(name)).slice(0, 12),
    });
  }
  return sections.filter((section) => section.title === "New Releases"
    ? section.books.length >= 5
    : section.books.length > 0);
}

export default function DiscoverStorySections({ books = [] }) {
  const sections = buildSections(books);
  if (!sections.length) return null;

  return (
    <div className="discover-story-sections" aria-label="Home story collections">
      {sections.map((section) => {
        const bentoPack = section.title === "New Releases";
        const items = bentoPack
          ? Array.from(
            { length: Math.floor(section.books.length / 5) },
            (_, packIndex) => section.books.slice(packIndex * 5, packIndex * 5 + 5),
          )
          : section.books;
        return (
          <section className={`discover-story-rail discover-story-rail--${bentoPack ? "bento" : "single-cards"}`} key={section.title} aria-label={section.title}>
            <h2>{section.title}</h2>
            <ArrowCarousel
              className={`discover-story-track${bentoPack ? " discover-story-track--bento" : ""}`}
              itemClassName={`home-story-card-slot discover-story-item${bentoPack ? " discover-story-item--bento" : " home-story-card-slot--inkitt"}`}
              label={`${section.title} stories`}
              edgeGlow={bentoPack}
              stepByItem={!bentoPack}
              carouselClassName={bentoPack ? "" : "arrow-carousel--inkitt-stories"}
              deferUntilVisible
              deferHeight={bentoPack ? 340 : 260}
            >
              {bentoPack ? items.map((pack, packIndex) => (
                <StoryCardPack
                  key={`${pack[0]?.id || section.title}-${packIndex}`}
                  books={pack}
                  layout="bento"
                  label={`${section.title}, group ${packIndex + 1}`}
                  coverOnly
                />
              )) : items.map((book) => (
                <BookCard key={book.id || book.title} book={book} variant="shelf" inkittStyle />
              ))}
            </ArrowCarousel>
          </section>
        );
      })}
    </div>
  );
}
