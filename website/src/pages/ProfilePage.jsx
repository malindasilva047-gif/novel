import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { commentWallPost, deleteWallPost, getBootstrap, getLibrary, getMe, getMyReviews, getMyStories, getReadingLists, getToken, getUserActivity, getUserWall, likeWallPost, postUserWall, resolveAssetUrl, updateMe, uploadProfileImage } from "../api";
import { isGuestUser } from "../utils/guest";
import WallPostCard from "../components/WallPostCard";
import ImageAdjustModal from "../components/ImageAdjustModal";
import { showToast } from "../components/ToastViewport";
import { getLocalReadingEntries, mergeReadingEntries } from "../utils/readingProgress";
import "./ProfilePage.css";

const TABS = ["Stories", "About", "Wall", "Activity", "Reviews"];
const ACHIEVEMENT_FILTERS = [
  { id: "all", label: "All badges" },
  { id: "earned", label: "Earned" },
  { id: "progress", label: "In progress" },
];
const PROFILE_GENDERS = ["Female", "Male", "Non-binary", "Prefer not to say"];
const PROFILE_COUNTRIES = [
  "Sri Lanka",
  "India",
  "United States",
  "United Kingdom",
  "Canada",
  "Australia",
  "Singapore",
  "Malaysia",
  "United Arab Emirates",
  "Germany",
  "France",
  "Japan",
  "Other",
];
const WRITER_LEVELS = [
  { name: "New voice", min: 0, next: 1_000 },
  { name: "Storyteller", min: 1_000, next: 10_000 },
  { name: "Wordsmith", min: 10_000, next: 50_000 },
  { name: "Author", min: 50_000, next: 100_000 },
  { name: "Master storyteller", min: 100_000, next: 100_000 },
];

function normalizeItems(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  return [];
}

function handleProfileTabKey(event, tabs, activeTab, onChange) {
  const index = tabs.indexOf(activeTab);
  let nextIndex = index;
  if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
  else if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
  else if (event.key === "Home") nextIndex = 0;
  else if (event.key === "End") nextIndex = tabs.length - 1;
  else return;

  event.preventDefault();
  const tabElement = event.currentTarget.parentElement?.querySelectorAll('[role="tab"]')[nextIndex];
  tabElement?.focus();
  onChange(tabs[nextIndex]);
}

function formatProfileDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function safeExternalUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

const PROFILE_URL_FIELDS = {
  facebook_url: { label: "Facebook", domains: ["facebook.com", "fb.com", "fb.watch", "fb.me"] },
  youtube_url: { label: "YouTube", domains: ["youtube.com", "youtu.be", "youtube-nocookie.com"] },
  instagram_url: { label: "Instagram", domains: ["instagram.com"] },
  twitter_url: { label: "X/Twitter", domains: ["x.com", "twitter.com"] },
  website_url: { label: "Website" },
};

function validateProfileUrl(value, field) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const config = PROFILE_URL_FIELDS[field];
  if (!config) return "";
  let url;
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return `Invalid ${config.label} URL. Please enter a valid ${config.label} link.`;
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const isHttp = url.protocol === "http:" || url.protocol === "https:";
  const isValidHost = config.domains
    ? config.domains.some((domain) => host === domain || host.endsWith(`.${domain}`))
    : host.includes(".") && !host.startsWith(".") && !host.endsWith(".");
  if (!isHttp || url.username || url.password || !isValidHost) {
    return `Invalid ${config.label} URL. Please enter a valid ${config.label} ${field === "youtube_url" ? "channel, video, or profile link" : "link"}.`;
  }
  return "";
}

function birthdayToDisplay(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return /^\d{2}\/\d{2}\/\d{4}$/.test(raw) ? raw : "";
}

function parseBirthday(value) {
  const raw = String(value || "").trim();
  if (!raw) return { iso: "", error: "" };
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return { iso: "", error: "Enter your birthday in DD/MM/YYYY format." };
  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return { iso: "", error: "Enter a valid calendar date in DD/MM/YYYY format." };
  }
  if (date.getTime() > Date.now()) return { iso: "", error: "Birthday cannot be in the future." };
  const today = new Date();
  const age = today.getUTCFullYear() - year - (
    today.getUTCMonth() + 1 < month
    || (today.getUTCMonth() + 1 === month && today.getUTCDate() < day) ? 1 : 0
  );
  if (age < 16) return { iso: "", error: "Wingsaga accounts require users to be at least 16 years old." };
  return { iso: `${yearText}-${monthText}-${dayText}`, error: "" };
}

