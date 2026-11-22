import { useEffect, useMemo, useState } from "react";
import { getBootstrap, resolveAssetUrl } from "../api";

function flattenBooks(bootstrap) {
  const sources = [
    bootstrap?.discover_books,
    bootstrap?.recently_updated,
    bootstrap?.recently_completed,
    bootstrap?.trending,
    bootstrap?.featured_book,
  ];
  const byId = new Map();
  sources.forEach((source) => {
    const rows = Array.isArray(source) ? source : source ? [source] : [];
    rows.forEach((row) => {
      const book = row?.book || row;
      if (book?.id != null && book.cover_path) byId.set(String(book.id), book);
    });
  });
  return [...byId.values()];
}

function routeCopy(pathname, books) {
  const storyMatch = pathname.match(/^\/stories\/(\d+)/);
  const story = storyMatch
    ? books.find((book) => String(book.id) === storyMatch[1])
    : null;
  if (pathname.includes("/chapters/")) {
    return {
      eyebrow: "KEEP READING",
      title: story?.title || "Your next chapter",
      description: story?.author ? `A story by ${story.author}` : "Continue the story.",
      preferredBook: story,
    };
  }
  if (storyMatch) {
    return {
      eyebrow: "STORY SPOTLIGHT",
      title: story?.title || "A story worth staying for",
      description: story?.author ? `Find more from ${story.author}.` : "Find your next favorite story.",
      preferredBook: story,
    };
  }

  const genreMatch = pathname.match(/^\/genres\/(.+)$/);
  if (genreMatch) {
    const genre = decodeURIComponent(genreMatch[1]);
    return {
      eyebrow: "BROWSE THE SHELVES",
      title: genre === "Stories" ? "Stories" : `${genre} stories`,
      description: "Find a new world, voice, or favorite author.",
    };
  }

  if (pathname.startsWith("/authors/")) {
    return { eyebrow: "AUTHOR SPOTLIGHT", title: "Meet the author", description: "Explore stories and updates from this writer." };
  }
  if (pathname.startsWith("/write") || pathname.startsWith("/edit") || pathname.startsWith("/manage-stories")) {
    return { eyebrow: "FOR STORYTELLERS", title: "Your writing desk", description: "Shape a story, then share it with readers." };
  }
  if (pathname.startsWith("/account")) {
    return { eyebrow: "YOUR WINGSAGA", title: "Account & settings", description: "Make your reading space your own." };
  }

  const pages = {
    "/library": ["YOUR READING SHELF", "My library", "Pick up where a good story left off."],
    "/profile": ["YOUR WINGSAGA", "Your profile", "Stories, reviews, and reading life."],
    "/notifications": ["YOUR WINGSAGA", "Notifications", "The latest from your reading community."],
    "/community": ["FIND YOUR PEOPLE", "The reader community", "Talk stories with readers and writers."],
    "/contests": ["WRITING CHALLENGES", "Story contests", "A new prompt is the start of something."],
    "/audiobooks": ["LISTEN IN", "Audiobooks", "Find your next story to hear."],
    "/subscription": ["SUPPORT STORYTELLERS", "Author subscriptions", "Meet the writers behind your favorite worlds."],
    "/login": ["WELCOME TO WINGSAGA", "Stories bring us together", "Sign in to keep your library and progress close."],
    "/account/help": ["WE ARE HERE TO HELP", "Help center", "Find answers and support for your account."],
    "/account/contact": ["GET IN TOUCH", "Contact Wingsaga", "Send a note to the team."],
  };
  const [eyebrow, title, description] = pages[pathname] || ["A HOME FOR EVERY STORY", "Find your next great story", "Explore new voices and worlds to get lost in."];
  return { eyebrow, title, description };
}

export default function SiteChrome({ pathname }) {
  const [books, setBooks] = useState([]);
  const [failedCoverPaths, setFailedCoverPaths] = useState(() => new Set());
  const hidePageCover = pathname === "/" || pathname === "/discover" || pathname.startsWith("/stories/") || pathname.startsWith("/write") || pathname.startsWith("/edit") || pathname.startsWith("/manage-stories") || pathname.startsWith("/genres/") || pathname.startsWith("/tags/") || pathname.startsWith("/authors/") || pathname.startsWith("/account") || ["/profile", "/library", "/notifications", "/community", "/contests", "/audiobooks", "/subscription", "/login"].includes(pathname);

  useEffect(() => {
    let active = true;
    getBootstrap().catch(() => null).then((bootstrap) => {
      if (!active) return;
      const nextBooks = flattenBooks(bootstrap);
      if (nextBooks.length) setBooks(nextBooks);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => setFailedCoverPaths(new Set()), [pathname]);

  const copy = useMemo(() => routeCopy(pathname, books), [pathname, books]);
  const coverCandidates = useMemo(() => {
    if (!books.length) return copy.preferredBook ? [copy.preferredBook] : [];
    const seed = [...pathname].reduce((total, char) => (total * 31 + char.charCodeAt(0)) >>> 0, 7);
    return [copy.preferredBook, ...books.slice(seed % books.length), ...books.slice(0, seed % books.length)]
      .filter((candidate, index, rows) => candidate?.cover_path && rows.findIndex((row) => row?.cover_path === candidate.cover_path) === index);
  }, [books, copy.preferredBook, pathname]);
  const coverBook = coverCandidates.find((candidate) => !failedCoverPaths.has(candidate.cover_path));
  const coverUrl = coverBook ? resolveAssetUrl(coverBook.cover_path) : "";

  return (
    <>
      {!hidePageCover ? (
        <section className="page-cover" aria-label={`${copy.title} cover`}>
          {coverUrl ? (
            <img
              className="page-cover-image"
              src={coverUrl}
              alt=""
              onError={() => setFailedCoverPaths((paths) => new Set([...paths, coverBook.cover_path]))}
            />
          ) : null}
          <div className="page-cover-shade" />
          <div className="page-cover-copy">
            <span className="page-cover-eyebrow">{copy.eyebrow}</span>
            <h1>{copy.title}</h1>
            <p>{copy.description}</p>
            {coverBook?.title && !copy.preferredBook ? (
              <span className="page-cover-credit">Cover: {coverBook.title}</span>
            ) : null}
          </div>
          <span className="page-cover-orbit" aria-hidden="true">✦</span>
        </section>
      ) : null}
    </>
  );
}
