import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { resolveAssetUrl } from "../api";
import "./GuestLandingPage.css";

const GENRES = [
  { name: "Romance", colors: ["#ff7a90", "#9d174d"], icon: "♥" },
  { name: "Fantasy", colors: ["#f5b942", "#c2410c"], icon: "✦" },
  { name: "Mystery", colors: ["#94a3b8", "#1e293b"], icon: "☾" },
  { name: "Sci-Fi", colors: ["#67e8f9", "#4c1d95"], icon: "✧" },
  { name: "Horror", colors: ["#a78bfa", "#312e81"], icon: "☠" },
  { name: "Fanfiction", colors: ["#5fd3b5", "#155e75"], icon: "✎" },
  { name: "New Adult", colors: ["#fb923c", "#7f1d1d"], icon: "☼" },
  { name: "Short Story", colors: ["#fde68a", "#db2777"], icon: "❝" },
];

const FAQ = [
  {
    q: "Can I earn from my stories?",
    a: "We are building ways for authors to earn from their work. They are not available yet, so for now the best thing you can do is keep writing and grow your readers.",
  },
  {
    q: "Is it free to read?",
    a: "Yes. Most stories are free. Some authors offer paid chapters or early access.",
  },
  {
    q: "How do I start publishing?",
    a: "Create an account, open the editor and write your first chapter. You can save it as a draft until you are ready.",
  },
  {
    q: "Can I read offline?",
    a: "Yes, you can read smoothly directly through our web platform on any device.",
  },
  {
    q: "Is there a mobile app?",
    a: "Not right now. For now the website works seamlessly on any phone or desktop browser.",
  },
];

const SEARCH_QUERIES = [
  "fake dating",
  "dark academia",
  "enemies to lovers",
  "slow burn",
  "found family",
  "second chance romance",
  "villain origin story",
  "cozy mystery for a rainy day",
];

function useTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("nh-theme") || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    } catch {
      return "light";
    }
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("nh-theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))];
}