function SocialIcon({ platform }) {
  const paths = {
    Facebook: <path d="M13.2 21v-8h2.7l.4-3.1h-3.1v-2c0-.9.3-1.6 1.6-1.6h1.7V3.5c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.5-4 4.2v2.3H7.4V13h2.7v8z" />,
    Instagram: <><rect x="3.4" y="3.4" width="17.2" height="17.2" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.8" cy="6.5" r=".9" fill="currentColor" stroke="none" /></>,
    "X / Twitter": <path d="M18.8 3H22l-7 8 8.2 10H17l-4.9-6.1L6.8 21H3.5l7.5-8.6L3.2 3h6.4l4.4 5.7zm-1.1 16.2h1.8L8.7 4.7H6.8z" />,
    YouTube: <><rect x="2.5" y="5" width="19" height="14" rx="4" /><path d="m10 9 5 3-5 3z" fill="currentColor" stroke="none" /></>,
    Website: <><circle cx="12" cy="12" r="9" /><path d="M3.5 12h17M12 3c2.2 2.4 3.2 5.4 3.2 9s-1 6.6-3.2 9c-2.2-2.4-3.2-5.4-3.2-9S9.8 5.4 12 3z" /></>,
  };
  return (
    <svg className={`profile-social-icon profile-social-icon--${platform.toLowerCase().replace(/[^a-z]+/g, "-")}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths[platform]}
    </svg>
  );
}

function isCompletedEntry(entry) {
  const status = String(entry.reading_status || entry.status || "").toLowerCase();
  const total = Number(entry.chapters || entry.book?.chapters || entry.chapter_count || 0);
  return ["completed", "complete", "finished", "done", "history"].includes(status)
    || (total > 0 && Number(entry.chapters_read || 0) >= total);
}

function readingProgress(entry) {
  const book = entry.book || entry;
  const total = Math.max(0, Number(entry.chapters || book.chapters || entry.chapter_count || book.chapter_count || 0));
  const lastChapter = Math.max(1, Number(entry.last_chapter_number || 1));
  const read = Math.max(Number(entry.chapters_read || 0), lastChapter - 1);
  const hasStoredProgress = entry.reading_progress_percent !== null
    && entry.reading_progress_percent !== undefined
    && Number.isFinite(Number(entry.reading_progress_percent));
  const stored = Number(entry.reading_progress_percent);
  const percent = hasStoredProgress
    ? Math.max(0, Math.min(100, Math.round(stored)))
    : total > 0 ? Math.max(0, Math.min(100, Math.round((read / total) * 100))) : 0;
  return { book, total, read, lastChapter, percent };
}

function achievementProgress(achievement, chaptersRead) {
  const explicitTarget = Number(achievement.target_progress || achievement.target || 0);
  const explicitCurrent = Number(achievement.current_progress ?? achievement.current ?? NaN);
  const chapterGoal = String(achievement.subtitle || achievement.title || "").match(/read\s+(?:your\s+)?(?:first|(\d+))\s+chapters?/i);
  const target = explicitTarget > 0
    ? explicitTarget
    : chapterGoal ? Math.max(1, Number(chapterGoal[1] || 1)) : 0;
  const hasExplicitStatus = ["unlocked", "is_unlocked", "completed"].some((key) => typeof achievement[key] === "boolean");
  const explicitStatus = achievement.unlocked ?? achievement.is_unlocked ?? achievement.completed;
  const current = Number.isFinite(explicitCurrent)
    ? Math.max(0, explicitCurrent)
    : target > 0 ? Math.max(0, chaptersRead) : 0;
  const hasProgress = target > 0;
  const unlocked = hasExplicitStatus ? Boolean(explicitStatus) : hasProgress ? current >= target : null;
  return {
    current: hasProgress ? Math.min(current, target) : current,
    target,
    percent: hasProgress ? Math.max(0, Math.min(100, Math.round((current / target) * 100))) : 0,
    unlocked,
    hasProgress,
  };
}

export default function ProfilePage({ user, setupRequired = false, onProfileComplete }) {
  const guest = isGuestUser(user);
  const [me, setMe] = useState(user);
  const [stories, setStories] = useState([]);
  const [readingLists, setReadingLists] = useState([]);
  const [readingEntries, setReadingEntries] = useState([]);
  const [readingError, setReadingError] = useState("");
  const [achievementGroups, setAchievementGroups] = useState([]);
  const [wall, setWall] = useState([]);
  const [activity, setActivity] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState("");
  const [wallDraft, setWallDraft] = useState("");
  const [wallSaving, setWallSaving] = useState(false);
  const [wallBusy, setWallBusy] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(() => new URLSearchParams(window.location.search).get("tab") === "About" ? "About" : "Stories");
  const [achievementFilter, setAchievementFilter] = useState("all");
  const [editing, setEditing] = useState(setupRequired);
  const [saving, setSaving] = useState(false);
  const [imageBusy, setImageBusy] = useState("");
  const [photoFailed, setPhotoFailed] = useState(false);
  const [imageCrop, setImageCrop] = useState(null);
  const [urlErrors, setUrlErrors] = useState({});
  const [birthdayError, setBirthdayError] = useState("");
  const avatarInput = useRef(null);
  const coverInput = useRef(null);
  const profileHeadingRef = useRef(null);
  const birthdayPickerRef = useRef(null);
  const profileId = me?.id || me?.user_id || user?.id || user?.user_id;

  useEffect(() => {
    if (setupRequired) {
      setEditing(true);
      setTab("About");
    }
  }, [setupRequired]);

  useEffect(() => {
    let cancelled = false;
    if (guest) {
      setMe(user);
      setStories([]);
      setReadingLists([]);
      setReadingEntries([]);
      setReadingError("");
      setAchievementGroups([]);
      setLoading(false);
      return () => { cancelled = true; };
    }

    setLoading(true);
    setError("");
    const localEntries = getLocalReadingEntries(user?.user_id || user?.id);
    Promise.allSettled([getMe(), getMyStories(), getReadingLists(), getBootstrap(), getLibrary()])
      .then(([profileResult, storiesResult, listsResult, bootstrapResult, libraryResult]) => {
        if (cancelled) return;
        if (profileResult.status === "fulfilled") setMe(profileResult.value || user);
        else setError(`Profile details could not load: ${profileResult.reason?.message || "Please try again."}`);
        if (storiesResult.status === "fulfilled") setStories(normalizeItems(storiesResult.value));
        else setError((current) => [current, `Your stories could not load: ${storiesResult.reason?.message || "Please try again."}`].filter(Boolean).join(" "));
        if (listsResult.status === "fulfilled") setReadingLists(normalizeItems(listsResult.value));
        if (bootstrapResult.status === "fulfilled") setAchievementGroups(normalizeItems(bootstrapResult.value?.achievements));
        if (libraryResult.status === "fulfilled") {
          setReadingEntries(mergeReadingEntries(normalizeItems(libraryResult.value), localEntries));
          setReadingError("");
        } else {
          setReadingEntries(localEntries);
          setReadingError(localEntries.length
            ? "Online reading progress is unavailable. Showing progress saved on this device."
            : `Reading progress could not load: ${libraryResult.reason?.message || "Please try again."}`);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [guest, user]);

  useEffect(() => {
    if (guest || !profileId) return undefined;
    let active = true;
    async function refreshProfileActivity() {
      const [profileResult, storiesResult, listsResult, libraryResult] = await Promise.allSettled([
        getMe(),
        getMyStories(),
        getReadingLists(),
        getLibrary(),
      ]);
      if (!active) return;
      if (profileResult.status === "fulfilled") setMe(profileResult.value);
      if (storiesResult.status === "fulfilled") setStories(normalizeItems(storiesResult.value));
      if (listsResult.status === "fulfilled") setReadingLists(normalizeItems(listsResult.value));
      if (libraryResult.status === "fulfilled") {
        setReadingEntries(mergeReadingEntries(
          normalizeItems(libraryResult.value),
          getLocalReadingEntries(user?.user_id || user?.id),
        ));
        setReadingError("");
      } else {
        setReadingError(`Reading progress could not refresh: ${libraryResult.reason?.message || "Please try again."}`);
      }
      try {
        if (tab === "Wall") setWall(normalizeItems(await getUserWall(profileId)));
        else if (tab === "Reviews") setReviews(normalizeItems(await getMyReviews()));
        else if (tab === "Activity") setActivity(normalizeItems(await getUserActivity(profileId)));
      } catch {
        // Keep the last rendered activity visible when a refresh fails.
      }
    }
    window.addEventListener("novelhub:content-changed", refreshProfileActivity);
    return () => {
      active = false;
      window.removeEventListener("novelhub:content-changed", refreshProfileActivity);
    };
  }, [guest, profileId, tab, user?.id, user?.user_id]);

  const name = me?.display_name || me?.email || "Reader";
  const initial = name.trim().charAt(0).toUpperCase() || "R";
  const photo = resolveAssetUrl(me?.photo_url || me?.photoUrl || "");
  const cover = resolveAssetUrl(me?.cover_url || me?.coverUrl || "");
  const username = (me?.username || (me?.email ? me.email.split("@")[0] : "")).replace(/^@+/, "");
  const chaptersRead = Math.max(0, Number(me?.chapters_read ?? me?.chaptersRead ?? 0));
  const currentReads = useMemo(
    () => readingEntries.filter((entry) => !isCompletedEntry(entry)).slice(0, 6),
    [readingEntries],
  );
  const socialLinks = [
    ["Instagram", me?.instagram_url],
    ["X / Twitter", me?.twitter_url],
    ["Facebook", me?.facebook_url],
    ["YouTube", me?.youtube_url],
    ["Website", me?.website_url || me?.website],
  ].map(([label, value]) => ({ label, href: safeExternalUrl(value) })).filter((link) => link.href);
  const totalWords = stories.reduce((total, story) => {
    const count = Number(story.word_count ?? story.total_word_count ?? 0);
    return total + (Number.isFinite(count) ? count : 0);
  }, 0);
  const publishedStoryCount = stories.filter((story) => !/draft|private|unpublished|hidden/i.test(String(story.status_text || story.status || ""))).length;
  const draftStoryCount = stories.length - publishedStoryCount;
  const memberSince = formatProfileDate(me?.created_at || me?.joined_at || me?.join_date);
  const writerLevel = [...WRITER_LEVELS].reverse().find((level) => totalWords >= level.min) || WRITER_LEVELS[0];
  const writerLevelProgress = writerLevel.next > writerLevel.min
    ? Math.max(0, Math.min(100, Math.round(((totalWords - writerLevel.min) / (writerLevel.next - writerLevel.min)) * 100)))
    : 100;
  const nextWriterLevel = WRITER_LEVELS[WRITER_LEVELS.indexOf(writerLevel) + 1];
  const profileAchievements = useMemo(() => achievementGroups.flatMap((group, groupIndex) => (group.items || []).map((achievement, achievementIndex) => ({
    groupName: group.group_name,
    groupIndex,
    achievement,
    achievementIndex,
    progress: achievementProgress(achievement, chaptersRead),
  }))), [achievementGroups, chaptersRead]);
  const filteredProfileAchievements = profileAchievements.filter(({ progress }) => {
    if (achievementFilter === "earned") return progress.unlocked === true;
    if (achievementFilter === "progress") return progress.unlocked !== true;
    return true;
  });

  function handleProfileUrlChange(event) {
    const { name: field, value } = event.currentTarget;
    setUrlErrors((current) => ({ ...current, [field]: validateProfileUrl(value, field) }));
  }

  function handleBirthdayChange(event) {
    const value = event.currentTarget.value;
    const parsed = parseBirthday(value);
    setBirthdayError(parsed.error);
    if (birthdayPickerRef.current) birthdayPickerRef.current.value = parsed.iso;
  }

  function handleBirthdayPickerChange(event) {
    const value = event.currentTarget.value;
    const displayValue = value ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}` : "";
    const input = event.currentTarget.form?.elements.namedItem("birth_date");
    if (input instanceof HTMLInputElement) input.value = displayValue;
    setBirthdayError(parseBirthday(displayValue).error);
  }

  async function saveProfile(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const birthday = parseBirthday(form.get("birth_date"));
    setBirthdayError(birthday.error);
    const invalidUrls = Object.keys(PROFILE_URL_FIELDS)
      .map((field) => [field, validateProfileUrl(form.get(field), field)])
      .filter(([, message]) => message);
    setUrlErrors(Object.fromEntries(invalidUrls));
    if (invalidUrls.length) {
      showToast(`❌ ${invalidUrls[0][1]}`, "error");
      e.currentTarget.elements.namedItem(invalidUrls[0][0])?.focus();
      return;
    }
    if (birthday.error) {
      showToast(`❌ ${birthday.error}`, "error");
      e.currentTarget.elements.namedItem("birth_date")?.focus();
      return;
    }
    setSaving(true);
    try {
      const displayName = String(form.get("display_name") || "").trim();
      const country = String(form.get("country") || "").trim();
      if (setupRequired && (!displayName || !birthday.iso || !country)) {
        throw new Error("Display name, birthday, and country are required to complete your profile.");
      }
      const profilePayload = {
        display_name: displayName,
        username: String(form.get("username") || "").trim(),
        bio: String(form.get("bio") || "").trim(),
        gender: String(form.get("gender") || "").trim(),
        birth_date: birthday.iso,
        country,
        facebook_url: String(form.get("facebook_url") || "").trim(),
        youtube_url: String(form.get("youtube_url") || "").trim(),
        instagram_url: String(form.get("instagram_url") || "").trim(),
        twitter_url: String(form.get("twitter_url") || "").trim(),
        website_url: String(form.get("website_url") || "").trim(),
        ...(setupRequired ? { profile_complete: true } : {}),
      };
      const usernameChanged = profilePayload.username !== username;
      let usernameCooldownMessage = "";
      let saved;
      try {
        saved = await updateMe(profilePayload);
      } catch (err) {
        if (!usernameChanged || err.status !== 429) throw err;
        delete profilePayload.username;
        saved = await updateMe(profilePayload);
        usernameCooldownMessage = err.message || "Your username is still within its change cooldown.";
      }
      const updatedUser = await getMe();
      if (setupRequired && saved?.profile_complete !== true && updatedUser?.profile_complete !== true) {
        throw new Error("Your profile was saved, but setup could not be verified. Please try again.");
      }
      setMe(updatedUser);
      setEditing(false);
      if (setupRequired) onProfileComplete?.();
      showToast(
        usernameCooldownMessage
          ? `Profile saved; username unchanged. ${usernameCooldownMessage}`
          : setupRequired ? "Your profile is complete." : "Profile saved to your account.",
        usernameCooldownMessage ? "warning" : "success",
      );
    } catch (err) { showToast(err.message || "Could not save profile.", "error"); }
    finally { setSaving(false); }
  }
  async function saveProfileImage(field, file) {
    if (!file) return;
    setImageBusy(field);
    try {
      const uploaded = await uploadProfileImage(file);
      await updateMe({ [field]: uploaded?.path || uploaded?.url || "" });
      setMe(await getMe());
      showToast(field === "photo_url" ? "Profile photo updated." : "Profile cover updated.", "success");
    } catch (err) {
      showToast(err.message || "Could not upload this image.", "error");
    } finally {
      setImageBusy("");
      if (field === "photo_url" && avatarInput.current) avatarInput.current.value = "";
      if (field === "cover_url" && coverInput.current) coverInput.current.value = "";
    }
  }
  useEffect(() => {
    if (guest || !profileId || (tab !== "Wall" && tab !== "Activity" && tab !== "Reviews")) return undefined;
    let cancelled = false;
    setFeedLoading(true);
    setFeedError("");
    const loadFeed = tab === "Wall" ? getUserWall(profileId) : tab === "Reviews" ? getMyReviews() : getUserActivity(profileId);
    loadFeed.then((response) => {
      if (cancelled) return;
      const items = normalizeItems(response);
      if (tab === "Wall") setWall(items);
      else if (tab === "Reviews") setReviews(items);
      else setActivity(items);
    }).catch((err) => {
      if (!cancelled) setFeedError(err.message || `Could not load your ${tab.toLowerCase()}.`);
    }).finally(() => { if (!cancelled) setFeedLoading(false); });
    return () => { cancelled = true; };
  }, [guest, profileId, tab]);

  async function postToWall(event) {
    event.preventDefault();
    const body = wallDraft.trim();
    if (!body || !profileId || wallSaving) return;
    setWallSaving(true);
    setFeedError("");
    try {
      await postUserWall(profileId, body);
      setWallDraft("");
      const response = await getUserWall(profileId);
      setWall(normalizeItems(response));
    } catch (err) {
      setFeedError(err.message || "Could not post to your wall.");
    } finally {
      setWallSaving(false);
    }
  }
  async function likeProfileWallPost(post) {
    setWallBusy(post.id);
    setFeedError("");
    try {
      const result = await likeWallPost(post.id);
      setWall((current) => current.map((item) => item.id === post.id ? { ...item, likes: result?.likes ?? item.likes, liked: result?.liked === true } : item));
      return true;
    } catch (err) {
      setFeedError(err.message || "Could not update this like.");
      return false;
    } finally {
      setWallBusy(null);
    }
  }
  async function commentOnProfileWall(post, body) {
    setWallBusy(post.id);
    setFeedError("");
    try {
      await commentWallPost(post.id, body);
      const response = await getUserWall(profileId);
      setWall(normalizeItems(response));
      return true;
    } catch (err) {
      setFeedError(err.message || "Could not post this reply.");
      return false;
    } finally {
      setWallBusy(null);
    }
  }
  async function deleteProfileWallPost(post) {
    setWallBusy(post.id);
    setFeedError("");
    try {
      await deleteWallPost(post.id);
      setWall((current) => current.filter((item) => String(item.id) !== String(post.id)));
      showToast("Wall post deleted.", "success");
      return true;
    } catch (err) {
      setFeedError(err.message || "Could not delete this wall post.");
      return false;
    } finally {
      setWallBusy(null);
    }
  }
  if (guest) {
    return (
      <div className="container page profile-guest-page">
        <section className="guest-lock card-panel">
          <span className="eyebrow">YOUR READING SPACE</span>
          <h1>Your profile starts here</h1>
          <p className="meta">Sign in to see your reading activity, saved stories, and writing in one place.</p>
          <div className="profile-guest-actions">
            <Link className="btn btn-primary" to="/login">Sign in</Link>
            <Link className="btn btn-ghost" to="/">Explore stories</Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <div
        className={`profile-cover ${cover ? "has-image" : ""}`}
        style={cover ? { backgroundImage: `linear-gradient(90deg, rgba(15, 11, 24, .45), rgba(15, 11, 24, .1)), url("${cover.replace(/["\\\n\r]/g, "")}")` } : undefined}
      >
        <div className="profile-cover-glow" />
        {editing ? <>
          <input ref={coverInput} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) setImageCrop({ field: "cover_url", file }); event.target.value = ""; }} />
          <button type="button" className="profile-image-edit profile-cover-edit" onClick={() => coverInput.current?.click()} disabled={imageBusy === "cover_url"}>{imageBusy === "cover_url" ? "Uploading…" : "Change cover"}</button>
        </> : null}
      </div>

      <div className="container profile-layout">
        {error ? <div className="error-banner" role="alert">{error}</div> : null}

        <section className="profile-heading card-panel" ref={profileHeadingRef}>
          <div className="profile-avatar-frame">
            {photo && !photoFailed ? <img className="profile-avatar-lg" src={photo} alt={`${name}'s profile`} onError={() => setPhotoFailed(true)} /> : (
              <div className="profile-avatar-lg profile-avatar-fallback" aria-hidden="true">{initial}</div>
            )}
            {editing ? <>
              <input ref={avatarInput} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) setImageCrop({ field: "photo_url", file }); event.target.value = ""; }} />
              <button type="button" className="profile-image-edit profile-avatar-edit" onClick={() => avatarInput.current?.click()} disabled={imageBusy === "photo_url"}>{imageBusy === "photo_url" ? "…" : "Change photo"}</button>
            </> : null}
          </div>
          <div className="profile-heading-copy">
            <div className="profile-heading-overview">
              <div className="profile-heading-identity">
                <div className="profile-identity-badges">
                  <span className="eyebrow">{me?.is_author || publishedStoryCount ? "WINGSAGA AUTHOR" : "YOUR WINGSAGA PROFILE"}</span>
                  {me?.is_author || publishedStoryCount ? <span className="profile-author-badge"><span aria-hidden="true">✦</span> Author</span> : null}
                  {me?.is_verified === true || me?.verified === true ? <span className="profile-verified-badge" aria-label="Verified author">✓ Verified</span> : null}
                </div>
                <h1>{name}</h1>
                {username ? <p className="profile-handle">@{username}</p> : null}
                {me?.email ? <p className="profile-email">{me.email}</p> : null}
                <p className="profile-bio-text">{me?.bio?.trim() || "Your story is still being written. Add a little about yourself to your profile."}</p>
                <div className="profile-identity-meta">
                  {me?.country ? <span><span aria-hidden="true">⌖</span>{me.country}</span> : null}
                  {memberSince ? <span><span aria-hidden="true">◷</span>On Wingsaga since {memberSince}</span> : null}
                  {publishedStoryCount ? <span><span aria-hidden="true">▣</span>{publishedStoryCount} published {publishedStoryCount === 1 ? "story" : "stories"}</span> : null}
                  {draftStoryCount ? <span><span aria-hidden="true">✎</span>{draftStoryCount} {draftStoryCount === 1 ? "draft" : "drafts"}</span> : null}
                </div>
              </div>
              <aside className="profile-heading-aside" aria-label="Profile statistics and actions">
                <div className="profile-metric-chips" aria-label="Profile metrics">
                  <span><strong>{Number(me?.followers ?? me?.follower_count ?? 0).toLocaleString()}</strong> Followers</span>
                  <span><strong>{Number(me?.following ?? me?.following_count ?? 0).toLocaleString()}</strong> Following</span>
                  <span><strong>{chaptersRead.toLocaleString()}</strong> Chapters read</span>
                </div>
                {setupRequired ? (
                  <div className="profile-setup-notice" role="status">
                    <strong>Finish setting up your profile</strong>
                    <span>Add your name, birthday, and country to complete your account.</span>
                  </div>
                ) : (
                  <div className="profile-actions-bar">
                    <button type="button" className="btn btn-ghost" onClick={() => setEditing((value) => !value)}>{editing ? "Cancel edit" : "Edit profile"}</button>
                    <Link className="btn btn-primary" to="/manage-stories">Manage stories</Link>
                  </div>
                )}
              </aside>
            </div>
            {editing ? <form className="profile-edit-form" onSubmit={saveProfile}>
              <label>Display name<input name="display_name" defaultValue={me?.display_name || ""} maxLength={80} required /></label>
              <label>Username<input name="username" defaultValue={username} maxLength={40} pattern="[A-Za-z0-9_.]+" required /></label>
              <label>About you<textarea name="bio" defaultValue={me?.bio || ""} rows={3} maxLength={500} /></label>
              <label>Gender
                <select name="gender" defaultValue={me?.gender || ""}>
                  <option value="">Select gender</option>
                  {me?.gender && !PROFILE_GENDERS.includes(me.gender) ? <option value={me.gender}>{me.gender}</option> : null}
                  {PROFILE_GENDERS.map((gender) => <option key={gender} value={gender}>{gender}</option>)}
                </select>
              </label>
              <label className="profile-birthday-field">Birthday
                <span className="profile-birthday-inputs">
                  <input
                    name="birth_date"
                    type="text"
                    inputMode="numeric"
                    autoComplete="bday"
                    placeholder="DD/MM/YYYY"
                    defaultValue={birthdayToDisplay(me?.birth_date)}
                    aria-invalid={Boolean(birthdayError)}
                    aria-describedby={birthdayError ? "profile-birthday-error" : undefined}
                    onChange={handleBirthdayChange}
                    required={setupRequired}
                  />
                  <input
                    ref={birthdayPickerRef}
                    className="profile-birthday-picker"
                    type="date"
                    aria-label="Choose birthday from calendar"
                    defaultValue={/^\d{4}-\d{2}-\d{2}$/.test(me?.birth_date || "") ? me.birth_date : ""}
                    onChange={handleBirthdayPickerChange}
                  />
                </span>
                {birthdayError ? <small id="profile-birthday-error" className="profile-field-error" role="alert">{birthdayError}</small> : null}
              </label>
              <label>Country
                <select name="country" defaultValue={me?.country || ""} required={setupRequired}>
                  <option value="">Select country</option>
                  {me?.country && !PROFILE_COUNTRIES.includes(me.country) ? <option value={me.country}>{me.country}</option> : null}
                  {PROFILE_COUNTRIES.map((country) => <option key={country} value={country}>{country}</option>)}
                </select>
              </label>
              {[
                ["facebook_url", "Facebook profile", me?.facebook_url, "facebook.com/…"],
                ["youtube_url", "YouTube profile", me?.youtube_url, "youtube.com/…"],
                ["instagram_url", "Instagram profile", me?.instagram_url, "instagram.com/…"],
                ["twitter_url", "X / Twitter profile", me?.twitter_url, "x.com/…"],
                ["website_url", "Website", me?.website_url || me?.website, "yourwebsite.com"],
              ].map(([field, label, value, placeholder]) => (
                <label key={field}>{label}
                  <input
                    name={field}
                    type="text"
                    inputMode="url"
                    autoComplete="url"
                    defaultValue={value || ""}
                    maxLength={255}
                    placeholder={placeholder}
                    aria-invalid={Boolean(urlErrors[field])}
                    aria-describedby={urlErrors[field] ? `profile-url-error-${field}` : undefined}
                    onChange={handleProfileUrlChange}
                  />
                  {urlErrors[field] ? <small id={`profile-url-error-${field}`} className="profile-field-error" role="alert">{urlErrors[field]}</small> : null}
                </label>
              ))}
              <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "Saving…" : setupRequired ? "Complete profile" : "Save profile"}</button>
            </form> : null}
          </div>
        </section>

        {!setupRequired ? <div className="profile-tabs" role="tablist" aria-label="Profile sections" onKeyDown={(event) => handleProfileTabKey(event, TABS, tab, setTab)}>
          {TABS.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              id={`profile-tab-${item.toLowerCase()}`}
              aria-controls={`profile-panel-${item.toLowerCase()}`}
              tabIndex={tab === item ? 0 : -1}
              aria-selected={tab === item}
              className={`profile-tab ${tab === item ? "active" : ""}`}
              onClick={() => setTab(item)}
            >
              {item}
            </button>
          ))}
        </div> : null}

        {!setupRequired && tab === "Reading" ? (
          <div className="profile-tabpanel profile-about-panel" id="profile-panel-reading" role="tabpanel" aria-labelledby="profile-tab-reading" tabIndex={0}>
            <section className="profile-current-reading-section">
              <div className="profile-section-heading">
                <div><span className="eyebrow">PICK UP WHERE YOU LEFT OFF</span><h2>Continue reading</h2></div>
                <Link to="/library">Open library <span aria-hidden="true">→</span></Link>
              </div>
              {readingError ? <p className="profile-reading-error" role="status">{readingError}</p> : null}
              {currentReads.length ? (
                <div className="profile-current-reading-grid">
                  {currentReads.map((entry) => {
                    const { book, total, read, lastChapter, percent } = readingProgress(entry);
                    const bookId = entry.book_id || book.id || entry.id;
                    const image = resolveAssetUrl(book.cover_path || book.coverPath || entry.cover_path || "");
                    const chapterLabel = total > 0
                      ? `Chapter ${Math.min(lastChapter, total)} of ${total}`
                      : `${read.toLocaleString()} chapters read`;
                    return (
                      <Link className="profile-current-reading-card" to={bookId ? `/stories/${bookId}` : "/library"} key={entry.id || bookId}>
                        <span className="profile-current-reading-cover">
                          {image ? <img src={image} alt="" loading="lazy" /> : <span aria-hidden="true">{(book.title || "W").slice(0, 1)}</span>}
                        </span>
                        <span className="profile-current-reading-copy">
                          <strong>{book.title || entry.title || "Untitled story"}</strong>
                          <small>{book.author_name || book.author || "Wingsaga author"}</small>
                          <span className="profile-reading-progress-label">{chapterLabel}</span>
                          <span className="profile-reading-progress-track" aria-label={`${percent}% read`}><span style={{ width: `${percent}%` }} /></span>
                          <small className="profile-reading-progress-caption">{percent}% complete</small>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              ) : loading ? (
                <div className="profile-current-reading-grid profile-current-reading-skeletons" aria-label="Loading reading progress" aria-live="polite">
                  {[0, 1, 2].map((item) => <div className="profile-current-reading-skeleton" key={item}><span /><div><i /><i /><i /></div></div>)}
                </div>
              ) : (
                <div className="profile-section-empty">
                  <span aria-hidden="true">▤</span>
                  <p>Your in-progress stories will appear here as you read.</p>
                  <Link to="/">Find a story</Link>
                </div>
              )}
            </section>

            <section className="profile-reading-lists-section">
              <div className="profile-section-heading"><div><span className="eyebrow">YOUR COLLECTIONS</span><h2>Reading lists</h2></div><Link to="/library">Manage lists</Link></div>
              {readingLists.length ? (
                <div className="profile-reading-list-grid">
                  {readingLists.slice(0, 6).map((list) => {
                    const firstCover = Array.isArray(list.covers) ? list.covers[0] : "";
                    const coverPath = list.cover_path || (typeof firstCover === "string" ? firstCover : firstCover?.cover_path || firstCover?.coverPath || "");
                    const image = resolveAssetUrl(coverPath);
                    return <Link className="profile-reading-list" to="/library" key={list.id || list.name}>
                      <span className="profile-reading-list-cover">{image ? <img src={image} alt="" loading="lazy" /> : <span aria-hidden="true">{(list.name || "L").slice(0, 1).toUpperCase()}</span>}<span className="profile-reading-list-cover-overlay" aria-hidden="true">COLLECTION</span></span>
                      <span className="profile-reading-list-copy"><strong>{list.name}</strong><small>{Number(list.story_count || 0)} {Number(list.story_count || 0) === 1 ? "story" : "stories"}</small><span>View collection <span aria-hidden="true">→</span></span></span>
                    </Link>;
                  })}
                </div>
              ) : <div className="profile-section-empty"><span aria-hidden="true">▧</span><p>Create reading lists to keep your next reads together.</p><Link to="/library">Create a list</Link></div>}
            </section>

            <section className="profile-achievements-section">
              <div className="profile-section-heading"><div><span className="eyebrow">SMALL STEPS, BIG STORIES</span><h2>Achievements &amp; milestones</h2></div></div>
              {!loading && (totalWords > 0 || stories.length > 0) ? (
                <div className="profile-level-progress profile-writing-progress">
                  <span className="profile-level-icon" aria-hidden="true">✎</span>
                  <span><strong>{writerLevel.name} · Writing level</strong><small>{totalWords.toLocaleString()} words across your stories</small></span>
                  <span className="profile-level-track" aria-label={`${writerLevelProgress}% to next writing level`}><span style={{ width: `${writerLevelProgress}%` }} /></span>
                  <small className="profile-level-next">{nextWriterLevel ? `${(nextWriterLevel.min - totalWords).toLocaleString()} to ${nextWriterLevel.name}` : "Highest level reached"}</small>
                </div>
              ) : null}
              {achievementGroups.length ? (
                <div className="profile-achievement-tabs">
                  <div className="profile-achievement-tablist" role="tablist" aria-label="Filter achievements">
                    {ACHIEVEMENT_FILTERS.map((filter) => {
                      const count = filter.id === "all" ? profileAchievements.length : filter.id === "earned"
                        ? profileAchievements.filter(({ progress }) => progress.unlocked === true).length
                        : profileAchievements.filter(({ progress }) => progress.unlocked !== true).length;
                      return <button
                        key={filter.id}
                        type="button"
                        role="tab"
                        id={`profile-achievement-tab-${filter.id}`}
                        aria-selected={achievementFilter === filter.id}
                        aria-controls="profile-achievements-panel"
                        className={`profile-achievement-tab${achievementFilter === filter.id ? " is-active" : ""}`}
                        onClick={() => setAchievementFilter(filter.id)}
                      >{filter.label}<span>{count}</span></button>;
                    })}
                  </div>
                  <div id="profile-achievements-panel" className="profile-achievement-panel" role="tabpanel" aria-labelledby={`profile-achievement-tab-${achievementFilter}`} tabIndex={0}>
                    {filteredProfileAchievements.length ? (
                      <div className="profile-achievement-groups">
                        {achievementGroups.map((group, groupIndex) => {
                          const groupAchievements = filteredProfileAchievements.filter((item) => item.groupIndex === groupIndex);
                          if (!groupAchievements.length) return null;
                          return <section className="profile-achievement-group" key={`${group.group_name}-${groupIndex}`}>
                            <h3>{group.group_name}</h3>
                            <div className="profile-achievement-grid">
                              {groupAchievements.map(({ achievement, achievementIndex, progress }) => {
                                const stateClass = progress.unlocked === true ? "is-unlocked" : progress.unlocked === false ? "is-locked" : "is-untracked";
                                const badge = /^\d+\s*\/\s*\d+$/.test(String(achievement.badge_value || "")) ? "✦" : achievement.badge_value || "✦";
                                return <article className={`profile-achievement ${stateClass}`} key={`${group.group_name}-${groupIndex}-${achievement.id ?? achievement.title}-${achievementIndex}`}>
                                  <span className="profile-achievement-badge" aria-hidden="true">{badge}</span>
                                  <span><strong>{achievement.title}</strong><small>{achievement.subtitle}</small></span>
                                  {progress.hasProgress ? <span className="profile-achievement-progress">
                                    <span className="profile-achievement-track"><span style={{ width: `${progress.percent}%` }} /></span>
                                    <small>{progress.current}/{progress.target}</small>
                                  </span> : achievement.progress_label ? <em>{achievement.progress_label}</em> : null}
                                  {progress.unlocked === true ? <span className="profile-achievement-state">Earned</span> : progress.unlocked === false ? <span className="profile-achievement-state">In progress</span> : null}
                                </article>;
                              })}
                            </div>
                          </section>;
                        })}
                      </div>
                    ) : <p className="profile-achievement-filter-empty">No badges in this view yet.</p>}
                  </div>
                </div>
              ) : <p className="meta">Achievements will appear here as the catalog milestones become available.</p>}
            </section>

          </div>
        ) : !setupRequired && tab === "About" ? (
          <div className="profile-tabpanel profile-about-panel" id="profile-panel-about" role="tabpanel" aria-labelledby="profile-tab-about" tabIndex={0}>
            <section className="profile-about card-panel">
              <div className="profile-about-heading">
                <div><span className="eyebrow">A LITTLE INTRODUCTION</span><h2>About {name.split(" ")[0]}</h2></div>
                <button type="button" className="profile-about-edit" onClick={() => {
                  setEditing(true);
                  profileHeadingRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}>Edit profile</button>
              </div>
              <div className="profile-about-bio">
                <p>{me?.bio?.trim() || user?.bio?.trim() || "No bio yet. Add a few lines about yourself to make this profile your own."}</p>
              </div>
                            <dl className="profile-about-details profile-about-details--list">
                {[
                  ["Name", name],
                  ["Email", me?.email || user?.email],
                  ["Username", username ? `@${username}` : ""],
                  ["Gender", me?.gender],
                  ["Birthday", birthdayToDisplay(me?.birth_date)],
                  ["Location", me?.country || user?.country],
                  ["Published stories", String(publishedStoryCount)],
                  ["Drafts", String(draftStoryCount)],
                  ["Member since", memberSince],
                ].filter(([, value]) => value !== "" && value != null).map(([label, value]) => (
                  <div className="profile-about-row" key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="profile-about-social-block">
                <h3 className="profile-about-social-title">Social media</h3>
                {socialLinks.length ? (
                  <nav className="profile-social-links" aria-label="Social profiles">
                    {socialLinks.map((link) => {
                      const host = new URL(link.href).hostname.replace(/^www\./, "");
                      return (
                        <a href={link.href} key={link.label} target="_blank" rel="noopener noreferrer">
                          <span className="profile-social-icon-wrap"><SocialIcon platform={link.label} /></span>
                          <span className="profile-social-copy"><strong>{link.label}</strong><small>{host}</small></span>
                          <span className="profile-social-external" aria-hidden="true">↗</span>
                        </a>
                      );
                    })}
                  </nav>
                ) : (
                  <p className="profile-social-empty">Social links added to your profile will appear here.</p>
                )}
              </div>
            </section>
          </div>
        ) : !setupRequired && tab === "Stories" ? (
          <section className="profile-stories-section profile-tabpanel" id="profile-panel-stories" role="tabpanel" aria-labelledby="profile-tab-stories" tabIndex={0}>
            <div className="profile-section-heading">
              <div><span className="eyebrow">FROM YOUR DESK</span><h2>Your stories</h2></div>
              <Link className="btn btn-primary" to="/write">Create a story</Link>
            </div>
            {loading ? <div className="profile-story-skeleton-grid" role="status" aria-label="Loading your stories">{[0, 1, 2, 3].map((item) => <span className="profile-story-skeleton" key={item} />)}</div> : null}
            {!loading && stories.length === 0 ? (
              <div className="profile-empty card-panel">
                <div className="profile-empty-mark" aria-hidden="true">✦</div>
                <h3>A blank page can become anything.</h3>
                <p className="meta">Start a story and keep every chapter together in your writing space.</p>
                <Link className="btn btn-primary" to="/write">Start writing</Link>
              </div>
            ) : null}
            {!loading && stories.length ? <div className="profile-story-grid profile-story-grid--home-pack">
              {stories.map((story) => {
                const image = resolveAssetUrl(story.cover_path || story.coverPath || "");
                const status = story.status_text || story.status || "Draft";
                const updated = formatProfileDate(story.last_updated_at || story.updated_at);
                const chapterCount = Number(story.published_chapter_count || story.chapter_count || 0);
                const draftChapters = Number(story.draft_chapter_count || 0);
                const rating = Number(story.rating || 0);
                return (
                  <Link key={story.id} to={`/write/${story.id}`} className="profile-story-card" aria-label={`Manage ${story.title || "Untitled story"}, ${status}`}>
                    <span className="profile-story-cover-wrap">
                      {image ? <img src={image} alt="" loading="lazy" decoding="async" /> : (
                        <span className="profile-story-cover-fallback" aria-hidden="true">{(story.title || "N").charAt(0)}</span>
                      )}
                      <span className={`profile-story-status${/draft|private|unpublished|hidden/i.test(String(status)) ? " is-draft" : ""}`}>{status}</span>
                    </span>
                    <div className="psc-body">
                      <div className="psc-title">{story.title || "Untitled story"}</div>
                      <div className="profile-story-metrics">
                        <span>{chapterCount} {chapterCount === 1 ? "chapter" : "chapters"}</span>
                        {draftChapters ? <span>{draftChapters} {draftChapters === 1 ? "draft" : "drafts"}</span> : null}
                        {rating > 0 ? <span aria-label={`Rating ${rating.toFixed(1)} out of 5`}>★ {rating.toFixed(1)}</span> : null}
                      </div>
                      {updated ? <time dateTime={story.last_updated_at || story.updated_at}>Updated {updated}</time> : null}
                      <span className="profile-story-manage-link">Manage story <span aria-hidden="true">→</span></span>
                    </div>
                  </Link>
                );
              })}
            </div> : null}
          </section>
        ) : !setupRequired && tab === "Wall" ? (
          <section className="profile-feed-section profile-tabpanel" id="profile-panel-wall" role="tabpanel" aria-labelledby="profile-tab-wall" tabIndex={0}>
            <header className="profile-section-heading"><div><span className="eyebrow">YOUR COMMUNITY</span><h2>Profile wall</h2></div></header>
            <form className="profile-wall-compose card-panel" onSubmit={postToWall}>
              <label className="visually-hidden" htmlFor="profile-wall-message">Write a wall post</label>
              <textarea id="profile-wall-message" value={wallDraft} onChange={(event) => setWallDraft(event.target.value)} maxLength={1000} rows={3} placeholder="Share a note with your readers…" />
              <div><span className="meta">{wallDraft.length}/1000</span><button className="btn btn-primary btn-sm" type="submit" disabled={wallSaving || !wallDraft.trim()}>{wallSaving ? "Posting…" : "Post to wall"}</button></div>
            </form>
            {feedError ? <div className="error-banner" role="alert">{feedError}</div> : null}
            {feedLoading ? <div className="profile-wall-skeleton-grid" role="status" aria-label="Loading profile wall">{[0, 1, 2, 3].map((item) => <div className="profile-wall-skeleton" key={item}><span /><i /><i /><i /></div>)}</div> : null}
            {!feedLoading && !wall.length ? <div className="profile-empty card-panel"><h3>Your wall is ready</h3><p className="meta">Notes from you and your readers will appear here.</p></div> : null}
            {!feedLoading && wall.length ? <div className="profile-feed-list">{wall.map((item) => {
              const currentUserId = user?.id || user?.user_id;
              const canDelete = currentUserId != null && item.user_id != null && String(item.user_id) === String(currentUserId);
              return <WallPostCard key={item.id} post={item} canInteract={Boolean(getToken())} canDelete={canDelete} busy={wallBusy === item.id} onLike={likeProfileWallPost} onComment={commentOnProfileWall} onDelete={deleteProfileWallPost} />;
            })}</div> : null}
          </section>
        ) : !setupRequired && tab === "Reviews" ? (
          <section className="profile-reviews-section profile-tabpanel" id="profile-panel-reviews" role="tabpanel" aria-labelledby="profile-tab-reviews" tabIndex={0}>
            <header className="profile-section-heading"><div><span className="eyebrow">YOUR READER VOICE</span><h2>Reviews you wrote</h2></div></header>
            {feedError ? <div className="error-banner" role="alert">{feedError}</div> : null}
            {feedLoading ? <div className="profile-review-skeleton-grid" role="status" aria-label="Loading your reviews">{[0, 1, 2].map((item) => <div className="profile-review-skeleton" key={item}><span /><div><i /><i /><i /><i /></div></div>)}</div> : null}
            {!feedLoading && !reviews.length ? <div className="profile-empty card-panel"><h3>No reviews yet</h3><p className="meta">Open a story and leave a review to help other readers choose their next read.</p><Link className="btn btn-primary" to="/">Explore stories</Link></div> : null}
            {!feedLoading && reviews.length ? (
              <div className="profile-review-list">
                {reviews.map((review, index) => {
                  const book = review.book || {};
                  const bookId = review.book_id || book.id;
                  const title = review.book_title || book.title || "Story review";
                  const image = resolveAssetUrl(review.cover_path || book.cover_path || "");
                  const reviewerAvatar = resolveAssetUrl(review.reviewer_photo || me?.photo_url || "");
                  const readingEntry = readingEntries.find((entry) => String(entry.book_id || entry.book?.id || entry.id) === String(bookId));
                  const readingStatus = readingEntry ? (isCompletedEntry(readingEntry) ? "Completed" : "In progress") : "Reviewed";
                  const helpfulCount = Number(review.helpful_count || review.likes_count || review.likes || 0);
                  return (
                    <article className="profile-review-card card-panel" key={review.id || `review-${index}`}>
                      {bookId ? <Link to={`/stories/${bookId}`} className="profile-review-cover" aria-label={`Open ${title}`}>{image ? <img src={image} alt="" loading="lazy" /> : <span>{title.slice(0, 1)}</span>}</Link> : null}
                      <div className="profile-review-copy">
                        <div className="profile-review-meta">
                          <span className="profile-review-avatar">{reviewerAvatar ? <img src={reviewerAvatar} alt="" /> : initial}</span>
                          <span className="profile-review-reviewer">{review.reviewer_name || name}<small>Reader review</small></span>
                          <span className="profile-review-status">{readingStatus}</span>
                        </div>
                        <Link to={bookId ? `/stories/${bookId}` : "/"} className="profile-review-title">{title}</Link>
                        <span className="profile-review-rating" aria-label={`${review.rating || 0} out of 5 stars`}>
                          <span aria-hidden="true">{"★".repeat(Math.max(0, Math.min(5, Number(review.rating || 0))))}{"☆".repeat(5 - Math.max(0, Math.min(5, Number(review.rating || 0))))}</span>
                          {Number(review.rating || 0)}/5
                        </span>
                        <p>{review.comment || review.body || "No written review."}</p>
                        <div className="profile-review-footer">
                          <time dateTime={review.created_at || undefined}>{review.created_at ? new Date(review.created_at).toLocaleDateString() : ""}</time>
                          <span className="profile-review-helpful" aria-label={`${helpfulCount} helpful votes`}>♡ Helpful <strong>{helpfulCount}</strong></span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : null}
          </section>
        ) : !setupRequired ? (
          <section className="profile-feed-section profile-tabpanel" id="profile-panel-activity" role="tabpanel" aria-labelledby="profile-tab-activity" tabIndex={0}>
            <header className="profile-section-heading"><div><span className="eyebrow">YOUR READING JOURNEY</span><h2>Recent activity</h2></div></header>
            {feedError ? <div className="error-banner" role="alert">{feedError}</div> : null}
            {feedLoading ? <p className="meta">Loading your activity…</p> : null}
            {!feedLoading && !activity.length ? <div className="profile-empty card-panel"><h3>Your story journey starts here</h3><p className="meta">Reading, likes, and community activity will show here.</p></div> : null}
            <div className="profile-feed-list">{activity.map((item) => <Link className="profile-feed-card card-panel" key={item.id} to={item.book_id ? `/stories/${item.book_id}` : "/profile"}><div className="profile-feed-avatar">{item.cover_path ? <img src={resolveAssetUrl(item.cover_path)} alt="" /> : (item.type || "N").slice(0,1).toUpperCase()}</div><div><strong>{item.title || "Wingsaga activity"}</strong><time>{item.created_at ? new Date(item.created_at).toLocaleString() : ""}</time>{item.message ? <p>{item.message}</p> : null}</div></Link>)}</div>
          </section>
        ) : null}
      </div>
      {imageCrop ? (
        <ImageAdjustModal
          file={imageCrop.file}
          aspectRatio={imageCrop.field === "photo_url" ? "1 / 1" : "2.8 / 1"}
          shape={imageCrop.field === "photo_url" ? "circle" : "square"}
          title={imageCrop.field === "photo_url" ? "Adjust profile photo" : "Adjust profile cover"}
          onCancel={() => setImageCrop(null)}
          onSave={async (croppedFile) => {
            const { field } = imageCrop;
            setImageCrop(null);
            await saveProfileImage(field, croppedFile);
          }}
        />
      ) : null}
    </div>
  );
}
