(() => {
  const originalFetch = window.fetch.bind(window);
  const books = Array.from({ length: 6 }, (_, i) => ({
    id: 100 + i,
    title: ["The Lantern Keeper", "Paper Hearts", "Salt & Static", "Nine Quiet Doors", "Midnight Ledger", "Crown of Ash"][i],
    author: ["Mara Voss", "J. Almeida", "R. Okafor", "Ilse Brandt", "T. Nakamura", "Lena Ortiz"][i],
    cover_path: "",
    rating: 4.2 + i / 10,
    view_count: 1200 + i * 350,
    primary_genre: "Fantasy",
    description: "A story about late nights, longer roads, and the people who keep reading anyway.",
    status_text: i % 2 ? "Ongoing" : "Completed",
  }));
  const libraryItems = books.slice(0, 4).map((book, i) => ({
    id: 900 + i,
    book_id: book.id,
    book,
    reading_status: i === 3 ? "Completed" : "Reading",
    reading_progress_percent: i === 3 ? 100 : 20 + i * 15,
    last_chapter_number: i + 2,
    last_paragraph_index: 3,
    chapters: 12,
    updated_at: new Date(Date.now() - i * 86400000).toISOString(),
  }));
  const json = (data) => new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    const path = url.replace(window.location.origin, "");
    if (path.startsWith("/api/me")) {
      return json({ user_id: 4242, id: 4242, email: "reader@example.com", display_name: "Test Reader", provider: "google", profile_complete: true, photo_url: "" });
    }
    if (path.startsWith("/api/auth/csrf") || path.startsWith("/api/auth/guest")) {
      return json({ access_token: "x", csrf_token: "x", cookie_session: true });
    }
    if (path.startsWith("/api/library")) return json({ items: libraryItems });
    if (path.startsWith("/api/reading-lists")) return json({ items: [] });
    if (path.startsWith("/api/recommendations")) return json({ items: books });
    if (path.startsWith("/api/books/")) {
      if (/chapters/.test(path)) return json({ items: [{ id: 500, chapter_number: 1 }] });
      return json({ item: books[0], book: books[0] });
    }
    if (path.startsWith("/api/bootstrap")) return json({ genres: [], tags: [] });
    if (path.startsWith("/api/public/genre-covers")) return json({ items: [] });
    if (/\/api\/genres\/[^/]+\/books/.test(path)) return json({ items: books });
    if (path.startsWith("/api/genres")) return json({ items: ["Fantasy", "Romance", "Thriller"], counts: [] });
    if (path.startsWith("/api/contests")) return json({ items: [
      { id: 1, title: "Write the storm", theme: "A night that changes everything, told in fewer than 2,000 words.", deadline: "Closes 12 Dec" },
      { id: 2, title: "Letters never sent", theme: "Epistolary fiction with a secret at its center.", deadline: "Closes 28 Dec", is_neon: true },
      { id: 3, title: "The last light on", theme: "Hope at the end of the world.", deadline: "Open entry" },
    ] });
    if (path.startsWith("/api/public/")) return json({ items: [] });
    if (path.startsWith("/api/search")) return json({ items: books, results: books });
    if (path.startsWith("/api/")) return json({ items: [] });
    return originalFetch(input, init);
  };
  localStorage.setItem("novelhub_web_token", "cookie-session");
  localStorage.setItem("nh-theme", window.__mockTheme || "light");
})()
