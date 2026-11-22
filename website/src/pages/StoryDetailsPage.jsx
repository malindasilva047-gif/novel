import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useBlocker, useNavigate, useSearchParams } from "react-router-dom";
import { createStory, getGenres, getWriteStory, getWriterTagSuggestions, resolveAssetUrl, updateStory, uploadWriteImage } from "../api";
import { isGuestUser } from "../utils/guest";
import ImageAdjustModal from "../components/ImageAdjustModal";
import { showToast } from "../components/ToastViewport";
import { createDefaultCoverFile, optimizeCoverFile } from "../utils/coverImages";
import "./StoryDetailsPage.css";

const GENRES = [
  "Romance", "Fantasy", "Drama", "Horror", "Mystery", "Adventure", "Poetry",
  "Slice of Life", "Fanfiction", "Thriller", "Sci-Fi", "Young Adult", "Humor",
  "Paranormal", "Action", "Other",
];
const WARNINGS = ["Violence", "Strong Language", "Sexual Content", "Drug/Alcohol Use", "Death", "Other"];

function normalizeStoryLanguage(value) {
  const language = String(value || "").trim().toLowerCase();
  const languageCode = language.split(/[-_]/)[0];
  if (["en", "english"].includes(languageCode)) return "English";
  if (["si", "sinhala", "sinhalese"].includes(languageCode)) return "Sinhala";
  if (["ta", "tamil"].includes(languageCode)) return "Tamil";
  return "";
}