function useTypewriter(queries, reduceMotion) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (reduceMotion) {
      setText(queries[0] || "");
      return undefined;
    }
    let i = 0;
    let cancelled = false;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    (async () => {
      while (!cancelled) {
        const q = queries[i++ % queries.length];
        for (const ch of q) {
          if (cancelled) return;
          setText((t) => t + ch);
          await wait(70);
        }
        await wait(1400);
        while (!cancelled) {
          let done = false;
          setText((t) => {
            if (!t) {
              done = true;
              return t;
            }
            return t.slice(0, -1);
          });
          if (done) break;
          await wait(28);
        }
        await wait(400);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [queries, reduceMotion]);
  return text;
}

function formatCount(n) {
  const v = Number(n) || 0;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${Math.round(v / 1e3)}K`;
  return String(v);
}

function StoryCover({ story, index }) {
  const colors = story.accent
    ? [story.accent, "#0D1914"]
    : GENRES[index % GENRES.length].colors;
  return (
    <article className="gl-book">
      <Link to={story.id ? `/stories/${story.id}` : "/"} className="gl-cover" style={{ background: `linear-gradient(160deg,${colors[0]},${colors[1]})` }}>
        {story.cover ? (
          <img src={story.cover} alt="" loading="lazy" />
        ) : (
          <span className="gl-cover-title">{story.title}</span>
        )}
        {story.badge ? <em className="gl-badge">{story.badge}</em> : null}
      </Link>
      <p>{story.title}</p>
      <small>by {story.author}</small>
    </article>
  );
}

export default function GuestLandingPage({ stories = [], genres = [], stats = {}, error = "", loading = false }) {
  const [theme, toggleTheme] = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeGenre, setActiveGenre] = useState("All");
  const [openFaq, setOpenFaq] = useState(null);
  const shelfRef = useRef(null);
  const reduceMotion = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  const typed = useTypewriter(SEARCH_QUERIES, reduceMotion);

  const shelfStories = useMemo(() => {
    const list = (Array.isArray(stories) ? stories : [])
      .filter((s) => s?.id != null)
      .slice(0, 16)
      .map((s, i) => ({
        id: s.id,
        title: s.title || "Untitled story",
        author: s.author || s.author_name || "Wingsaga author",
        genre: s.primary_genre || s.genre || s.secondary_genre || "Stories",
        cover: resolveAssetUrl(s.cover_path || s.coverPath || s.cover_image || s.image || ""),
        accent: s.accent_hex || GENRES[i % GENRES.length].colors[0],
        badge: i % 5 === 0 ? "Trending" : i % 7 === 0 ? "New" : null,
      }));
    if (list.length) return list;
    return GENRES.slice(0, 8).map((g, i) => ({
      id: null,
      title: `${g.name} story`,
      author: "Wingsaga",
      genre: g.name,
      cover: "",
      accent: g.colors[0],
      badge: i % 3 === 0 ? "Staff pick" : null,
    }));
  }, [stories]);

  const filteredShelf = activeGenre === "All"
    ? shelfStories
    : shelfStories.filter((s) => String(s.genre).toLowerCase().includes(activeGenre.toLowerCase()));

  const genreChips = useMemo(() => {
    const fromApi = [...new Set((Array.isArray(genres) ? genres : []).map((g) => String(g || "").trim()).filter(Boolean))];
    const names = fromApi.length ? fromApi.slice(0, 8) : GENRES.map((g) => g.name);
    return ["All", ...names];
  }, [genres]);

  const displayStats = {
    stories: Number(stats?.stories) || 120000,
    comments: Number(stats?.comments) || 2400000,
    writers: Number(stats?.writers) || 48000,
  };

  useEffect(() => {
    document.title = "Wingsaga – Stories worth staying up for";
  }, []);

  function scrollShelf(dir) {
    shelfRef.current?.scrollBy({ left: dir * 420, behavior: "smooth" });
  }

  return (
    <div className="gl-root" data-theme={theme}>
      <nav className="gl-nav">
        <div className="gl-wrap gl-nav-inner">
          <Link to="/" className="gl-logo" aria-label="Wingsaga home">
            <span className="gl-logo-mark">W</span>
            Wingsaga
          </Link>
          <div className="gl-nav-links">
            <a href="#search">Search</a>
            <a href="#discover">Discover</a>
            <a href="#community">Community</a>
            <a href="#write">Write</a>
          </div>
          <div className="gl-auth">
            <button type="button" className="gl-theme" onClick={toggleTheme} aria-label="Toggle dark mode">
              {theme === "dark" ? "☀" : "☾"}
            </button>
            <Link to="/login" className="gl-btn gl-btn-ghost">Log in</Link>
            <Link to="/login" className="gl-btn gl-btn-lamp">Sign up</Link>
          </div>
          <button type="button" className="gl-menu-btn" aria-label="Menu" onClick={() => setMenuOpen((o) => !o)}>
            ☰
          </button>
        </div>
        {menuOpen ? (
          <div className="gl-mobile-nav">
            <a href="#search" onClick={() => setMenuOpen(false)}>Search</a>
            <a href="#discover" onClick={() => setMenuOpen(false)}>Discover</a>
            <a href="#community" onClick={() => setMenuOpen(false)}>Community</a>
            <a href="#write" onClick={() => setMenuOpen(false)}>Write</a>
            <Link to="/login" className="gl-btn gl-btn-ghost" onClick={() => setMenuOpen(false)}>Log in</Link>
            <Link to="/login" className="gl-btn gl-btn-lamp" onClick={() => setMenuOpen(false)}>Sign up</Link>
          </div>
        ) : null}
      </nav>

      <header className="gl-hero" id="top">
        <div className="gl-wrap gl-hero-grid">
          <div>
            <h1>
              Stories worth <em>staying up</em> for.
            </h1>
            <p className="gl-lede">
              Read original fiction, react to the exact line that got you, and talk it through with readers who finished the chapter at 2 a.m. too.
            </p>
            <div className="gl-hero-btns">
              <a href="#write" className="gl-btn gl-btn-lamp">Write your story</a>
              <a href="#discover" className="gl-btn gl-btn-ghost">Browse stories</a>
            </div>
            <div className="gl-stats">
              <div>
                <b>{formatCount(displayStats.stories)}</b>
                stories
              </div>
              <div>
                <b>{formatCount(displayStats.comments)}</b>
                comments
              </div>
              <div>
                <b>{formatCount(displayStats.writers)}</b>
                writers
              </div>
            </div>
            {error ? <p className="gl-error-hint">Live shelves are warming up — explore the community below.</p> : null}
          </div>
          <div className="gl-scene" aria-hidden="true">
            <div className="gl-scene-card gl-scene-writer">
              <span className="gl-tag">Writer</span>
              <div className="gl-doc">
                <span>She struck the first match.</span>
                <span>The dark leaned in.</span>
                <span>“Four left,” she said.</span>
              </div>
            </div>
            <div className="gl-scene-card gl-scene-reader">
              <span className="gl-tag">Reader</span>
              <div className="gl-hearts">❤ 🔥 💛</div>
            </div>
            <div className="gl-pill gl-pill-like">
              <span>♥</span> readers loved this
            </div>
          </div>
        </div>
      </header>

      <section className="gl-gg">
        <div className="gl-wrap">
          <div className="gl-ggrid">
            {GENRES.map((g) => (
              <Link
                key={g.name}
                to={`/genres/${encodeURIComponent(g.name)}`}
                className="gl-gt"
              >
                <u style={{ background: `linear-gradient(160deg,${g.colors[0]},${g.colors[1]})` }}>{g.icon}</u>
                {g.name}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section id="search" className="gl-sx">
        <div className="gl-wrap gl-sxg">
          <div>
            <h2>Search by mood, trope or vibe</h2>
            <p className="gl-lede" style={{ marginTop: 18 }}>
              Type what you feel like reading. We’ll find stories that match, even if you don’t know the title.
            </p>
          </div>
          <div className="gl-sxs">
            <div className="gl-sbar">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-4-4" />
              </svg>
              <span className="gl-typed">{typed}</span>
              <i className="gl-caret" />
            </div>
            <Link to="/login" className="gl-btn gl-btn-lamp gl-search-cta">Start searching</Link>
          </div>
        </div>
      </section>

      <section id="discover" className="gl-discover">
        <div className="gl-wrap">
          <div className="gl-head">
            <h2>
              Find your next
              <br />
              late-night read
            </h2>
            <div className="gl-arrows">
              <button type="button" aria-label="Scroll left" onClick={() => scrollShelf(-1)}>←</button>
              <button type="button" aria-label="Scroll right" onClick={() => scrollShelf(1)}>→</button>
            </div>
          </div>
          <div className="gl-chips" role="group" aria-label="Filter by genre">
            {genreChips.map((g) => (
              <button
                key={g}
                type="button"
                className="gl-chip"
                aria-pressed={activeGenre === g}
                onClick={() => setActiveGenre(g)}
              >
                {g}
              </button>
            ))}
          </div>
          <div className="gl-shelf-wrap">
            <div className="gl-shelf" ref={shelfRef} tabIndex={0} aria-label="Story shelf">
              {(filteredShelf.length ? filteredShelf : shelfStories).map((s, i) => (
                <StoryCover key={s.id || `${s.title}-${i}`} story={s} index={i} />
              ))}
            </div>
          </div>
          {loading ? <p className="gl-meta">Loading stories…</p> : null}
        </div>
      </section>

      <section id="community" className="gl-community">
        <div className="gl-wrap gl-split">
          <div>
            <h2>Comment on a line, not just a chapter</h2>
            <p className="gl-lede" style={{ marginTop: 16 }}>
              Highlight any paragraph and start a thread right where the moment happened.
            </p>
            <div className="gl-features">
              <div>
                <h3>Paragraph threads</h3>
                <p>Reactions stay attached to the exact sentence that earned them.</p>
              </div>
              <div>
                <h3>Reading circles</h3>
                <p>Follow a story together and unlock chapters on a shared schedule.</p>
              </div>
              <div>
                <h3>Author replies</h3>
                <p>Writers answer in the margin, where readers will actually see it.</p>
              </div>
            </div>
          </div>
          <div className="gl-ca" aria-label="Comment example">
            <p className="gl-ln gl-ln-on">
              Mara counted the matches. Four.
              <span className="gl-n">💬 2</span>
            </p>
            <div className="gl-msg">
              <div className="gl-av" style={{ background: "#F4CC2F", color: "#202020" }}>i</div>
              <div>
                <b>inkandtea</b>
                Four?? I can&apos;t breathe.
              </div>
            </div>
            <div className="gl-msg">
              <div className="gl-av" style={{ background: "#205B4C" }}>p</div>
              <div>
                <b>pagefox</b>
                Already scared for her.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="roles" className="gl-roles-sec">
        <div className="gl-wrap gl-roles">
          <div className="gl-role gl-role-w">
            <h3>If you write</h3>
            <p>Draft in a quiet editor, publish a chapter at a time, and watch the comments arrive line by line.</p>
            <Link to="/write" className="gl-btn gl-btn-lamp" style={{ marginTop: 18 }}>Open Write Studio</Link>
          </div>
          <div className="gl-role gl-role-r">
            <h3>If you read</h3>
            <p>Follow authors, react as you go, and never lose your place between phone and web.</p>
            <Link to="/login" className="gl-btn gl-btn-ghost" style={{ marginTop: 18 }}>Create free account</Link>
          </div>
        </div>
      </section>

      <section id="write" className="gl-write">
        <div className="gl-wrap">
          <div style={{ maxWidth: 640 }}>
            <h2>Write it here. Grow it here.</h2>
            <p className="gl-lede" style={{ marginTop: 16 }}>
              Publish chapter by chapter, see where readers react, and build an audience around the stories you finish.
            </p>
          </div>
          <div className="gl-cards">
            <div className="gl-tile">
              <div className="gl-ic" style={{ background: "color-mix(in srgb, var(--gl-lamp) 14%, transparent)", color: "var(--gl-lamp)" }}>✎</div>
              <h3>A calm editor</h3>
              <p>Distraction-free drafting with autosave, chapter scheduling and cover tools built in.</p>
            </div>
            <div className="gl-tile">
              <div className="gl-ic" style={{ background: "rgba(244,204,47,.22)", color: "var(--gl-lamp2)" }}>♥</div>
              <h3>Reader insight</h3>
              <p>See which lines readers highlight and where they drop off, chapter by chapter.</p>
            </div>
            <div className="gl-tile">
              <div className="gl-ic" style={{ background: "color-mix(in srgb, var(--gl-lamp2) 14%, transparent)", color: "var(--gl-lamp2)" }}>◈</div>
              <h3>Build your following</h3>
              <p>Followers, reading lists and shares help new readers find your story and stay for the next chapter.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="faq" className="gl-faq-sec">
        <div className="gl-wrap">
          <h2 style={{ textAlign: "center" }}>Questions, answered</h2>
          <div className="gl-faq">
            {FAQ.map((item, i) => (
              <details key={item.q} open={openFaq === i} onToggle={(e) => setOpenFaq(e.target.open ? i : null)}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <footer className="gl-footer">
        <div className="gl-band">
          <h2>Write your own bestseller</h2>
          <p>Your story could be the next big hit. Join a community that finds tomorrow&apos;s favorite authors today.</p>
          <Link to="/login" className="gl-btn">Start writing</Link>
        </div>
        <div className="gl-fmain">
          <div className="gl-wrap gl-fgrid">
            <div>
              <h4>About us</h4>
              <p>Wingsaga is a home for original stories, where readers react line by line and writers grow alongside them.</p>
            </div>
            <div>
              <h4>For authors</h4>
              <Link to="/write">Start writing</Link>
              <Link to="/login">Guidelines</Link>
            </div>
            <div>
              <h4>For readers</h4>
              <a href="#discover">Browse stories</a>
              <a href="#search">Search</a>
              <a href="#community">Comments</a>
            </div>
            <div>
              <h4>Community</h4>
              <Link to="/community">Community</Link>
              <a href="#faq">Help</a>
            </div>
          </div>
          <div className="gl-legal">
            <span>© 2026 Wingsaga. All rights reserved.</span>
            <span>
              <Link to="/account/terms">Terms</Link>
              {" · "}
              <Link to="/account/privacy">Privacy</Link>
              {" · "}
              <Link to="/account/cookies">Cookie policy</Link>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
