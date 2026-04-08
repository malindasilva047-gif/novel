"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, apiUpload, clearSiteSettingsCache, readToken } from "@/lib/api";

const DEFAULT_SETTINGS = {
  site_name: "Bixbi",
  logo_url: "",
  dark_logo_url: "",
  light_logo_url: "",
  splash_image_url: "",
  contact_email: "support@bixbi.app",
  copyright_text: `Copyright ${new Date().getFullYear()} Bixbi. All rights reserved.`,
  primary_color: "#1278ff",
  secondary_color: "#35a0ff",
  sms_config: {
    provider: "Twilio",
    provider_secondary: "MSG 91",
    account_sid: "",
    auth_token: "",
    phone_number: "",
  },
  mail_setup: {
    mailer: "smtp",
    host: "",
    port: "587",
    encryption: "tls",
    username: "",
    password: "",
    from_address: "",
  },
  aws_media: {
    access_key: "",
    secret_access_key: "",
    bucket_name: "",
    bucket_url: "",
  },
  firebase: {
    credentials_file_url: "",
    info_text: "Open Firebase Console, create a service account key, and upload the JSON file URL here.",
  },
  payment: {
    active_provider: "razorpay",
    razorpay_enabled: false,
    stripe_public_key: "",
    stripe_secret_key: "",
    paypal_enabled: false,
  },
  login_config: {
    email_enabled: true,
    mobile_otp_enabled: true,
    facebook_enabled: false,
    google_enabled: true,
    apple_enabled: false,
  },
  purchase_code: {
    code: "",
    status: "active",
  },
};

const DEFAULT_PANEL_DATA = {
  dashboard: { summary: {}, recent_books: [] },
  analytics: {},
  users: [],
  reels: [],
  stories: [],
  user_reports: [],
  story_reports: [],
  chapter_reports: [],
  comment_reports: [],
  post_reports: [],
  reel_reports: [],
  country_users: [],
  hashtags: [],
  languages: [],
  genres: [],
  blocks: [],
  avatars: [],
  push_notifications: [],
  settings: DEFAULT_SETTINGS,
  cms_pages: [],
  debug: { last_activity: [], cache_keys: [], per_story_views: [] },
};

const DEFAULT_PROFILE_FORM = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  date_of_birth: "",
  gender: "male",
  country: "",
  preferred_language: "",
  profile_image: "",
};

const DEFAULT_PASSWORD_FORM = {
  current_password: "",
  new_password: "",
  confirm_password: "",
};

const DEFAULT_USER_FORM = {
  username: "",
  email: "",
  password: "",
  full_name: "",
  phone: "",
  country: "",
  preferred_language: "",
  gender: "male",
  profile_image: "",
  is_admin: false,
  is_banned: false,
};

const ADVANCED_SECTIONS = [
  { key: "reels", label: "Reels", icon: "🎬" },
  { key: "hashtags", label: "Hashtags", icon: "#" },
  { key: "languages", label: "Languages", icon: "🈯" },
  { key: "genres", label: "Genres", icon: "🏷️" },
  { key: "blocks", label: "Blocks", icon: "⛔" },
  { key: "avatars", label: "Avatars", icon: "🖼️" },
  { key: "story-reports", label: "Story Reports", icon: "📣" },
  { key: "chapter-reports", label: "Chapter Reports", icon: "📝" },
  { key: "comment-reports", label: "Comment Reports", icon: "💬" },
  { key: "profile", label: "Profile", icon: "👤" },
  { key: "cms", label: "CMS Pages", icon: "📄" },
  { key: "debug", label: "Admin Debug", icon: "🧪" },
  { key: "country-users", label: "Country Users", icon: "🌍" },
];

const SETTINGS_TABS = [
  { key: "general", label: "General Settings" },
  { key: "sms", label: "SMS Configuration" },
  { key: "mail", label: "Mail Setup" },
  { key: "aws", label: "AWS Media Storage" },
  { key: "firebase", label: "Firebase Setup" },
  { key: "payment", label: "Payment Method" },
  { key: "login", label: "Login Configuration" },
  { key: "purchase", label: "Purchase Code" },
];

function formatCount(value) {
  const count = Number(value || 0);
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return `${count}`;
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function formatRelativeDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHour < 24) return `${diffHour} hr ago`;
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString();
}

function splitFullName(value) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  return {
    first_name: parts[0] || "",
    last_name: parts.slice(1).join(" "),
  };
}

function buildFullName(firstName, lastName) {
  return `${String(firstName || "").trim()} ${String(lastName || "").trim()}`.trim();
}

function toProfileForm(user = {}) {
  const nameParts = splitFullName(user.full_name || user.name || user.username || "");
  return {
    ...DEFAULT_PROFILE_FORM,
    ...nameParts,
    email: user.email || "",
    phone: user.phone || user.mobile || "",
    date_of_birth: user.date_of_birth || "",
    gender: user.gender || "male",
    country: user.country || "",
    preferred_language: user.preferred_language || "",
    profile_image: user.profile_image || "",
  };
}

function toUserForm(user = {}) {
  return {
    ...DEFAULT_USER_FORM,
    username: user.username || "",
    email: user.email || "",
    full_name: user.full_name || user.name || "",
    phone: user.phone || user.mobile || "",
    country: user.country || "",
    preferred_language: user.preferred_language || "",
    gender: user.gender || "male",
    profile_image: user.profile_image || "",
    is_admin: Boolean(user.is_admin),
    is_banned: Boolean(user.is_banned),
  };
}

