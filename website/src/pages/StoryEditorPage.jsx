import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  createChapter,
  createStory,
  deleteChapter,
  getWriteStory,
  getStoryChapterRevisions,
  reorderStoryChapters,
  resolveAssetUrl,
  submitAllChapters,
  restoreStoryChapterRevision,
  updateChapter,
  updateStory,
  uploadWriteImage,
} from "../api";
import { isGuestUser } from "../utils/guest";
import ImageAdjustModal from "../components/ImageAdjustModal";
import { showToast } from "../components/ToastViewport";
import { parseRichTextParagraphs, richTextToPlainText, sanitizeRichTextHtml } from "../utils/richText";
import { formatSelectedText } from "../utils/inlineTextFormatting";

const MIN_PUBLISH_WORDS = 60;
const MAX_PUBLISH_WORDS = 10000;

export default function StoryEditorPage({ user }) {
  const { storyId } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const guest = isGuestUser(user);
  const coverInputRef = useRef(null);
  const editorSurfaceRef = useRef(null);
  const notesTextareaRef = useRef(null);
  const moreMenuRef = useRef(null);

  // Notes remain plain text; chapter formatting uses semantic markup in the rich editor.
  const applyInlineFormat = (kind) => {
    const input = notesTextareaRef.current;
    if (!input) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    if (start === end) {
      input.focus();
      return;
    }
    const currentText = notes;
    const selected = currentText.slice(start, end);
    const styled = formatSelectedText(selected, kind);
    const scrollTop = input.scrollTop;
    const next = currentText.slice(0, start) + styled + currentText.slice(end);
    setNotes(next);
    setDraftDirty(true);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start, start + styled.length);
      input.scrollTop = scrollTop;
    });
  };

  function syncEditorContent() {
    const editor = editorSurfaceRef.current;
    if (!editor) return;
    const safeContent = sanitizeRichTextHtml(editor.innerHTML);
    setContent((current) => current === safeContent ? current : safeContent);
    setDraftDirty(true);
  }

  function applyEditorFormat(command) {
    const editor = editorSurfaceRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || !selection.rangeCount || selection.isCollapsed
      || !editor.contains(selection.anchorNode) || !editor.contains(selection.focusNode)) {
      editor?.focus();
      return;
    }
    const range = selection.getRangeAt(0).cloneRange();
    editor.focus();
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand("styleWithCSS", false, false);
    document.execCommand(command, false);
    syncEditorContent();
  }

  const [story, setStory] = useState(null);
  const [coverCropFile, setCoverCropFile] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [title, setTitle] = useState("");
  const [storyTitle, setStoryTitle] = useState("");
  const [content, setContent] = useState("");
  const [draftDirty, setDraftDirty] = useState(false);
  const blocker = useBlocker(draftDirty);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [addingChapter, setAddingChapter] = useState(false);
  const [savingChapterDraft, setSavingChapterDraft] = useState(false);
  const [deletingStory, setDeletingStory] = useState(false);
  const [lastSaved, setLastSaved] = useState("");
  const [submitOpen, setSubmitOpen] = useState(false);
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [revisionsOpen, setRevisionsOpen] = useState(false);
  const [revisions, setRevisions] = useState([]);
  const [loadingRevisions, setLoadingRevisions] = useState(false);
  const [restoringRevision, setRestoringRevision] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [chapterPanelOpen, setChapterPanelOpen] = useState(true);
  const autoSaveTimer = useRef(null);
  const saveQueue = useRef(Promise.resolve());
  const pendingSaves = useRef(0);
  const draftRef = useRef({ id: activeId, title, content, notes });
  draftRef.current = { id: activeId, title, content, notes };

  useEffect(() => {
    const editor = editorSurfaceRef.current;
    if (!editor) return;
    const safeContent = sanitizeRichTextHtml(content);
    if (sanitizeRichTextHtml(editor.innerHTML) !== safeContent) editor.innerHTML = safeContent;
  }, [activeId, content]);

  useEffect(() => {
    if (!moreOptionsOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!moreMenuRef.current?.contains(event.target)) setMoreOptionsOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setMoreOptionsOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [moreOptionsOpen]);

  const active = useMemo(
    () => chapters.find((c) => String(c.id) === String(activeId)) || chapters[0],
    [chapters, activeId]
  );
  async function load(id, preferredChapterId = null, preferLatestChapter = false) {
    const res = await getWriteStory(id);
    if (res?.chaptersError) {
      throw new Error(`Could not load this story's chapters: ${res.chaptersError.message || "Please check your connection and try again."}`);
    }
    const s = res?.story || res?.item || res;
    let ch = res?.chapters || res?.items || [];
    if (!Array.isArray(ch)) ch = [];
    // Normalize chapter fields from backend
    ch = ch.map((c) => ({
      ...c,
      id: c.id,
      title: c.title || `Chapter ${c.chapter_number || ""}`,
      content: c.content || "",
      notes: c.notes || "",
      submission_status: c.submission_status || "draft",
      chapter_number: c.chapter_number,
    }));
    setStory(s);
    setStoryTitle(s?.title || "Untitled Story");
    if (!ch.length) {
      ch = [{
        id: null,
        title: "Chapter 1",
        content: "",
        notes: "",
        submission_status: "draft",
        chapter_number: 1,
      }];
    }

    ch = (Array.isArray(ch) ? ch : []).map((c) => ({
      ...c,
      title: c.title || `Chapter ${c.chapter_number || ""}`,
      content: c.content || "",
      notes: c.notes || "",
      submission_status: c.submission_status || "draft",
    }));
    setChapters(ch);
    const prefer = preferredChapterId
      ? ch.find((c) => String(c.id) === String(preferredChapterId))
      : activeId && ch.find((c) => String(c.id) === String(activeId));
    const pick = prefer || (preferLatestChapter ? ch.at(-1) : ch[0]);
    if (pick) {
      setActiveId(pick.id);
      setTitle(pick.title || "Chapter 1");
      setContent(pick.content || "");
      setNotes(pick.notes || "");
      setDraftDirty(false);
    } else {
      setActiveId(null);
      setTitle("");
      setContent("");
      setDraftDirty(false);
    }
  }

  function saveDraft(snapshot, manual = false, asDraft = false) {
    if (!snapshot) return Promise.resolve(null);
    if (!String(snapshot.title || "").trim()) {
      const error = new Error("Add a chapter title before saving.");
      setMsg(error.message);
      return Promise.reject(error);
    }
    const savedContent = sanitizeRichTextHtml(snapshot.content);
    if (!richTextToPlainText(savedContent).trim()) {
      const error = new Error("You can't save an empty chapter.");
      setMsg(error.message);
      return Promise.reject(error);
    }
    clearTimeout(autoSaveTimer.current);
    pendingSaves.current += 1;
    setSaving(true);
    setMsg(manual ? "Saving…" : "Saving draft…");
    let savedChapterId = snapshot.id || null;
    const chapterNumber = Number(snapshot.chapter_number || active?.chapter_number)
      || chapters.reduce((highest, chapter) => Math.max(highest, Number(chapter.chapter_number) || 0), 0) + 1;
    const submissionStatus = asDraft
      ? "draft"
      : snapshot.submission_status || active?.submission_status || "draft";
    const scheduledFor = (
      Object.prototype.hasOwnProperty.call(snapshot, "scheduled_for")
        ? snapshot.scheduled_for
        : active?.scheduled_for
    ) ?? null;

    const save = saveQueue.current
      .catch(() => {})
      .then(() => {
        const normalizedTitle = String(snapshot.title || "").trim().toLocaleLowerCase();
        const duplicate = normalizedTitle && chapters.find((chapter) =>
          String(chapter.id) !== String(snapshot.id)
          && String(chapter.title || "").trim().toLocaleLowerCase() === normalizedTitle,
        );
        if (duplicate) throw new Error(`Another chapter is already named “${duplicate.title}”. Give this chapter a different title before saving.`);
        if (savedChapterId) {
          return updateChapter(savedChapterId, {
            story_id: Number(storyId),
            title: String(snapshot.title || "").trim(),
            content: savedContent,
            notes: snapshot.notes,
            chapter_number: chapterNumber,
            submission_status: submissionStatus,
            scheduled_for: scheduledFor,
          });
        }
        return createChapter(storyId, {
          title: String(snapshot.title || "").trim(),
          content: savedContent,
          notes: snapshot.notes,
          chapter_number: chapterNumber,
          story_id: Number(storyId),
          submission_status: submissionStatus,
          scheduled_for: scheduledFor,
        }).then((result) => {
          savedChapterId = result?.id || result?.chapter_id || result?.item?.id;
          if (!savedChapterId) throw new Error("The chapter could not be saved because the server returned no chapter ID.");
          if (String(draftRef.current.id) === String(snapshot.id)) {
            draftRef.current = { ...draftRef.current, id: savedChapterId };
            setActiveId(savedChapterId);
          }
          setChapters((items) => items.map((item) => (
            String(item.id) === String(snapshot.id)
            && Number(item.chapter_number || 1) === chapterNumber
          ) ? { ...item, id: savedChapterId } : item));
        });
      })
      .then(async () => {
        if (asDraft) {
          setChapters((items) => items.map((item) => String(item.id) === String(savedChapterId)
            ? { ...item, submission_status: "draft" }
            : item));
          const hasPublishedSibling = chapters.some((chapter) =>
            String(chapter.id) !== String(savedChapterId) && isPublishedChapter(chapter),
          );
          const storyStatus = hasPublishedSibling ? "Ongoing" : "Draft";
          await updateStory(storyId, { status_text: storyStatus });
          setStory((current) => current ? { ...current, status_text: storyStatus } : current);
        }
      })
      .then(() => {
        const current = draftRef.current;
        if (String(current.id) === String(savedChapterId)) {
          setLastSaved(new Date().toLocaleString());
          const unchanged = current.title === snapshot.title
            && current.content === snapshot.content
            && current.notes === snapshot.notes;
          if (unchanged) {
            setDraftDirty(false);
            setMsg(manual ? "Saved" : "All changes saved");
          }
          setChapters((items) => items.map((item) => String(item.id) === String(savedChapterId)
            ? { ...item, title: snapshot.title, content: snapshot.content, notes: snapshot.notes, submission_status: submissionStatus, scheduled_for: scheduledFor }
            : item));
        }
        return savedChapterId;
      })
      .catch((err) => {
        if (String(draftRef.current.id) === String(savedChapterId) || String(draftRef.current.id) === String(snapshot.id)) {
          setMsg(`${manual ? "Save failed" : "Auto-save failed"}: ${err.message || "Please try saving again."}`);
        }
        throw err;
      })
      .finally(() => {
        pendingSaves.current -= 1;
        setSaving(pendingSaves.current > 0);
      });

    saveQueue.current = save;
    return save;
  }

  useEffect(() => {
    if (!draftDirty || !active || !title.trim() || !hasChapterText(content)) return undefined;
    const snapshot = {
      id: active.id,
      title,
      content,
      notes,
      chapter_number: active.chapter_number,
      submission_status: active.submission_status,
      scheduled_for: active.scheduled_for,
    };
    autoSaveTimer.current = window.setTimeout(() => {
      saveDraft(snapshot).catch((err) => {
        showToast(`Auto-save failed: ${err.message || "Please try saving again."}`, "error");
      });
    }, 2000);
    return () => clearTimeout(autoSaveTimer.current);
  }, [draftDirty, active, title, content, notes]);

  useEffect(() => () => clearTimeout(autoSaveTimer.current), []);

  useEffect(() => {
    if (!draftDirty) return undefined;
    const warnBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [draftDirty]);

  useEffect(() => {
    if (guest) return;
    let cancelled = false;
    (async () => {
      try {
        if (!storyId || storyId === "new") {
          const res = await createStory({
            title: "Untitled Story",
            author: user?.display_name || user?.username || user?.email || "Author",
            description: "",
            status_text: "Draft",
            genre: "Romance",
          });
          const id = res?.id || res?.story_id || res?.item?.id;
          if (id && !cancelled) navigate(`/write/${id}`, { replace: true });
          return;
        }
        await load(storyId, search.get("chapter"));
      } catch (e) {
        if (!cancelled) setError(String(e.message || e));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyId, guest, search]);

  async function selectChapter(c) {
    if (!c?.id) return;
    if (String(c.id) === String(active?.id)) {
      // An explicit click on the selected row should restore its saved text if
      // the editor state was cleared or not hydrated yet.
      if (!draftDirty) {
        draftRef.current = { id: c.id, title: c.title || "", content: c.content || "", notes: c.notes || "" };
        setTitle(c.title || "");
        setContent(c.content || "");
        setNotes(c.notes || "");
      }
      return;
    }
    clearTimeout(autoSaveTimer.current);
    const previous = active?.id ? { id: active.id, title, content, notes } : null;
    if (draftDirty && previous) {
      // Preserve the latest text in the list and switch immediately; a slow save
      // should never make the editor appear stuck on the previous chapter.
      setChapters((items) => items.map((item) => String(item.id) === String(previous.id)
        ? { ...item, title: previous.title, content: previous.content, notes: previous.notes }
        : item));
    }
    draftRef.current = { id: c.id, title: c.title || "", content: c.content || "", notes: c.notes || "" };
    setActiveId(c.id);
    setLastSaved("");
    setTitle(c.title || "");
    setContent(c.content || "");
    setNotes(c.notes || "");
    setDraftDirty(false);
    setMsg("");
    if (draftDirty && previous) {
      saveDraft(previous).catch((error) => {
        const message = `Previous chapter is still unsaved: ${error.message || "Please retry."}`;
        setMsg(message);
        showToast(message, "error");
      });
    }
  }

  async function saveChapter() {
    if (!active) {
      const message = "Create a chapter first.";
      setMsg(message);
      showToast(message, "warning");
      return;
    }
    if (!title.trim()) {
      const message = "Add a chapter title before saving.";
      setMsg(message);
      showToast(message, "warning");
      return;
    }
    if (!richTextToPlainText(content).trim()) {
      const message = "You can't save an empty chapter.";
      setMsg(message);
      showToast(message, "warning");
      return;
    }
    try {
      await saveDraft({ id: active.id, title, content, notes, chapter_number: active.chapter_number }, true, true);
      showToast("Draft saved.", "success");
      navigate("/manage-stories?tab=drafts");
    } catch (e) {
      setMsg(`Save failed: ${e.message || "Please try again."}`);
      showToast(`Save failed: ${e.message || "Please try again."}`, "error");
    }
  }

  function requestEditorNavigation(destination) {
    navigate(destination);
  }

  function discardAndLeave() {
    clearTimeout(autoSaveTimer.current);
    setDraftDirty(false);
    blocker.proceed();
  }

  async function saveDraftAndLeave() {
    if (!active) {
      const message = "Create a chapter before saving your changes as a draft.";
      setMsg(message);
      showToast(message, "warning");
      return;
    }
    if (!title.trim() || !hasChapterText(content)) {
      const message = "Add a chapter title and content before saving as a draft.";
      setMsg(message);
      showToast(message, "warning");
      return;
    }
    try {
      await saveDraft({ id: active.id, title, content, notes, chapter_number: active.chapter_number }, true, true);
      showToast("Draft saved.", "success");
      blocker.proceed();
    } catch (err) {
      setMsg(`Save failed: ${err.message || "Please try again."}`);
      showToast(`Save failed: ${err.message || "Please try again."}`, "error");
    }
  }

  async function removeChapter() {
    const chapter = chapters.find((item) => String(item.id) === String(activeId)) || active;
    if (!chapter || deletingStory) return;
    const chapterStatus = String(chapter.submission_status || "draft").toLowerCase();
    if (chapterStatus === "scheduled") {
      const message = "Clear the chapter schedule before deleting it.";
      setMsg(message);
      showToast(message, "warning");
      return;
    }
    if (chapterStatus !== "draft") {
      const message = "Only draft chapters can be deleted.";
      setMsg(message);
      showToast(message, "warning");
      return;
    }
    const isLastChapter = chapters.length === 1;
    const confirmed = window.confirm(
      isLastChapter
        ? "This is the last chapter. Deleting it will keep the story details page. You can delete the story from Manage Stories after all chapters are removed."
        : "Are you sure you want to delete this chapter? This action cannot be undone."
    );
    if (!confirmed) return;
    setDeletingStory(true);
    setError("");
    try {
      if (draftDirty && String(activeId) === String(chapter.id)) {
        await saveDraft({ id: activeId, title, content, notes });
      }
      await deleteChapter(chapter.id);
      showToast("Chapter deleted.", "success");
      if (isLastChapter) {
        navigate("/manage-stories?tab=drafts", { replace: true });
      } else {
        await load(storyId);
        setMsg("Chapter deleted");
      }
    } catch (err) {
      setMsg(String(err.message || err));
      showToast(String(err.message || err), "error");
    } finally {
      setDeletingStory(false);
    }
  }

  async function onCoverFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCoverCropFile(file);
  }

  async function uploadAdjustedCover(file) {
    setMsg("Uploading cover…");
    try {
      const up = await uploadWriteImage(file);
      let path = up?.path || up?.url || up?.cover_path || up?.filename;
      if (!path) throw new Error("No path returned from upload");
      if (!String(path).startsWith("/") && !String(path).startsWith("http")) {
        path = `/uploads/${path}`;
      }
      await updateStory(storyId, { cover_path: path });
      setStory((s) => (s ? { ...s, cover_path: path } : s));
      setMsg("Cover updated");
      showToast("Story cover updated.", "success");
      await load(storyId);
    } catch (err) {
      const message = String(err.message || err);
      setMsg(message);
      showToast(message, "error");
    } finally {
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  }

  async function addChapter() {
    if (addingChapter || reordering) return;
    if (!active || !title.trim() || !hasChapterText(content)) {
      const message = "Add a chapter title and content, then save it before starting another chapter.";
      setMsg(message);
      showToast(message, "warning");
      return;
    }
    setAddingChapter(true);
    try {
      if (draftDirty || !active.id) {
        await saveDraft({ id: active.id, title, content, notes, chapter_number: active.chapter_number }, true);
      }
      const nextChapterNumber = Math.max(
        Number(active.chapter_number) || 0,
        ...chapters.map((chapter) => Number(chapter.chapter_number) || 0),
      ) + 1;
      const name = `Chapter ${nextChapterNumber}`;
      setChapters((items) => [...items, {
        id: null,
        title: name,
        content: "",
        notes: "",
        submission_status: "draft",
        chapter_number: nextChapterNumber,
      }]);
      setActiveId(null);
      draftRef.current = { id: null, title: name, content: "", notes: "" };
      setLastSaved("");
      setTitle(name);
      setContent("");
      setNotes("");
      setDraftDirty(false);
      setMsg("Chapter ready — it will be created when you save your writing.");
      showToast(`${name} is ready. It will be created when you save your writing.`, "success");
    } catch (e) {
      setMsg(String(e.message || e));
      showToast(String(e.message || e), "error");
    } finally {
      setAddingChapter(false);
    }
  }

  async function moveChapter(chapter, direction) {
    if (reordering || !chapter?.id) return;
    if (chapters.some((item) => !item.id)) {
      const message = "Save the current chapter before changing chapter order.";
      setMsg(message);
      showToast(message, "warning");
      return;
    }
    const currentIndex = chapters.findIndex((item) => String(item.id) === String(chapter.id));
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= chapters.length) return;
    if (draftDirty && active?.id) {
      try {
        await saveDraft({ id: active.id, title, content, notes });
      } catch (err) {
        const message = `Could not save the current chapter before reordering: ${err.message || "Please retry."}`;
        setMsg(message);
        showToast(message, "error");
        return;
      }
    }

    const ordered = [...chapters];
    const [moved] = ordered.splice(currentIndex, 1);
    ordered.splice(nextIndex, 0, moved);
    const chapterIds = ordered.map((item) => Number(item.id));
    if (chapterIds.some((id) => !Number.isInteger(id) || id <= 0)) {
      const message = "Could not reorder chapters because a chapter has an invalid ID.";
      setMsg(message);
      showToast(message, "error");
      return;
    }

    setReordering(true);
    setChapters(ordered);
    setMsg("Saving chapter order…");
    try {
      await reorderStoryChapters(storyId, chapterIds);
      await load(storyId, active?.id);
      setMsg("Chapter order saved");
      showToast("Chapter order saved.", "success");
    } catch (err) {
      try {
        await load(storyId, active?.id);
      } catch (reloadError) {
        setError(`Chapter order could not be saved, and the editor could not reload: ${reloadError.message || "Please refresh."}`);
      }
      setMsg(`Could not reorder chapters: ${err.message || "Please try again."}`);
      showToast(`Could not reorder chapters: ${err.message || "Please try again."}`, "error");
    } finally {
      setReordering(false);
    }
  }

  function wordCount(text) {
    return richTextToPlainText(text).trim().split(/\s+/).filter(Boolean).length;
  }

  function hasChapterText(text) {
    return Boolean(richTextToPlainText(text).trim());
  }

  function firstUnpublishedChapterNumber(chapterNumber = Number(active?.chapter_number || 1), chapterList = chapters) {
    const publishedStatuses = new Set(["published", "ongoing", "completed"]);
    for (let number = 1; number < chapterNumber; number += 1) {
      const previousChapter = chapterList.find((chapter) => Number(chapter.chapter_number) === number);
      const status = String(previousChapter?.submission_status || "draft").trim().toLowerCase();
      if (!previousChapter || !publishedStatuses.has(status)) return number;
    }
    return null;
  }

  async function saveActiveChapterAsDraft() {
    if (savingChapterDraft) return;
    if (!active) {
      const message = "Select a chapter before saving it as a draft.";
      setMsg(message);
      showToast(message, "warning");
      return;
    }
    if (!title.trim() || !hasChapterText(content)) {
      const message = "Add a chapter title and content before saving it as a draft.";
      setMsg(message);
      showToast(message, "warning");
      return;
    }

    setSavingChapterDraft(true);
    try {
      const savedChapterId = await saveDraft({
        id: active.id,
        title,
        content,
        notes,
        chapter_number: active.chapter_number,
        submission_status: "draft",
        scheduled_for: null,
      }, true, true);
      if (!savedChapterId) throw new Error("The selected chapter could not be saved as a draft.");
      await load(storyId, savedChapterId);
      setMsg("Selected chapter saved as a draft.");
      showToast("Selected chapter saved as a draft.", "success");
    } catch (err) {
      const message = `Could not save this chapter as a draft: ${err.message || "Please try again."}`;
      setMsg(message);
      showToast(message, "error");
    } finally {
      setSavingChapterDraft(false);
    }
  }

  async function submitChapter(mode) {
    setSubmitOpen(false);
    let returnToDesk = false;
    if (mode === "withdraw" && !window.confirm("Unpublish every chapter in this story? Readers will no longer be able to open them.")) {
      return;
    }
    try {
      if (mode === "one" && active) {
        const firstUnpublished = firstUnpublishedChapterNumber();
        if (firstUnpublished != null) {
          const validationMessage = `Publish Chapter ${firstUnpublished} before Chapter ${active.chapter_number}.`;
          setMsg(validationMessage);
          showToast(validationMessage, "warning");
          return;
        }
      }
      if (mode === "one" || mode === "all") {
        const storyTitleValue = String(story?.title || storyTitle || "").trim();
        const summary = String(story?.description || "").trim();
        const genre = String(story?.genre || story?.primary_genre || "").trim();
        const language = String(story?.language || "").trim();
        if (!storyTitleValue || !summary || !genre || !language) {
          const returnPath = encodeURIComponent(`/write/${storyId}`);
          requestEditorNavigation(`/write/new?story=${storyId}&returnTo=${returnPath}`);
          showToast("Complete the story title, summary, genre, and language before publishing.", "warning");
          return;
        }
      }
      if (mode === "one" && (!active || !title.trim() || !hasChapterText(content))) {
        const message = !active ? "Select a chapter" : !title.trim() ? "Add a chapter title before publishing." : "You can't publish an empty chapter.";
        setMsg(message);
        showToast(message, "warning");
        return;
      }
      if (mode === "one") {
        const words = wordCount(content);
        if (words > MAX_PUBLISH_WORDS) {
          const message = `Chapters must be ${MAX_PUBLISH_WORDS.toLocaleString()} words or fewer.`;
          setMsg(message);
          showToast(message, "warning");
          return;
        }
        if (words < MIN_PUBLISH_WORDS) {
          const message = `Minimum ${MIN_PUBLISH_WORDS} words required before publishing.`;
          setMsg(message);
          showToast(message, "warning");
          return;
        }
      }
      let targetChapterId = active?.id || null;
      if (draftDirty && active && title.trim() && hasChapterText(content)) {
        targetChapterId = await saveDraft({
          id: active.id,
          title,
          content,
          notes,
          chapter_number: active.chapter_number,
          submission_status: active.submission_status,
          scheduled_for: active.scheduled_for,
        });
      } else if (mode === "one" && active && !targetChapterId) {
        targetChapterId = await saveDraft({
          id: null,
          title,
          content,
          notes,
          chapter_number: active.chapter_number,
          submission_status: active.submission_status,
          scheduled_for: active.scheduled_for,
        });
      }
      if (mode === "one") {
        if (!targetChapterId) {
          const message = "Select a chapter";
          setMsg(message);
          showToast(message, "warning");
          return;
        }
        if (!title.trim()) {
          const message = "Add a chapter title before publishing.";
          setMsg(message);
          showToast(message, "warning");
          return;
        }
        await updateChapter(targetChapterId, {
          story_id: Number(storyId),
          title: title.trim(),
          content: sanitizeRichTextHtml(content),
          chapter_number: Number(active.chapter_number || 1),
          notes,
          submission_status: "published",
          scheduled_for: null,
        });
        await updateStory(storyId, { status_text: "Ongoing" });
        setMsg("Chapter published");
        showToast("Chapter published.", "success");
        returnToDesk = true;
      } else if (mode === "all") {
        if (targetChapterId && (title.trim() || hasChapterText(content))) {
          await updateChapter(targetChapterId, { title, content: sanitizeRichTextHtml(content), notes });
        }
        const eligibleIds = chapters
          .filter((chapter) => {
            const status = String(chapter.submission_status || chapter.status_text || "").toLowerCase();
            if (isPublishedChapter(chapter) || status === "scheduled" || chapter.scheduled_for) return false;
            const body = String(chapter.id) === String(targetChapterId) ? content : chapter.content;
            const words = wordCount(body);
            return words >= MIN_PUBLISH_WORDS && words <= MAX_PUBLISH_WORDS;
          })
          .map((chapter) => Number(chapter.id))
          .filter((chapterId) => chapterId > 0);
        if (!eligibleIds.length) {
          const message = `No draft chapter meets the ${MIN_PUBLISH_WORDS}–${MAX_PUBLISH_WORDS.toLocaleString()} word publish limits.`;
          setMsg(message);
          showToast(message, "warning");
        } else {
          const result = await submitAllChapters(storyId, {
            chapter_ids: eligibleIds,
            min_words: MIN_PUBLISH_WORDS,
          });
          const resultMessage = result?.message || `${result?.submitted_count || 0} chapter(s) published.`;
          setMsg(resultMessage);
          showToast(resultMessage, Number(result?.submitted_count ?? eligibleIds.length) > 0 ? "success" : "warning");
        }
      } else if (mode === "withdraw") {
        const chaptersToUpdate = chapters
          .filter(isPublishedChapter)
          .sort((a, b) => Number(b.chapter_number || 0) - Number(a.chapter_number || 0));
        if (!chaptersToUpdate.length) {
          const message = "There are no published chapters to unpublish.";
          setMsg(message);
          showToast(message, "warning");
          return;
        }
        for (const chapter of chaptersToUpdate) {
          await updateChapter(chapter.id, { submission_status: "draft", scheduled_for: null });
        }
        await updateStory(storyId, { status_text: "Draft" });
        setStory((current) => current ? { ...current, status_text: "Draft" } : current);
        setMsg("All chapters withdrawn to draft");
        showToast("All chapters unpublished.", "success");
      }
      await load(storyId);
      if (returnToDesk) navigate("/manage-stories");
    } catch (e) {
      setMsg(String(e.message || e));
      showToast(String(e.message || e), "error");
    }
  }

  async function unpublishActiveChapter() {
    if (!active?.id || deletingStory) return;
    const live = chapters
      .filter(isPublishedChapter)
      .sort((a, b) => Number(b.chapter_number || 0) - Number(a.chapter_number || 0));
    const latest = live[0];
    if (latest && String(latest.id) !== String(active.id)) {
      setMsg(`Please unpublish the latest chapter (Chapter ${latest.chapter_number}) first.`);
      showToast(`Unpublish the latest chapter (Chapter ${latest.chapter_number}) first.`, "warning");
      return;
    }
    if (!window.confirm("This chapter will be hidden from readers and moved to Draft.")) return;
    try {
      await updateChapter(active.id, { submission_status: "draft" });
      await load(storyId, active.id);
      setMsg("Chapter unpublished");
      showToast("Chapter unpublished.", "success");
    } catch (err) {
      setMsg(`Could not unpublish chapter: ${err.message || "Please try again."}`);
      showToast(`Could not unpublish chapter: ${err.message || "Please try again."}`, "error");
    }
  }

  function localDateTimeValue(date) {
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function isPublishedChapter(c) {
    const st = String(c.submission_status || c.status_text || "").toLowerCase();
    return ["published", "ongoing", "submitted", "completed"].includes(st);
  }

  async function scheduleActiveChapter(event) {
    event.preventDefault();
    if (!active || !title.trim() || !hasChapterText(content)) {
      const message = "Add a chapter title and content before scheduling.";
      setMsg(message);
      showToast(message, "warning");
      return;
    }
    if (!scheduleDate || new Date(scheduleDate).getTime() <= Date.now()) {
      const message = "Choose a future date and time.";
      setMsg(message);
      showToast(message, "warning");
      return;
    }
    setScheduling(true);
    try {
      const latest = await getWriteStory(storyId);
      if (latest?.chaptersError) throw latest.chaptersError;
      const chapterNumber = Number(active.chapter_number || 1);
      const firstUnpublished = firstUnpublishedChapterNumber(chapterNumber, Array.isArray(latest?.chapters) ? latest.chapters : []);
      if (firstUnpublished != null) {
        const validationMessage = `Publish Chapter ${firstUnpublished} before Chapter ${chapterNumber}.`;
        setMsg(validationMessage);
        showToast(validationMessage, "warning");
        return;
      }
      const scheduledFor = `${scheduleDate}:00`;
      const savedChapterId = await saveDraft({
        id: active.id,
        title,
        content,
        notes,
        chapter_number: chapterNumber,
        submission_status: "scheduled",
        scheduled_for: scheduledFor,
      }, true);
      if (!savedChapterId) throw new Error("The chapter was not saved, so it could not be scheduled.");
      const storyStatus = (latest?.chapters || []).some(isPublishedChapter) ? "Ongoing" : "Draft";
      await updateStory(storyId, { status_text: storyStatus });
      setStory((current) => current ? { ...current, status_text: storyStatus } : current);
      setScheduleOpen(false);
      setMsg("Chapter scheduled for publishing.");
      showToast("Chapter scheduled for publishing.", "success");
      await load(storyId, savedChapterId);
    } catch (err) {
      setMsg(`Could not schedule chapter: ${err.message || "Please try again."}`);
      showToast(`Could not schedule chapter: ${err.message || "Please try again."}`, "error");
    } finally {
      setScheduling(false);
    }
  }

  async function openRevisions() {
    if (!active?.id) {
      const message = "Save this chapter first to view revisions.";
      setMsg(message);
      showToast(message, "warning");
      return;
    }
    setLoadingRevisions(true);
    setRevisionsOpen(true);
    try {
      const response = await getStoryChapterRevisions(active.id);
      setRevisions(Array.isArray(response) ? response : response?.items || []);
    } catch (err) {
      const message = `Could not load revisions: ${err.message || "Please try again."}`;
      setMsg(message);
      showToast(message, "error");
      setRevisionsOpen(false);
    } finally {
      setLoadingRevisions(false);
    }
  }

  async function restoreRevision(revision) {
    if (!active?.id || restoringRevision) return;
    if (!window.confirm("Restore this earlier version? Your current chapter text will be replaced.")) return;
    setRestoringRevision(true);
    try {
      await restoreStoryChapterRevision(active.id, revision.id);
      await load(storyId, active.id);
      setRevisionsOpen(false);
      setMsg("Revision restored. Other chapters were not changed.");
      showToast("Chapter revision restored.", "success");
    } catch (err) {
      const message = `Could not restore revision: ${err.message || "Please try again."}`;
      setMsg(message);
      showToast(message, "error");
    } finally {
      setRestoringRevision(false);
    }
  }

  async function changeStoryStatus(status) {
    const summary = String(story?.description || story?.summary || "").trim();
    const genre = String(story?.genre || story?.primary_genre || "").trim();
    const language = String(story?.language || "").trim();
    if (!summary || !genre || !language) {
      const message = "Complete the story summary, genre, and language in Story details before changing its status.";
      setMsg(message);
      showToast(message, "warning");
      return;
    }
    const prompts = {
      Ongoing: "Readers will see this story. Continue?",
      Completed: "Mark as finished? Chapters stay available.",
    };
    if (!prompts[status] || !window.confirm(prompts[status])) return;
    try {
      await updateStory(storyId, { status_text: status });
      setStory((current) => current ? { ...current, status_text: status } : current);
      setMsg(`Status updated to ${status}`);
      showToast(`Story status updated to ${status}.`, "success");
    } catch (err) {
      const message = `Could not update status: ${err.message || "Please try again."}`;
      setMsg(message);
      showToast(message, "error");
    }
  }


  if (guest) {
    return (
      <>
        <nav className="writer-workspace-bar" aria-label="Writer access">
          <Link to="/" className="writer-workspace-back">← Wingsaga</Link>
          <span className="writer-workspace-status">Writing desk</span>
        </nav>
        <div className="container page">
          <div className="guest-lock">
            <h3>Sign in to write</h3>
            <Link className="btn btn-primary" to="/login" state={{ returnTo: `/write/${storyId}` }}>
              Sign in
            </Link>
          </div>
        </div>
      </>
    );
  }

  if (error) return <main className="container page writer-load-error" role="alert">
    <p>{error}</p>
    <button type="button" className="btn btn-primary" onClick={() => {
      setError("");
      load(storyId, search.get("chapter")).catch((err) => {
        const message = String(err.message || err);
        setError(message);
        showToast(message, "error");
      });
    }}>Try again</button>
  </main>;
  if (!story && storyId && storyId !== "new") {
    return <div className="container page">Loading editor…</div>;
  }

  const cover = resolveAssetUrl(story?.cover_path || "");
  const chapterStatus = (c) => {
    if (!c.id) return { label: "Not saved", cls: "warn" };
    const status = String(c.submission_status || c.status_text || "").toLowerCase();
    if (status === "scheduled" || c.scheduled_for) return { label: "Scheduled", cls: "scheduled" };
    if (isPublishedChapter(c)) return { label: "Published", cls: "ok" };
    return { label: "Draft", cls: "warn" };
  };

  return (
    <div className="editor-inkitt editor-chapter-mock">
      <div className="editor-app-top">
        <nav className="writer-workspace-bar" aria-label="Story editor">
          <button type="button" className="writer-workspace-back editor-mock-back" onClick={() => requestEditorNavigation("/manage-stories?tab=drafts")} aria-label="Back">←</button>
          <div className="writer-workspace-context">
            <span>Edit Chapter</span>
            <strong>{storyTitle || "Untitled Story"} · {title || "Chapter"}</strong>
          </div>
          <div className="editor-mock-header-actions">
            <button type="button" className="editor-mock-icon" onClick={addChapter} disabled={addingChapter} title="Add new chapter" aria-label="Add new chapter">＋</button>
            <button type="button" className="editor-mock-icon" onClick={saveChapter} disabled={saving} title="Save and continue" aria-label="Save and continue">✓</button>
            <div className="menu-wrap" ref={moreMenuRef}>
              <button type="button" className="editor-mock-icon" onClick={() => setMoreOptionsOpen((value) => !value)} aria-label="More options" aria-haspopup="menu" aria-expanded={moreOptionsOpen} aria-controls="chapter-more-menu">⋯</button>
              {moreOptionsOpen ? (
                <div id="chapter-more-menu" className="menu open editor-mock-menu" role="menu" aria-label="Chapter options">
                  <div className="editor-mock-menu-heading">
                    <span>CHAPTER WORKSPACE</span>
                    <strong>More options</strong>
                  </div>
                  <button type="button" className="menu-item" role="menuitem" onClick={() => { setMoreOptionsOpen(false); setScheduleDate(active?.scheduled_for ? localDateTimeValue(new Date(active.scheduled_for)) : localDateTimeValue(new Date(Date.now() + 60 * 60 * 1000))); setScheduleOpen(true); }}><span className="editor-menu-icon" aria-hidden="true">◷</span><span><strong>Schedule publishing</strong><small>Choose when readers can see it</small></span></button>
                  <button type="button" className="menu-item" role="menuitem" onClick={() => { setMoreOptionsOpen(false); openRevisions(); }}><span className="editor-menu-icon" aria-hidden="true">↺</span><span><strong>Chapter revisions</strong><small>Review or restore an earlier draft</small></span></button>
                  <button type="button" className="menu-item" role="menuitem" onClick={() => { setMoreOptionsOpen(false); requestEditorNavigation(`/write/new?story=${storyId}&returnTo=${encodeURIComponent(`/write/${storyId}`)}`); }}><span className="editor-menu-icon" aria-hidden="true">✎</span><span><strong>Story details</strong><small>Edit title, description, and tags</small></span></button>
                  <button type="button" className="menu-item" role="menuitem" onClick={() => { setMoreOptionsOpen(false); saveActiveChapterAsDraft(); }} disabled={savingChapterDraft || deletingStory || !active}><span className="editor-menu-icon" aria-hidden="true">▣</span><span><strong>{savingChapterDraft ? "Saving as draft…" : "Save selected chapter as draft"}</strong><small>Move only this chapter to drafts</small></span></button>
                  <div className="editor-mock-menu-divider" />
                  <button type="button" className="menu-item danger" role="menuitem" onClick={() => { setMoreOptionsOpen(false); removeChapter(); }} disabled={deletingStory || !active?.id}><span className="editor-menu-icon" aria-hidden="true">⌫</span><span><strong>{deletingStory ? "Deleting chapter…" : "Delete chapter"}</strong><small>This action cannot be undone</small></span></button>
                </div>
              ) : null}
            </div>
          </div>
        </nav>
        <div className="editor-mock-status-row">
          <div>
            <span className={`editor-mock-status-badge ${active && isPublishedChapter(active) ? "published" : active?.scheduled_for ? "scheduled" : "draft"}`}>
              <i /> {active && isPublishedChapter(active) ? "Published" : active?.scheduled_for ? "Scheduled" : "Draft"}
            </span>
            <span className="editor-mock-autosave">
              {saving ? "Saving…" : draftDirty ? "Unsaved changes" : lastSaved ? `Saved ${lastSaved}` : "Saved"}
            </span>
          </div>
          <button type="button" className={`editor-mock-schedule ${active?.scheduled_for ? "scheduled" : ""}`} onClick={() => { setScheduleDate(active?.scheduled_for ? localDateTimeValue(new Date(active.scheduled_for)) : localDateTimeValue(new Date(Date.now() + 60 * 60 * 1000))); setScheduleOpen(true); }}>
            ◷ {active?.scheduled_for ? new Date(active.scheduled_for).toLocaleString() : "Not scheduled"}
          </button>
        </div>
        <div className="editor-mock-toolbar" aria-label="Chapter editor toolbar">
          <div className="editor-mock-word-info">
            <span>Word count: <strong>{wordCount(content).toLocaleString()}</strong></span>
            <span>· goal</span>
            <span className="editor-mock-goal-input">60</span>
            <div className="editor-mock-goal"><i style={{ width: `${Math.min(100, wordCount(content) / 60 * 100)}%` }} /></div>
          </div>
          <div className="editor-mock-format-tools">
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyEditorFormat("bold")} title="Bold (Ctrl+B)" aria-label="Bold (Ctrl+B)"><strong>B</strong></button>
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyEditorFormat("italic")} title="Italic (Ctrl+I)" aria-label="Italic (Ctrl+I)"><em>I</em></button>
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyEditorFormat("underline")} title="Underline (Ctrl+U)" aria-label="Underline (Ctrl+U)"><u>U</u></button>
          </div>
          <div className="editor-mock-actions">
            <button type="button" className="editor-mock-save" onClick={saveChapter} disabled={saving}>Save Draft</button>
            <button
              type="button"
              className="editor-mock-publish"
              onClick={() => active && isPublishedChapter(active) ? unpublishActiveChapter() : submitChapter("one")}
              disabled={saving || deletingStory || scheduling}
              title={firstUnpublishedChapterNumber() != null ? `Publish Chapter ${firstUnpublishedChapterNumber()} first` : undefined}
            >
              {active && isPublishedChapter(active) ? "Unpublish ✓" : "Publish Chapter"}
            </button>
          </div>
        </div>
      </div>
      <div className="editor-grid">
        <aside className="editor-left">
          <div className="editor-left-links">
            <button type="button" className="linkish" onClick={() => requestEditorNavigation(`/write/new?story=${storyId}&returnTo=${encodeURIComponent(`/write/${storyId}`)}`)}>
              Story details
            </button>
            <button type="button" className="linkish" onClick={() => requestEditorNavigation(`/stories/${storyId}`)}>
              Preview
            </button>
          </div>
          <button type="button" className="btn editor-save" onClick={saveChapter} disabled={saving}>
            Save draft
          </button>
          <div className="submit-wrap">
            <button
              type="button"
              className="btn btn-primary submit-main"
              onClick={() => active && isPublishedChapter(active) ? unpublishActiveChapter() : submitChapter("one")}
              disabled={saving || deletingStory || scheduling}
              title={firstUnpublishedChapterNumber() != null ? `Publish Chapter ${firstUnpublishedChapterNumber()} first` : undefined}
            >
              {active && isPublishedChapter(active) ? "Unpublish chapter" : "Publish chapter"}
            </button>
            <button
              type="button"
              className="btn btn-primary submit-caret"
              onClick={() => setSubmitOpen((v) => !v)}
              aria-label="More chapter options"
              aria-expanded={submitOpen}
            >
              ⋯
            </button>
            {submitOpen && (
              <div className="submit-menu">
                <button type="button" onClick={() => { setSubmitOpen(false); setScheduleDate(active?.scheduled_for ? localDateTimeValue(new Date(active.scheduled_for)) : localDateTimeValue(new Date(Date.now() + 60 * 60 * 1000))); setScheduleOpen(true); }}>
                  Schedule publishing
                </button>
                <button type="button" onClick={() => { setSubmitOpen(false); openRevisions(); }}>
                  Revisions
                </button>
                {!active || !isPublishedChapter(active) ? <button type="button" onClick={() => { setSubmitOpen(false); removeChapter(); }} disabled={deletingStory || !active?.id}>{deletingStory ? "Deleting chapter…" : "Delete chapter"}</button> : null}
              </div>
            )}
          </div>
          {msg ? <p className="meta editor-msg">{msg}</p> : null}
        </aside>

        <main className="editor-center">
          <div className="editor-writing-intro">
            <span>YOUR WRITING STUDIO</span>
            <p>A calm space to shape the next chapter of your story.</p>
          </div>
          <div className="story-title-row">
            <span className="story-title-display">{storyTitle || "Untitled Story"}</span>
          </div>
          <div className="chapter-title-row">
            <input
              className="chapter-title-input"
              aria-label="Chapter title"
              value={title}
              maxLength={160}
              onChange={(event) => {
                setTitle(event.target.value);
                setDraftDirty(true);
              }}
              placeholder="Chapter title"
            />
            <button type="button" className="linkish" onClick={() => setNotesOpen(true)}>
              📝 Chapter notes
            </button>
          </div>
          <div className="editor-toolbar">
            <button type="button" title="Select text, then apply bold" onMouseDown={(e) => e.preventDefault()} onClick={() => applyEditorFormat("bold")}>
              B
            </button>
            <button type="button" title="Select text, then apply italic" onMouseDown={(e) => e.preventDefault()} onClick={() => applyEditorFormat("italic")}>
              <em>I</em>
            </button>
            <button type="button" title="Select text, then underline" onMouseDown={(e) => e.preventDefault()} onClick={() => applyEditorFormat("underline")}><u>U</u></button>
          </div>
          <div
            ref={editorSurfaceRef}
            className="editor-textarea"
            role="textbox"
            aria-label="Chapter text"
            aria-multiline="true"
            contentEditable
            suppressContentEditableWarning
            spellCheck
            data-placeholder="Start writing here…"
            onInput={syncEditorContent}
            onPaste={(event) => {
              event.preventDefault();
              const plainText = event.clipboardData.getData("text/plain");
              document.execCommand("insertText", false, plainText);
              syncEditorContent();
            }}
            onKeyDown={(event) => {
              if (!(event.ctrlKey || event.metaKey)) return;
              const shortcut = { b: "bold", i: "italic", u: "underline" }[event.key.toLowerCase()];
              if (!shortcut) return;
              event.preventDefault();
              applyEditorFormat(shortcut);
            }}
          />
          <div className="editor-draft-meta">
            <span>{wordCount(content).toLocaleString()} words</span>
            <span>{richTextToPlainText(content).length.toLocaleString()} characters</span>
            <span>{active && isPublishedChapter(active) ? "Published chapter" : "Private draft"}</span>
            <span>Publish range: {MIN_PUBLISH_WORDS}–{MAX_PUBLISH_WORDS.toLocaleString()} words</span>
          </div>
        </main>

        <aside className={`editor-right chapter-panel${chapterPanelOpen ? " open" : " collapsed"}`} aria-label="Story chapters and details">
          <section className="writer-cover-card chapter-cover-card" aria-labelledby="writer-cover-heading">
            <div className="writer-cover-card-heading">
              <div>
                <span>YOUR STORY</span>
                <h2 id="writer-cover-heading">Cover & details</h2>
              </div>
              <span className="writer-cover-state">{cover ? "COVER ADDED" : "DRAFT STORY"}</span>
            </div>
            <div className={`writer-cover-preview${cover ? " has-cover" : ""}`}>
              {cover ? <img src={cover} alt={`${storyTitle || "Story"} cover preview`} /> : (
                <div className="writer-cover-placeholder"><span aria-hidden="true">N</span><small>Add a cover when you are ready</small></div>
              )}
            </div>
            <strong className="writer-story-sidebar-title">{storyTitle || "Untitled Story"}</strong>
            <div className="writer-story-sidebar-facts">
              <span><small>Genre</small>{story?.genre || story?.primary_genre || "Not set"}</span>
              <span><small>Status</small>{story?.status_text || "Draft"}</span>
            </div>
            <div className="writer-story-sidebar-actions">
              <button type="button" className="cover-edit-btn" onClick={() => coverInputRef.current?.click()}>
                {cover ? "Change cover" : "Add cover"}
              </button>
              <button type="button" className="linkish" onClick={() => requestEditorNavigation(`/write/new?story=${storyId}`)}>Edit story details</button>
              {String(story?.status_text || "").toLowerCase().includes("complete")
                ? <button type="button" className="linkish" onClick={() => changeStoryStatus("Ongoing")}>Mark as ongoing</button>
                : Number(story?.published_chapter_count || chapters.filter(isPublishedChapter).length) > 0
                  ? <button type="button" className="linkish" onClick={() => changeStoryStatus("Completed")}>Mark as complete</button>
                  : null}
              {chapters.some(isPublishedChapter) ? <button type="button" className="linkish" onClick={() => submitChapter("withdraw")}>Unpublish all chapters</button> : null}
              {chapters.some((chapter) => chapter.id && !isPublishedChapter(chapter)) ? <button type="button" className="linkish" onClick={() => submitChapter("all")}>Publish all drafts</button> : null}
            </div>
            <input ref={coverInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/jpg" className="visually-hidden" onChange={onCoverFile} />
          </section>
          <div className="editor-parts-heading">
            <div>
              <h3 className="chapters-heading">Story chapters</h3>
              <span className="chapter-list-count">
                {chapters.filter((chapter) => chapter.id).length} saved chapters
                {chapters.some((chapter) => !chapter.id) ? " · current chapter is not saved yet" : ""}
              </span>
            </div>
            <button
              type="button"
              className="chapter-panel-toggle"
              onClick={() => setChapterPanelOpen((value) => !value)}
              aria-expanded={chapterPanelOpen}
              aria-label={chapterPanelOpen ? "Collapse chapter panel" : "Expand chapter panel"}
            >
              {chapterPanelOpen ? "‹" : "›"}
            </button>
          </div>
          <button type="button" className="btn create-ch-btn chapter-panel-new" onClick={addChapter} disabled={reordering || addingChapter}>
            {addingChapter ? "Adding…" : "+ New chapter"}
          </button>
          <p className="chapter-list-hint">Select a chapter to continue writing.</p>
          <ul className="editor-chapter-list">
            {chapters.map((c) => {
              const st = chapterStatus(c);
              const selected = String(c.id) === String(active?.id);
              return (
                <li key={c.id || `new-${c.chapter_number}`} className={selected ? "selected" : ""}>
                  <button type="button" className="ch-select" title={`Open ${c.title || `Chapter ${c.chapter_number || ""}`} in the writing area`} onClick={() => selectChapter(c)} disabled={!c.id}>
                    <strong>{c.title || "Chapter"}</strong>
                    <span className="meta">
                      Chapter {c.chapter_number != null ? c.chapter_number : ""}
                    </span>
                    <span className="meta chapter-list-word-count">
                      {wordCount(c.content || (String(c.id) === String(active?.id) ? content : "")).toLocaleString()} words
                    </span>
                    <span className={`ch-status ${st.cls}`}>{st.label}</span>
                  </button>
                  {c.id ? (
                    <div className="ch-actions">
                      <button
                        type="button"
                        aria-label={`Move ${c.title || "chapter"} up`}
                        title="Move chapter up"
                        className="chapter-order-button"
                        disabled={reordering || chapters.indexOf(c) === 0}
                        onClick={() => moveChapter(c, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${c.title || "chapter"} down`}
                        title="Move chapter down"
                        className="chapter-order-button"
                        disabled={reordering || chapters.indexOf(c) === chapters.length - 1}
                        onClick={() => moveChapter(c, 1)}
                      >
                        ↓
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
            {chapters.length === 0 ? (
              <li className="chapter-empty-state">
                No chapters yet. Add a chapter to start writing.
              </li>
            ) : null}
          </ul>
          <div className="create-chapter-box">
            <button type="button" className="btn create-ch-btn" onClick={addChapter} disabled={reordering || addingChapter}>
              {addingChapter ? "Adding…" : "+ Add chapter"}
            </button>
          </div>
        </aside>
      </div>

      {blocker.state === "blocked" ? (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) blocker.reset();
        }}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="leave-editor-title">
            <div className="modal-head">
              <h2 id="leave-editor-title">Leave the chapter editor?</h2>
            </div>
            <p className="meta">You have unsaved changes. Save them as a private draft, discard them, or keep editing.</p>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => blocker.reset()}>Keep editing</button>
              <button type="button" className="btn" onClick={discardAndLeave}>Discard</button>
              <button type="button" className="btn btn-primary" onClick={saveDraftAndLeave} disabled={saving}>Save as draft</button>
            </div>
          </section>
        </div>
      ) : null}

      {notesOpen && (
        <div className="modal-backdrop" onClick={() => setNotesOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Chapter notes</h2>
              <button type="button" className="auth-close" onClick={() => setNotesOpen(false)}>
                ×
              </button>
            </div>
            <div className="editor-toolbar" style={{ borderRadius: 6, marginBottom: 0 }}>
              <button type="button" title="Select text, then apply bold" onMouseDown={(e) => e.preventDefault()} onClick={() => applyInlineFormat("bold")}>B</button>
              <button type="button" title="Select text, then apply italic" onMouseDown={(e) => e.preventDefault()} onClick={() => applyInlineFormat("italic")}>
                <em>I</em>
              </button>
            </div>
            <textarea
              ref={notesTextareaRef}
              className="notes-area"
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setDraftDirty(true);
              }}
              rows={6}
            />
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setNotesOpen(false)}>
                Close
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={async () => {
                  if (active?.id) {
                    try {
                      await saveDraft({ id: active.id, title, content, notes }, true);
                    } catch (e) {
                      const message = `Save failed: ${e.message || "Could not save chapter notes."}`;
                      setMsg(message);
                      showToast(message, "error");
                      return;
                    }
                  }
                  showToast("Chapter notes saved.", "success");
                  setNotesOpen(false);
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {scheduleOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !scheduling) setScheduleOpen(false);
        }}>
          <form className="modal-card chapter-schedule-dialog" onSubmit={scheduleActiveChapter}>
            <div className="modal-head">
              <h2>Schedule this chapter</h2>
              <button type="button" className="auth-close" onClick={() => setScheduleOpen(false)} disabled={scheduling}>
                ×
              </button>
            </div>
            <p className="meta">Choose when “{title || active?.title || "this chapter"}” should be published. You can change the schedule from this chapter’s options.</p>
            <label className="form-label" htmlFor="chapter-scheduled-for">Publish date and time</label>
            <input
              id="chapter-scheduled-for"
              type="datetime-local"
              required
              min={localDateTimeValue(new Date())}
              value={scheduleDate}
              onChange={(event) => setScheduleDate(event.target.value)}
            />
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setScheduleOpen(false)} disabled={scheduling}>
                Close
              </button>
              <button type="submit" className="btn btn-primary" disabled={scheduling}>
                {scheduling ? "Saving schedule…" : "Schedule chapter"}
              </button>
            </div>
          </form>
        </div>
      )}

      {revisionsOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !restoringRevision) setRevisionsOpen(false);
        }}>
          <section className="modal-card revisions-dialog" role="dialog" aria-modal="true" aria-labelledby="chapter-revisions-title">
            <div className="modal-head">
              <h2 id="chapter-revisions-title">Chapter revisions</h2>
              <button type="button" className="auth-close" onClick={() => setRevisionsOpen(false)} disabled={restoringRevision}>×</button>
            </div>
            {loadingRevisions ? <p className="meta">Loading saved versions…</p> : null}
            {!loadingRevisions && !revisions.length ? <p className="meta">No earlier versions are available yet.</p> : null}
            {!loadingRevisions && revisions.length ? <ul className="revision-list">
              {revisions.map((revision) => (
                <li key={revision.id}>
                  <div><strong>{revision.title || "Untitled chapter"}</strong><small>{revision.created_at ? new Date(revision.created_at).toLocaleString() : "Previous version"}</small></div>
                  <button type="button" className="btn btn-secondary" onClick={() => restoreRevision(revision)} disabled={restoringRevision}>{restoringRevision ? "Restoring…" : "Restore"}</button>
                </li>
              ))}
            </ul> : null}
          </section>
        </div>
      )}

      {coverCropFile ? (
        <ImageAdjustModal
          file={coverCropFile}
          aspectRatio="2 / 3"
          title="Adjust story cover"
          onCancel={() => setCoverCropFile(null)}
          onSave={async (croppedFile) => {
            setCoverCropFile(null);
            await uploadAdjustedCover(croppedFile);
          }}
        />
      ) : null}

    </div>
  );
}
