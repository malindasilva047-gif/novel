import { useState } from "react";
import { Link } from "react-router-dom";
import BookCard from "../components/BookCard";
import { usePageMeta } from "../components/PageMeta";
import { getToken, resolveAssetUrl } from "../api";
import { getGuestChapterOrder, isChapterAllowedForGuest } from "../utils/guest";
import { parseRichTextParagraphs, richTextToPlainText } from "../utils/richText";

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function chapterWords(chapter) {
  return richTextToPlainText(chapter.content).trim().split(/\s+/).filter(Boolean).length;
}

function storyLanguage(book) {
  const value = String(book.language_name || book.language || "").trim();
  const normalized = value.toLowerCase().split(/[-_]/)[0];
  if (normalized === "en") return "English";
  if (["si", "sinhala", "sinhalese"].includes(normalized)) return "Sinhala";
  if (["ta", "tamil"].includes(normalized)) return "Tamil";
  return value;
}

export default function StoryDetailLayout({
  id, book, user, isOwner, chapters, readingEntry, reviews, recs, liked, following, guest, msg,
  listOpen, readingLists, readingListsLoading, readingListsError, newListName, creatingList,
  onNewListName, onCreateList, onLike, onFollow, onAddList, onToggleList,
  onShareStory,
  authorOpen, onOpenAuthor, onCloseAuthor,
  reportOpen, onOpenReport, onCloseReport, reportReason, onReportReason,
  onSubmitReport, reportBusy, chapterOrder, onChapterOrder,
}) {
  const [aboutExpanded, setAboutExpanded] = useState(false);
  const [showAllChapters, setShowAllChapters] = useState(false);
  const cover = resolveAssetUrl(book.cover_path || book.coverPath || "");
  const [coverFailed, setCoverFailed] = useState(false);
  const displayCover = cover && !coverFailed;
  const genres = [...new Set([book.primary_genre, book.secondary_genre, book.genre].filter(Boolean))];
  const storyUrl = `https://wingsaga.com/stories/${id}`;
  usePageMeta({
    title: `${book.title || "Story"} by ${book.author || "Wingsaga Author"} | Wingsaga`,
    description: String(book.description || `Read ${book.title || "this story"} on Wingsaga.`).slice(0, 300),
    image: book.cover_path || book.coverPath || "",
    type: "book",
    canonicalPath: `/stories/${id}`,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "Book",
      name: book.title || "Untitled story",
      author: { "@type": "Person", name: book.author || "Unknown author" },
      description: book.description || "",
      image: cover || undefined,
      genre: genres,
      url: storyUrl,
    },
  });
  const hashtags = [...new Set(
    (Array.isArray(book.tags) ? book.tags : Array.isArray(book.hashtags) ? book.hashtags : [])
      .map((tag) => typeof tag === "string" ? tag : tag?.name || tag?.tag || "")
      .map((tag) => String(tag).trim().replace(/^#/, ""))
      .filter(Boolean),
  )].slice(0, 3);
  const orderedChapters = [...chapters].sort((a, b) => {
    const delta = Number(a.chapter_number || 0) - Number(b.chapter_number || 0);
    return chapterOrder === "oldest" ? delta : -delta;
  });
  const guestChapterOrder = getGuestChapterOrder(chapters);
  const firstChapter = [...chapters].sort((a, b) => Number(a.chapter_number || 0) - Number(b.chapter_number || 0))[0] || null;
  const ownerId = Number(book.user_id || book.author_user_id);
  const viewerId = Number(user?.user_id || user?.id);
  const readingStatus = String(readingEntry?.reading_status || "").toLowerCase().trim();
  const finished = ["completed", "complete", "finished", "done", "history"].includes(readingStatus)
    || (Number(readingEntry?.chapters || 0) > 0
      && Number(readingEntry?.chapters_read || 0) >= Number(readingEntry.chapters));
  const canResume = !guest && getToken() && readingEntry
    && !(ownerId > 0 && ownerId === viewerId) && !finished;
  const savedChapterNumber = Number(readingEntry?.last_chapter_number || 1);
  const resumeChapter = chapters.find((chapter) => Number(chapter.chapter_number) === savedChapterNumber) || firstChapter;
  const savedParagraph = Number.isFinite(Number(readingEntry?.last_paragraph_index))
    ? Math.max(0, Math.floor(Number(readingEntry?.last_paragraph_index || 0)))
    : 0;
  const resumeChapterNumber = Number(resumeChapter?.chapter_number) || savedChapterNumber;
  const resumeParagraphCount = resumeChapter ? parseRichTextParagraphs(resumeChapter.content).length : 0;
  const resumeParagraph = resumeParagraphCount
    ? Math.min(savedParagraph, resumeParagraphCount - 1)
    : savedParagraph;
  const averageRating = reviews.length
    ? reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length
    : 0;
  const rawRating = Number(book.rating);
  const rating = rawRating > 0 ? rawRating.toFixed(1) : averageRating ? averageRating.toFixed(1) : "—";
  const reviewCount = Number(book.review_count || book.reviews_count || reviews.length);
  const reads = Number(book.view_count || book.read_count || book.reads || 0);
  const likes = Number(book.likes_count || book.likes || 0);
  const status = book.status_text || (book.is_completed ? "Completed" : "Ongoing");
  const totalWords = chapters.reduce((total, chapter) => total + chapterWords(chapter), 0);
  const startLink = canResume && resumeChapter
    ? "/stories/" + id + "/chapters/" + resumeChapter.id + "?paragraph=" + resumeParagraph
    : firstChapter ? "/stories/" + id + "/chapters/" + firstChapter.id : null;
  const aboutText = richTextToPlainText(book.description || "The author has not added a summary yet.").trim();
  const aboutWords = aboutText.split(/\s+/).filter(Boolean);
  const hasLongAbout = aboutWords.length > 50;
  const displayedAbout = !aboutExpanded && hasLongAbout ? `${aboutWords.slice(0, 50).join(" ")}…` : aboutText;
  const displayedChapters = showAllChapters ? orderedChapters : orderedChapters.slice(0, 6);

  return (
    <div className="story-detail-page">
      <section className="story-detail-hero" style={displayCover ? { "--story-cover-image": "url(\"" + cover.replaceAll("\"", "%22") + "\")" } : undefined}>
        <div className="story-detail-hero-inner">
          {displayCover
            ? <img className="story-detail-cover" src={cover} alt={book.title + " cover"} onError={() => setCoverFailed(true)} />
            : <div className="story-detail-cover story-detail-cover--empty" style={{ "--cover-accent": book.accent_hex || "#14765B" }}>{(book.title || "N").slice(0, 1)}</div>}
          <div className="story-detail-intro">
            <span className={"story-detail-status" + (/complete|finished/i.test(status) ? " is-complete" : "")}>{status}</span>
            <h1>{book.title}</h1>
            <div className="story-detail-author-row">
              <button type="button" className="story-detail-avatar" onClick={onOpenAuthor} aria-label={"About " + (book.author || "the author")}>
                {(book.author || "A").slice(0, 1).toUpperCase()}
              </button>
              <span>by <button type="button" className="story-detail-author-link" onClick={onOpenAuthor}>{book.author || "Unknown author"}</button></span>
              <button type="button" className="story-detail-follow" onClick={onFollow}>{following ? "Following" : "Follow author"}</button>
            </div>
            
            <div className="story-detail-tags">
              {genres.map((genre) => <Link key={`genre-${genre}`} to={"/genres/" + encodeURIComponent(genre)}>{genre}</Link>)}
              {hashtags.map((tag) => <Link className="story-detail-hashtag" key={`tag-${tag}`} to={"/tags/" + encodeURIComponent(tag)}>#{tag}</Link>)}
              {storyLanguage(book) ? <span className="story-detail-language">{storyLanguage(book)}</span> : null}
              {book.audience ? <span>{book.audience}</span> : null}
            </div>
            <div className="story-detail-stats" aria-label="Story statistics">
              <span><strong>{rating}</strong><small>Rating</small></span>
              <span><strong>{reads.toLocaleString()}</strong><small>Reads</small></span>
              <span><strong>{likes.toLocaleString()}</strong><small>Likes</small></span>
              <span><strong>{chapters.length}</strong><small>Chapters</small></span>
              <span><strong>{reviewCount.toLocaleString()}</strong><small>Reviews</small></span>
            </div>
          </div>
          <div className="story-detail-actions">
            {startLink
              ? <Link className="story-detail-read" to={startLink}>
                  <span className="story-detail-read-copy">
                    <strong>{canResume ? "Continue reading" : "Start reading"}</strong>
                    {canResume && resumeChapter ? <small>Last read: Chapter {resumeChapterNumber}, paragraph {resumeParagraph + 1}</small> : null}
                  </span>
                  <span className="story-detail-read-arrow" aria-hidden="true">&#8594;</span>
                </Link>
              : <span className="story-detail-no-chapters">No chapters published yet</span>}
            <button type="button" className={"story-detail-secondary" + (liked ? " is-active" : "")} onClick={onLike}>{liked ? "♥ Liked" : "♡ Like story"}</button>
            <div className="list-dropdown-wrap story-detail-list-wrap">
              <button type="button" className="story-detail-secondary" onClick={onToggleList} aria-expanded={listOpen}>＋ Add to library</button>
              {listOpen ? <div className="list-dropdown" role="dialog" aria-label="Save story to your library">
                <div className="list-dropdown-title">YOUR READING SPACE</div>
                <p className="list-dropdown-note">Choose a reading list or create one for this story.</p>
                {readingListsLoading ? <p className="list-dropdown-state">Loading your reading lists…</p> : null}
                {!readingListsLoading && readingLists.length ? <div className="list-dropdown-options">
                  {readingLists.map((list) => <button className="list-dropdown-save" type="button" key={list.id} onClick={() => onAddList(list.id)}>
                    <span className="list-dropdown-icon" aria-hidden="true">＋</span>
                    <span><strong>{list.name || "Untitled list"}</strong><small>{Number(list.story_count || list.books_count || 0)} stories</small></span>
                    <span className="list-dropdown-arrow" aria-hidden="true">→</span>
                  </button>)}
                </div> : null}
                {!readingListsLoading && !readingLists.length && !readingListsError ? <p className="list-dropdown-state">You haven’t created a reading list yet.</p> : null}
                {readingListsError ? <p className="list-dropdown-error" role="alert">{readingListsError}</p> : null}
                <form className="list-dropdown-create-form" onSubmit={onCreateList}>
                  <label htmlFor="story-reading-list-name">Create a new list</label>
                  <div><input id="story-reading-list-name" value={newListName} onChange={(event) => onNewListName(event.target.value)} maxLength={80} placeholder="List name" /><button type="submit" disabled={creatingList}>{creatingList ? "Creating…" : "Create"}</button></div>
                </form>
                <Link className="list-create" to="/library" onClick={onToggleList}>Manage my library <span aria-hidden="true">↗</span></Link>
              </div> : null}
            </div>
            <Link className="story-detail-review-link" to={"/stories/" + id + "/review"}>Write a review</Link>
            <button type="button" className="story-detail-share" onClick={onShareStory}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path strokeLinecap="round" strokeLinejoin="round" d="m8.7 10.6 6.6-4.2M8.7 13.4l6.6 4.2"/></svg> Share story <span aria-hidden="true">↗</span></button>
            {isOwner ? <div className="story-owner-tools" aria-label="Author story controls">
              <span>AUTHOR CONTROLS</span>
              <Link to={`/write/new?story=${id}`}>Edit story details</Link>
              <Link to={`/write/${id}`}>Manage chapters</Link>
            </div> : null}
          </div>
        </div>
        {msg ? <p className="story-detail-message" role="status">{msg}</p> : null}
      </section>

      <div className="story-detail-content">
        <main className="story-detail-main">
          <section className="story-detail-card story-detail-summary">
            <div className="story-detail-card-heading">
              <div><span className="story-detail-eyebrow">THE STORY</span><h2>About this story</h2></div>
              <span className="story-detail-rating">★ {rating}</span>
            </div>
            <p>{displayedAbout}</p>
            {hasLongAbout ? <button type="button" className="story-detail-show-more" onClick={() => setAboutExpanded((value) => !value)}>{aboutExpanded ? "Show less" : "See more"}</button> : null}
            <div className="story-detail-facts">
              <span><small>Genre</small><strong>{book.genre || book.primary_genre || "Uncategorized"}</strong></span>
              <span><small>Status</small><strong>{status}</strong></span>
              <span><small>Language</small><strong>{book.language || book.language_name || "Not specified"}</strong></span>
              <span><small>Audience</small><strong>{book.audience || "All ages"}</strong></span>
            </div>
          </section>

          <section className="story-detail-card story-detail-chapters" aria-labelledby="story-chapters-heading">
            <div className="story-detail-card-heading">
              <div><span className="story-detail-eyebrow">START READING</span><h2 id="story-chapters-heading">Chapters <span>({chapters.length})</span></h2></div>
              {chapters.length ? <label className="story-detail-sort">Sort <select value={chapterOrder} onChange={(event) => onChapterOrder(event.target.value)}><option value="oldest">First to last</option><option value="latest">Latest first</option></select></label> : null}
            </div>
            {orderedChapters.length ? (
              <ol className="story-detail-chapter-list">{displayedChapters.map((chapter, originalIndex) => {
                const accessIndex = guestChapterOrder.get(String(chapter.id)) ?? -1;
                const locked = guest && !isChapterAllowedForGuest(accessIndex);
                const number = chapter.chapter_number ?? originalIndex + 1;
                const words = chapterWords(chapter);
                const chapterDate = formatDate(chapter.updated_at || chapter.published_at || chapter.created_at);
                const title = chapter.title || "Chapter " + number;
                return <li key={chapter.id} className={locked ? "is-locked" : ""}>
                  {locked
                    ? <Link className="story-detail-chapter-row story-detail-chapter-row--locked" to="/login" state={{ returnTo: `/stories/${id}/chapters/${chapter.id}` }}><span className="story-detail-chapter-number" aria-hidden="true">🔒</span><span className="story-detail-chapter-copy"><small>CHAPTER {number}</small><strong>{title}</strong></span><span className="story-detail-chapter-meta">{chapterDate}<small>{words ? words.toLocaleString() + " words" : ""}</small></span><span className="story-detail-chapter-state">Sign in to read</span></Link>
                  : <div className="story-detail-chapter-owner-row">
                    <Link className="story-detail-chapter-row" to={"/stories/" + id + "/chapters/" + chapter.id}><span className="story-detail-chapter-number">{number}</span><span className="story-detail-chapter-copy"><small>CHAPTER {number}{isOwner && chapter.submission_status ? ` · ${chapter.submission_status}` : ""}</small><strong>{title}</strong></span><span className="story-detail-chapter-meta">{chapterDate}<small>{words ? words.toLocaleString() + " words" : ""}</small></span><span className="story-detail-chapter-arrow" aria-hidden="true">→</span></Link>
                    {isOwner ? <div className="story-detail-chapter-owner-actions"><Link to={`/write/${id}?chapter=${chapter.id}`}>Edit</Link></div> : null}
                  </div>}
                </li>;
              })}</ol>
            ) : <p className="story-detail-empty">The author has not published any chapters yet.</p>}
            {orderedChapters.length > 6 ? <button type="button" className="story-detail-show-more" onClick={() => setShowAllChapters((value) => !value)}>{showAllChapters ? "Show fewer chapters" : `Show more chapters (${orderedChapters.length - 6})`}</button> : null}
          </section>

          <section className="story-detail-card story-detail-reviews" aria-labelledby="story-reviews-heading">
            <div className="story-detail-card-heading">
              <div><span className="story-detail-eyebrow">READER NOTES</span><h2 id="story-reviews-heading">Reviews <span>({reviewCount})</span></h2></div>
              <div className="story-detail-review-links">
                <Link to={"/stories/" + id + "/reviews"}>View all</Link>
                <Link to={"/stories/" + id + "/review"}>Write a review <span aria-hidden="true">→</span></Link>
              </div>
            </div>
            {reviews.length ? <ul className="story-detail-review-list">{reviews.slice(0, 5).map((review, index) => {
              const stars = Math.max(0, Math.min(5, Number(review.rating) || 0));
              return <li key={review.id || review.created_at || index}>
                <div className="story-detail-review-top"><strong>{review.display_name || review.username || "Reader"}</strong><span aria-label={stars + " out of 5 stars"}>{"★".repeat(stars)}<i>{"★".repeat(5 - stars)}</i></span></div>
                <p>{review.comment || review.body || review.title || ""}</p>
                {review.created_at ? <small>{formatDate(review.created_at)}</small> : null}
              </li>;
            })}</ul> : <p className="story-detail-empty">No reviews yet. Be the first to share what you think.</p>}
          </section>
        </main>

        <aside className="story-detail-sidebar">
          <section className="story-detail-card story-detail-author-card">
            <span className="story-detail-eyebrow">MEET THE AUTHOR</span>
            <div className="story-detail-author-profile"><span className="story-detail-author-avatar">{(book.author || "A").slice(0, 1).toUpperCase()}</span><div><strong>{book.author || "Unknown author"}</strong><small>Storyteller</small></div></div>
            <p>Explore more stories and updates from this author.</p>
            <div className="story-detail-author-actions"><button type="button" onClick={onFollow}>{following ? "Following" : "Follow author"}</button>{(book.author_id || book.user_id) ? <Link to={"/authors/" + (book.author_id || book.user_id)}>View profile</Link> : null}</div>
          </section>
          <section className="story-detail-card story-detail-quick-facts">
            <span className="story-detail-eyebrow">STORY DETAILS</span><h2>At a glance</h2>
            <dl><div><dt>Estimated reading time</dt><dd>{totalWords ? Math.max(1, Math.ceil(totalWords / 250)) + " min" : "—"}</dd></div><div><dt>Chapters</dt><dd>{chapters.length}</dd></div><div><dt>Reads</dt><dd>{reads.toLocaleString()}</dd></div><div><dt>Likes</dt><dd>{likes.toLocaleString()}</dd></div></dl>
            <button type="button" className="story-detail-report" onClick={onOpenReport}>Report this story</button>
          </section>
        </aside>

        {recs.length ? <section className="story-detail-recommendations"><header className="story-detail-recommendation-heading"><div><span>MORE WORLDS TO EXPLORE</span><h2>Stories you may like</h2></div><Link to="/">Browse all <span aria-hidden="true">→</span></Link></header><div className="story-detail-recommendation-grid" role="region" aria-label="Related stories" tabIndex={0}>{recs.slice(0, 5).map((recommendation) => (
          <BookCard book={recommendation} variant="shelf" inkittStyle key={recommendation.id} />
        ))}</div></section> : null}
      </div>

      {authorOpen ? <div className="story-detail-modal-backdrop" onClick={onCloseAuthor}><section className="story-detail-modal" role="dialog" aria-modal="true" aria-labelledby="story-author-modal-title" onClick={(event) => event.stopPropagation()}>
        <div className="story-detail-modal-heading"><h2 id="story-author-modal-title">About the author</h2><button type="button" onClick={onCloseAuthor} aria-label="Close">×</button></div>
        <div className="story-detail-author-profile"><span className="story-detail-author-avatar">{(book.author || "A").slice(0, 1).toUpperCase()}</span><div><strong>{book.author || "Unknown author"}</strong><small>Writer on Wingsaga</small></div></div>
        <p>Follow this author to keep up with new stories and chapters.</p>
        <div className="story-detail-author-actions"><button type="button" onClick={onFollow}>{following ? "Following" : "Follow author"}</button>{(book.author_id || book.user_id) ? <Link to={"/authors/" + (book.author_id || book.user_id)} onClick={onCloseAuthor}>View profile</Link> : null}</div>
      </section></div> : null}

      {reportOpen ? <div className="story-detail-modal-backdrop" onClick={onCloseReport}><section className="story-detail-modal" role="dialog" aria-modal="true" aria-labelledby="story-report-title" onClick={(event) => event.stopPropagation()}>
        <div className="story-detail-modal-heading"><h2 id="story-report-title">Report this story</h2><button type="button" onClick={onCloseReport} aria-label="Close">×</button></div>
        <p>Tell the moderation team what concerns you. Reports are reviewed and may affect story availability.</p>
        <form onSubmit={onSubmitReport}><label htmlFor="story-report-reason">Reason</label><select id="story-report-reason" value={reportReason} onChange={(event) => onReportReason(event.target.value)}><option>Spam or misleading content</option><option>Harassment or hateful content</option><option>Copyright concern</option><option>Unsafe or inappropriate content</option><option>Other</option></select>
          {msg ? <p role="status">{msg}</p> : null}<div className="story-detail-modal-actions"><button type="button" onClick={onCloseReport}>Cancel</button><button type="submit" disabled={reportBusy}>{reportBusy ? "Sending…" : "Send report"}</button></div>
        </form>
      </section></div> : null}
    </div>
  );
}
