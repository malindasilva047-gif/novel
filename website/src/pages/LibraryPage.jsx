import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import BookCard from "../components/BookCard";
import {
  addReadingListItem,
  createReadingList,
  deleteLibraryEntry,
  deleteReadingList,
  getBookChapters,
  getLibrary,
  getRecommendations,
  getReadingListDetail,
  getReadingLists,
  removeReadingListItem,
  resolveAssetUrl,
  updateLibraryEntry,
} from "../api";
import { isGuestUser } from "../utils/guest";
import { getLocalReadingEntries, getReadingProgressPercent, mergeReadingEntries, readingEntryTimestamp, removeLocalReadingProgress, saveLocalReadingProgress } from "../utils/readingProgress";

function itemsFrom(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.items)) return response.items;
  if (Array.isArray(response?.books)) return response.books;
  return [];
}

const libraryShowcaseFallbacks = [
  { title: "Crimson Crown", author: "K. Thorne", cover: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=400&q=80", label: "BOOK I" },
  { title: "The Shape of Us", author: "S. Mugabe", cover: "https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?auto=format&fit=crop&w=500&q=80", label: "A NOVEL" },
  { title: "Black Hearts", author: "Jenna Wood", cover: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=400&q=80", label: "JENNA WOOD" },
  { title: "Whispers in the Mist", author: "Elena Vance", cover: "https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&w=400&q=80", label: "ELENA VANCE" },
];

function LibraryCinematicHero({ entries, busyEntry, onResume }) {
  const entry = entries[0] || null;
  const story = entry?.book || entry;
  const showcaseBooks = libraryShowcaseFallbacks.map((fallback, index) => {
    const readingEntry = entries[index] || null;
    const readingStory = readingEntry?.book || readingEntry;
    return {
      entry: readingEntry,
      story: readingStory,
      title: readingStory?.title || fallback.title,
      author: readingStory?.author || fallback.author,
      cover: readingStory
        ? resolveAssetUrl(readingStory.cover_path || readingStory.coverPath || "") || fallback.cover
        : fallback.cover,
      label: readingEntry ? "YOUR SHELF" : fallback.label,
    };
  });
  return (
    <section className="library-cinematic-hero" aria-label="Wingsaga featured stories">
      <div className="library-cinematic-copy">
        <span className="library-kicker"><i aria-hidden="true" />WINGSAGA ORIGINALS &amp; READER FAVORITES</span>
        <h1>{story?.title || "Everything is Life"}</h1>
        <p>{story?.description || "Discover heartfelt serials, late-night fantasy epics, and unforgettable characters crafted by independent storytellers."}</p>
        <div className="library-cinematic-actions">
          {entry ? (
            <button type="button" className="library-featured-button" onClick={() => onResume(entry)} disabled={busyEntry === entry.id}>
              {busyEntry === entry.id ? "Opening..." : <>Start reading <span aria-hidden="true">&#8594;</span></>}
            </button>
          ) : <Link className="library-featured-button" to="/">Start reading <span aria-hidden="true">&#8594;</span></Link>}
          <a className="library-cinematic-secondary" href="#collectionSection">Explore stories <span aria-hidden="true">&#8599;</span></a>
        </div>
      </div>
      <div className="library-cinematic-showcase">
        <div className="library-showcase-platform" aria-hidden="true" />
        <div className="library-cinematic-covers" aria-label="Featured Wingsaga book covers">
          {showcaseBooks.map((book, index) => {
            const contents = <>
              <img src={book.cover} alt="" loading={index < 2 ? "eager" : "lazy"} decoding="async" onError={(event) => { event.currentTarget.style.display = "none"; }} />
              <span className="library-showcase-shade" aria-hidden="true" />
              <span className="library-showcase-label">{book.label}</span>
              <span className="library-showcase-title">
                {!book.story && index === 0 ? <>Crimson<br />Crown</>
                  : !book.story && index === 1 ? <>the<br />shape<br /><em>of</em> us</>
                    : !book.story && index === 2 ? <>BLACK<br />HEARTS</>
                      : !book.story && index === 3 ? <>Whispers in<br />the Mist</>
                        : book.title}
              </span>
              <span className="library-showcase-author">{book.author}</span>
            </>;
            return book.entry ? (
              <Link className={`library-cinematic-cover library-cinematic-cover--${index + 1}`} to={`/stories/${book.story.id}`} key={book.entry.id || book.story.id} aria-label={`Open ${book.title}`}>
                {contents}
              </Link>
            ) : (
              <div className={`library-cinematic-cover library-cinematic-cover--${index + 1}`} key={`showcase-${index}`} aria-label={`${book.title} by ${book.author}`}>
                {contents}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function LibraryContinueCard({ entry, busyEntry, onResume, onSetStatus, onRemove, onAddToList, onCloseMenu, guest = false }) {
  const story = entry.book || entry;
  const progress = getReadingProgressPercent(entry);
  const cover = resolveAssetUrl(story.cover_path || story.coverPath || "");
  const chapter = Math.max(1, Number(entry.last_chapter_number || 1));
  const paragraph = Math.max(1, Number(entry.last_paragraph_index || 0) + 1);
  return (
    <article className="continue-reading-card" key={entry.id || story.id}>
      <Link className="continue-reading-cover" to={`/stories/${story.id}`} aria-label={`Open ${story.title || "story"}`}>
        {!cover ? <span className="continue-reading-cover-fallback" aria-hidden="true">{String(story.title || "W").slice(0, 1)}</span> : null}
        {cover ? <img src={cover} alt="" loading="lazy" decoding="async" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : null}
      </Link>
      <div className="continue-reading-copy">
        <span className="continue-reading-chapter">Chapter {chapter}{entry.chapters ? ` / ${entry.chapters}` : ""}</span>
        {entry.last_paragraph_index !== null && entry.last_paragraph_index !== undefined
          ? <span className="continue-reading-paragraph">Last read: paragraph {paragraph}</span>
          : null}
        <Link className="continue-reading-title" to={`/stories/${story.id}`}>{story.title || "Untitled story"}</Link>
        <span className="continue-reading-author">by {story.author || "Wingsaga author"}</span>
        <div className="continue-reading-progress">
          <span className="continue-reading-meter" role="progressbar" aria-label={`${progress}% read`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress}>
            <span style={{ width: `${progress}%` }} />
          </span>
          <div>
            <span>{progress}% read</span>
            <button type="button" onClick={() => onResume(entry)} disabled={busyEntry === entry.id}>
              {busyEntry === entry.id ? "Opening…" : <>Continue reading <span aria-hidden="true">→</span></>}
            </button>
          </div>
        </div>
      </div>
      {!guest ? (
      <details className="library-card-menu">
        <summary aria-label={`Actions for ${story.title || "this story"}`} title="Story actions"><span aria-hidden="true">•••</span></summary>
        <div className="library-card-menu-items">
          <button type="button" onClick={(event) => { onCloseMenu(event); onAddToList(story); }}>Add to reading list</button>
          <button type="button" disabled={busyEntry === entry.id} onClick={(event) => { onCloseMenu(event); onSetStatus(entry, "Completed"); }}>
            {busyEntry === entry.id ? "Saving…" : "Mark completed"}
          </button>
          <button type="button" className="is-danger" disabled={busyEntry === entry.id} onClick={(event) => { onCloseMenu(event); onRemove(entry); }}>Remove from library</button>
        </div>
      </details>
      ) : null}
    </article>
  );
}

function isCompleted(entry) {
  const status = String(entry.reading_status || "").toLowerCase().trim();
  return ["completed", "complete", "finished", "done", "history"].includes(status)
    || getReadingProgressPercent(entry) >= 100;
}

function completedTabPendingKey(user) {
  const userId = user?.user_id || user?.id;
  return userId ? `novelhub:library-completion-pending:${userId}` : "";
}

function readingEntryKey(entry) {
  return String(entry.book_id || entry.book?.id || entry.id || "").replace(/^local-/, "");
}

function readingEntryActivity(entry) {
  return readingEntryTimestamp(entry);
}

export default function LibraryPage({ user }) {
  const guest = isGuestUser(user);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(() => {
    const initialTab = searchParams.get("tab");
    return initialTab === "lists" || initialTab === "completed" ? initialTab : "continue-reading";
  });
  const [readingCardOffset, setReadingCardOffset] = useState(0);
  const [entries, setEntries] = useState([]);
  const [readingLists, setReadingLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyEntry, setBusyEntry] = useState(null);
  const [listDialogOpen, setListDialogOpen] = useState(false);
  const [listDialogMode, setListDialogMode] = useState("existing");
  const [selectedListId, setSelectedListId] = useState("");
  const [listTargetStory, setListTargetStory] = useState(null);
  const [listName, setListName] = useState("");
  const [listDescription, setListDescription] = useState("");
  const [listDialogError, setListDialogError] = useState("");
  const [savingList, setSavingList] = useState(false);
  const [activeList, setActiveList] = useState(null);
  const [activeListItems, setActiveListItems] = useState([]);
  const [listBusy, setListBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const loadId = useRef(0);
  const listDialogRef = useRef(null);
  const readingGridRef = useRef(null);

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    setTab(requestedTab === "lists" || requestedTab === "completed" ? requestedTab : "continue-reading");
  }, [searchParams]);

  useEffect(() => {
    if (guest) return;
    const pendingKey = completedTabPendingKey(user);
    if (!pendingKey || !localStorage.getItem(pendingKey)) return;
    localStorage.removeItem(pendingKey);
    selectLibraryTab("completed");
  }, [guest, user?.user_id, user?.id]);

  function selectLibraryTab(nextTab) {
    setTab(nextTab);
    const nextParams = new URLSearchParams(window.location.search);
    if (nextTab === "lists" || nextTab === "completed") nextParams.set("tab", nextTab);
    else nextParams.delete("tab");
    setSearchParams(nextParams, { replace: true });
  }

  function handleLibraryTabKeyDown(event) {
    const tabs = ["continue-reading", "lists", "completed"];
    const currentIndex = tabs.indexOf(tab);
    const nextIndex = event.key === "ArrowRight"
      ? (currentIndex + 1) % tabs.length
      : event.key === "ArrowLeft"
        ? (currentIndex - 1 + tabs.length) % tabs.length
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    selectLibraryTab(nextTab);
    document.getElementById(`library-tab-${nextTab}`)?.focus();
  }

  useEffect(() => {
    const currentLoad = ++loadId.current;
    if (guest) {
      setReadingLists([]);
      setLoading(true);
      setError("");
      getRecommendations().then((response) => {
        if (currentLoad !== loadId.current) return;
        const previewEntries = itemsFrom(response).slice(0, 12).map((story) => ({
          id: `guest-${story.id}`,
          book_id: story.id,
          book: story,
          reading_status: "Reading",
          reading_progress_percent: 0,
          chapters_read: 0,
          last_chapter_number: 1,
        }));
        setEntries(previewEntries);
        setLoading(false);
      }).catch(() => {
        if (currentLoad !== loadId.current) return;
        setEntries([]);
        setLoading(false);
      });
      return () => { loadId.current += 1; };
    }
    setLoading(true);
    setError("");
    Promise.allSettled([getLibrary(), getReadingLists()]).then(([libraryResult, listsResult]) => {
      if (currentLoad !== loadId.current) return;
      const localEntries = getLocalReadingEntries(user?.user_id || user?.id);
      const errors = [];
      if (libraryResult.status === "fulfilled") {
        setEntries(mergeReadingEntries(itemsFrom(libraryResult.value), localEntries));
      } else {
        setEntries(localEntries);
        errors.push(localEntries.length
          ? "Showing reading progress saved on this device while the library reconnects."
          : `Reading progress could not load: ${libraryResult.reason?.message || "Please try again."}`);
      }
      if (listsResult.status === "fulfilled") setReadingLists(itemsFrom(listsResult.value));
      else errors.push(`Reading lists could not load: ${listsResult.reason?.message || "Please try again."}`);
      setError(errors.join(" "));
      setLoading(false);
    });
    return () => { loadId.current += 1; };
  }, [guest, user?.user_id, user?.id, reloadKey]);

  useEffect(() => {
    if (guest) return undefined;
    const onProgress = (event) => {
      const progress = event.detail || {};
      if (!progress.book_id) return;
      const storyId = String(progress.book_id);
      if (isCompleted(progress) || Number(progress.reading_progress_percent) >= 100) {
        setTab("completed");
        const nextParams = new URLSearchParams(window.location.search);
        nextParams.set("tab", "completed");
        setSearchParams(nextParams, { replace: true });
        const pendingKey = completedTabPendingKey(user);
        if (pendingKey) localStorage.removeItem(pendingKey);
      }
      setEntries((current) => {
        const index = current.findIndex((entry) => String(entry.book_id || entry.book?.id || entry.id).replace(/^local-/, "") === storyId);
        const nextEntry = index >= 0
          ? {
              ...current[index],
              ...progress,
              book_id: progress.book_id,
              book: {
                ...(current[index].book || {}),
                id: progress.book_id,
                title: progress.title || current[index].book?.title,
                author: progress.author || current[index].book?.author,
                cover_path: progress.cover_path || current[index].book?.cover_path,
                primary_genre: progress.primary_genre || current[index].book?.primary_genre,
              },
            }
          : {
              ...progress,
              id: `local-${storyId}`,
              book: {
                id: progress.book_id,
                title: progress.title || "Story",
                author: progress.author || "Author",
                cover_path: progress.cover_path || "",
                primary_genre: progress.primary_genre || "",
              },
            };
        if (index < 0) return [nextEntry, ...current];
        return current.map((entry, entryIndex) => entryIndex === index ? nextEntry : entry);
      });
    };
    const onListsChanged = () => {
      getReadingLists()
        .then((response) => setReadingLists(itemsFrom(response)))
        .catch((err) => setNotice(`Reading lists could not refresh: ${err.message || "Please try again."}`));
    };
    window.addEventListener("novelhub:library-progress-changed", onProgress);
    window.addEventListener("novelhub:reading-lists-changed", onListsChanged);
    return () => {
      window.removeEventListener("novelhub:library-progress-changed", onProgress);
      window.removeEventListener("novelhub:reading-lists-changed", onListsChanged);
    };
  }, [guest, user?.user_id, user?.id, setSearchParams]);

  useEffect(() => {
    if (!listDialogOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !savingList) setListDialogOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    const frame = requestAnimationFrame(() => listDialogRef.current?.focus());
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      cancelAnimationFrame(frame);
    };
  }, [listDialogOpen, savingList]);

  const continueReadingEntries = useMemo(() => entries.filter((entry) => !isCompleted(entry)), [entries]);
  const displayedContinueReadingEntries = useMemo(() => {
    if (continueReadingEntries.length < 2) return continueReadingEntries;
    const offset = readingCardOffset % continueReadingEntries.length;
    return [...continueReadingEntries.slice(offset), ...continueReadingEntries.slice(0, offset)];
  }, [continueReadingEntries, readingCardOffset]);
  const completed = useMemo(() => entries.filter(isCompleted), [entries]);
  const heroEntries = useMemo(() => [...continueReadingEntries]
    .sort((left, right) => readingEntryActivity(right) - readingEntryActivity(left)
      || readingEntryKey(left).localeCompare(readingEntryKey(right), undefined, { numeric: true }))
    .slice(0, 4), [continueReadingEntries]);
  function openListDialog(story = null) {
    setListTargetStory(story);
    setListDialogMode(story && readingLists.length ? "existing" : "create");
    setSelectedListId(readingLists.length ? String(readingLists[0].id) : "");
    setListName("");
    setListDescription("");
    setListDialogError("");
    setListDialogOpen(true);
  }

  async function submitListDialog(event) {
    event.preventDefault();
    if (savingList) return;
    if (listDialogMode === "existing" && (!selectedListId || !listTargetStory?.id)) {
      setListDialogError("Choose a reading list first.");
      return;
    }
    if (listDialogMode === "create" && !listName.trim()) {
      setListDialogError("Enter a name for your reading list.");
      return;
    }
    setSavingList(true);
    setListDialogError("");
    setNotice("");
    try {
      let successMessage = "";
      if (listDialogMode === "create") {
        const created = await createReadingList({
          name: listName.trim(),
          description: listDescription.trim(),
          sort_order: readingLists.length + 1,
        });
        if (!created?.id) throw new Error("The reading list was created without an ID.");
        if (listTargetStory?.id) {
          await addReadingListItem(created.id, listTargetStory.id);
          successMessage = `Created “${listName.trim()}” and added “${listTargetStory.title || "the story"}”.`;
        } else {
          successMessage = `Created “${listName.trim()}”.`;
        }
      } else {
        const result = await addReadingListItem(selectedListId, listTargetStory.id);
        const selected = readingLists.find((list) => String(list.id) === selectedListId);
        successMessage = result?.already_exists
          ? `“${listTargetStory.title || "This story"}” is already in “${selected?.name || "that list"}”.`
          : `Added “${listTargetStory.title || "the story"}” to “${selected?.name || "your list"}”.`;
      }
      const response = await getReadingLists();
      setReadingLists(itemsFrom(response));
      setNotice(successMessage);
      setListDialogOpen(false);
    } catch (err) {
      setListDialogError(err.message || "Your reading list could not be saved. Please try again.");
    } finally {
      setSavingList(false);
    }
  }

  async function resumeEntry(entry) {
    const story = entry.book || entry;
    try {
      const response = await getBookChapters(story.id);
      const chapters = response?.items || [];
      const wanted = Number(entry.last_chapter_number || 1);
      const matchingChapter = chapters.find((item) => Number(item.chapter_number) === wanted);
      const chapter = matchingChapter || chapters[0];
      if (chapter?.id) {
        const savedParagraph = Number(entry.last_paragraph_index || 0);
        const paragraph = matchingChapter && Number.isFinite(savedParagraph)
          ? Math.max(0, Math.floor(savedParagraph))
          : 0;
        navigate(`/stories/${story.id}/chapters/${chapter.id}?paragraph=${paragraph}`);
        return;
      }
      setNotice("This story has no readable chapters yet.");
    } catch (err) {
      setNotice(`Could not resume this story: ${err.message || "Please try again."}`);
    }
  }

  async function setEntryStatus(entry, nextStatus) {
    const story = entry.book || entry;
    const nextProgress = nextStatus === "Completed" ? 100 : 0;
    const nextChaptersRead = nextStatus === "Completed" ? Number(entry.chapters || 0) : 0;
    const updatePayload = {
      reading_status: nextStatus,
      updated_text: nextStatus === "Completed" ? "Finished" : "Reading",
      reading_progress_percent: nextProgress,
      chapters_read: nextChaptersRead,
    };
    if (String(entry.id || "").startsWith("local-")) {
      const localPayload = {
        ...entry,
        ...updatePayload,
        book_id: Number(entry.book_id || story.id),
        title: story.title || "Story",
        author: story.author || "Author",
        cover_path: story.cover_path || "",
      };
      saveLocalReadingProgress(user?.user_id || user?.id, localPayload, story);
      setEntries((current) => current.map((item) => item.id === entry.id ? { ...item, ...updatePayload } : item));
      setNotice(nextStatus === "Completed" ? "Moved to Completed." : "Moved back to Continue reading.");
      return;
    }
    setBusyEntry(entry.id);
    setNotice("");
    try {
      await updateLibraryEntry(entry.id, updatePayload);
      saveLocalReadingProgress(user?.user_id || user?.id, {
        ...entry,
        ...updatePayload,
        book_id: Number(entry.book_id || story.id),
        title: story.title || "Story",
        author: story.author || "Author",
        cover_path: story.cover_path || "",
      }, story);
      setEntries((current) => current.map((item) => item.id === entry.id ? { ...item, ...updatePayload } : item));
      setNotice(nextStatus === "Completed" ? "Moved to Completed." : "Moved back to Continue reading.");
    } catch (err) {
      setNotice(err.message || "Could not update this story. Please try again.");
    } finally {
      setBusyEntry(null);
    }
  }

  async function onRemoveEntry(entry) {
    const story = entry.book || entry;
    if (!window.confirm(`Remove “${story.title || "this story"}” from your library?`)) return;
    if (String(entry.id || "").startsWith("local-")) {
      removeLocalReadingProgress(user?.user_id || user?.id, story.id);
      setEntries((current) => current.filter((item) => item.id !== entry.id));
      setNotice("Story removed from your library.");
      return;
    }
    setBusyEntry(entry.id);
    try {
      await deleteLibraryEntry(entry.id);
      removeLocalReadingProgress(user?.user_id || user?.id, story.id);
      setEntries((current) => current.filter((item) => item.id !== entry.id));
      setNotice("Story removed from your library.");
    } catch (err) {
      setNotice(err.message || "Could not remove this story.");
    } finally {
      setBusyEntry(null);
    }
  }

  function closeCardMenu(event) {
    event.currentTarget.closest("details")?.removeAttribute("open");
  }

  function scrollContinueReading(direction) {
    const grid = readingGridRef.current;
    if (!grid) return;
    if (continueReadingEntries.length > 1 && continueReadingEntries.length <= 4) {
      setReadingCardOffset((offset) => (offset + direction + continueReadingEntries.length) % continueReadingEntries.length);
      return;
    }
    grid.scrollBy({ left: direction * grid.clientWidth, behavior: "smooth" });
  }

  async function openList(list) {
    setListBusy(true);
    setActiveList(list);
    setActiveListItems([]);
    try {
      const detail = await getReadingListDetail(list.id);
      setActiveList(detail);
      setActiveListItems(detail?.items || []);
    } catch (err) {
      setNotice(err.message || "This reading list could not be opened.");
    } finally {
      setListBusy(false);
    }
  }

  async function removeListItem(item) {
    try {
      await removeReadingListItem(activeList.id, item.id);
      setActiveListItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
      setActiveList((current) => current ? { ...current, story_count: Math.max(0, Number(current.story_count || 0) - 1) } : current);
      setReadingLists((current) => current.map((list) => list.id === activeList.id ? { ...list, story_count: Math.max(0, Number(list.story_count || 0) - 1), preview_items: activeListItems.filter((currentItem) => currentItem.id !== item.id).slice(0, 3) } : list));
    } catch (err) {
      setNotice(err.message || "Could not remove this story from the list.");
    }
  }

  async function removeList(list) {
    if (!window.confirm(`Delete the reading list “${list.name}”?`)) return;
    try {
      await deleteReadingList(list.id);
      setReadingLists((current) => current.filter((item) => item.id !== list.id));
      setNotice("Reading list deleted.");
      setActiveList(null);
    } catch (err) {
      setNotice(err.message || "Could not delete this reading list.");
    }
  }

  const selectedEntries = tab === "completed" ? completed : continueReadingEntries;

  return (
    <div className="page library-page library-page--full library-experience">
      <LibraryCinematicHero entries={guest ? [] : heroEntries} busyEntry={busyEntry} onResume={resumeEntry} />

      <section id="collectionSection" className="library-saved-library" aria-labelledby="library-saved-title">
      <header className="library-section-heading library-saved-heading">
        <div><span className="eyebrow">YOUR COLLECTION</span><h2 id="library-saved-title">Your collection</h2></div>
        <div className="library-saved-actions">
          <span>{loading ? "Loading your shelves..." : guest ? `${entries.length} ${entries.length === 1 ? "story" : "stories"} to explore` : `${entries.length} ${entries.length === 1 ? "story" : "stories"} saved`}</span>
          <button type="button" className="library-create-list-button" onClick={() => guest ? navigate("/login") : openListDialog()}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path strokeLinecap="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            <span>Create list</span>
          </button>
        </div>
      </header>
      <div className="profile-tabs library-tabs" role="tablist" aria-label="Library sections" onKeyDown={handleLibraryTabKeyDown}>
        <button type="button" role="tab" id="library-tab-continue-reading" aria-controls="library-panel-continue-reading" aria-selected={tab === "continue-reading"} tabIndex={tab === "continue-reading" ? 0 : -1} className={`profile-tab ${tab === "continue-reading" ? "active" : ""}`} onClick={() => selectLibraryTab("continue-reading")}>
          <span className="library-tab-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg></span> Ongoing <span className="tab-count">{continueReadingEntries.length}</span>
        </button>
        <button type="button" role="tab" id="library-tab-lists" aria-controls="library-panel-lists" aria-selected={tab === "lists"} tabIndex={tab === "lists" ? 0 : -1} className={`profile-tab ${tab === "lists" ? "active" : ""}`} onClick={() => selectLibraryTab("lists")}>
          <span className="library-tab-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M7 4.5h10a2 2 0 0 1 2 2V21l-7-3.5L5 21V6.5a2 2 0 0 1 2-2Z" /></svg></span> Reading lists <span className="tab-count">{readingLists.length}</span>
        </button>
        <button type="button" role="tab" id="library-tab-completed" aria-controls="library-panel-completed" aria-selected={tab === "completed"} tabIndex={tab === "completed" ? 0 : -1} className={`profile-tab ${tab === "completed" ? "active" : ""}`} onClick={() => selectLibraryTab("completed")}>
          <span className="library-tab-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg></span> Completed <span className="tab-count">{completed.length}</span>
        </button>
      </div>

      {error ? <div className="error-banner" role="alert">{error} <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReloadKey((key) => key + 1)}>Retry</button></div> : null}
      {notice ? <p className="library-notice" role="status">{notice}</p> : null}
      {loading ? <div className="library-loading" aria-live="polite"><span className="library-loading-orbit" />Opening your shelves…</div> : null}

      {tab !== "lists" ? (
        <section id={tab === "completed" ? "library-panel-completed" : "library-panel-continue-reading"} role="tabpanel" aria-labelledby={tab === "completed" ? "library-tab-completed" : "library-tab-continue-reading"} aria-label={tab === "completed" ? "Completed stories" : "Continue reading stories"}>
          {tab === "continue-reading" && continueReadingEntries.length ? (
            <>
              <div className="continue-reading-shelf library-continue-shelf">
                <header className="continue-reading-heading library-tab-section-heading" id="library-continue">
                  <div><span className="eyebrow">PICK UP WHERE YOU LEFT OFF</span><h2>Continue Reading</h2></div>
                </header>
                {loading ? <p className="library-rail-empty">Loading your reading progress...</p> : (
                  <div className="library-carousel-shell">
                    <button type="button" className="library-carousel-arrow library-carousel-arrow--previous" onClick={() => scrollContinueReading(-1)} aria-label="Previous stories" title="Previous stories">
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path strokeLinecap="round" strokeLinejoin="round" d="m15 18-6-6 6-6" /></svg>
                    </button>
                    <div className="continue-reading-grid" ref={readingGridRef}>
                      {displayedContinueReadingEntries.map((entry) => (
                        <LibraryContinueCard
                          key={entry.id || entry.book?.id || entry.book_id}
                          entry={entry}
                          busyEntry={busyEntry}
                          onResume={resumeEntry}
                          onSetStatus={setEntryStatus}
                          onRemove={onRemoveEntry}
                          onAddToList={openListDialog}
                          onCloseMenu={closeCardMenu}
                          guest={guest}
                        />
                      ))}
                    </div>
                    <button type="button" className="library-carousel-arrow library-carousel-arrow--next" onClick={() => scrollContinueReading(1)} aria-label="Next stories" title="Next stories">
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" /></svg>
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : null}
          {!loading && tab === "completed" && completed.length ? (
            <>
              <div className="library-shelf-heading"><div><span className="eyebrow">THE STORIES YOU FINISHED</span><h2>Your completed stories</h2></div><span>{completed.length} {completed.length === 1 ? "story" : "stories"}</span></div>
              <div className="profile-page library-completed-as-profile">
              <div className="profile-story-grid profile-story-grid--home-pack library-completed-grid" data-home-pack="true">
              {completed.map((entry) => {
                const story = entry.book || entry;
                const book = {
                  id: story.id || entry.book_id,
                  title: story.title || "Untitled story",
                  author: story.author || story.author_name || "Wingsaga author",
                  cover_path: story.cover_path || story.coverPath || "",
                  rating: story.rating != null ? story.rating : 0,
                  view_count: Number(story.view_count || story.read_count || story.reads || 0),
                  read_count: Number(story.read_count || story.view_count || story.reads || 0),
                  genre: story.genre || story.primary_genre || story.secondary_genre || "",
                  primary_genre: story.primary_genre || story.genre || "",
                  secondary_genre: story.secondary_genre || story.genre || story.primary_genre || "",
                  publication_status: story.status_text || story.status || story.publication_status || "Completed",
                  status: story.status_text || story.status || "Completed",
                  status_text: story.status_text || story.status || "Completed",
                  is_completed: true,
                };
                return (
                  <div className="profile-home-story-slot home-story-card-slot library-completed-slot" key={entry.id || story.id}>
                    <BookCard book={book} variant="shelf" inkittStyle showRating showStatus />
                    <details className="library-card-menu library-card-menu--top-right">
                      <summary aria-label={`Actions for ${story.title || "this story"}`} title="Story actions">
                        <span className="library-card-menu-orb" aria-hidden="true">
                          <i /><i /><i />
                        </span>
                      </summary>
                      <div className="library-card-menu-items">
                        <Link to={`/stories/${story.id}`} onClick={closeCardMenu}>Read again</Link>
                        <button type="button" onClick={(event) => { closeCardMenu(event); openListDialog(story); }}>Add to reading list</button>
                        <button type="button" disabled={busyEntry === entry.id} onClick={(event) => { closeCardMenu(event); setEntryStatus(entry, "Reading"); }}>
                          {busyEntry === entry.id ? "Saving…" : "Move to Continue reading"}
                        </button>
                        <button type="button" className="is-danger" disabled={busyEntry === entry.id} onClick={(event) => { closeCardMenu(event); onRemoveEntry(entry); }}>Remove from library</button>
                      </div>
                    </details>
                  </div>
                );
              })}
              </div>
              </div>
            </>
          ) : null}
          {!loading && !error && selectedEntries.length === 0 ? (
            <div className="library-empty card-panel">
              <span className="library-empty-illustration" aria-hidden="true">{tab === "completed" ? "✦" : "⌕"}</span>
              <span className="library-empty-mark">{tab === "completed" ? "YOUR READING JOURNEY" : "A GOOD STORY AWAITS"}</span>
              <h2>{tab === "completed" ? "Complete your first story to build your reading journey." : "You haven't started reading a story yet."}</h2>
              <p className="meta">{tab === "completed" ? "Stories you finish will be gathered here so you can revisit every ending." : "Discover a story, start reading, and your progress will be saved here automatically."}</p>
              {tab === "continue-reading" ? <Link className="btn btn-primary" to="/">Discover Stories</Link> : null}
            </div>
          ) : null}
        </section>
      ) : (
        <section id="library-panel-lists" className="lists-panel" role="tabpanel" aria-labelledby="library-tab-lists" aria-label="Reading lists">
          {!loading && readingLists.length > 0 ? (
            <div className="rl-grid">
              {readingLists.map((list) => {
                const previews = itemsFrom(list.preview_items).slice(0, 3);
                const cover = resolveAssetUrl(list.cover_path || "");
                return (
                  <article key={list.id} className="rl-user-card card-panel">
                    <button type="button" className="rl-open-button" onClick={() => openList(list)} aria-label={`Open ${list.name}`}>
                      {previews.length ? (
                        <div className="rl-preview-collage" data-count={previews.length} aria-label={`${previews.length} stories in ${list.name}`}>
                          {previews.map((preview, index) => {
                            const previewCover = resolveAssetUrl(preview.cover_path || "");
                            return (
                              <span className={`rl-preview-item rl-preview-item--${index + 1}`} key={preview.id || preview.book_id}>
                                <span className="rl-preview-cover" aria-hidden="true">
                                  {previewCover ? <img src={previewCover} alt="" loading="lazy" decoding="async" /> : <span className="rl-preview-fallback" aria-hidden="true">{String(preview.title || "W").slice(0, 1)}</span>}
                                </span>
                              </span>
                            );
                          })}
                        </div>
                      ) : cover ? <div className="rl-user-cover"><img src={cover} alt="" loading="lazy" /></div>
                        : <div className="rl-user-cover rl-user-cover-fallback" aria-hidden="true"><span>W</span><small>WINGSAGA LIST</small></div>}
                      <div className="rl-user-card-copy">
                        <h3>{list.name}</h3>
                        <p className="rl-story-count">
                          <span aria-hidden="true">{String(list.name || "W").trim().slice(0, 1).toUpperCase()}</span>
                          {Number(list.story_count || 0).toLocaleString()} {Number(list.story_count || 0) === 1 ? "story" : "stories"}
                        </p>
                        {list.description ? <p className="rl-description">{list.description}</p> : null}
                      </div>
                    </button>
                    <button type="button" className="library-remove" onClick={() => removeList(list)}>Delete list</button>
                  </article>
                );
              })}
            </div>
          ) : null}
          {!loading && !error && readingLists.length === 0 ? (
            <div className="library-empty library-empty--lists card-panel">
              <span className="library-empty-illustration" aria-hidden="true">▤</span>
              <span className="library-empty-mark">CURATE YOUR SHELVES</span>
              <h2>Create your first reading list and organize your favorite stories.</h2>
              <p className="meta">Collect stories by mood, genre, or what you want to read next.</p>
              {guest ? <Link to="/login" className="btn btn-primary">Create a reading list</Link> : <button type="button" className="btn btn-primary" onClick={() => openListDialog()}>Create a reading list</button>}
            </div>
          ) : null}
        </section>
      )}
      </section>

      {listDialogOpen ? (
        <div className="library-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingList) setListDialogOpen(false); }}>
          <section className="library-list-modal library-add-modal card-panel" role="dialog" aria-modal="true" aria-labelledby="add-list-title" tabIndex={-1} ref={listDialogRef}>
            <button className="library-modal-close" type="button" onClick={() => setListDialogOpen(false)} aria-label="Close dialog" disabled={savingList}>×</button>
            <span className="eyebrow">MAKE IT YOURS</span>
            <h2 id="add-list-title">{listTargetStory ? "Add to a reading list" : "Create a reading list"}</h2>
            {listTargetStory ? <p className="meta">Choose where “{listTargetStory.title || "this story"}” belongs.</p> : <p className="meta">Create a collection for stories you want to keep close.</p>}
            <div className="library-list-mode" role="tablist" aria-label="Reading list options">
              <button type="button" role="tab" aria-selected={listDialogMode === "existing"} disabled={!readingLists.length} className={listDialogMode === "existing" ? "active" : ""} onClick={() => { setListDialogMode("existing"); setListDialogError(""); }}>Choose a list</button>
              <button type="button" role="tab" aria-selected={listDialogMode === "create"} className={listDialogMode === "create" ? "active" : ""} onClick={() => { setListDialogMode("create"); setListDialogError(""); }}>Create new</button>
            </div>
            <form onSubmit={submitListDialog}>
              {listDialogMode === "existing" ? (
                <div className="library-list-options" role="radiogroup" aria-label="Existing reading lists">
                  {readingLists.map((list) => (
                    <label className={`library-list-option${selectedListId === String(list.id) ? " is-selected" : ""}`} key={list.id}>
                      <input type="radio" name="reading-list-choice" value={list.id} checked={selectedListId === String(list.id)} onChange={() => setSelectedListId(String(list.id))} />
                      <span><strong>{list.name}</strong><small>{Number(list.story_count || 0)} {Number(list.story_count || 0) === 1 ? "story" : "stories"}</small></span>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="library-list-create-fields">
                  <label htmlFor="library-list-name">Reading list name
                    <input id="library-list-name" value={listName} onChange={(event) => setListName(event.target.value)} maxLength={80} placeholder="e.g. Weekend reads" required />
                  </label>
                  <label htmlFor="library-list-description">Description <span>(optional)</span>
                    <textarea id="library-list-description" value={listDescription} onChange={(event) => setListDescription(event.target.value)} maxLength={500} rows={3} placeholder="What kind of stories belong here?" />
                  </label>
                </div>
              )}
              {listDialogError ? <p className="library-dialog-error" role="alert">{listDialogError}</p> : null}
              <div className="library-dialog-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setListDialogOpen(false)} disabled={savingList}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={savingList || (listDialogMode === "existing" && (!selectedListId || !listTargetStory)) || (listDialogMode === "create" && !listName.trim())}>
                  {savingList ? "Saving…" : listDialogMode === "existing" ? "Add story" : listTargetStory ? "Create list & add story" : "Create list"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {activeList ? (
        <div className="library-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveList(null); }}>
          <section className="library-list-modal card-panel" role="dialog" aria-modal="true" aria-labelledby="active-list-title">
            <button className="library-modal-close" type="button" onClick={() => setActiveList(null)} aria-label="Close list">×</button>
            <span className="eyebrow">READING LIST</span>
            <h2 id="active-list-title">{activeList.name}</h2>
            {activeList.description ? <p className="meta">{activeList.description}</p> : null}
            <p className="meta">{activeListItems.length} stories</p>
            {listBusy ? <p className="meta">Loading stories…</p> : null}
            {!listBusy && activeListItems.length ? (
              <div className="library-list-items">
                {activeListItems.map((item) => (
                  <div className="library-list-item" key={item.id}>
                    <BookCard book={{ ...item, id: item.book_id }} variant="mini" />
                    <Link to={`/stories/${item.book_id}`} onClick={() => setActiveList(null)}>{item.title}</Link>
                    <button type="button" className="library-remove" onClick={() => removeListItem(item)}>Remove</button>
                  </div>
                ))}
              </div>
            ) : null}
            {!listBusy && activeListItems.length === 0 ? <p className="meta">This list is empty. Add a story from its story page.</p> : null}
          </section>
        </div>
      ) : null}

    </div>
  );
}
