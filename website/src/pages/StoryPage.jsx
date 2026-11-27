import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import StoryDetailLayout from "./StoryDetailLayout";
import {
  addReadingListItem,
  createReadingList,
  followAuthor,
  getAuthorFollow,
  getBook,
  getBookChapters,
  getBookLike,
  getBookReviews,
  getWriteStory,
  getLibrary,
  getReadingLists,
  getToken,
  getStoryRecommendations,
  reportBook,
  toggleBookLike,
  unfollowAuthor,
} from "../api";
import { isGuestUser } from "../utils/guest";
import { getLocalReadingEntries, readingEntryTimestamp } from "../utils/readingProgress";

export default function StoryPage({ user }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const guest = isGuestUser(user);

  const [book, setBook] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [chapterOrder, setChapterOrder] = useState("oldest");
  const [readingEntry, setReadingEntry] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [recs, setRecs] = useState([]);
  const [liked, setLiked] = useState(false);
  const [following, setFollowing] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [readingLists, setReadingLists] = useState([]);
  const [readingListsLoading, setReadingListsLoading] = useState(false);
  const [readingListsError, setReadingListsError] = useState("");
  const [newListName, setNewListName] = useState("");
  const [creatingList, setCreatingList] = useState(false);
  const [authorOpen, setAuthorOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("Spam or misleading content");
  const [reportBusy, setReportBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError("");
      setReadingEntry(null);
      try {
        const [b, ch, rev, related] = await Promise.all([
          getBook(id),
          getBookChapters(id),
          getBookReviews(id).then((r) => r?.items || r || []).catch(() => []),
          getStoryRecommendations(id).catch(() => ({ items: [] })),
        ]);
        if (cancelled) return;
        setBook(b);
        let items = Array.isArray(ch) ? ch : ch?.items || ch?.chapters || [];
        const ownerId = Number(b?.user_id || b?.author_user_id);
        const viewerId = Number(user?.user_id || user?.id);
        if (!guest && ownerId > 0 && ownerId === viewerId) {
          try {
            const writerView = await getWriteStory(id);
            if (!cancelled && writerView?.chapters?.length) items = writerView.chapters;
          } catch { /* Keep the public chapter list if writer access is unavailable. */ }
        }
        if (!cancelled) setChapters(items);
        setReviews(Array.isArray(rev) ? rev : []);
        if (getToken() && !guest) {
          getLibrary().then((library) => {
            if (cancelled) return;
            const libraryItems = Array.isArray(library) ? library : library?.items || [];
            const serverEntry = libraryItems.find((entry) => String(entry.book?.id || entry.book_id) === String(id)) || null;
            const localEntry = getLocalReadingEntries(user?.user_id || user?.id)
              .find((entry) => String(entry.book?.id || entry.book_id || entry.id).replace(/^local-/, "") === String(id)) || null;
            const localUpdated = readingEntryTimestamp(localEntry);
            const serverUpdated = readingEntryTimestamp(serverEntry);
            setReadingEntry(localEntry && (!serverEntry || localUpdated > serverUpdated) ? localEntry : serverEntry);
          }).catch((err) => {
            if (!cancelled) setMsg(`Reading progress could not load: ${err.message || "Please try again."}`);
          });
        }

        setRecs((related?.items || []).filter((item) => String(item?.id) !== String(id)).slice(0, 9));

        try {
          const like = await getBookLike(id);
          if (!cancelled) {
            if (getToken() && !isGuestUser(user)) setLiked(!!like?.liked || !!like?.is_liked);
            if (Number.isFinite(Number(like?.likes_count))) {
              setBook((current) => current ? { ...current, likes_count: Number(like.likes_count) } : current);
            }
          }
        } catch {
          /* optional */
        }

        if (getToken() && !isGuestUser(user)) {
          const authorId = b?.author_id || b?.user_id;
          if (authorId) {
            try {
              const f = await getAuthorFollow(authorId);
              if (!cancelled) setFollowing(!!f?.following);
            } catch {
              /* optional */
            }
          }
        }
      } catch (e) {
        if (!cancelled) setError(String(e.message || e));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user]);

  async function onLike() {
    if (!getToken() || guest) {
      setMsg("Sign in to like");
      return;
    }
    try {
      const res = await toggleBookLike(id, liked);
      const nowLiked =
        res?.liked === true || res?.is_liked === true || (res?.liked !== false && !liked);
      setLiked(nowLiked);
      if (Number.isFinite(Number(res?.likes_count))) {
        setBook((current) => current ? { ...current, likes_count: Number(res.likes_count) } : current);
      }
      if (res?.self) setMsg("You cannot like your own story.");
      else setMsg((current) => (current === "Liked" || current === "Unliked" ? "" : current));
    } catch (e) {
      setMsg(String(e.message || e));
    }
  }

  async function shareStory() {
    const url = `${window.location.origin}/stories/${id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: book?.title || "Wingsaga story", url });
      } else {
        await navigator.clipboard.writeText(url);
        setMsg("Story link copied.");
      }
    } catch (shareError) {
      if (shareError.name !== "AbortError") setMsg(`Story link could not be shared: ${shareError.message || "Please try again."}`);
    }
  }

  async function onFollow() {
    if (!getToken() || guest) {
      setMsg("Sign in to follow");
      return;
    }
    const authorId = book?.author_id || book?.user_id;
    if (!authorId) {
      setMsg("Author profile not linked");
      return;
    }
    try {
      if (following) {
        await unfollowAuthor(authorId);
        setFollowing(false);
      } else {
        await followAuthor(authorId);
        setFollowing(true);
      }
    } catch (e) {
      setMsg(String(e.message || e));
    }
  }

  async function onToggleList() {
    if (listOpen) {
      setListOpen(false);
      return;
    }
    if (!getToken() || guest) {
      setMsg("Sign in to save");
      navigate("/login");
      return;
    }
    setListOpen(true);
    setReadingListsLoading(true);
    setReadingListsError("");
    try {
      const result = await getReadingLists();
      setReadingLists(Array.isArray(result) ? result : result?.items || []);
    } catch (e) {
      setReadingListsError(String(e.message || e));
    } finally {
      setReadingListsLoading(false);
    }
  }

  async function onAddList(listId) {
    try {
      await addReadingListItem(listId, Number(id));
      setMsg("Saved to your reading list.");
      setListOpen(false);
    } catch (e) {
      setReadingListsError(String(e.message || e));
    }
  }

  async function onCreateList(event) {
    event.preventDefault();
    const name = newListName.trim();
    if (!name) {
      setReadingListsError("Enter a name for your reading list.");
      return;
    }
    setCreatingList(true);
    setReadingListsError("");
    try {
      await createReadingList({ name, sort_order: readingLists.length + 1 });
      const response = await getReadingLists();
      const lists = Array.isArray(response) ? response : response?.items || [];
      setReadingLists(lists);
      setNewListName("");
      const created = lists.find((list) => String(list.name || "").trim().toLowerCase() === name.toLowerCase());
      if (!created?.id) throw new Error("The list was created but could not be loaded. Please choose it from your library.");
      await addReadingListItem(created.id, Number(id));
      setMsg(`Saved to "${name}".`);
      setListOpen(false);
    } catch (e) {
      setReadingListsError(String(e.message || e));
    } finally {
      setCreatingList(false);
    }
  }

  async function submitReport(event) {
    event.preventDefault();
    if (!getToken() || guest) {
      setMsg("Sign in to report a story.");
      setReportOpen(false);
      return;
    }
    setReportBusy(true);
    try {
      const result = await reportBook(id, reportReason);
      setMsg(result?.self ? "You cannot report your own story." : result?.already_reported ? "You have already reported this story." : "Report sent to the moderation team.");
      setReportOpen(false);
    } catch (e) {
      setMsg(String(e.message || e));
    } finally {
      setReportBusy(false);
    }
  }

  const isOwner = Boolean(book && Number(book.user_id || book.author_user_id) > 0
    && Number(book.user_id || book.author_user_id) === Number(user?.user_id || user?.id));

  if (error) return <div className="container page error-banner">{error}</div>;
  if (!book) return <div className="container page">Loading story…</div>;

  return <StoryDetailLayout
    id={id}
    book={book}
    user={user}
    isOwner={isOwner}
    chapters={chapters}
    readingEntry={readingEntry}
    reviews={reviews}
    recs={recs}
    liked={liked}
    following={following}
    guest={guest}
    msg={msg}
    listOpen={listOpen}
    onLike={onLike}
    onFollow={onFollow}
    readingLists={readingLists}
    readingListsLoading={readingListsLoading}
    readingListsError={readingListsError}
    newListName={newListName}
    creatingList={creatingList}
    onNewListName={setNewListName}
    onAddList={onAddList}
    onCreateList={onCreateList}
    onToggleList={onToggleList}
    onShareStory={shareStory}
    authorOpen={authorOpen}
    onOpenAuthor={() => setAuthorOpen(true)}
    onCloseAuthor={() => setAuthorOpen(false)}
    reportOpen={reportOpen}
    onOpenReport={() => guest ? navigate("/login") : setReportOpen(true)}
    onCloseReport={() => setReportOpen(false)}
    reportReason={reportReason}
    onReportReason={setReportReason}
    onSubmitReport={submitReport}
    reportBusy={reportBusy}
    chapterOrder={chapterOrder}
    onChapterOrder={setChapterOrder}
  />;
}