function DashboardCard({ label, value, tone = "primary" }) {
  const iconMap = {
    "Total Users": "👤",
    "Total Stories": "📚",
    "Total Reads": "👁",
    Revenue: "💰",
  };
  return (
    <article className={`admin-stat-card admin-tone-${tone}`}>
      <span className="admin-stat-icon-bg">{iconMap[label] || "•"}</span>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function StatusChip({ value }) {
  const toneMap = {
    active: "active",
    ok: "active",
    published: "published",
    resolved: "resolved",
    sent: "resolved",
    flagged: "open",
    spam: "inactive",
    inactive: "inactive",
    draft: "draft",
    open: "open",
    archived: "archived",
    deactive: "inactive",
    live: "active",
  };
  const label = String(value || "active").replace(/_/g, " ");
  const tone = toneMap[String(value || "").toLowerCase()] || "active";
  return <span className={`admin-status-chip ${tone}`}>{label}</span>;
}

function MiniAvatar({ image, text, square = false }) {
  return (
    <div className={square ? "admin-book-thumb" : "admin-avatar"}>
      {image ? <img src={image} alt={text} loading="eager" /> : String(text || "A").slice(0, 1).toUpperCase()}
    </div>
  );
}

function ActionIconButton({ label, onClick, danger = false }) {
  return (
    <button type="button" className={`admin-icon-btn ${danger ? "danger" : ""}`} onClick={onClick} title={label}>
      {label}
    </button>
  );
}

function SectionHeader({ title, breadcrumb, actions }) {
  return (
    <div className="admin-section-head">
      <div>
        <h2>{title}</h2>
        <p>{breadcrumb}</p>
      </div>
      {actions ? <div className="admin-section-actions">{actions}</div> : null}
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState("dashboard");
  const [settingsTab, setSettingsTab] = useState("general");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Loading admin panel...");
  const [me, setMe] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [panelData, setPanelData] = useState(DEFAULT_PANEL_DATA);
  const [settingsDraft, setSettingsDraft] = useState(DEFAULT_SETTINGS);
  const [hashtagName, setHashtagName] = useState("");
  const [languageForm, setLanguageForm] = useState({ name: "", country: "", status: "active", is_default: false });
  const [avatarForm, setAvatarForm] = useState({ name: "", gender: "female", image_url: "" });
  const [genreForm, setGenreForm] = useState({ name: "", icon_url: "", status: "active" });
  const [pushForm, setPushForm] = useState({ title: "", description: "" });
  const [cmsDraft, setCmsDraft] = useState({ slug: "", title: "", excerpt: "", content: "", is_published: true });
  const [selectedCmsSlug, setSelectedCmsSlug] = useState("");
  const [profileTab, setProfileTab] = useState("edit-profile");
  const [profileDraft, setProfileDraft] = useState(DEFAULT_PROFILE_FORM);
  const [passwordDraft, setPasswordDraft] = useState(DEFAULT_PASSWORD_FORM);
  const [userForm, setUserForm] = useState(DEFAULT_USER_FORM);
  const [editingUserId, setEditingUserId] = useState("");
  const [editingLanguageName, setEditingLanguageName] = useState("");
  const [editingAvatarId, setEditingAvatarId] = useState("");
  const [editingGenreName, setEditingGenreName] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [genreUploading, setGenreUploading] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [adminComments, setAdminComments] = useState([]);
  const [commentsFilter, setCommentsFilter] = useState("all");
  const [commentsLoading, setCommentsLoading] = useState(false);

  const deferredSearch = useDeferredValue(searchText.trim().toLowerCase());

  async function loadPanelData() {
    const token = readToken();
    if (!token) {
      router.replace("/admin/login");
      return;
    }

    const meData = await apiRequest("/users/me", { token });
    if (!(meData?.is_admin || meData?.role === "admin")) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      router.replace("/admin/login?reason=forbidden");
      return;
    }

    const data = await apiRequest("/admin/panel-data", { token });
    const mergedData = { ...DEFAULT_PANEL_DATA, ...data };
    const nextSettings = { ...DEFAULT_SETTINGS, ...(mergedData.settings || {}) };
    const firstCms = Array.isArray(mergedData.cms_pages) && mergedData.cms_pages.length > 0
      ? mergedData.cms_pages[0]
      : { slug: "about", title: "About Bixbi", excerpt: "", content: "", is_published: true };

    setMe(meData);
    setProfileDraft(toProfileForm(meData));
    setPanelData(mergedData);
    setSettingsDraft(nextSettings);
    setSelectedCmsSlug(firstCms.slug || "");
    setCmsDraft({
      slug: firstCms.slug || "",
      title: firstCms.title || "",
      excerpt: firstCms.excerpt || "",
      content: firstCms.content || "",
      is_published: firstCms.is_published !== false,
    });
    setMessage("Admin panel connected to live website data.");
  }

  useEffect(() => {
    loadPanelData()
      .catch((error) => {
        setMessage(error?.message || "Could not load admin panel.");
      })
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    const token = readToken();
    if (!token) return undefined;
    const timer = setInterval(() => {
      apiRequest("/admin/panel-data", { token })
        .then((data) => {
          setPanelData((prev) => ({ ...prev, ...data }));
        })
        .catch(() => {});
    }, 20000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (activeSection !== "comments") return;
    loadAdminComments().catch(() => {});
  }, [activeSection]);

  const filteredUsers = useMemo(() => {
    return (panelData.users || []).filter((item) => {
      if (!deferredSearch) return true;
      return `${item.username} ${item.name} ${item.email} ${item.mobile}`.toLowerCase().includes(deferredSearch);
    });
  }, [panelData.users, deferredSearch]);

  const filteredReels = useMemo(() => {
    return (panelData.reels || []).filter((item) => {
      if (!deferredSearch) return true;
      return `${item.title} ${item.author_name} ${item.username} ${item.email}`.toLowerCase().includes(deferredSearch);
    });
  }, [panelData.reels, deferredSearch]);

  const filteredStories = useMemo(() => {
    return (panelData.stories || []).filter((item) => {
      if (!deferredSearch) return true;
      return `${item.title} ${item.author_name} ${item.username} ${item.email}`.toLowerCase().includes(deferredSearch);
    });
  }, [panelData.stories, deferredSearch]);

  const filteredCountries = useMemo(() => {
    return (panelData.country_users || []).filter((item) => {
      if (!deferredSearch) return true;
      return String(item.country || "").toLowerCase().includes(deferredSearch);
    });
  }, [panelData.country_users, deferredSearch]);

  const filteredHashtags = useMemo(() => {
    return (panelData.hashtags || []).filter((item) => {
      if (!deferredSearch) return true;
      return String(item.name || "").toLowerCase().includes(deferredSearch);
    });
  }, [panelData.hashtags, deferredSearch]);

  const filteredLanguages = useMemo(() => {
    return (panelData.languages || []).filter((item) => {
      if (!deferredSearch) return true;
      return `${item.name} ${item.country}`.toLowerCase().includes(deferredSearch);
    });
  }, [panelData.languages, deferredSearch]);

  const filteredGenres = useMemo(() => {
    return (panelData.genres || []).filter((item) => {
      if (!deferredSearch) return true;
      return `${item.name} ${item.status}`.toLowerCase().includes(deferredSearch);
    });
  }, [panelData.genres, deferredSearch]);

  const filteredBlocks = useMemo(() => {
    return (panelData.blocks || []).filter((item) => {
      if (!deferredSearch) return true;
      return `${item.blocked_to?.name || ""} ${item.blocked_by?.name || ""}`.toLowerCase().includes(deferredSearch);
    });
  }, [panelData.blocks, deferredSearch]);

  const filteredAvatars = useMemo(() => {
    return (panelData.avatars || []).filter((item) => {
      if (!deferredSearch) return true;
      return `${item.name} ${item.gender}`.toLowerCase().includes(deferredSearch);
    });
  }, [panelData.avatars, deferredSearch]);

  const filteredPush = useMemo(() => {
    return (panelData.push_notifications || []).filter((item) => {
      if (!deferredSearch) return true;
      return `${item.title} ${item.description}`.toLowerCase().includes(deferredSearch);
    });
  }, [panelData.push_notifications, deferredSearch]);

  const filteredCmsPages = useMemo(() => {
    return (panelData.cms_pages || []).filter((item) => {
      if (!deferredSearch) return true;
      return `${item.slug} ${item.title} ${item.excerpt}`.toLowerCase().includes(deferredSearch);
    });
  }, [panelData.cms_pages, deferredSearch]);

  const chapterRows = useMemo(() => {
    const seen = new Set();
    return (panelData.chapter_reports || []).filter((item) => {
      const key = item.chapter?.id || item.id;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      if (!deferredSearch) return true;
      return `${item.chapter?.title || ""} ${item.story?.title || ""} ${item.reported_user?.name || ""}`
        .toLowerCase()
        .includes(deferredSearch);
    });
  }, [panelData.chapter_reports, deferredSearch]);

  const flaggedCommentIds = useMemo(() => {
    return new Set((panelData.comment_reports || []).map((item) => item.comment?.id).filter(Boolean));
  }, [panelData.comment_reports]);

  const filteredAdminComments = useMemo(() => {
    return adminComments.filter((item) => {
      const isSpam = /(https?:\/\/|www\.|spam|cheap|buy followers|telegram|porn|casino)/i.test(item.content || "");
      const isFlagged = flaggedCommentIds.has(item.id) || item.status === "hidden";

      if (commentsFilter === "flagged" && !isFlagged) return false;
      if (commentsFilter === "spam" && !isSpam) return false;

      if (!deferredSearch) return true;
      return `${item.content || ""} ${item.story_id || ""} ${item.user_id || ""}`.toLowerCase().includes(deferredSearch);
    });
  }, [adminComments, commentsFilter, deferredSearch, flaggedCommentIds]);

  async function performAction(task, onSuccess) {
    try {
      await task();
      if (onSuccess) {
        await onSuccess();
      }
    } catch (error) {
      setMessage(error?.message || "Action failed.");
    }
  }

  async function loadAdminComments(status = "all") {
    const token = readToken();
    if (!token) return;
    setCommentsLoading(true);
    try {
      const query = status === "all" ? "" : `?status=${encodeURIComponent(status)}`;
      const rows = await apiRequest(`/admin/comments${query}`, { token });
      setAdminComments(Array.isArray(rows) ? rows : []);
    } catch (error) {
      setMessage(error?.message || "Could not load comments.");
    } finally {
      setCommentsLoading(false);
    }
  }

  function getUserForComment(comment) {
    return (panelData.users || []).find((item) => item.id === comment.user_id || item._id === comment.user_id);
  }

  async function toggleCommentVisibility(comment) {
    const token = readToken();
    if (!token) return;
    await performAction(
      async () => {
        const route = comment.status === "hidden"
          ? `/admin/comments/${comment.id}/show`
          : `/admin/comments/${comment.id}/hide`;
        const response = await apiRequest(route, { method: "POST", token });
        setMessage(response.message || "Comment updated.");
      },
      async () => loadAdminComments(),
    );
  }

  async function removeComment(comment) {
    if (typeof window !== "undefined" && !window.confirm("Delete this comment permanently?")) {
      return;
    }
    const token = readToken();
    if (!token) return;
    await performAction(
      async () => {
        const response = await apiRequest(`/admin/comments/${comment.id}`, { method: "DELETE", token });
        setMessage(response.message || "Comment deleted.");
      },
      async () => loadAdminComments(),
    );
  }

  async function updateUserBan(user) {
    const token = readToken();
    if (!token) return;
    await performAction(
      async () => {
        const route = user.is_banned ? `/admin/users/${user.id}/unban` : `/admin/users/${user.id}/ban`;
        const response = await apiRequest(route, { method: "POST", token });
        setMessage(response.message || "User status updated.");
      },
      loadPanelData,
    );
  }

  async function updateStoryStatus(storyId, status) {
    const token = readToken();
    if (!token) return;
    await performAction(
      async () => {
        const response = await apiRequest(`/admin/stories/${storyId}/status`, {
          method: "PATCH",
          token,
          body: { status },
        });
        setMessage(response.message || "Story updated.");
      },
      loadPanelData,
    );
  }

  async function deleteStory(storyId) {
    if (typeof window !== "undefined" && !window.confirm("Delete this story and its related records?")) {
      return;
    }
    const token = readToken();
    if (!token) return;
    await performAction(
      async () => {
        const response = await apiRequest(`/admin/stories/${storyId}`, { method: "DELETE", token });
        setMessage(response.message || "Story deleted.");
      },
      loadPanelData,
    );
  }

  async function resolveReport(reportId) {
    const token = readToken();
    if (!token) return;
    await performAction(
      async () => {
        const response = await apiRequest(`/admin/reports/${reportId}/resolve`, { method: "POST", token });
        setMessage(response.message || "Report resolved.");
      },
      loadPanelData,
    );
  }

  async function createHashtag() {
    const token = readToken();
    if (!token || !hashtagName.trim()) return;
    await performAction(
      async () => {
        const response = await apiRequest("/admin/hashtags", {
          method: "POST",
          token,
          body: { name: hashtagName.trim() },
        });
        setHashtagName("");
        setMessage(response.message || "Hashtag saved.");
      },
      loadPanelData,
    );
  }

  async function removeHashtag(name) {
    const token = readToken();
    if (!token) return;
    await performAction(
      async () => {
        const response = await apiRequest(`/admin/hashtags/${encodeURIComponent(name)}`, { method: "DELETE", token });
        setMessage(response.message || "Hashtag deleted.");
      },
      loadPanelData,
    );
  }

  async function createLanguage() {
    const token = readToken();
    if (!token || !languageForm.name.trim()) return;
    const route = editingLanguageName ? `/admin/languages/${encodeURIComponent(editingLanguageName)}` : "/admin/languages";
    const method = editingLanguageName ? "PATCH" : "POST";
    const body = editingLanguageName
      ? { country: languageForm.country, status: languageForm.status, is_default: languageForm.is_default }
      : languageForm;
    await performAction(
      async () => {
        const response = await apiRequest(route, {
          method,
          token,
          body,
        });
        setEditingLanguageName("");
        setLanguageForm({ name: "", country: "", status: "active", is_default: false });
        setMessage(response.message || "Language saved.");
      },
      loadPanelData,
    );
  }

  function startLanguageEdit(item) {
    setEditingLanguageName(item.name);
    setLanguageForm({
      name: item.name || "",
      country: item.country || "",
      status: item.status || "active",
      is_default: Boolean(item.is_default),
    });
  }

  function resetLanguageEditor() {
    setEditingLanguageName("");
    setLanguageForm({ name: "", country: "", status: "active", is_default: false });
  }

  async function saveAvatar() {
    const token = readToken();
    if (!token || !avatarForm.name.trim() || !avatarForm.image_url.trim()) return;
    const route = editingAvatarId ? `/admin/avatars/${editingAvatarId}` : "/admin/avatars";
    const method = editingAvatarId ? "PATCH" : "POST";
    await performAction(
      async () => {
        const response = await apiRequest(route, {
          method,
          token,
          body: avatarForm,
        });
        setEditingAvatarId("");
        setAvatarForm({ name: "", gender: "female", image_url: "" });
        setMessage(response.message || "Avatar saved.");
      },
      loadPanelData,
    );
  }

  function startAvatarEdit(item) {
    setEditingAvatarId(item.id || "");
    setAvatarForm({
      name: item.name || "",
      gender: item.gender || "female",
      image_url: item.image_url || "",
    });
  }

  function resetAvatarEditor() {
    setEditingAvatarId("");
    setAvatarForm({ name: "", gender: "female", image_url: "" });
  }

  async function patchLanguage(name, changes) {
    const token = readToken();
    if (!token) return;
    await performAction(
      async () => {
        const response = await apiRequest(`/admin/languages/${encodeURIComponent(name)}`, {
          method: "PATCH",
          token,
          body: changes,
        });
        setMessage(response.message || "Language updated.");
      },
      loadPanelData,
    );
  }

  async function deleteLanguage(name) {
    const token = readToken();
    if (!token) return;
    await performAction(
      async () => {
        const response = await apiRequest(`/admin/languages/${encodeURIComponent(name)}`, { method: "DELETE", token });
        if (editingLanguageName === name) {
          resetLanguageEditor();
        }
        setMessage(response.message || "Language deleted.");
      },
      loadPanelData,
    );
  }

  async function saveGenre() {
    const token = readToken();
    if (!token || !genreForm.name.trim()) return;
    const route = editingGenreName ? `/admin/genres/${encodeURIComponent(editingGenreName)}` : "/admin/genres";
    const method = editingGenreName ? "PATCH" : "POST";
    const body = editingGenreName
      ? { icon_url: genreForm.icon_url, status: genreForm.status }
      : genreForm;
    await performAction(
      async () => {
        const response = await apiRequest(route, { method, token, body });
        setEditingGenreName("");
        setGenreForm({ name: "", icon_url: "", status: "active" });
        setMessage(response.message || "Genre saved.");
      },
      loadPanelData,
    );
  }

  function startGenreEdit(item) {
    setEditingGenreName(item.name || "");
    setGenreForm({
      name: item.name || "",
      icon_url: item.icon_url || "",
      status: item.status || "active",
    });
  }

  function resetGenreEditor() {
    setEditingGenreName("");
    setGenreForm({ name: "", icon_url: "", status: "active" });
  }

  async function deleteGenre(name) {
    const token = readToken();
    if (!token) return;
    await performAction(
      async () => {
        const response = await apiRequest(`/admin/genres/${encodeURIComponent(name)}`, { method: "DELETE", token });
        if (editingGenreName === name) {
          resetGenreEditor();
        }
        setMessage(response.message || "Genre deleted.");
      },
      loadPanelData,
    );
  }

  async function uploadAdminImage(file, target = "avatar") {
    const token = readToken();
    if (!token || !file) return;
    const setBusy = target === "genre" ? setGenreUploading : setAvatarUploading;
    setBusy(true);
    try {
      const uploaded = await apiUpload("/admin/uploads/image", { file, fieldName: "image", token });
      if (target === "genre") {
        setGenreForm((prev) => ({ ...prev, icon_url: uploaded.image_url || "" }));
      } else {
        setAvatarForm((prev) => ({ ...prev, image_url: uploaded.image_url || "" }));
      }
      setMessage("Image uploaded.");
    } catch (error) {
      setMessage(error?.message || "Image upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAvatar(avatarId) {
    const token = readToken();
    if (!token) return;
    await performAction(
      async () => {
        const response = await apiRequest(`/admin/avatars/${avatarId}`, { method: "DELETE", token });
        if (editingAvatarId === avatarId) {
          resetAvatarEditor();
        }
        setMessage(response.message || "Avatar deleted.");
      },
      loadPanelData,
    );
  }

  async function saveProfile() {
    const token = readToken();
    if (!token) return;
    await performAction(
      async () => {
        const response = await apiRequest("/users/me", {
          method: "PATCH",
          token,
          body: {
            full_name: buildFullName(profileDraft.first_name, profileDraft.last_name),
            profile_image: profileDraft.profile_image,
            phone: profileDraft.phone,
            date_of_birth: profileDraft.date_of_birth,
            gender: profileDraft.gender,
            country: profileDraft.country,
            preferred_language: profileDraft.preferred_language,
            bio: me?.bio || "Admin profile",
            location: me?.location || profileDraft.country || "Admin HQ",
            favorite_genres: Array.isArray(me?.favorite_genres) && me.favorite_genres.length > 0 ? me.favorite_genres : ["Administration"],
            reading_goal: me?.reading_goal || "Manage the platform",
            website: me?.website || "",
          },
        });
        setMessage(response.message || "Profile updated.");
      },
      loadPanelData,
    );
  }

  async function changePassword() {
    const token = readToken();
    if (!token) return;
    if (!passwordDraft.current_password || !passwordDraft.new_password || !passwordDraft.confirm_password) return;
    await performAction(
      async () => {
        const response = await apiRequest("/users/me/change-password", {
          method: "POST",
          token,
          body: passwordDraft,
        });
        setPasswordDraft(DEFAULT_PASSWORD_FORM);
        setMessage(response.message || "Password updated.");
      },
      loadPanelData,
    );
  }

  function resetUserEditor() {
    setEditingUserId("");
    setUserForm(DEFAULT_USER_FORM);
  }

  function startUserEdit(user) {
    setEditingUserId(user.id || "");
    setUserForm(toUserForm(user));
  }

  async function saveUser() {
    const token = readToken();
    if (!token || !userForm.username.trim() || !userForm.email.trim()) return;
    if (!editingUserId && !userForm.password.trim()) {
      setMessage("Password is required for new users.");
      return;
    }

    const body = {
      username: userForm.username.trim(),
      email: userForm.email.trim(),
      full_name: userForm.full_name.trim(),
      phone: userForm.phone.trim(),
      country: userForm.country.trim(),
      preferred_language: userForm.preferred_language.trim(),
      gender: userForm.gender,
      profile_image: userForm.profile_image.trim(),
      is_admin: userForm.is_admin,
      is_banned: userForm.is_banned,
    };
    if (userForm.password.trim()) {
      body.password = userForm.password.trim();
    }

    await performAction(
      async () => {
        const response = await apiRequest(editingUserId ? `/admin/users/${editingUserId}` : "/admin/users", {
          method: editingUserId ? "PATCH" : "POST",
          token,
          body,
        });
        resetUserEditor();
        setMessage(response.message || "User saved.");
      },
      loadPanelData,
    );
  }

  async function deleteUser(user) {
    if (typeof window !== "undefined" && !window.confirm(`Delete user ${user.username || user.email}? This removes related records.`)) {
      return;
    }
    const token = readToken();
    if (!token) return;
    await performAction(
      async () => {
        const response = await apiRequest(`/admin/users/${user.id}`, { method: "DELETE", token });
        if (editingUserId === user.id) {
          resetUserEditor();
        }
        setMessage(response.message || "User deleted.");
      },
      loadPanelData,
    );
  }

  async function sendPushNotification() {
    const token = readToken();
    if (!token || !pushForm.title.trim() || !pushForm.description.trim()) return;
    await performAction(
      async () => {
        const response = await apiRequest("/admin/push-notifications", {
          method: "POST",
          token,
          body: pushForm,
        });
        setPushForm({ title: "", description: "" });
        setMessage(`${response.message || "Push notification sent."} Recipients: ${response.recipient_count || 0}`);
      },
      loadPanelData,
    );
  }

  async function saveSettings() {
    const token = readToken();
    if (!token) return;
    await performAction(
      async () => {
        const response = await apiRequest("/admin/settings/full", {
          method: "PATCH",
          token,
          body: { settings: settingsDraft },
        });
        clearSiteSettingsCache();
        setSettingsDraft({ ...DEFAULT_SETTINGS, ...(response.settings || settingsDraft) });
        setMessage(response.message || "Settings updated.");
      },
      loadPanelData,
    );
  }

  async function saveCmsPage() {
    const token = readToken();
    if (!token || !cmsDraft.slug.trim() || !cmsDraft.title.trim() || !cmsDraft.content.trim()) return;
    const slug = cmsDraft.slug.trim();
    const isExisting = (panelData.cms_pages || []).some((item) => item.slug === slug);
    await performAction(
      async () => {
        const response = await apiRequest(isExisting ? `/admin/cms-pages/${encodeURIComponent(slug)}` : "/admin/cms-pages", {
          method: isExisting ? "PATCH" : "POST",
          token,
          body: cmsDraft,
        });
        setSelectedCmsSlug(slug);
        setMessage(response.message || "CMS page saved.");
      },
      loadPanelData,
    );
  }

  async function deleteCmsPage(slug) {
    if (typeof window !== "undefined" && !window.confirm("Delete this CMS page?")) {
      return;
    }
    const token = readToken();
    if (!token) return;
    await performAction(
      async () => {
        const response = await apiRequest(`/admin/cms-pages/${encodeURIComponent(slug)}`, { method: "DELETE", token });
        setSelectedCmsSlug("");
        setCmsDraft({ slug: "", title: "", excerpt: "", content: "", is_published: true });
        setMessage(response.message || "CMS page deleted.");
      },
      loadPanelData,
    );
  }

  function selectCmsPage(slug) {
    setSelectedCmsSlug(slug);
    const page = (panelData.cms_pages || []).find((item) => item.slug === slug);
    if (!page) return;
    setCmsDraft({
      slug: page.slug || slug,
      title: page.title || "",
      excerpt: page.excerpt || "",
      content: page.content || "",
      is_published: page.is_published !== false,
    });
  }

  function updateSettingsValue(path, value) {
    setSettingsDraft((prev) => {
      if (!path.includes(".")) {
        return { ...prev, [path]: value };
      }
      const [parent, child] = path.split(".");
      return {
        ...prev,
        [parent]: {
          ...(prev[parent] || {}),
          [child]: value,
        },
      };
    });
  }

  function resetCmsDraft() {
    setSelectedCmsSlug("");
    setCmsDraft({ slug: "", title: "", excerpt: "", content: "", is_published: true });
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.replace("/admin/login");
  }

  const reportSections = {
    "user-reports": { title: "User Report List", items: panelData.user_reports || [] },
    "story-reports": { title: "Story Report List", items: panelData.story_reports || panelData.post_reports || [] },
    "chapter-reports": { title: "Chapter Report List", items: panelData.chapter_reports || [] },
    "comment-reports": { title: "Comment Report List", items: panelData.comment_reports || [] },
    "post-reports": { title: "Story Report List", items: panelData.story_reports || panelData.post_reports || [] },
    "reel-reports": { title: "Reel Report List", items: panelData.reel_reports || [] },
  };

  if (loading) {
    return (
      <main className="admin-shell">
        <div className="admin-main admin-loading-state">Loading admin panel...</div>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <aside className={`admin-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="admin-brand-row admin-sidebar-logo">
          <div className="admin-logo-icon">NA</div>
          <div className="admin-brand-block">
            <div className="admin-brand-script">NovelAdmin</div>
            <div className="admin-brand-sub">Control Panel</div>
          </div>
          <button type="button" className="admin-sidebar-close" onClick={() => setSidebarOpen(false)}>✕</button>
        </div>

        <button type="button" className="admin-nav-search-pill" onClick={() => setSidebarOpen(false)}>
          Search users, stories...
        </button>

        <div className="admin-nav-group">
          <div className="admin-nav-title">Main</div>
          <button type="button" className={`admin-nav-item ${activeSection === "dashboard" ? "active" : ""}`} onClick={() => { setActiveSection("dashboard"); setSidebarOpen(false); }}>
            <span className="admin-nav-icon">🏠</span>
            Dashboard
          </button>
        </div>

        <div className="admin-nav-group">
          <div className="admin-nav-title">Content</div>
          <button type="button" className={`admin-nav-item ${activeSection === "users" ? "active" : ""}`} onClick={() => { setActiveSection("users"); setSidebarOpen(false); }}>
            <span className="admin-nav-icon">👤</span>
            Users
          </button>
          <button type="button" className={`admin-nav-item ${activeSection === "stories" ? "active" : ""}`} onClick={() => { setActiveSection("stories"); setSidebarOpen(false); }}>
            <span className="admin-nav-icon">📚</span>
            Stories
          </button>
          <button type="button" className={`admin-nav-item ${activeSection === "chapters" ? "active" : ""}`} onClick={() => { setActiveSection("chapters"); setSidebarOpen(false); }}>
            <span className="admin-nav-icon">📄</span>
            Chapters
          </button>
          <button type="button" className={`admin-nav-item ${activeSection === "comments" ? "active" : ""}`} onClick={() => { setActiveSection("comments"); setSidebarOpen(false); }}>
            <span className="admin-nav-icon">💬</span>
            Comments
          </button>
        </div>

        <div className="admin-nav-group">
          <div className="admin-nav-title">Moderation</div>
          <button type="button" className={`admin-nav-item ${activeSection === "user-reports" ? "active" : ""}`} onClick={() => { setActiveSection("user-reports"); setSidebarOpen(false); }}>
            <span className="admin-nav-icon">🚨</span>
            Reports
          </button>
        </div>

        <div className="admin-nav-group">
          <div className="admin-nav-title">Insights</div>
          <button type="button" className={`admin-nav-item ${activeSection === "dashboard" ? "active" : ""}`} onClick={() => { setActiveSection("dashboard"); setSidebarOpen(false); }}>
            <span className="admin-nav-icon">📊</span>
            Analytics
          </button>
          <button
            type="button"
            className={`admin-nav-item ${activeSection === "settings" && settingsTab === "payment" ? "active" : ""}`}
            onClick={() => {
              setActiveSection("settings");
              setSettingsTab("payment");
              setSidebarOpen(false);
            }}
          >
            <span className="admin-nav-icon">💰</span>
            Monetization
          </button>
        </div>

        <div className="admin-nav-group">
          <div className="admin-nav-title">System</div>
          <button type="button" className={`admin-nav-item ${activeSection === "push" ? "active" : ""}`} onClick={() => { setActiveSection("push"); setSidebarOpen(false); }}>
            <span className="admin-nav-icon">🔔</span>
            Notifications
          </button>
          <button type="button" className={`admin-nav-item ${activeSection === "settings" ? "active" : ""}`} onClick={() => { setActiveSection("settings"); setSidebarOpen(false); }}>
            <span className="admin-nav-icon">⚙️</span>
            Settings
          </button>
          <button type="button" className={`admin-nav-item ${reportsOpen ? "active" : ""}`} onClick={() => setReportsOpen((prev) => !prev)}>
            <span className="admin-nav-icon">⋯</span>
            Advanced
          </button>
          {reportsOpen && (
            <div className="admin-subnav">
              {ADVANCED_SECTIONS.map((item) => (
                <button
                  type="button"
                  key={item.key}
                  className={`admin-subnav-item ${activeSection === item.key ? "active" : ""}`}
                  onClick={() => {
                    setActiveSection(item.key);
                    setSidebarOpen(false);
                  }}
                >
                  <span className="admin-nav-icon">{item.icon || "•"}</span>
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="admin-nav-group admin-nav-footer">
          <button type="button" className="admin-nav-item" onClick={logout}><span className="admin-nav-icon">⏻</span>Logout</button>
        </div>

        <div className="admin-sidebar-bottom">
          <div className="admin-profile">
            <div className="admin-avatar admin-avatar-mini">{(me?.full_name || me?.username || "AD").slice(0, 2).toUpperCase()}</div>
            <div className="admin-info">
              <div className="admin-name">{me?.full_name || me?.username || "Admin"}</div>
              <div className="admin-role">Administrator</div>
            </div>
          </div>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar admin-topbar-light">
          <div className="admin-topbar-left">
            <button type="button" className="admin-hamburger" onClick={() => setSidebarOpen(true)}>menu</button>
            <div className="admin-top-search">
              <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search users, stories..." />
            </div>
          </div>
          <div className="admin-topbar-right">
            <button type="button" className="admin-theme-toggle">🌙 Dark</button>
            <div className="admin-top-icon">🔔</div>
            <div className="admin-action-menu-wrap">
              <button type="button" className="admin-top-profile admin-top-profile-btn" onClick={() => setUserMenuOpen((prev) => !prev)}>
                {(me?.full_name || me?.username || "AD").slice(0, 2).toUpperCase()}
              </button>
              {userMenuOpen ? (
                <div className="admin-action-menu admin-user-menu">
                  <div className="admin-user-menu-head">
                    <strong>{me?.full_name || me?.username || "Admin"}</strong>
                    <span>{me?.email || ""}</span>
                  </div>
                  <button type="button" className="admin-action-menu-item" onClick={() => { setActiveSection("profile"); setUserMenuOpen(false); }}>My Profile</button>
                  <button type="button" className="admin-action-menu-item danger" onClick={logout}>Logout</button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <section className="admin-content">
          {activeSection === "dashboard" && (
            <>
              <SectionHeader title="Dashboard" breadcrumb={`Overview · ${new Date().toLocaleDateString()}`} />
              <div className="admin-stat-grid">
                <DashboardCard label="Total Users" value={formatCount(panelData.dashboard?.summary?.total_users || 0)} tone="sky" />
                <DashboardCard label="Total Stories" value={formatCount(panelData.dashboard?.summary?.total_books || 0)} tone="violet" />
                <DashboardCard label="Total Reads" value={formatCount(panelData.dashboard?.summary?.total_views || 0)} tone="mint" />
                <DashboardCard label="Revenue" value={`$${formatCount(panelData.dashboard?.summary?.total_downloads || 0)}`} tone="amber" />
              </div>

              <div className="admin-split-grid">
                <section className="admin-panel">
                  <div className="admin-panel-header">
                    <h2>Recent Books</h2>
                    <button type="button" className="admin-link-btn" onClick={() => setActiveSection("stories")}>Stories List</button>
                  </div>
                  <div className="admin-table-wrap compact">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>S.L</th>
                          <th>Story Image</th>
                          <th>Title</th>
                          <th>Category</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(panelData.dashboard?.recent_books || []).map((item, index) => (
                          <tr key={item.id || index}>
                            <td>{index + 1}</td>
                            <td><MiniAvatar square image={item.image} text={item.title} /></td>
                            <td>{item.title}</td>
                            <td>{item.category}</td>
                            <td><StatusChip value={item.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="admin-panel">
                  <div className="admin-panel-header">
                    <h2>Platform Snapshot</h2>
                  </div>
                  <div className="admin-list-grid">
                    <div className="admin-list-card"><span>Open Reports</span><strong>{panelData.analytics?.open_reports || 0}</strong></div>
                    <div className="admin-list-card"><span>Banned Users</span><strong>{panelData.analytics?.banned_users || 0}</strong></div>
                    <div className="admin-list-card"><span>Total Comments</span><strong>{panelData.analytics?.total_comments || 0}</strong></div>
                    <div className="admin-list-card"><span>Total Likes</span><strong>{panelData.analytics?.total_likes || 0}</strong></div>
                    <div className="admin-list-card"><span>Hidden Comments</span><strong>{panelData.analytics?.hidden_comments || 0}</strong></div>
                    <div className="admin-list-card"><span>Badges Earned</span><strong>{panelData.analytics?.badges_earned || 0}</strong></div>
                  </div>
                </section>
              </div>

              <div className="admin-debug-grid admin-debug-grid-wide">
                <section className="admin-panel">
                  <div className="admin-panel-header"><h2>Latest Activity</h2></div>
                  <div className="admin-debug-list">
                    {(panelData.debug?.last_activity || []).slice(0, 5).map((item, index) => (
                      <div key={`${item.user_id}-${index}`} className="admin-debug-card">
                        <strong>{item.action_type}</strong>
                        <span>User: {item.user_id}</span>
                        <span>Story: {item.post_id}</span>
                        <span>{formatRelativeDate(item.created_at)}</span>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="admin-panel">
                  <div className="admin-panel-header"><h2>Recommendation Cache</h2></div>
                  <div className="admin-debug-list">
                    {(panelData.debug?.cache_keys || []).slice(0, 6).map((item) => (
                      <div key={item} className="admin-debug-card mono">{item}</div>
                    ))}
                    {(panelData.debug?.cache_keys || []).length === 0 && <div className="admin-debug-card">No cache keys yet.</div>}
                  </div>
                </section>
                <section className="admin-panel">
                  <div className="admin-panel-header"><h2>Live DB Views</h2></div>
                  <div className="admin-debug-list">
                    {(panelData.debug?.per_story_views || []).slice(0, 6).map((item) => (
                      <div key={item.story_id} className="admin-debug-card">
                        <strong>{item.title}</strong>
                        <span>{item.views} views</span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </>
          )}

          {activeSection === "reels" && (
            <section className="admin-panel">
              <SectionHeader title="Reel List" breadcrumb="Dashboard . Reel List" />
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>S.L</th>
                      <th>Reel Image</th>
                      <th>Username</th>
                      <th>Posted Date/Time</th>
                      <th>Likes</th>
                      <th>Comments</th>
                      <th>Views</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReels.map((item, index) => (
                      <tr key={item.id}>
                        <td>{index + 1}</td>
                        <td><MiniAvatar square image={item.image} text={item.title} /></td>
                        <td>
                          <div className="admin-person-cell">
                            <strong>{item.username || item.author_name}</strong>
                            <span>{item.email}</span>
                          </div>
                        </td>
                        <td>{formatDateTime(item.posted_at)}</td>
                        <td>{item.likes} Likes</td>
                        <td>{item.comments} Comments</td>
                        <td>{item.views} Views</td>
                        <td><StatusChip value={item.status === "published" ? "active" : item.status} /></td>
                        <td>
                          <div className="admin-inline-actions">
                            <ActionIconButton label="View" onClick={() => router.push(`/read/${item.id}`)} />
                            <ActionIconButton label={item.status === "published" ? "Draft" : "Live"} onClick={() => updateStoryStatus(item.id, item.status === "published" ? "draft" : "published")} />
                            <ActionIconButton label="Delete" danger onClick={() => deleteStory(item.id)} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeSection === "stories" && (
            <section className="admin-panel">
              <SectionHeader title="Stories List" breadcrumb="Dashboard . Stories List" />
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>S.L</th>
                      <th>Story Image</th>
                      <th>Username</th>
                      <th>Posted Date/Time</th>
                      <th>Status</th>
                      <th>Views</th>
                      <th>Likes</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStories.map((item, index) => (
                      <tr key={item.id}>
                        <td>{index + 1}</td>
                        <td><MiniAvatar square image={item.image} text={item.title} /></td>
                        <td>
                          <div className="admin-person-cell">
                            <strong>{item.username || item.author_name}</strong>
                            <span>{item.email}</span>
                          </div>
                        </td>
                        <td>{formatDateTime(item.posted_at)}</td>
                        <td><StatusChip value={item.status === "published" ? "live" : item.status} /></td>
                        <td>{item.views} View</td>
                        <td>{item.likes} Like</td>
                        <td>
                          <div className="admin-inline-actions">
                            <ActionIconButton label="View" onClick={() => router.push(`/read/${item.id}`)} />
                            <ActionIconButton label={item.status === "published" ? "Draft" : "Live"} onClick={() => updateStoryStatus(item.id, item.status === "published" ? "draft" : "published")} />
                            <ActionIconButton label="Delete" danger onClick={() => deleteStory(item.id)} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeSection === "chapters" && (
            <section className="admin-panel">
              <SectionHeader title="Chapters" breadcrumb="Content . Chapter management" />
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Chapter Title</th>
                      <th>Story</th>
                      <th>Author</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chapterRows.map((item, index) => (
                      <tr key={item.chapter?.id || item.id}>
                        <td>{index + 1}</td>
                        <td>{item.chapter?.title || "Unknown Chapter"}</td>
                        <td>{item.story?.title || "Unknown Story"}</td>
                        <td>{item.reported_user?.name || "Unknown"}</td>
                        <td><StatusChip value={item.status === "resolved" ? "published" : "draft"} /></td>
                        <td>
                          <div className="admin-inline-actions">
                            <ActionIconButton label="View" onClick={() => router.push(`/read/${item.story?.id || ""}`)} />
                            <ActionIconButton label="Resolve" onClick={() => resolveReport(item.id)} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeSection === "comments" && (
            <section className="admin-panel">
              <SectionHeader
                title="Comments"
                breadcrumb="Moderation . Comment management"
                actions={
                  <div className="admin-tab-strip">
                    <button type="button" className={`admin-tab-chip ${commentsFilter === "all" ? "active" : ""}`} onClick={() => setCommentsFilter("all")}>All</button>
                    <button type="button" className={`admin-tab-chip ${commentsFilter === "flagged" ? "active" : ""}`} onClick={() => setCommentsFilter("flagged")}>Flagged</button>
                    <button type="button" className={`admin-tab-chip ${commentsFilter === "spam" ? "active" : ""}`} onClick={() => setCommentsFilter("spam")}>Spam</button>
                  </div>
                }
              />
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Comment</th>
                      <th>Story</th>
                      <th>Status</th>
                      <th>Time</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commentsLoading && (
                      <tr>
                        <td colSpan={6}>Loading comments...</td>
                      </tr>
                    )}
                    {!commentsLoading && filteredAdminComments.map((item) => {
                      const user = getUserForComment(item);
                      const isSpam = /(https?:\/\/|www\.|spam|cheap|buy followers|telegram|porn|casino)/i.test(item.content || "");
                      const statusLabel = isSpam ? "spam" : item.status === "hidden" ? "flagged" : "ok";
                      return (
                        <tr key={item.id}>
                          <td>
                            <div className="admin-user-identity">
                              <MiniAvatar image={user?.profile_image || ""} text={user?.username || "U"} />
                              <div className="admin-person-cell">
                                <strong>{user?.username || "unknown"}</strong>
                                <span>{user?.email || item.user_id}</span>
                              </div>
                            </div>
                          </td>
                          <td>{item.content || "-"}</td>
                          <td>{(panelData.stories || []).find((story) => story.id === item.story_id)?.title || item.story_id || "-"}</td>
                          <td><StatusChip value={statusLabel} /></td>
                          <td>{formatRelativeDate(item.created_at)}</td>
                          <td>
                            <div className="admin-inline-actions">
                              <ActionIconButton label="View" onClick={() => router.push(`/read/${item.story_id}`)} />
                              {user ? <ActionIconButton label={user.is_banned ? "Unban" : "Ban"} onClick={() => updateUserBan(user)} /> : null}
                              <ActionIconButton label={item.status === "hidden" ? "Show" : "Hide"} onClick={() => toggleCommentVisibility(item)} />
                              <ActionIconButton label="Delete" danger onClick={() => removeComment(item)} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {reportSections[activeSection] && (
            <section className="admin-panel">
              <SectionHeader title={reportSections[activeSection].title} breadcrumb={`Dashboard . Report List . ${reportSections[activeSection].title}`} />
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>S.L</th>
                      <th>Created Date/Time</th>
                      <th>Reported Item</th>
                      <th>Reason</th>
                      <th>Reported By</th>
                      <th>Account Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportSections[activeSection].items.map((item, index) => (
                      <tr key={item.id}>
                        <td>{index + 1}</td>
                        <td>{formatDateTime(item.created_at)}</td>
                        <td>
                          <div className="admin-user-identity">
                            <MiniAvatar
                              image={
                                activeSection === "user-reports"
                                  ? item.reported_user?.image
                                  : item.story?.image || item.reported_user?.image
                              }
                              text={
                                activeSection === "user-reports"
                                  ? item.reported_user?.name
                                  : activeSection === "chapter-reports"
                                    ? item.chapter?.title || item.story?.title || "Chapter"
                                    : activeSection === "comment-reports"
                                      ? item.comment?.content || item.story?.title || "Comment"
                                      : item.story?.title || item.reported_user?.name
                              }
                            />
                            <div className="admin-person-cell">
                              <strong>
                                {activeSection === "user-reports"
                                  ? item.reported_user?.name
                                  : activeSection === "chapter-reports"
                                    ? item.chapter?.title || item.story?.title || "Unknown Chapter"
                                    : activeSection === "comment-reports"
                                      ? item.comment?.content || item.story?.title || "Unknown Comment"
                                      : item.story?.title || item.reported_user?.name}
                              </strong>
                              <span>
                                {activeSection === "user-reports"
                                  ? item.reported_user?.email
                                  : activeSection === "chapter-reports"
                                    ? `Story: ${item.story?.title || "Unknown Story"}`
                                    : activeSection === "comment-reports"
                                      ? `Story: ${item.story?.title || "Unknown Story"}`
                                      : item.reported_user?.email || item.story?.title}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td>{item.reason}</td>
                        <td>
                          <div className="admin-user-identity">
                            <MiniAvatar image={item.reported_by?.image} text={item.reported_by?.name} />
                            <div className="admin-person-cell">
                              <strong>{item.reported_by?.name}</strong>
                              <span>{item.reported_by?.email}</span>
                            </div>
                          </div>
                        </td>
                        <td><StatusChip value={item.reported_user?.status || item.status || item.report_kind} /></td>
                        <td>
                          <div className="admin-inline-actions">
                            <ActionIconButton label="Resolve" onClick={() => resolveReport(item.id)} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeSection === "users" && (
            <section className="admin-panel">
              <SectionHeader title="User List" breadcrumb="Dashboard . User List" actions={<button type="button" className="admin-primary-btn" onClick={resetUserEditor}>{editingUserId ? "New User" : "Add User"}</button>} />
              <div className="admin-form-split admin-form-split-wide">
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>S.L</th>
                        <th>Username</th>
                        <th>Created Date/Time</th>
                        <th>Login Type</th>
                        <th>Account Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((item, index) => (
                        <tr key={item.id}>
                          <td>{index + 1}</td>
                          <td>
                            <div className="admin-user-identity">
                              <MiniAvatar image={item.profile_image} text={item.username} />
                              <div className="admin-person-cell">
                                <strong>{item.username}</strong>
                                <span>{item.email}</span>
                              </div>
                            </div>
                          </td>
                          <td>{formatDateTime(item.created_at)}</td>
                          <td><span className="admin-tag-chip">{item.mobile ? "Mobile Number" : item.email ? "Email" : "Google"}</span></td>
                          <td><StatusChip value={item.status} /></td>
                          <td>
                            <div className="admin-inline-actions">
                              <ActionIconButton label="Edit" onClick={() => startUserEdit(item)} />
                              <ActionIconButton label={item.is_banned ? "Unban" : "Ban"} onClick={() => updateUserBan(item)} />
                              <ActionIconButton label="Delete" danger onClick={() => deleteUser(item)} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="admin-form-card">
                  <div className="admin-form-heading">
                    <h3>{editingUserId ? "Edit User" : "Add User"}</h3>
                    <p>{editingUserId ? "Update user details from the live website database." : "Create a new user directly from the admin panel."}</p>
                  </div>
                  <div className="admin-field-grid two-col">
                    <div>
                      <label>Username</label>
                      <input className="admin-input" value={userForm.username} onChange={(event) => setUserForm((prev) => ({ ...prev, username: event.target.value }))} />
                    </div>
                    <div>
                      <label>Email</label>
                      <input className="admin-input" value={userForm.email} onChange={(event) => setUserForm((prev) => ({ ...prev, email: event.target.value }))} />
                    </div>
                    <div>
                      <label>Full Name</label>
                      <input className="admin-input" value={userForm.full_name} onChange={(event) => setUserForm((prev) => ({ ...prev, full_name: event.target.value }))} />
                    </div>
                    <div>
                      <label>Password {editingUserId ? "(optional)" : "*"}</label>
                      <input type="password" className="admin-input" value={userForm.password} onChange={(event) => setUserForm((prev) => ({ ...prev, password: event.target.value }))} />
                    </div>
                    <div>
                      <label>Mobile Number</label>
                      <input className="admin-input" value={userForm.phone} onChange={(event) => setUserForm((prev) => ({ ...prev, phone: event.target.value }))} />
                    </div>
                    <div>
                      <label>Country</label>
                      <input className="admin-input" value={userForm.country} onChange={(event) => setUserForm((prev) => ({ ...prev, country: event.target.value }))} />
                    </div>
                    <div>
                      <label>Preferred Language</label>
                      <input className="admin-input" value={userForm.preferred_language} onChange={(event) => setUserForm((prev) => ({ ...prev, preferred_language: event.target.value }))} />
                    </div>
                    <div>
                      <label>Profile Image URL</label>
                      <input className="admin-input" value={userForm.profile_image} onChange={(event) => setUserForm((prev) => ({ ...prev, profile_image: event.target.value }))} />
                    </div>
                  </div>
                  <div className="admin-radio-row">
                    <span>Gender</span>
                    {["male", "female", "other"].map((value) => (
                      <label key={value} className="admin-radio-pill">
                        <input type="radio" name="admin-user-gender" checked={userForm.gender === value} onChange={() => setUserForm((prev) => ({ ...prev, gender: value }))} />
                        {value}
                      </label>
                    ))}
                  </div>
                  <div className="admin-toggle-list">
                    <div className="admin-toggle-row admin-toggle-row-card">
                      <span>Admin Access</span>
                      <button type="button" className={`admin-toggle ${userForm.is_admin ? "active" : ""}`} onClick={() => setUserForm((prev) => ({ ...prev, is_admin: !prev.is_admin }))}><span /></button>
                    </div>
                    <div className="admin-toggle-row admin-toggle-row-card">
                      <span>Banned</span>
                      <button type="button" className={`admin-toggle ${userForm.is_banned ? "active" : ""}`} onClick={() => setUserForm((prev) => ({ ...prev, is_banned: !prev.is_banned }))}><span /></button>
                    </div>
                  </div>
                  <div className="admin-inline-actions">
                    <button type="button" className="admin-primary-btn" onClick={saveUser}>{editingUserId ? "Update User" : "Create User"}</button>
                    {(editingUserId || userForm.username || userForm.email) ? <button type="button" className="admin-clear-btn" onClick={resetUserEditor}>Cancel</button> : null}
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeSection === "country-users" && (
            <section className="admin-panel">
              <SectionHeader title="Country Wise Users" breadcrumb="Dashboard . Country Wise Users" />
              <div className="admin-country-list">
                {filteredCountries.map((item) => {
                  const maxCount = Math.max(...(panelData.country_users || []).map((entry) => Number(entry.count || 0)), 1);
                  const width = `${Math.max(4, (Number(item.count || 0) / maxCount) * 100)}%`;
                  return (
                    <div key={item.country} className="admin-country-row">
                      <div className="admin-country-label">{item.country}</div>
                      <div className="admin-country-bar"><span style={{ width }} /></div>
                      <div className="admin-country-count">{item.count} Users</div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {activeSection === "hashtags" && (
            <section className="admin-panel">
              <SectionHeader
                title="Hashtag List"
                breadcrumb="Dashboard . Hashtag List"
                actions={
                  <div className="admin-inline-form compact">
                    <input className="admin-input" value={hashtagName} onChange={(event) => setHashtagName(event.target.value)} placeholder="Add hashtag word..." />
                    <button type="button" className="admin-primary-btn" onClick={createHashtag}>Add Hashtag</button>
                  </div>
                }
              />
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>S.L</th>
                      <th>Hashtag Word</th>
                      <th>Post Count</th>
                      <th>Reel Count</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHashtags.map((item, index) => (
                      <tr key={item.name}>
                        <td>{index + 1}</td>
                        <td>#{item.name}</td>
                        <td>{item.story_count || 0} post</td>
                        <td>{item.story_count || 0} reel</td>
                        <td>
                          <div className="admin-inline-actions">
                            <ActionIconButton label="Delete" danger onClick={() => removeHashtag(item.name)} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeSection === "languages" && (
            <section className="admin-panel">
              <SectionHeader title="Language List" breadcrumb="Dashboard . Language List" actions={<button type="button" className="admin-primary-btn" onClick={resetLanguageEditor}>{editingLanguageName ? "New Language" : "Add Language"}</button>} />
              <div className="admin-form-split admin-form-split-wide">
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>S.L</th>
                        <th>Language</th>
                        <th>Country</th>
                        <th>Status</th>
                        <th>Default</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLanguages.map((item, index) => (
                        <tr key={item.name}>
                          <td>{index + 1}</td>
                          <td>{item.name}</td>
                          <td>{item.country}</td>
                          <td>
                            <button type="button" className={`admin-toggle ${item.status !== "inactive" ? "active" : ""}`} onClick={() => patchLanguage(item.name, { status: item.status === "active" ? "inactive" : "active" })}>
                              <span />
                            </button>
                          </td>
                          <td>
                            <button type="button" className={`admin-toggle ${item.is_default ? "active" : ""}`} onClick={() => patchLanguage(item.name, { is_default: !item.is_default })}>
                              <span />
                            </button>
                          </td>
                          <td>
                            <div className="admin-inline-actions">
                              <ActionIconButton label="Edit" onClick={() => startLanguageEdit(item)} />
                              <ActionIconButton label="Delete" danger onClick={() => deleteLanguage(item.name)} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="admin-form-card">
                  <div className="admin-form-heading">
                    <h3>{editingLanguageName ? "Edit Language" : "Add Language"}</h3>
                    <p>Manage language availability and the default language shown across the website.</p>
                  </div>
                  <div className="admin-field-grid two-col">
                    <div>
                      <label>Language Name</label>
                      <input className="admin-input" value={languageForm.name} disabled={Boolean(editingLanguageName)} onChange={(event) => setLanguageForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Language" />
                    </div>
                    <div>
                      <label>Country</label>
                      <input className="admin-input" value={languageForm.country} onChange={(event) => setLanguageForm((prev) => ({ ...prev, country: event.target.value }))} placeholder="Country" />
                    </div>
                  </div>
                  <div className="admin-toggle-list">
                    <div className="admin-toggle-row admin-toggle-row-card">
                      <span>Status: {languageForm.status === "inactive" ? "Inactive" : "Active"}</span>
                      <button type="button" className={`admin-toggle ${languageForm.status !== "inactive" ? "active" : ""}`} onClick={() => setLanguageForm((prev) => ({ ...prev, status: prev.status === "active" ? "inactive" : "active" }))}><span /></button>
                    </div>
                    <div className="admin-toggle-row admin-toggle-row-card">
                      <span>Default Language</span>
                      <button type="button" className={`admin-toggle ${languageForm.is_default ? "active" : ""}`} onClick={() => setLanguageForm((prev) => ({ ...prev, is_default: !prev.is_default }))}><span /></button>
                    </div>
                  </div>
                  <div className="admin-inline-actions">
                    <button type="button" className="admin-primary-btn" onClick={createLanguage}>{editingLanguageName ? "Update Language" : "Save Language"}</button>
                    {(editingLanguageName || languageForm.name || languageForm.country) ? <button type="button" className="admin-clear-btn" onClick={resetLanguageEditor}>Cancel</button> : null}
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeSection === "genres" && (
            <section className="admin-panel">
              <SectionHeader title="Genre List" breadcrumb="Dashboard . Genre List" actions={<button type="button" className="admin-primary-btn" onClick={resetGenreEditor}>{editingGenreName ? "New Genre" : "Add Genre"}</button>} />
              <div className="admin-form-split admin-form-split-wide">
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>S.L</th>
                        <th>Genre</th>
                        <th>Stories</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredGenres.map((item, index) => (
                        <tr key={item.name}>
                          <td>{index + 1}</td>
                          <td>
                            <div className="admin-user-identity">
                              <MiniAvatar image={item.icon_url} text={item.name} />
                              <div className="admin-person-cell">
                                <strong>{item.name}</strong>
                                <span>{item.icon_url ? "Icon uploaded" : "No icon"}</span>
                              </div>
                            </div>
                          </td>
                          <td>{item.story_count || 0}</td>
                          <td><StatusChip value={item.status || "active"} /></td>
                          <td>
                            <div className="admin-inline-actions">
                              <ActionIconButton label="Edit" onClick={() => startGenreEdit(item)} />
                              <ActionIconButton label="Delete" danger onClick={() => deleteGenre(item.name)} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="admin-form-card">
                  <div className="admin-form-heading">
                    <h3>{editingGenreName ? "Edit Genre" : "Add Genre"}</h3>
                    <p>Create genre labels with icon uploads used by admin and discovery pages.</p>
                  </div>
                  <label>Genre Name</label>
                  <input className="admin-input" value={genreForm.name} disabled={Boolean(editingGenreName)} onChange={(event) => setGenreForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Genre name" />
                  <label>Genre Icon Upload</label>
                  <input type="file" accept="image/*" className="admin-file-input" onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) uploadAdminImage(file, "genre");
                    event.target.value = "";
                  }} />
                  {genreUploading ? <p className="admin-page-subtitle">Uploading icon...</p> : null}
                  {genreForm.icon_url ? <MiniAvatar image={genreForm.icon_url} text={genreForm.name || "G"} /> : null}
                  <div className="admin-toggle-row admin-toggle-row-card">
                    <span>Status: {genreForm.status === "inactive" ? "Inactive" : "Active"}</span>
                    <button type="button" className={`admin-toggle ${genreForm.status !== "inactive" ? "active" : ""}`} onClick={() => setGenreForm((prev) => ({ ...prev, status: prev.status === "active" ? "inactive" : "active" }))}><span /></button>
                  </div>
                  <div className="admin-inline-actions">
                    <button type="button" className="admin-primary-btn" onClick={saveGenre}>{editingGenreName ? "Update Genre" : "Save Genre"}</button>
                    {(editingGenreName || genreForm.name) ? <button type="button" className="admin-clear-btn" onClick={resetGenreEditor}>Cancel</button> : null}
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeSection === "blocks" && (
            <section className="admin-panel">
              <SectionHeader title="Block List" breadcrumb="Dashboard . Block List" />
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>S.L</th>
                      <th>Date/Time</th>
                      <th>Blocked To</th>
                      <th>Blocked By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBlocks.map((item, index) => (
                      <tr key={item.id}>
                        <td>{index + 1}</td>
                        <td>{formatDateTime(item.created_at)}</td>
                        <td>
                          <div className="admin-user-identity">
                            <MiniAvatar image={item.blocked_to?.image} text={item.blocked_to?.name} />
                            <div className="admin-person-cell">
                              <strong>{item.blocked_to?.name}</strong>
                              <span>{item.blocked_to?.email}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="admin-user-identity">
                            <MiniAvatar image={item.blocked_by?.image} text={item.blocked_by?.name} />
                            <div className="admin-person-cell">
                              <strong>{item.blocked_by?.name}</strong>
                              <span>{item.blocked_by?.email}</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeSection === "avatars" && (
            <section className="admin-panel">
              <SectionHeader title="Avatar List" breadcrumb="Dashboard . Avatar List" actions={<button type="button" className="admin-primary-btn" onClick={resetAvatarEditor}>{editingAvatarId ? "New Avatar" : "Add Avatar"}</button>} />
              <div className="admin-form-split admin-form-split-wide">
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>S.L</th>
                        <th>Avatar Image</th>
                        <th>Avatar Name</th>
                        <th>Avatar Gender</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAvatars.map((item, index) => (
                        <tr key={item.id}>
                          <td>{index + 1}</td>
                          <td><MiniAvatar image={item.image_url} text={item.name} /></td>
                          <td>{item.name}</td>
                          <td>{item.gender}</td>
                          <td>
                            <div className="admin-inline-actions">
                              <ActionIconButton label="Edit" onClick={() => startAvatarEdit(item)} />
                              <ActionIconButton label="Delete" danger onClick={() => deleteAvatar(item.id)} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="admin-form-card">
                  <div className="admin-form-heading">
                    <h3>{editingAvatarId ? "Edit Avatar" : "Add Avatar"}</h3>
                    <p>Avatar choices here are available to the public user experience and onboarding flows.</p>
                  </div>
                  <label>Avatar Name</label>
                  <input className="admin-input" value={avatarForm.name} onChange={(event) => setAvatarForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Avatar name" />
                  <label>Avatar Image Upload</label>
                  <input
                    type="file"
                    accept="image/*"
                    className="admin-file-input"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) uploadAdminImage(file, "avatar");
                      event.target.value = "";
                    }}
                  />
                  {avatarUploading ? <p className="admin-page-subtitle">Uploading avatar...</p> : null}
                  {avatarForm.image_url ? <MiniAvatar image={avatarForm.image_url} text={avatarForm.name || "A"} /> : null}
                  <div className="admin-radio-row">
                    <span>Gender</span>
                    {["male", "female", "other"].map((value) => (
                      <label key={value} className="admin-radio-pill">
                        <input type="radio" name="avatar-gender" checked={avatarForm.gender === value} onChange={() => setAvatarForm((prev) => ({ ...prev, gender: value }))} />
                        {value}
                      </label>
                    ))}
                  </div>
                  <div className="admin-inline-actions">
                    <button type="button" className="admin-primary-btn" onClick={saveAvatar}>{editingAvatarId ? "Update Avatar" : "Save Avatar"}</button>
                    {(editingAvatarId || avatarForm.name || avatarForm.image_url) ? <button type="button" className="admin-clear-btn" onClick={resetAvatarEditor}>Cancel</button> : null}
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeSection === "push" && (
            <section className="admin-panel">
              <SectionHeader title="Push Notification" breadcrumb="Dashboard . Push Notification" />
              <div className="admin-form-split">
                <div className="admin-form-card">
                  <label>Title</label>
                  <input className="admin-input" value={pushForm.title} onChange={(event) => setPushForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="Notification title" />
                  <label>Description</label>
                  <textarea className="admin-textarea" rows={5} value={pushForm.description} onChange={(event) => setPushForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="Message to all active users" />
                  <button type="button" className="admin-primary-btn admin-wide-btn" onClick={sendPushNotification}>Push Notification</button>
                </div>
                <div className="admin-table-wrap compact">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>S.L</th>
                        <th>Title</th>
                        <th>Description</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPush.map((item, index) => (
                        <tr key={item.id}>
                          <td>{index + 1}</td>
                          <td>{item.title}</td>
                          <td>{item.description}</td>
                          <td>{formatRelativeDate(item.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {activeSection === "settings" && (
            <section className="admin-panel">
              <SectionHeader title="Settings" breadcrumb="Dashboard . Settings" />
              <div className="admin-settings-layout">
                <div className="admin-settings-tabs">
                  {SETTINGS_TABS.map((tab) => (
                    <button type="button" key={tab.key} className={`admin-settings-tab ${settingsTab === tab.key ? "active" : ""}`} onClick={() => setSettingsTab(tab.key)}>
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="admin-settings-panel">
                  {settingsTab === "general" && (
                    <div className="admin-settings-block">
                      <h3>General Settings</h3>
                      <div className="admin-field-grid two-col">
                        <div>
                          <label>App/Website Name</label>
                          <input className="admin-input" value={settingsDraft.site_name || ""} onChange={(event) => updateSettingsValue("site_name", event.target.value)} />
                        </div>
                        <div>
                          <label>Contact Email</label>
                          <input className="admin-input" value={settingsDraft.contact_email || ""} onChange={(event) => updateSettingsValue("contact_email", event.target.value)} />
                        </div>
                        <div>
                          <label>Dark Logo URL</label>
                          <input className="admin-input" value={settingsDraft.dark_logo_url || ""} onChange={(event) => updateSettingsValue("dark_logo_url", event.target.value)} />
                        </div>
                        <div>
                          <label>Light Logo URL</label>
                          <input className="admin-input" value={settingsDraft.light_logo_url || ""} onChange={(event) => updateSettingsValue("light_logo_url", event.target.value)} />
                        </div>
                        <div>
                          <label>Splash Image URL</label>
                          <input className="admin-input" value={settingsDraft.splash_image_url || ""} onChange={(event) => updateSettingsValue("splash_image_url", event.target.value)} />
                        </div>
                        <div>
                          <label>Copyright Text</label>
                          <input className="admin-input" value={settingsDraft.copyright_text || ""} onChange={(event) => updateSettingsValue("copyright_text", event.target.value)} />
                        </div>
                      </div>
                      <div className="admin-field-grid two-col">
                        <div>
                          <label>Primary Color</label>
                          <input className="admin-input" value={settingsDraft.primary_color || ""} onChange={(event) => updateSettingsValue("primary_color", event.target.value)} />
                        </div>
                        <div>
                          <label>Secondary Color</label>
                          <input className="admin-input" value={settingsDraft.secondary_color || ""} onChange={(event) => updateSettingsValue("secondary_color", event.target.value)} />
                        </div>
                      </div>
                    </div>
                  )}

                  {settingsTab === "sms" && (
                    <div className="admin-settings-block">
                      <h3>SMS Configuration</h3>
                      <div className="admin-field-grid two-col">
                        <div><label>Twilio Account SID</label><input className="admin-input" value={settingsDraft.sms_config?.account_sid || ""} onChange={(event) => updateSettingsValue("sms_config.account_sid", event.target.value)} /></div>
                        <div><label>Twilio Auth Token</label><input className="admin-input" value={settingsDraft.sms_config?.auth_token || ""} onChange={(event) => updateSettingsValue("sms_config.auth_token", event.target.value)} /></div>
                        <div><label>Twilio Phone Number</label><input className="admin-input" value={settingsDraft.sms_config?.phone_number || ""} onChange={(event) => updateSettingsValue("sms_config.phone_number", event.target.value)} /></div>
                        <div><label>Secondary Provider</label><input className="admin-input" value={settingsDraft.sms_config?.provider_secondary || ""} onChange={(event) => updateSettingsValue("sms_config.provider_secondary", event.target.value)} /></div>
                      </div>
                    </div>
                  )}

                  {settingsTab === "mail" && (
                    <div className="admin-settings-block">
                      <h3>Mail Setup</h3>
                      <div className="admin-field-grid two-col">
                        <div><label>Mail Mailer</label><input className="admin-input" value={settingsDraft.mail_setup?.mailer || ""} onChange={(event) => updateSettingsValue("mail_setup.mailer", event.target.value)} /></div>
                        <div><label>Mail Host</label><input className="admin-input" value={settingsDraft.mail_setup?.host || ""} onChange={(event) => updateSettingsValue("mail_setup.host", event.target.value)} /></div>
                        <div><label>Mail Port</label><input className="admin-input" value={settingsDraft.mail_setup?.port || ""} onChange={(event) => updateSettingsValue("mail_setup.port", event.target.value)} /></div>
                        <div><label>Mail Encryption</label><input className="admin-input" value={settingsDraft.mail_setup?.encryption || ""} onChange={(event) => updateSettingsValue("mail_setup.encryption", event.target.value)} /></div>
                        <div><label>Mail Username</label><input className="admin-input" value={settingsDraft.mail_setup?.username || ""} onChange={(event) => updateSettingsValue("mail_setup.username", event.target.value)} /></div>
                        <div><label>Mail Password</label><input className="admin-input" value={settingsDraft.mail_setup?.password || ""} onChange={(event) => updateSettingsValue("mail_setup.password", event.target.value)} /></div>
                        <div><label>Mail From Address</label><input className="admin-input" value={settingsDraft.mail_setup?.from_address || ""} onChange={(event) => updateSettingsValue("mail_setup.from_address", event.target.value)} /></div>
                      </div>
                    </div>
                  )}

                  {settingsTab === "aws" && (
                    <div className="admin-settings-block">
                      <h3>AWS Media Storage</h3>
                      <div className="admin-field-grid two-col">
                        <div><label>Access Key</label><input className="admin-input" value={settingsDraft.aws_media?.access_key || ""} onChange={(event) => updateSettingsValue("aws_media.access_key", event.target.value)} /></div>
                        <div><label>Secret Access Key</label><input className="admin-input" value={settingsDraft.aws_media?.secret_access_key || ""} onChange={(event) => updateSettingsValue("aws_media.secret_access_key", event.target.value)} /></div>
                        <div><label>Bucket Name</label><input className="admin-input" value={settingsDraft.aws_media?.bucket_name || ""} onChange={(event) => updateSettingsValue("aws_media.bucket_name", event.target.value)} /></div>
                        <div><label>S3 Bucket URL</label><input className="admin-input" value={settingsDraft.aws_media?.bucket_url || ""} onChange={(event) => updateSettingsValue("aws_media.bucket_url", event.target.value)} /></div>
                      </div>
                    </div>
                  )}

                  {settingsTab === "firebase" && (
                    <div className="admin-settings-block">
                      <h3>Firebase Setup</h3>
                      <div className="admin-field-grid">
                        <div>
                          <label>Upload JSON File URL</label>
                          <input className="admin-input" value={settingsDraft.firebase?.credentials_file_url || ""} onChange={(event) => updateSettingsValue("firebase.credentials_file_url", event.target.value)} />
                        </div>
                        <div>
                          <label>Info</label>
                          <textarea className="admin-textarea admin-note-box" rows={4} value={settingsDraft.firebase?.info_text || ""} onChange={(event) => updateSettingsValue("firebase.info_text", event.target.value)} />
                        </div>
                      </div>
                    </div>
                  )}

                  {settingsTab === "payment" && (
                    <div className="admin-settings-block">
                      <h3>Payment Method</h3>
                      <div className="admin-tab-strip">
                        {[
                          { key: "razorpay", label: "Razor Pay" },
                          { key: "stripe", label: "Stripe" },
                          { key: "paypal", label: "PayPal" },
                        ].map((provider) => (
                          <button key={provider.key} type="button" className={`admin-tab-chip ${settingsDraft.payment?.active_provider === provider.key ? "active" : ""}`} onClick={() => updateSettingsValue("payment.active_provider", provider.key)}>
                            {provider.label}
                          </button>
                        ))}
                      </div>
                      <div className="admin-toggle-row">
                        <span>Enable Razorpay Payment</span>
                        <button type="button" className={`admin-toggle ${settingsDraft.payment?.razorpay_enabled ? "active" : ""}`} onClick={() => updateSettingsValue("payment.razorpay_enabled", !settingsDraft.payment?.razorpay_enabled)}><span /></button>
                      </div>
                      <div className="admin-field-grid two-col">
                        <div><label>Stripe Public Key</label><input className="admin-input" value={settingsDraft.payment?.stripe_public_key || ""} onChange={(event) => updateSettingsValue("payment.stripe_public_key", event.target.value)} /></div>
                        <div><label>Stripe Secret Key</label><input className="admin-input" value={settingsDraft.payment?.stripe_secret_key || ""} onChange={(event) => updateSettingsValue("payment.stripe_secret_key", event.target.value)} /></div>
                      </div>
                    </div>
                  )}

                  {settingsTab === "login" && (
                    <div className="admin-settings-block">
                      <h3>Login Configuration</h3>
                      <div className="admin-toggle-list">
                        {[
                          ["login_config.email_enabled", "Email"],
                          ["login_config.mobile_otp_enabled", "MobileOtp"],
                          ["login_config.facebook_enabled", "Facebook"],
                          ["login_config.google_enabled", "Google"],
                          ["login_config.apple_enabled", "Apple"],
                        ].map(([path, label]) => {
                          const [parent, child] = path.split(".");
                          const enabled = Boolean(settingsDraft?.[parent]?.[child]);
                          return (
                            <div key={path} className="admin-toggle-row admin-toggle-row-card">
                              <span>{label}</span>
                              <button type="button" className={`admin-toggle ${enabled ? "active" : ""}`} onClick={() => updateSettingsValue(path, !enabled)}><span /></button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {settingsTab === "purchase" && (
                    <div className="admin-settings-block">
                      <h3>Purchase Code</h3>
                      <div className="admin-field-grid">
                        <div><label>Purchase Code</label><input className="admin-input" value={settingsDraft.purchase_code?.code || ""} onChange={(event) => updateSettingsValue("purchase_code.code", event.target.value)} /></div>
                        <div className="admin-toggle-row admin-toggle-row-card">
                          <span>{settingsDraft.purchase_code?.status === "active" ? "Active" : "Deactive"}</span>
                          <button type="button" className={`admin-toggle ${settingsDraft.purchase_code?.status === "active" ? "active" : ""}`} onClick={() => updateSettingsValue("purchase_code.status", settingsDraft.purchase_code?.status === "active" ? "deactive" : "active")}><span /></button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="admin-settings-save-row">
                    <button type="button" className="admin-primary-btn" onClick={saveSettings}>Save Settings</button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeSection === "cms" && (
            <section className="admin-panel">
              <SectionHeader title="CMS Pages" breadcrumb="Dashboard . CMS Pages" actions={<button type="button" className="admin-clear-btn" onClick={resetCmsDraft}>New Page</button>} />
              <div className="admin-form-split">
                <div className="admin-table-wrap compact">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Slug</th>
                        <th>Title</th>
                        <th>Status</th>
                        <th>Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCmsPages.map((item) => (
                        <tr key={item.slug} className={selectedCmsSlug === item.slug ? "admin-row-active" : ""} onClick={() => selectCmsPage(item.slug)}>
                          <td>{item.slug}</td>
                          <td>{item.title}</td>
                          <td><StatusChip value={item.is_published ? "active" : "inactive"} /></td>
                          <td>{formatRelativeDate(item.updated_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="admin-form-card">
                  <label>Slug</label>
                  <input className="admin-input" value={cmsDraft.slug} onChange={(event) => setCmsDraft((prev) => ({ ...prev, slug: event.target.value }))} />
                  <label>Title</label>
                  <input className="admin-input" value={cmsDraft.title} onChange={(event) => setCmsDraft((prev) => ({ ...prev, title: event.target.value }))} />
                  <label>Excerpt</label>
                  <input className="admin-input" value={cmsDraft.excerpt} onChange={(event) => setCmsDraft((prev) => ({ ...prev, excerpt: event.target.value }))} />
                  <label>Content</label>
                  <textarea className="admin-textarea" rows={12} value={cmsDraft.content} onChange={(event) => setCmsDraft((prev) => ({ ...prev, content: event.target.value }))} />
                  <div className="admin-toggle-row admin-toggle-row-card">
                    <span>Published</span>
                    <button type="button" className={`admin-toggle ${cmsDraft.is_published ? "active" : ""}`} onClick={() => setCmsDraft((prev) => ({ ...prev, is_published: !prev.is_published }))}><span /></button>
                  </div>
                  <div className="admin-inline-actions">
                    <button type="button" className="admin-primary-btn" onClick={saveCmsPage}>Save Page</button>
                    {selectedCmsSlug ? <button type="button" className="admin-clear-btn" onClick={() => deleteCmsPage(selectedCmsSlug)}>Delete Page</button> : null}
                    {cmsDraft.slug ? <button type="button" className="admin-clear-btn" onClick={() => router.push(`/cms/${cmsDraft.slug}`)}>Open Public Page</button> : null}
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeSection === "profile" && (
            <section className="admin-panel">
              <SectionHeader title="Profile" breadcrumb="Dashboard . Profile" />
              <div className="admin-profile-shell">
                <div className="admin-profile-card admin-profile-card-hero">
                  <MiniAvatar image={profileDraft.profile_image || me?.profile_image} text={me?.full_name || me?.username || "A"} />
                  <div className="admin-profile-meta">
                    <h3>{me?.full_name || me?.username || "Admin User"}</h3>
                    <p>{me?.email || ""}</p>
                    <div className="admin-inline-meta">
                      <span>Role: Admin</span>
                      <span>Followers: {me?.followers_count || 0}</span>
                      <span>Following: {me?.following_count || 0}</span>
                    </div>
                  </div>
                </div>
                <div className="admin-tab-row">
                  <button type="button" className={`admin-profile-tab ${profileTab === "edit-profile" ? "active" : ""}`} onClick={() => setProfileTab("edit-profile")}>Edit Profile</button>
                  <button type="button" className={`admin-profile-tab ${profileTab === "change-password" ? "active" : ""}`} onClick={() => setProfileTab("change-password")}>Change Password</button>
                </div>
                {profileTab === "edit-profile" ? (
                  <div className="admin-form-card">
                    <div className="admin-field-grid two-col">
                      <div>
                        <label>First Name</label>
                        <input className="admin-input" value={profileDraft.first_name} onChange={(event) => setProfileDraft((prev) => ({ ...prev, first_name: event.target.value }))} />
                      </div>
                      <div>
                        <label>Last Name</label>
                        <input className="admin-input" value={profileDraft.last_name} onChange={(event) => setProfileDraft((prev) => ({ ...prev, last_name: event.target.value }))} />
                      </div>
                      <div>
                        <label>Email</label>
                        <input className="admin-input" value={profileDraft.email} disabled readOnly />
                      </div>
                      <div>
                        <label>Mobile Number</label>
                        <input className="admin-input" value={profileDraft.phone} onChange={(event) => setProfileDraft((prev) => ({ ...prev, phone: event.target.value }))} />
                      </div>
                      <div>
                        <label>Date Of Birth</label>
                        <input type="date" className="admin-input" value={profileDraft.date_of_birth} onChange={(event) => setProfileDraft((prev) => ({ ...prev, date_of_birth: event.target.value }))} />
                      </div>
                      <div>
                        <label>Preferred Language</label>
                        <input className="admin-input" value={profileDraft.preferred_language} onChange={(event) => setProfileDraft((prev) => ({ ...prev, preferred_language: event.target.value }))} />
                      </div>
                      <div>
                        <label>Country</label>
                        <input className="admin-input" value={profileDraft.country} onChange={(event) => setProfileDraft((prev) => ({ ...prev, country: event.target.value }))} />
                      </div>
                      <div>
                        <label>Profile Image URL</label>
                        <input className="admin-input" value={profileDraft.profile_image} onChange={(event) => setProfileDraft((prev) => ({ ...prev, profile_image: event.target.value }))} />
                      </div>
                    </div>
                    <div className="admin-radio-row">
                      <span>Gender</span>
                      {["male", "female", "other"].map((value) => (
                        <label key={value} className="admin-radio-pill">
                          <input type="radio" name="profile-gender" checked={profileDraft.gender === value} onChange={() => setProfileDraft((prev) => ({ ...prev, gender: value }))} />
                          {value}
                        </label>
                      ))}
                    </div>
                    <div className="admin-inline-actions">
                      <button type="button" className="admin-primary-btn admin-profile-submit" onClick={saveProfile}>Submit</button>
                    </div>
                  </div>
                ) : (
                  <div className="admin-form-card">
                    <div className="admin-field-grid two-col">
                      <div>
                        <label>Current Password</label>
                        <input type="password" className="admin-input" value={passwordDraft.current_password} onChange={(event) => setPasswordDraft((prev) => ({ ...prev, current_password: event.target.value }))} placeholder="Enter current password" />
                      </div>
                      <div>
                        <label>New Password</label>
                        <input type="password" className="admin-input" value={passwordDraft.new_password} onChange={(event) => setPasswordDraft((prev) => ({ ...prev, new_password: event.target.value }))} placeholder="Enter new password" />
                      </div>
                      <div>
                        <label>Confirm Password</label>
                        <input type="password" className="admin-input" value={passwordDraft.confirm_password} onChange={(event) => setPasswordDraft((prev) => ({ ...prev, confirm_password: event.target.value }))} placeholder="Confirm new password" />
                      </div>
                    </div>
                    <div className="admin-inline-actions">
                      <button type="button" className="admin-primary-btn admin-profile-submit" onClick={changePassword}>Submit</button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {activeSection === "debug" && (
            <div className="admin-debug-grid">
              <section className="admin-panel">
                <SectionHeader title="Last 10 user_activity inserts" breadcrumb="Dashboard . Admin Debug" />
                <div className="admin-debug-list">
                  {(panelData.debug?.last_activity || []).map((item, index) => (
                    <div key={`${item.user_id}-${index}`} className="admin-debug-card">
                      <strong>{item.action_type}</strong>
                      <span>User: {item.user_id}</span>
                      <span>Story: {item.post_id}</span>
                      <span>Read Time: {item.read_time || 0}s</span>
                      <span>Scroll: {item.scroll_depth || 0}%</span>
                      <span>{formatRelativeDate(item.created_at)}</span>
                    </div>
                  ))}
                </div>
              </section>
              <section className="admin-panel">
                <SectionHeader title="Live recommendation cache keys" breadcrumb="Dashboard . Admin Debug" />
                <div className="admin-debug-list">
                  {(panelData.debug?.cache_keys || []).map((item) => (
                    <div key={item} className="admin-debug-card mono">{item}</div>
                  ))}
                  {(panelData.debug?.cache_keys || []).length === 0 && <div className="admin-debug-card">No recommendation cache keys yet.</div>}
                </div>
              </section>
              <section className="admin-panel">
                <SectionHeader title="Per-story live views from DB" breadcrumb="Dashboard . Admin Debug" />
                <div className="admin-debug-list">
                  {(panelData.debug?.per_story_views || []).map((item) => (
                    <div key={item.story_id} className="admin-debug-card">
                      <strong>{item.title}</strong>
                      <span>{item.views} views</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </section>

        <div className="admin-message-bar">{message}</div>
      </div>
    </main>
  );
}