import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  addToReadingList,
  getBook,
  getBookChapters,
  getBookLike,
  getChapterComments,
  getChapterReactions,
  recordChapterView,
  getLibrary,
  getToken,
  getUserProfile,
  resolveAssetUrl,
  saveLibraryProgress,
  postChapterComment,
  toggleChapterCommentLike,
  toggleBookLike,
  toggleChapterReaction,
} from "../api";
import {
  getGuestChapterOrder,
  GUEST_CHAPTER_LIMIT,
  isChapterAllowedForGuest,
  isGuestUser,
} from "../utils/guest";
import { getLocalReadingEntries, removeLocalReadingProgress, saveLocalReadingProgress } from "../utils/readingProgress";
import {
  filterChapterComments,
  filterParagraphComments,
} from "../utils/chapterComments";
import { parseRichTextParagraphs, renderRichTextNodes, richTextToPlainText } from "../utils/richText";

const REACTIONS = [
  { label: "Love this", emoji: "❤️" },
  { label: "Funny", emoji: "😂" },
  { label: "Spicy", emoji: "🌶️" },
  { label: "Suspenseful", emoji: "😮" },
  { label: "Emotional", emoji: "📚" },
  { label: "Profound", emoji: "🤯" },
  { label: "Heartwarming", emoji: "🥰" },
  { label: "Shocking", emoji: "😱" },
  { label: "Good Writing", emoji: "✍️" },
  { label: "Compelling Plot", emoji: "🎢" },
  { label: "Great Character", emoji: "😎" },
  { label: "Strong Dialog", emoji: "💬" },
];

function wordCount(text) {
  const value = String(text || "").trim();
  return value ? value.split(/\s+/).length : 0;
}

function formatCommentDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function completedTabPendingKey(user) {
  const userId = user?.user_id || user?.id;
  return userId ? `novelhub:library-completion-pending:${userId}` : "";
}