export default function StoryDetailsPage({ user }) {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const editingStoryId = search.get("story");
  const requestedReturnTo = search.get("returnTo");
  const allowedReturnTargets = [
    "/manage-stories",
    "/manage-stories?tab=drafts",
    "/manage-stories?tab=submitted",
    `/write/${editingStoryId}`,
  ];
  const returnTo = editingStoryId && allowedReturnTargets.includes(requestedReturnTo)
    ? requestedReturnTo
    : "/manage-stories?tab=drafts";
  const guest = isGuestUser(user);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [genre, setGenre] = useState("");
  const [genres, setGenres] = useState(GENRES);
  const [language, setLanguage] = useState("");
  const [audience, setAudience] = useState("All Ages");
  const [warnings, setWarnings] = useState([]);
  const [otherWarning, setOtherWarning] = useState("");
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState("");
  const [suggestedTags, setSuggestedTags] = useState([]);
  const [tagSuggestionsLoading, setTagSuggestionsLoading] = useState(false);
  const [tagLoadError, setTagLoadError] = useState("");
  const [coverFile, setCoverFile] = useState(null);
  const [coverDragActive, setCoverDragActive] = useState(false);
  const [cropFile, setCropFile] = useState(null);
  const [coverPath, setCoverPath] = useState("");
  const [savedStoryId, setSavedStoryId] = useState(editingStoryId || "");
  const [busy, setBusy] = useState(false);
  const [loadingStory, setLoadingStory] = useState(Boolean(editingStoryId));
  const [editingBaseline, setEditingBaseline] = useState(null);
  const [error, setError] = useState("");
  const allowNavigationRef = useRef(false);
  const coverInputRef = useRef(null);
  const authorName = user?.display_name || user?.username || user?.name || "Author";
  const storyFormSnapshot = JSON.stringify({
    title, summary, genre, language, audience, warnings, otherWarning, tags,
    tagInput, coverPath, coverFile: coverFile?.name || "", cropFile: cropFile?.name || "",
  });
  const formDirty = editingBaseline !== null
    ? storyFormSnapshot !== editingBaseline
    : Boolean(
    title.trim() ||
    summary.trim() ||
    tagInput.trim() ||
    genre !== "" ||
    language !== "" ||
    audience !== "All Ages" ||
    warnings.length ||
    otherWarning.trim() ||
    tags.length ||
    cropFile ||
    coverFile ||
    coverPath
  );
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      formDirty &&
      !allowNavigationRef.current &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
  );

  useEffect(() => {
    if (!formDirty) return undefined;
    const warnBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [formDirty]);

  useEffect(() => {
    let active = true;
    getGenres().then((response) => {
      const items = response?.items || response || [];
      if (active && Array.isArray(items)) {
        setGenres([...new Set([...GENRES, ...items.map((item) => typeof item === "string" ? item : item?.name || item?.genre || "").filter(Boolean)])]);
      }
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const query = tagInput.trim().replace(/^#/, "");
    let active = true;
    if (!query || tags.length >= 3) {
      setSuggestedTags([]);
      setTagSuggestionsLoading(false);
      setTagLoadError("");
      return () => { active = false; };
    }

    setSuggestedTags([]);
    setTagLoadError("");
    setTagSuggestionsLoading(true);
    const timeout = window.setTimeout(() => {
      getWriterTagSuggestions(query).then((response) => {
        if (!active) return;
        const items = response?.items || [];
        setSuggestedTags(Array.isArray(items)
          ? items.map((item) => typeof item === "string" ? item : item?.name || item?.tag || "").filter(Boolean)
          : []);
      }).catch((loadError) => {
        if (active) setTagLoadError(loadError.message || "Could not load hashtag suggestions. Please try again.");
      }).finally(() => {
        if (active) setTagSuggestionsLoading(false);
      });
    }, 200);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [tagInput, tags.length]);

  useEffect(() => {
    setSavedStoryId(editingStoryId || "");
    setEditingBaseline(null);
    if (!editingStoryId) {
      setLoadingStory(false);
      setTitle("");
      setSummary("");
      setGenre("");
      setLanguage("");
      setAudience("All Ages");
      setWarnings([]);
      setOtherWarning("");
      setTags([]);
      setTagInput("");
      setCoverFile(null);
      setCropFile(null);
      setCoverPath("");
      return undefined;
    }
    let active = true;
    setLoadingStory(true);
    setError("");
    getWriteStory(editingStoryId).then((response) => {
      if (!active) return;
      const story = response?.story || response;
      setTitle(String(story?.title || ""));
      setSummary(String(story?.description || ""));
      setGenre(String(story?.genre || story?.primary_genre || ""));
      setLanguage(normalizeStoryLanguage(story?.language) || "English");
      setAudience(String(story?.audience || "All Ages"));
      setCoverPath(String(story?.cover_path || ""));
      const warningValues = String(story?.content_warnings || "").split(",").map((value) => value.trim()).filter(Boolean);
      setWarnings(warningValues.filter((value) => WARNINGS.includes(value)));
      setOtherWarning(warningValues.filter((value) => !WARNINGS.includes(value)).join(", "));
      setTags(Array.isArray(story?.tags) ? story.tags.map(String).slice(0, 3) : []);
      setEditingBaseline(JSON.stringify({
        title: String(story?.title || ""),
        summary: String(story?.description || ""),
        genre: String(story?.genre || story?.primary_genre || ""),
        language: normalizeStoryLanguage(story?.language) || "English",
        audience: String(story?.audience || "All Ages"),
        warnings: warningValues.filter((value) => WARNINGS.includes(value)),
        otherWarning: warningValues.filter((value) => !WARNINGS.includes(value)).join(", "),
        tags: Array.isArray(story?.tags) ? story.tags.map(String).slice(0, 3) : [],
        tagInput: "",
        coverPath: String(story?.cover_path || ""),
        coverFile: "",
        cropFile: "",
      }));
    }).catch((err) => {
      if (active) setError(err.message || "Could not load story details.");
    }).finally(() => {
      if (active) setLoadingStory(false);
    });
    return () => { active = false; };
  }, [editingStoryId]);

  const coverPreview = useMemo(() => coverFile ? URL.createObjectURL(coverFile) : resolveAssetUrl(coverPath), [coverFile, coverPath]);
  const readinessItems = [
    title.trim(),
    summary.trim(),
    genre.trim(),
    language.trim(),
    (coverFile || coverPath.trim()) ? "cover" : "",
  ];
  const readinessDone = readinessItems.filter(Boolean).length;
  const readinessPercent = Math.round((readinessDone / readinessItems.length) * 100);
  const visibleSuggestedTags = useMemo(() => {
    const query = tagInput.trim().replace(/^#/, "").toLocaleLowerCase();
    if (!query) return [];
    return suggestedTags.filter((tag) =>
      !tags.some((selected) => selected.toLowerCase() === tag.toLowerCase())
      && tag.toLocaleLowerCase().startsWith(query),
    );
  }, [suggestedTags, tagInput, tags]);
  const canAddTag = suggestedTags.some((tag) =>
    tag.toLocaleLowerCase() === tagInput.trim().replace(/^#/, "").toLocaleLowerCase(),
  );
  useEffect(() => () => {
    if (coverFile && coverPreview.startsWith("blob:")) URL.revokeObjectURL(coverPreview);
  }, [coverFile, coverPreview]);

  function addTag(value = tagInput) {
    const next = value.trim().replace(/^#/, "");
    if (!next || tags.length >= 3 || tags.some((tag) => tag.toLowerCase() === next.toLowerCase())) return;
    const approvedTag = suggestedTags.find((tag) => tag.toLowerCase() === next.toLowerCase());
    if (!approvedTag) {
      showToast("Choose a hashtag from the admin list.", "warning");
      return;
    }
    setTags((current) => [...current, approvedTag]);
    setTagInput("");
  }

  function toggleWarning(warning) {
    setWarnings((current) => current.includes(warning)
      ? current.filter((item) => item !== warning)
      : [...current, warning]);
  }

  function chooseCover(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      const message = "Choose an image file for your story cover.";
      setError(message);
      showToast(message, "error");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      const message = "Cover images must be 5 MB or smaller.";
      setError(message);
      showToast(message, "error");
      return;
    }
    setError("");
    setCropFile(file);
  }

  async function submit(event, intent = "write") {
    event?.preventDefault();
    if (busy) return;
    if (!title.trim()) {
      const message = "Enter a story title to start your draft.";
      setError(message);
      showToast(message, "warning");
      return;
    }
    setBusy(true);
    setError("");
    try {
      let uploadedCover = coverPath;
      const authorName = user?.display_name || user?.username || user?.name || "Author";
      const coverToUpload = coverFile || (!uploadedCover ? await createDefaultCoverFile(title, authorName) : null);
      if (coverToUpload) {
        const optimizedCover = await optimizeCoverFile(coverToUpload);
        const upload = await uploadWriteImage(optimizedCover);
        uploadedCover = upload?.path || upload?.url || upload?.cover_path || upload?.filename || "";
        if (!uploadedCover) throw new Error("The cover upload did not return an image path.");
        if (!uploadedCover.startsWith("/") && !uploadedCover.startsWith("http")) uploadedCover = `/uploads/${uploadedCover}`;
      }
      if (!uploadedCover) throw new Error("A story cover could not be prepared. Please choose an image or retry.");
      const currentStoryId = savedStoryId || editingStoryId;
      const payload = {
        title: title.trim() || "Untitled Story",
        author: user?.display_name || user?.username || user?.name || "Author",
        description: summary.trim(),
        genre,
        cover_path: uploadedCover,
        ...(!currentStoryId ? { status_text: "Draft" } : {}),
        content_warnings: [...warnings.filter((warning) => warning !== "Other"), ...(warnings.includes("Other") && otherWarning.trim() ? [otherWarning.trim()] : warnings.includes("Other") ? ["Other"] : [])].join(", "),
        tags,
        language,
        audience,
      };
      const result = currentStoryId
        ? await updateStory(currentStoryId, payload)
        : await createStory(payload);
      const id = currentStoryId || result?.id || result?.story_id || result?.item?.id || result?.story?.id;
      if (!id) throw new Error("Your story was created, but the editor could not be opened. Find it in Manage Stories.");
      setSavedStoryId(String(id));
      setCoverPath(uploadedCover);
      setCoverFile(null);
      setEditingBaseline(JSON.stringify({
        title,
        summary,
        genre,
        language,
        audience,
        warnings,
        otherWarning,
        tags,
        tagInput,
        coverPath: uploadedCover,
        coverFile: "",
        cropFile: cropFile?.name || "",
      }));

      const wasBlocked = blocker.state === "blocked";
      if (intent === "draft") {
        showToast(editingStoryId ? "Story details saved." : "Draft saved.", "success");
        if (wasBlocked) {
          allowNavigationRef.current = true;
          blocker.proceed();
        }
        return;
      }
      allowNavigationRef.current = true;
      if (wasBlocked) blocker.proceed();
      else navigate(editingStoryId ? returnTo : `/write/${id}`);
    } catch (err) {
      const message = String(err.message || err);
      setError(message);
      showToast(message, "error");
    } finally {
      setBusy(false);
    }
  }

  if (guest) {
    return <main className="story-setup-page"><section className="story-setup-guest"><span className="eyebrow">WINGSAGA WRITER'S ROOM</span><h1>Start with your story details</h1><p>Sign in to create a story and keep your draft on your writing desk.</p><Link className="btn btn-primary" to="/login" state={{ returnTo: "/write/new" }}>Sign in to write</Link></section></main>;
  }

  return (
    <main className="story-setup-page">
      <div className="story-setup-topbar">
        <Link className="story-setup-back" to={editingStoryId ? returnTo : "/write"}>← <span>Writing desk</span></Link>
        <div className="story-setup-progress">
          <span className="story-setup-progress-label">Completion</span>
          <div
            className="story-setup-progress-track"
            role="progressbar"
            aria-label="Story setup completion"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={readinessPercent}
            title={`${readinessDone} of ${readinessItems.length} setup details are ready`}
          >
            <span style={{ width: `${readinessPercent}%` }} />
          </div>
          <strong>{readinessPercent}%</strong>
        </div>
        <div className="story-setup-top-actions">
          <Link className="btn btn-ghost" to={editingStoryId ? returnTo : "/write"}>Cancel</Link>
          <button className="btn btn-primary" type="submit" form="story-setup-form" disabled={busy || loadingStory}>
            {busy ? "Saving…" : editingStoryId ? "Save details" : "Save & Continue"}
          </button>
        </div>
      </div>

      <header className="story-setup-heading">
        <span className="eyebrow">{editingStoryId ? "STORY DETAILS" : "NEW STORY"}</span>
        <h1>{editingStoryId ? "Story details and settings" : "Create a new story"}</h1>
        <p>Fill in the details below to start your story. You can update them whenever it grows.</p>
      </header>

      {error || tagLoadError ? <div className="error-banner" role="alert">{error || tagLoadError}</div> : null}

      <form id="story-setup-form" className="story-setup-form" onSubmit={submit}>
        <aside className="story-setup-cover-card" aria-label="Story cover">
          <div className="story-setup-section-heading">
            <h2>Cover image <span>*</span></h2>
            <small>A cover is required. We can create one for you.</small>
          </div>
          <div
            className={`story-setup-cover${coverDragActive ? " is-dragging" : ""}`}
            role="button"
            tabIndex={0}
            aria-label="Choose a story cover image"
            onClick={() => coverInputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                coverInputRef.current?.click();
              }
            }}
            onDragEnter={(event) => { event.preventDefault(); setCoverDragActive(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setCoverDragActive(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setCoverDragActive(false);
              chooseCover(event.dataTransfer.files?.[0]);
            }}
          >
            {coverPreview ? (
              <img src={coverPreview} alt="Story cover preview" />
            ) : (
              <div className="story-cover-generated" aria-label={`Default cover preview for ${title || "your story"}`}>
                <span aria-hidden="true">W</span>
                <strong>{title || "Your story title"}</strong>
                <small>{user?.display_name || user?.username || user?.name || "Your author name"}</small>
              </div>
            )}
            {coverDragActive ? <span className="story-setup-cover-drop">Drop to add your cover</span> : null}
          </div>
          <input
            ref={coverInputRef}
            className="story-setup-file-input"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            aria-label="Upload cover image"
            onChange={(event) => {
              chooseCover(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <div className="story-setup-cover-actions">
            <button type="button" className="btn btn-ghost" onClick={() => coverInputRef.current?.click()}>
              {coverFile || coverPath ? "Replace cover" : "Upload cover"}
            </button>
            {coverFile || coverPath ? (
              <button type="button" className="story-setup-remove-cover" onClick={() => {
                setCoverFile(null);
                setCoverPath("");
              }}>Remove</button>
            ) : null}
          </div>
          <small className="story-setup-cover-hint">Recommended 800 × 1200 px · Max 5 MB · JPG, PNG, WebP, or GIF</small>
          <small className="story-setup-cover-hint">If you skip the upload, a Wingsaga cover will be generated from your title and author.</small>
        </aside>

        <div className="story-setup-fields">
          <section className="story-setup-section">
            <div className="story-setup-section-heading">
              <h2>Story details</h2>
              <small>Fields marked <span>*</span> are required</small>
            </div>
            <div className="story-setup-field">
              <label className="form-label" htmlFor="story-title">Title <span>*</span><small>{title.length}/100</small>
                <input id="story-title" required maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Give your story a title…" />
              </label>
            </div>
            <div className="story-setup-field">
              <label className="form-label" htmlFor="story-author">Author <span>*</span>
                <input id="story-author" required value={authorName} readOnly aria-readonly="true" />
              </label>
              <small className="story-setup-meta">Connected to your profile. You can edit your author name in your account settings.</small>
            </div>
            <div className="story-setup-field">
              <label className="form-label" htmlFor="story-summary">Story description <span>*</span><small>{summary.length}/500</small>
                <textarea id="story-summary" maxLength={500} rows={5} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="A brief summary that hooks the reader…" />
              </label>
              <small className="story-setup-meta">Shown on the story card and in search results. Complete it before publishing.</small>
            </div>
            <div className="story-setup-field-grid">
              <label className="form-label" htmlFor="story-genre">Genre
                <select id="story-genre" value={genre} onChange={(event) => setGenre(event.target.value)}>
                  <option value="">Select genre…</option>{genres.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label className="form-label" htmlFor="story-language">Language <span>*</span>
                <select id="story-language" required value={language} onChange={(event) => setLanguage(normalizeStoryLanguage(event.target.value))}>
                  <option value="">Select language…</option>
                  <option value="English">English</option><option value="Sinhala">Sinhala</option><option value="Tamil">Tamil</option>
                </select>
              </label>
              <label className="form-label" htmlFor="story-audience">Audience
                <select id="story-audience" value={audience} onChange={(event) => setAudience(event.target.value)}>
                  <option>All Ages</option><option>Teen (16+)</option><option>Mature (18+)</option>
                </select>
              </label>
            </div>
          </section>

          <section className="story-setup-section">
            <div className="story-setup-section-heading">
              <h2>Content warnings</h2>
              <small>Select all that apply</small>
            </div>
            <fieldset className="story-setup-fieldset">
              <legend className="story-setup-visually-hidden">Content warnings</legend>
              <div className="story-warning-options">{WARNINGS.map((warning) => (
                <label key={warning} className={warnings.includes(warning) ? "selected" : ""}>
                  <input type="checkbox" checked={warnings.includes(warning)} onChange={() => toggleWarning(warning)} />{warning}
                </label>
              ))}</div>
              {warnings.includes("Other") ? <label className="form-label story-other-warning" htmlFor="story-other-warning">Specify other warning
                <input id="story-other-warning" value={otherWarning} maxLength={120} onChange={(event) => setOtherWarning(event.target.value)} placeholder="For example, self-harm…" />
              </label> : null}
            </fieldset>
          </section>

          <section className="story-setup-section">
            <div className="story-setup-section-heading">
              <h2>Hashtags</h2>
              <small>Up to 3 hashtags</small>
            </div>
            <fieldset className="story-setup-fieldset">
              <legend className="story-setup-visually-hidden">Hashtags (up to 3)</legend>
              <div className="story-tag-entry">
                <input aria-label="Add a hashtag" value={tagInput} maxLength={30} onChange={(event) => setTagInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addTag(); } }} placeholder="Type a hashtag or choose a suggestion…" disabled={tags.length >= 3} />
                <button className="btn btn-ghost" type="button" onClick={() => addTag()} disabled={!canAddTag || tags.length >= 3}>Add tag</button>
              </div>
              <div className={`story-tag-counter${tags.length >= 3 ? " is-max" : ""}`} aria-live="polite">{tags.length}/3 selected</div>
              {tags.length ? <div className="story-tag-selected" aria-label="Selected hashtags">{tags.map((tag) => <button type="button" key={tag} aria-label={`Remove hashtag ${tag}`} onClick={() => setTags((current) => current.filter((item) => item !== tag))}>#{tag} <span aria-hidden="true">×</span></button>)}</div> : null}
              {!tagInput.trim() ? <div className="story-tag-counter" role="status">Start typing to find hashtags.</div> : null}
              {tagInput.trim() && tagSuggestionsLoading ? <div className="story-tag-counter" role="status">Searching hashtags…</div> : null}
              {visibleSuggestedTags.length && tags.length < 3 ? (
                <div className="story-tag-suggestions-wrap">
                  <span className="story-setup-suggestion-label">Suggested hashtags</span>
                  <div className="story-tag-suggestions" aria-label="Suggested tags">{visibleSuggestedTags.map((tag) => <button type="button" key={tag} onClick={() => addTag(tag)}>+ {tag}</button>)}</div>
                </div>
              ) : null}
              {tagInput.trim() && !tagSuggestionsLoading && !tagLoadError && !visibleSuggestedTags.length && tags.length < 3 ? <div className="story-tag-counter" role="status">No matching hashtags found.</div> : null}
            </fieldset>
          </section>
        </div>

        <footer className="story-setup-actions">
          <button className="btn btn-ghost" type="button" disabled={busy || loadingStory} onClick={() => submit(null, "draft")}>{busy ? "Saving…" : "Save Draft"}</button>
          <button className="btn btn-primary" type="submit" disabled={busy || loadingStory}>{busy ? "Saving…" : editingStoryId ? "Save details" : "Save & Continue"}</button>
        </footer>
      </form>
      {blocker.state === "blocked" ? (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) blocker.reset();
        }}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="leave-story-setup-title">
            <div className="modal-head">
              <h2 id="leave-story-setup-title">Leave story setup?</h2>
            </div>
            <p className="meta">Your story details have not been saved. Save them as a draft, discard your changes, or keep editing.</p>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => blocker.reset()}>Keep editing</button>
              <button type="button" className="btn" onClick={() => {
                allowNavigationRef.current = true;
                blocker.proceed();
              }}>Discard</button>
              <button type="button" className="btn btn-primary" onClick={() => submit(null, "draft")} disabled={busy}>
                {busy ? "Saving…" : "Save as Draft"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {cropFile ? (
        <ImageAdjustModal
          file={cropFile}
          aspectRatio="2 / 3"
          title="Adjust story cover"
          onCancel={() => setCropFile(null)}
          onSave={async (croppedFile) => { setCoverFile(croppedFile); setCropFile(null); }}
        />
      ) : null}
    </main>
  );
}