export default function ChapterPage({ user }) {
  const { id, chapterId } = useParams();
  const [searchParams] = useSearchParams();
  const paragraphParam = Number(searchParams.get("paragraph") || 0);
  const resumeParagraph = Number.isFinite(paragraphParam) ? Math.max(0, Math.floor(paragraphParam)) : 0;
  const navigate = useNavigate();
  const guest = isGuestUser(user);
  const [book, setBook] = useState(null);
  const [authorProfile, setAuthorProfile] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [chapter, setChapter] = useState(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [commentMsg, setCommentMsg] = useState("");
  const [comments, setComments] = useState([]);
  const [commentLikeBusy, setCommentLikeBusy] = useState({});
  const [paraCounts, setParaCounts] = useState({});
  const [activePara, setActivePara] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [reactionCounts, setReactionCounts] = useState({});
  const [mine, setMine] = useState([]);
  const [liked, setLiked] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [fontSize, setFontSize] = useState(() => {
    const saved = Number(localStorage.getItem("novelhub_reader_font_size"));
    return saved >= 16 && saved <= 26 ? saved : 19;
  });
  const [warmPage, setWarmPage] = useState(() => localStorage.getItem("novelhub_reader_warm_page") === "true");
  const [readingProgress, setReadingProgress] = useState(0);
  const [chapterProgress, setChapterProgress] = useState(0);
  const [readingParagraph, setReadingParagraph] = useState(resumeParagraph);
  const progressTimer = useRef(null);
  const pendingProgress = useRef(null);
  const scrollFrame = useRef(0);
  const saveQueue = useRef(Promise.resolve());
  const commentCloseButton = useRef(null);
  const completedStoryRef = useRef(false);

  function openChapterComments() {
    setActivePara(null);
    setPanelOpen(true);
  }

  useEffect(() => {
    if (!panelOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    commentCloseButton.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setPanelOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [panelOpen]);

  const chapterNumber = useMemo(() => {
    if (!chapter) return 1;
    return Number(chapter.chapter_number) || 1;
  }, [chapter]);

  const paragraphs = useMemo(() => {
    return parseRichTextParagraphs(chapter?.content);
  }, [chapter?.content]);
  const chapterWordCounts = useMemo(
    () => chapters.map((item) => wordCount(richTextToPlainText(item.content))),
    [chapters],
  );
  const paragraphWordCounts = useMemo(() => paragraphs.map(({ text }) => wordCount(text)), [paragraphs]);
  const safeResumeParagraph = paragraphs.length
    ? Math.min(resumeParagraph, paragraphs.length - 1)
    : 0;
  const totalBookWords = useMemo(
    () => chapterWordCounts.reduce((total, count) => total + count, 0),
    [chapterWordCounts],
  );
  const idx = chapters.findIndex((c) => String(c.id) === String(chapterId));
  const guestChapterOrder = useMemo(() => getGuestChapterOrder(chapters), [chapters]);
  const chapterAccessIndex = guestChapterOrder.get(String(chapterId)) ?? -1;
  const isStoryOwner = !guest && Number(book?.user_id || book?.author_user_id) === Number(user?.user_id || user?.id);
  const authorId = book?.author_id || book?.author_user_id || book?.user_id;

  useEffect(() => {
    const userId = user?.user_id || user?.id;
    const localEntry = getLocalReadingEntries(userId).find(
      (entry) => String(entry.book_id || entry.book?.id || entry.id).replace(/^local-/, "") === String(id),
    );
    completedStoryRef.current = ["completed", "complete", "finished", "done", "history"].includes(
      String(localEntry?.reading_status || "").trim().toLowerCase(),
    );
    let active = true;
    if (guest || isStoryOwner || !getToken()) return () => { active = false; };
    getLibrary().then((response) => {
      if (!active) return;
      const entries = Array.isArray(response?.items) ? response.items : Array.isArray(response) ? response : [];
      const entry = entries.find((item) => String(item.book_id || item.book?.id) === String(id));
      if (entry && ["completed", "complete", "finished", "done", "history"].includes(
        String(entry.reading_status || "").trim().toLowerCase(),
      )) {
        completedStoryRef.current = true;
      }
    }).catch((err) => {
      console.warn("Could not check existing library completion status.", err);
    });
    return () => { active = false; };
  }, [id, guest, isStoryOwner, user?.id, user?.user_id]);

  useEffect(() => {
    if (isStoryOwner) {
      removeLocalReadingProgress(user?.user_id || user?.id, id);
    }
  }, [id, isStoryOwner, user?.id, user?.user_id]);

  useEffect(() => {
    let cancelled = false;
    setAuthorProfile(null);
    if (!authorId) return undefined;
    getUserProfile(authorId)
      .then((profile) => {
        if (!cancelled) setAuthorProfile(profile);
      })
      .catch(() => {
        if (!cancelled) setAuthorProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [authorId]);

  function progressAtParagraph(paragraphIndex, paragraphFraction = 0) {
    if (totalBookWords <= 0 || idx < 0) return 0;
    const safeIndex = paragraphs.length
      ? Math.max(0, Math.min(paragraphs.length - 1, Math.floor(Number(paragraphIndex) || 0)))
      : 0;
    const priorWords = chapterWordCounts.slice(0, idx).reduce((total, count) => total + count, 0);
    const wordsRead = priorWords
      + paragraphWordCounts.slice(0, safeIndex).reduce((total, count) => total + count, 0)
      + (paragraphWordCounts[safeIndex] || 0) * Math.max(0, Math.min(1, paragraphFraction));
    return Math.max(0, Math.min(100, Math.floor((wordsRead / totalBookWords) * 100)));
  }

  function chapterProgressAtParagraph(paragraphIndex, paragraphFraction = 0) {
    const chapterWords = chapterWordCounts[idx] || 0;
    if (chapterWords <= 0) return 0;
    const safeIndex = paragraphs.length
      ? Math.max(0, Math.min(paragraphs.length - 1, Math.floor(Number(paragraphIndex) || 0)))
      : 0;
    const wordsRead = paragraphWordCounts.slice(0, safeIndex).reduce((total, count) => total + count, 0)
      + (paragraphWordCounts[safeIndex] || 0) * Math.max(0, Math.min(1, paragraphFraction));
    return Math.max(0, Math.min(100, Math.round((wordsRead / chapterWords) * 100)));
  }

  function visibleReadingPosition() {
    const nodes = [...document.querySelectorAll("[data-reader-paragraph]")];
    if (!nodes.length) {
      return {
        paragraphIndex: 0,
        progress: progressAtParagraph(0),
        chapterProgress: chapterProgressAtParagraph(0),
      };
    }
    const readingLine = window.innerHeight * 0.35;
    let current = nodes[0];
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      if (rect.top <= readingLine && rect.bottom >= readingLine) {
        current = node;
        nearestDistance = 0;
        break;
      }
      const distance = readingLine < rect.top ? rect.top - readingLine : readingLine - rect.bottom;
      if (distance < nearestDistance) {
        current = node;
        nearestDistance = distance;
      }
    }
    const paragraphIndex = Number(current.dataset.readerParagraph) || 0;
    const rect = current.getBoundingClientRect();
    const fraction = rect.height > 0 ? (readingLine - rect.top) / rect.height : 0;
    return {
      paragraphIndex,
      progress: progressAtParagraph(paragraphIndex, fraction),
      chapterProgress: chapterProgressAtParagraph(paragraphIndex, fraction),
    };
  }

  function savePosition(paragraphIndex, progress) {
    if (!chapter || !book || guest || isStoryOwner || !getToken()) return Promise.resolve();
    clearTimeout(progressTimer.current);
    if (pendingProgress.current?.chapterId === String(chapter.id)) {
      pendingProgress.current = null;
    }
    const completed = completedStoryRef.current || progress >= 100;
    if (completed) completedStoryRef.current = true;
    const payload = {
      book_id: Number(id),
      reading_status: completed ? "Completed" : "Reading",
      updated_text: completed ? "Finished" : "Reading",
      chapters: chapters.length,
      last_chapter_number: chapterNumber,
      last_paragraph_index: paragraphIndex,
      chapters_read: completed ? chapters.length : Math.max(0, idx),
      reading_progress_percent: progress,
      primary_genre: book?.primary_genre || book?.genre || "",
      title: book?.title || "Story",
      author: book?.author_name || book?.author || "Author",
      cover_path: book?.cover_path || "",
      author_user_id: authorId,
    };
    saveLocalReadingProgress(user?.user_id || user?.id, payload, book);
    window.dispatchEvent(new CustomEvent("novelhub:library-progress-changed", {
      detail: { ...payload, updated_at: new Date().toISOString() },
    }));
    const pendingKey = progress >= 100 ? completedTabPendingKey(user) : "";
    if (pendingKey) localStorage.setItem(pendingKey, "1");
    const saveTask = saveQueue.current
      .catch(() => undefined)
      .then(() => saveLibraryProgress(payload))
      .catch((err) => {
        if (pendingKey) localStorage.removeItem(pendingKey);
        throw err;
      });
    saveQueue.current = saveTask;
    return saveTask;
  }

  function recordProgress(paragraphIndex, progress, immediate = false) {
    setReadingParagraph(paragraphIndex);
    if (immediate) {
      return savePosition(paragraphIndex, progress);
    }
    if (getToken() && !guest && !isStoryOwner) {
      pendingProgress.current = {
        chapterId: String(chapter?.id || ""),
        paragraphIndex,
        progress,
      };
      clearTimeout(progressTimer.current);
      progressTimer.current = setTimeout(() => {
        savePosition(paragraphIndex, progress).catch((err) => {
          setMsg(`Reading progress could not be saved: ${err.message || "Please try again."}`);
        });
      }, 300);
    }
    return Promise.resolve();
  }

  async function loadComments(num) {
    try {
      const res = await getChapterComments(id, num);
      setComments(res?.items || []);
      setParaCounts(res?.paragraph_counts || {});
      setCommentMsg("");
    } catch (err) {
      setComments([]);
      setParaCounts({});
      setCommentMsg(`Comments could not load: ${err.message || "check your connection and try again."}`);
    }
  }

  async function loadReactions(num) {
    try {
      const res = await getChapterReactions(id, num);
      setReactionCounts(res?.counts || res || {});
      setMine(res?.mine || []);
    } catch {
      setReactionCounts({});
      setMine([]);
    }
  }

  useEffect(() => {
    if (!chapter) return undefined;
    const num = Number(chapter.chapter_number) || 1;
    let active = true;
    const refreshLiveActivity = () => {
      void loadComments(num);
      void loadReactions(num);
      getBookLike(id).then((like) => {
        if (!active) return;
        setLiked(!!like?.liked || !!like?.is_liked);
        if (Number.isFinite(Number(like?.likes_count))) {
          setBook((current) => current ? { ...current, likes_count: Number(like.likes_count) } : current);
        }
      }).catch(() => {});
    };
    window.addEventListener("novelhub:content-changed", refreshLiveActivity);
    return () => {
      active = false;
      window.removeEventListener("novelhub:content-changed", refreshLiveActivity);
    };
  }, [chapter, id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError("");
      try {
        const [b, chRes] = await Promise.all([getBook(id), getBookChapters(id)]);
        const items = [...(chRes?.items || [])].sort((a, b) => {
          const byNumber = Number(a.chapter_number || 0) - Number(b.chapter_number || 0);
          return byNumber || String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
        });
        if (cancelled) return;
        setBook(b);
        setChapters(items);
        const found = items.find((c) => String(c.id) === String(chapterId));
        setChapter(found || null);
        getBookLike(id).then((like) => {
          if (!cancelled) {
            setLiked(!!like?.liked || !!like?.is_liked);
            if (Number.isFinite(Number(like?.likes_count))) {
              setBook((current) => current ? { ...current, likes_count: Number(like.likes_count) } : current);
            }
          }
        }).catch(() => {
          // The reader remains available if optional like metadata is unavailable.
        });
        if (found) {
          const num = Number(found.chapter_number) || 1;
          recordChapterView(id, num).catch((viewError) => {
            console.warn("Chapter analytics could not be recorded.", viewError);
          });
          await loadComments(num);
          await loadReactions(num);
        }
      } catch (e) {
        if (!cancelled) setError(String(e.message || e));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, chapterId]);

  useEffect(() => {
    if (!chapter) return undefined;
    const progress = progressAtParagraph(safeResumeParagraph);
    setReadingProgress(progress);
    setChapterProgress(chapterProgressAtParagraph(safeResumeParagraph));
    setReadingParagraph(safeResumeParagraph);
    if (!getToken() || guest) return undefined;
    void recordProgress(safeResumeParagraph, progress, true).catch((err) => {
      setMsg(`Reading progress could not be saved: ${err.message || "Please try again."}`);
    });
    return undefined;
  }, [chapter?.id, chapters.length, guest, id, safeResumeParagraph, isStoryOwner, chapterNumber, idx, totalBookWords, paragraphWordCounts, book?.primary_genre, book?.genre]);

  useEffect(() => {
    if (!chapter || safeResumeParagraph <= 0) return undefined;
    const frame = requestAnimationFrame(() => {
      document.querySelector(`[data-reader-paragraph="${safeResumeParagraph}"]`)
        ?.scrollIntoView({ block: "start", behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [chapter?.id, safeResumeParagraph]);

  useEffect(() => {
    if (safeResumeParagraph > 0 || !chapter) return undefined;
    window.scrollTo({ top: 0, behavior: "instant" });
    return undefined;
  }, [chapter?.id, safeResumeParagraph]);

  useEffect(() => {
    const flushPendingProgress = () => {
      const currentChapterId = String(chapter?.id || "");
      let pending = pendingProgress.current;
      if (pending?.chapterId !== currentChapterId) pending = null;
      // Capture the actual viewport too, so a quick tab close or route change
      // during the scroll debounce cannot leave the previous paragraph saved.
      if (chapter && document.querySelector("[data-reader-paragraph]")) {
        const position = visibleReadingPosition();
        pending = {
          chapterId: currentChapterId,
          paragraphIndex: position.paragraphIndex,
          progress: position.progress,
        };
      }
      if (!pending) return;
      clearTimeout(progressTimer.current);
      pendingProgress.current = null;
      void savePosition(pending.paragraphIndex, pending.progress).catch((err) => {
        console.warn("Reading progress could not be saved while leaving the chapter.", err);
      });
    };
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") flushPendingProgress();
    };
    window.addEventListener("pagehide", flushPendingProgress);
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      window.removeEventListener("pagehide", flushPendingProgress);
      document.removeEventListener("visibilitychange", flushWhenHidden);
      flushPendingProgress();
      clearTimeout(progressTimer.current);
    };
  }, [chapter?.id]);

  useEffect(() => {
    if (!chapter) return undefined;
    const onScroll = () => {
      cancelAnimationFrame(scrollFrame.current);
      scrollFrame.current = requestAnimationFrame(() => {
        const position = visibleReadingPosition();
        setReadingProgress(position.progress);
        setChapterProgress(position.chapterProgress);
        if (!guest && !isStoryOwner && getToken()) {
          recordProgress(position.paragraphIndex, position.progress);
        } else {
          setReadingParagraph(position.paragraphIndex);
        }
      });
    };
    const onPopState = () => {
      const position = visibleReadingPosition();
      setReadingProgress(position.progress);
      setChapterProgress(position.chapterProgress);
      setReadingParagraph(position.paragraphIndex);
      void recordProgress(position.paragraphIndex, position.progress, true).catch((err) => {
        setMsg(`Reading progress could not be saved: ${err.message || "Please try again."}`);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("popstate", onPopState);
      cancelAnimationFrame(scrollFrame.current);
    };
  }, [chapter?.id, chapterWordCounts, guest, isStoryOwner, paragraphs, totalBookWords, id, chapterNumber, idx, book?.primary_genre, book?.genre]);

  if (guest && chapter && !isChapterAllowedForGuest(chapterAccessIndex)) {
    return (
      <div className="container page">
        <div className="guest-lock">
          <h3>Sign in to keep reading</h3>
          <p>
            Guests can read the first {GUEST_CHAPTER_LIMIT} chapters. Sign in for the full story.
          </p>
          <Link className="btn btn-primary" to="/login" state={{ returnTo: `/stories/${id}/chapters/${chapterId}` }}>
            Sign in
          </Link>
          <div style={{ marginTop: 12 }}>
            <Link to={`/stories/${id}`}>← Back to story</Link>
          </div>
        </div>
      </div>
    );
  }

  if (error) return <div className="container page error-banner">{error}</div>;
  if (!chapter) return <div className="container page">Loading chapter…</div>;
  const prev = idx > 0 ? chapters[idx - 1] : null;
  const next = idx >= 0 && idx < chapters.length - 1 ? chapters[idx + 1] : null;
  const nextAccessIndex = next ? guestChapterOrder.get(String(next.id)) ?? -1 : -1;
  const nextLocked = guest && next && !isChapterAllowedForGuest(nextAccessIndex);

  function openPara(i) {
    setActivePara(i);
    setPanelOpen(true);
    const progress = progressAtParagraph(i, 0);
    setReadingProgress(progress);
    setChapterProgress(chapterProgressAtParagraph(i, 0));
    recordProgress(i, progress);
  }

  async function returnToStoryDetail(event) {
    event?.preventDefault();
    if (!window.confirm("Leave chapter? Do you want to go to the story detail page?")) return;
    if (!guest && !isStoryOwner && getToken()) {
      const position = visibleReadingPosition();
      setReadingProgress(position.progress);
      setChapterProgress(position.chapterProgress);
      setReadingParagraph(position.paragraphIndex);
      try {
        await recordProgress(position.paragraphIndex, position.progress, true);
      } catch (err) {
        setMsg(`Reading progress could not be saved: ${err.message || "Please try again."}`);
        return;
      }
    }
    navigate(`/stories/${id}`, { replace: true });
  }

  async function submitComment(e) {
    e.preventDefault();
    if (!getToken() || guest) {
      setCommentMsg("Sign in to comment.");
      return;
    }
    if (!draft.trim()) {
      setCommentMsg("Write a comment before posting.");
      return;
    }
    setBusy(true);
    setCommentMsg("");
    try {
      await postChapterComment(id, chapterNumber, {
        body: draft.trim(),
        paragraph_index: activePara ?? -1,
      });
      setDraft("");
      await loadComments(chapterNumber);
      setCommentMsg("Comment posted.");
    } catch (err) {
      setCommentMsg(String(err.message || err));
    } finally {
      setBusy(false);
    }
  }

  async function onReact(label) {
    if (!getToken() || guest) {
      navigate("/login", { state: { returnTo: `/stories/${id}/chapters/${chapterId}` } });
      return;
    }
    try {
      const res = await toggleChapterReaction(id, chapterNumber, label);
      setReactionCounts((prev) => ({
        ...prev,
        [label]: res?.count ?? (prev[label] || 0),
      }));
      if (res?.selected) {
        setMine((m) => (m.includes(label) ? m : [...m, label]));
      } else {
        setMine((m) => m.filter((x) => x !== label));
      }
      await loadReactions(chapterNumber);
    } catch (err) {
      setMsg(String(err.message || err));
    }
  }

  async function onCommentLike(comment) {
    if (!getToken() || guest) {
      navigate("/login", { state: { returnTo: `/stories/${id}/chapters/${chapterId}` } });
      return;
    }
    if (commentLikeBusy[comment.id]) return;
    setCommentLikeBusy((current) => ({ ...current, [comment.id]: true }));
    setCommentMsg("");
    try {
      const result = await toggleChapterCommentLike(comment.id);
      setComments((current) => current.map((item) => (
        item.id === comment.id
          ? { ...item, liked: Boolean(result?.liked), like_count: Number(result?.like_count ?? item.like_count ?? 0) }
          : item
      )));
    } catch (err) {
      setCommentMsg(String(err.message || err));
    } finally {
      setCommentLikeBusy((current) => ({ ...current, [comment.id]: false }));
    }
  }

  async function onSaveList() {
    if (!getToken() || guest) {
      setMsg("Sign in to save");
      return;
    }
    try {
      await addToReadingList(Number(id));
      setMsg("Saved to reading list");
    } catch (err) {
      setMsg(String(err.message || err));
    }
  }

  async function onLike() {
    if (!getToken() || guest) {
      navigate("/login", { state: { returnTo: `/stories/${id}/chapters/${chapterId}` } });
      return;
    }
    if (likeBusy) return;
    setLikeBusy(true);
    setMsg("");
    try {
      const result = await toggleBookLike(id, liked);
      const nowLiked = result?.liked === true || result?.is_liked === true || (result?.liked !== false && !liked);
      setLiked(nowLiked);
      if (Number.isFinite(Number(result?.likes_count))) {
        setBook((current) => current ? { ...current, likes_count: Number(result.likes_count) } : current);
      }
    } catch (err) {
      setMsg(`Like could not be updated: ${err.message || "Please try again."}`);
    } finally {
      setLikeBusy(false);
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
    } catch (err) {
      if (err.name !== "AbortError") {
        setMsg(`Story link could not be shared: ${err.message || "Please try again."}`);
      }
    }
  }

  async function finishStory() {
    if (!getToken() || guest) {
      setMsg("Sign in to save your reading progress");
      return;
    }
    if (isStoryOwner) {
      removeLocalReadingProgress(user?.user_id || user?.id, id);
      setMsg("Story completed");
      navigate(`/stories/${id}`, { replace: true });
      return;
    }
    try {
      const payload = {
        book_id: Number(id),
        reading_status: "Completed",
        updated_text: "Finished",
        chapters: chapters.length,
        last_chapter_number: chapterNumber,
        last_paragraph_index: Math.max(0, paragraphs.length - 1),
        chapters_read: chapters.length,
        reading_progress_percent: 100,
        primary_genre: book?.primary_genre || book?.genre || "",
        title: book?.title || "Story",
        author: book?.author_name || book?.author || "Author",
        cover_path: book?.cover_path || "",
        author_user_id: authorId,
      };
      completedStoryRef.current = true;
      saveLocalReadingProgress(user?.user_id || user?.id, payload, book);
      const pendingKey = completedTabPendingKey(user);
      if (pendingKey) localStorage.setItem(pendingKey, "1");
      await saveLibraryProgress(payload);
      setMsg("Story marked completed");
      navigate(`/stories/${id}`, { replace: true });
    } catch (err) {
      const pendingKey = completedTabPendingKey(user);
      if (pendingKey) localStorage.removeItem(pendingKey);
      setMsg(String(err.message || err));
    }
  }

  function adjustFontSize(amount) {
    setFontSize((current) => {
      const next = Math.max(16, Math.min(26, current + amount));
      localStorage.setItem("novelhub_reader_font_size", String(next));
      return next;
    });
  }

  function toggleWarmPage() {
    setWarmPage((current) => {
      localStorage.setItem("novelhub_reader_warm_page", String(!current));
      return !current;
    });
  }

  const panelComments =
    activePara == null
      ? filterChapterComments(comments)
      : filterParagraphComments(comments, activePara);
  const chapterCommentsCount = filterChapterComments(comments).length;

  return (
    <div className={`inkitt-reader${warmPage ? " reader-warm" : ""}`}>
      <div
        className="reader-scroll-progress"
        role="progressbar"
        aria-label="Chapter reading progress"
        aria-valuetext={`${chapterProgress}% of this chapter read`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={chapterProgress}
      >
        <span style={{ width: `${chapterProgress}%` }} />
      </div>
        <nav className="reader-workspace-bar" aria-label="Reading controls">
          <Link to={`/stories/${id}`} className="reader-workspace-story" onClick={returnToStoryDetail}>
            <span aria-hidden="true">←</span>
            {book?.cover_path ? (
              <img className="reader-workspace-cover" src={resolveAssetUrl(book.cover_path)} alt="" />
            ) : null}
            <span className="reader-workspace-story-copy">
              <strong>{book?.title || "Story"}</strong>
              <small>{book?.author_name || book?.author || "Wingsaga"}</small>
            </span>
          </Link>
          <span className="reader-book-progress" aria-label={`${readingProgress}% of story read, part ${chapterNumber}, paragraph ${readingParagraph + 1}`}>
            <strong>{readingProgress}%</strong><span>of story read</span>
            <small>Part {chapterNumber} · Paragraph {readingParagraph + 1}</small>
          </span>
        </nav>
        <div className={`inkitt-reader-grid${authorId ? " has-author-rail" : ""}`}>
        <aside className="reader-actions">
          <button type="button" className="story-action-btn" onClick={onSaveList}>
            🔖 Add to Reading List
          </button>
          <Link className="story-action-btn story-action-primary" to={`/stories/${id}/review`}>
            Write a Review
          </Link>
          <button type="button" className="story-action-btn" onClick={shareStory}>
            Share story
          </button>
          {msg ? <p className="meta side-msg">{msg}</p> : null}
          <div className="reader-font-tools">
            <span className="meta">Customize readability</span>
            <div className="font-btns">
              <button type="button" className="story-action-btn" onClick={() => adjustFontSize(-1)} aria-label="Decrease reading text size">A-</button>
              <button type="button" className="story-action-btn" onClick={() => adjustFontSize(1)} aria-label="Increase reading text size">A+</button>
              <button type="button" className={`story-action-btn ${warmPage ? "selected" : ""}`} onClick={toggleWarmPage} aria-pressed={warmPage}>Warm page</button>
            </div>
          </div>
        </aside>

        <article className={`reader-main ${warmPage ? "reader-main--warm" : ""}`}>
          <div className="reader-top-inline">
            <div className="reader-story-heading">
              {book?.cover_path ? (
                <img
                  className="reader-story-cover"
                  src={resolveAssetUrl(book.cover_path)}
                  alt={`${book.title || "Story"} cover`}
                />
              ) : null}
              <div className="reader-story-heading-copy">
                <span className="eyebrow">PART {chapterNumber} · {book?.title || "STORY"}</span>
                <h1 className="chapter-heading">{chapter.title || `Chapter ${chapterNumber}`}</h1>
                <span className="reader-story-author">{book?.author_name || book?.author || ""}</span>
                <button
                  type="button"
                  className={`reader-like-button${liked ? " is-liked" : ""}`}
                  onClick={onLike}
                  disabled={likeBusy}
                  aria-pressed={liked}
                  aria-label={`${liked ? "Unlike" : "Like"} ${book?.title || "this story"}${Number(book?.likes_count) ? `, ${Number(book.likes_count)} likes` : ""}`}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
                  </svg>
                  <span>{liked ? "Liked" : "Like"}</span>
                  <small>{Number(book?.likes_count || 0).toLocaleString()}</small>
                </button>
              </div>
            </div>
          </div>

          <div className="reader-paragraphs" style={{ "--reader-font-size": `${fontSize}px` }}>
            {paragraphs.length ? (
              paragraphs.map((p, i) => {
                const count = Number(paraCounts[i] || paraCounts[String(i)] || 0);
                return (
                  <div key={i} className="para-row">
                    <p className="para-text" data-reader-paragraph={i}>{renderRichTextNodes(p.nodes, `chapter-${i}`)}</p>
                    <div className="para-actions" aria-label={`Paragraph ${i + 1} actions`}>
                      <button
                        type="button"
                        className={`para-bubble ${count > 0 ? "has-comments" : ""}`}
                        onClick={() => openPara(i)}
                        title="Paragraph comments"
                        aria-label={`View ${count} comments on paragraph ${i + 1}`}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8.7 8.7 0 0 1-3.4-.7L4 20l1.2-3.4A7.2 7.2 0 0 1 4 12c0-4.1 3.6-7.5 8-7.5s8 3.1 8 7Z" />
                        </svg>
                        <span>{count}</span>
                      </button>
                      {(() => {
                        const label = `paragraph:${i}:Like`;
                        const selected = mine.includes(label);
                        const reactionCount = Number(reactionCounts[label] || 0);
                        return (
                          <button
                            type="button"
                            className={`para-heart${selected ? " is-liked" : ""}`}
                            onClick={() => onReact(label)}
                            aria-pressed={selected}
                            aria-label={`${selected ? "Unlike" : "Like"} paragraph ${i + 1}, ${reactionCount} likes`}
                            title="Like this paragraph"
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
                            </svg>
                            <span>{reactionCount}</span>
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="meta">Empty chapter.</p>
            )}
          </div>
          <aside className="reader-ad-slot" aria-label="Advertisement placement">
            <strong>Advertisement</strong><span>Reserved space — does not interrupt reading</span>
          </aside>

          <section className="chapter-discussion-entry" aria-label="Chapter discussion">
            <div>
              <span className="eyebrow">CHAPTER DISCUSSION</span>
              <h2>Talk about this chapter</h2>
            </div>
            <button type="button" className="btn btn-ghost" onClick={openChapterComments}>
              💬 Chapter comments ({chapterCommentsCount})
            </button>
          </section>

          <div className="chapter-divider">〰</div>

          <div className="reader-nav">
            {prev ? (
              <Link className="btn" to={`/stories/${id}/chapters/${prev.id}`} replace>
                ← Previous
              </Link>
            ) : (
              <span />
            )}
            {next && !nextLocked ? (
              <Link className="btn btn-primary" to={`/stories/${id}/chapters/${next.id}`} replace>
                Next →
              </Link>
            ) : (
              <button className="btn btn-primary" type="button" onClick={finishStory}>
                Finish story
              </button>
            )}
          </div>
          <aside className="reader-ad-slot reader-ad-slot-bottom" aria-label="Advertisement placement">
            <strong>Advertisement</strong><span>Reserved space</span>
          </aside>

          <section className="reactions-grid-wrap">
            <h3>Reactions</h3>
            <div className="reactions-grid">
              {REACTIONS.map((r) => {
                const count = Number(reactionCounts[r.label] || 0);
                const selected = mine.includes(r.label);
                return (
                  <button
                    key={r.label}
                    type="button"
                    className={`reaction-cell ${selected ? "selected" : ""}`}
                    onClick={() => onReact(r.label)}
                  >
                    <span className="reaction-emoji">{r.emoji}</span>
                    <span className="reaction-count">{count}</span>
                    <span className="reaction-label">{r.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {nextLocked ? (
            <div className="guest-lock">
              <h3>Unlock the rest of this story</h3>
              <p>Sign in to read the next chapters.</p>
              <Link className="btn btn-primary" to="/login" state={{ returnTo: `/stories/${id}/chapters/${next.id}` }}>
                Sign in
              </Link>
            </div>
          ) : null}

        </article>

        <aside className="reader-chapters-side" aria-label="Story navigation">
          <details className="reader-chapters-details" open>
            <summary>
              <span><small>STORY CONTENTS</small><strong>Chapters</strong></span>
              <span className="reader-chapters-current">Part {chapterNumber} <i aria-hidden="true">⌄</i></span>
            </summary>
            <ol className="reader-chapter-list">
              {chapters.map((item, index) => {
                const accessIndex = guestChapterOrder.get(String(item.id)) ?? index;
                const locked = guest && !isChapterAllowedForGuest(accessIndex);
                const selected = String(item.id) === String(chapterId);
                const number = item.chapter_number ?? accessIndex + 1;
                const title = item.title || `Chapter ${number}`;
                return (
                  <li key={item.id} className={`${selected ? "is-current" : ""}${locked ? " is-locked" : ""}`}>
                    {locked ? (
                      <Link to="/login" state={{ returnTo: `/stories/${id}/chapters/${item.id}` }}>
                        <span className="reader-chapter-index">🔒</span>
                        <span className="reader-chapter-title">{number}. {title}</span>
                        <span className="reader-chapter-lock-label">Sign in</span>
                      </Link>
                    ) : (
                      <Link to={`/stories/${id}/chapters/${item.id}`} replace aria-current={selected ? "page" : undefined}>
                        <span className="reader-chapter-index">{number}</span>
                        <span className="reader-chapter-title">{title}</span>
                      </Link>
                    )}
                  </li>
                );
              })}
            </ol>
          </details>
          {authorId ? (
            <section className="reader-author-card">
              <span className="reader-author-kicker">THE AUTHOR</span>
              <Link className="reader-author-profile" to={`/authors/${authorId}`}>
                <span className="reader-author-avatar">
                  {authorProfile?.photo_url || authorProfile?.avatar_url ? (
                    <img
                      src={resolveAssetUrl(authorProfile.photo_url || authorProfile.avatar_url)}
                      alt=""
                    />
                  ) : (
                    (authorProfile?.display_name || authorProfile?.username || book?.author_name || book?.author || "A")
                      .trim().slice(0, 1).toUpperCase()
                  )}
                </span>
                <strong>{authorProfile?.display_name || authorProfile?.username || book?.author_name || book?.author || "Author"}</strong>
                {authorProfile?.username ? <small>@{String(authorProfile.username).replace(/^@+/, "")}</small> : null}
              </Link>
              {authorProfile?.bio ? <p>{authorProfile.bio}</p> : <p>Read more stories and updates from this author.</p>}
              <Link className="reader-author-link" to={`/authors/${authorId}`}>View author profile <span aria-hidden="true">→</span></Link>
            </section>
          ) : null}
        </aside>

      </div>

      {/* Comments slide-over panel */}
      {panelOpen && (
        <div className="comments-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setPanelOpen(false); }}>
        <section className="comments-panel" role="dialog" aria-modal="true" aria-labelledby="comments-panel-title">
          <div className="comments-panel-head">
            <div>
              <span className="comments-panel-kicker">{activePara == null ? "CHAPTER DISCUSSION" : "PARAGRAPH DISCUSSION"}</span>
              <h2 id="comments-panel-title">{activePara == null ? "Chapter comments" : `Paragraph ${activePara + 1} comments`}</h2>
              <p>{book?.title || "Story"} <span aria-hidden="true">·</span> Part {chapterNumber}</p>
            </div>
            <button ref={commentCloseButton} type="button" className="auth-close" aria-label="Close comments" onClick={() => setPanelOpen(false)}>
              ×
            </button>
          </div>
          <ul className="comment-thread">
            {panelComments.map((c) => (
              <li key={c.id} className="comment-card">
                <span className="comment-avatar" aria-hidden="true">{(c.display_name || "Reader").trim().slice(0, 1).toUpperCase()}</span>
                <div className="comment-card-content">
                  <div className="comment-card-meta"><strong>{c.display_name || "Reader"}</strong><time dateTime={c.created_at || undefined}>{formatCommentDate(c.created_at)}</time></div>
                  <p>{c.body}</p>
                  <button
                    type="button"
                    className={`comment-like${c.liked ? " is-liked" : ""}`}
                    onClick={() => onCommentLike(c)}
                    disabled={Boolean(commentLikeBusy[c.id])}
                    aria-pressed={Boolean(c.liked)}
                    aria-label={`${c.liked ? "Unlike" : "Like"} comment by ${c.display_name || "Reader"}`}
                  >
                    <span aria-hidden="true">♥</span> {Number(c.like_count || 0)}
                  </button>
                </div>
              </li>
            ))}
            {panelComments.length === 0 && commentMsg.startsWith("Comments could not load:") ? (
              <li className="comment-load-error" role="alert">
                <span>{commentMsg}</span>
                <button type="button" onClick={() => loadComments(chapterNumber)}>Try again</button>
              </li>
            ) : null}
            {panelComments.length === 0 && !commentMsg.startsWith("Comments could not load:") && <li className="comment-empty"><span aria-hidden="true">✧</span><strong>Start the conversation</strong><p>{activePara == null ? "Share what stood out to you in this chapter." : "Be the first to share a thought about this paragraph."}</p></li>}
          </ul>
          {(!isStoryOwner || activePara != null) ? <form className="comment-compose" onSubmit={submitComment}>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={guest ? "Sign in to write a comment…" : isStoryOwner ? "Leave a note on this paragraph…" : "Write a comment…"}
              disabled={guest}
              rows={3}
              maxLength={2000}
              aria-label="Write a comment"
            />
            <div className="comment-compose-footer">
              {guest ? <Link to="/login" state={{ returnTo: `/stories/${id}/chapters/${chapterId}` }}>Sign in to join the conversation</Link> : <span>{draft.length}/2000</span>}
              <button type="submit" className="btn btn-primary" disabled={guest || busy || !draft.trim()}>
                {busy ? "Posting…" : "Post comment"}
              </button>
            </div>
          </form> : <p className="comment-form-status meta">You own this story. Reader chapter comments appear here.</p>}
          {commentMsg && !commentMsg.startsWith("Comments could not load:") ? <p className="comment-form-status meta" role="status">{commentMsg}</p> : null}
        </section>
        </div>
      )}
    </div>
  );
}
