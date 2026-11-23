import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import Header from "./components/Header";
import Footer from "./components/Footer";
import HomePageCTA from "./components/HomePageCTA";
import ToastViewport from "./components/ToastViewport";
import SiteChrome from "./components/SiteChrome";
import YouMayAlsoLike from "./components/YouMayAlsoLike";
import { getMe, guestLogin, setToken, getToken, clearToken, revokeCurrentSession, initializeWebSession } from "./api";
import { isGuestUser } from "./utils/guest";

const HomePage = lazy(() => import("./pages/HomePage"));
const AudiobooksPage = lazy(() => import("./pages/AudiobooksPage"));
const ContestsPage = lazy(() => import("./pages/ContestsPage"));
const CommunityPage = lazy(() => import("./pages/CommunityPage"));
const SubscriptionPage = lazy(() => import("./pages/SubscriptionPage"));
const StoryPage = lazy(() => import("./pages/StoryPage"));
const ChapterPage = lazy(() => import("./pages/ChapterPage"));
const LibraryPage = lazy(() => import("./pages/LibraryPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const WritePage = lazy(() => import("./pages/WritePage"));
const WriterAnalyticsPage = lazy(() => import("./pages/WriterAnalyticsPage"));
const StoryDetailsPage = lazy(() => import("./pages/StoryDetailsPage"));
const StoryEditorPage = lazy(() => import("./pages/StoryEditorPage"));
const ManageStoriesPage = lazy(() => import("./pages/ManageStoriesPage"));
const GenrePage = lazy(() => import("./pages/GenrePage"));
const TagPage = lazy(() => import("./pages/TagPage"));
const AuthorPage = lazy(() => import("./pages/AuthorPage"));
const ReviewPage = lazy(() => import("./pages/ReviewPage"));
const ReviewsPage = lazy(() => import("./pages/ReviewsPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const AccountPage = lazy(() => import("./pages/AccountPage").then((module) => ({ default: module.default })));
const AccountHelp = lazy(() => import("./pages/AccountPage").then((module) => ({ default: module.AccountHelp })));
const AccountContact = lazy(() => import("./pages/AccountPage").then((module) => ({ default: module.AccountContact })));
const AccountStats = lazy(() => import("./pages/AccountPage").then((module) => ({ default: module.AccountStats })));
const AccountNotifications = lazy(() => import("./pages/AccountPage").then((module) => ({ default: module.AccountNotifications })));
const AccountGenres = lazy(() => import("./pages/AccountPage").then((module) => ({ default: module.AccountGenres })));
const AccountWarnings = lazy(() => import("./pages/AccountPage").then((module) => ({ default: module.AccountWarnings })));
const AccountLegal = lazy(() => import("./pages/AccountPage").then((module) => ({ default: module.AccountLegal })));
const AccountLanguage = lazy(() => import("./pages/AccountPage").then((module) => ({ default: module.AccountLanguage })));

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [bootLoading, setBootLoading] = useState(true);
  const [profileSetupRequired, setProfileSetupRequired] = useState(false);
  const cursorAuraRef = useRef(null);
  const path = location.pathname;
  const readingFocus = /^\/stories\/\d+\/chapters\/\d+$/.test(path);
  const writingFocus = /^\/(?:write|edit)\/\d+$/.test(path) || /^\/write\/stories\/\d+$/.test(path);
  const focusWorkspace = readingFocus || writingFocus;
  const guestLanding = isGuestUser(user) && path === "/"
    && !new URLSearchParams(location.search).get("q")?.trim();
  const showSiteChrome = !focusWorkspace;
  const searchingHome = path === "/"
    && Boolean(new URLSearchParams(location.search).get("q")?.trim());
  const minimalHome = path === "/" && !searchingHome;
  const currentStoryId = path.match(/^\/stories\/(\d+)/)?.[1];
  const storyReviewsFocus = /^\/stories\/\d+\/reviews$/.test(path);
  const storyReviewForm = /^\/stories\/\d+\/review$/.test(path);
  const recommendationsExcluded = path === "/" || path === "/discover" || path === "/login" || path === "/profile" || path === "/library" || path === "/community" || path === "/notifications" || path.startsWith("/write") || path.startsWith("/manage-stories") || path.startsWith("/account") || path.startsWith("/tags/") || path.startsWith("/genres/") || path === "/subscription" || /^\/stories\/\d+$/.test(path) || storyReviewsFocus;

  useEffect(() => {
    const aura = cursorAuraRef.current;
    if (!aura || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return undefined;

    let frame = 0;
    let x = 0;
    let y = 0;
    const moveAura = (event) => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      x = event.clientX;
      y = event.clientY;
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        aura.style.left = `${x}px`;
        aura.style.top = `${y}px`;
        aura.style.opacity = "1";
        frame = 0;
      });
    };
    const hideAura = () => { aura.style.opacity = "0"; };
    window.addEventListener("pointermove", moveAura, { passive: true });
    window.addEventListener("pointerleave", hideAura);
    window.addEventListener("blur", hideAura);

    return () => {
      window.removeEventListener("pointermove", moveAura);
      window.removeEventListener("pointerleave", hideAura);
      window.removeEventListener("blur", hideAura);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const refreshUser = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      return null;
    }
    try {
      const me = await getMe();
      setUser(me);
      const pendingUserId = sessionStorage.getItem("novelhub_profile_setup_user");
      const userId = String(me?.user_id || me?.id || "");
      if (pendingUserId && pendingUserId === userId && !me?.profile_complete) {
        setProfileSetupRequired(true);
      } else if (me?.profile_complete && pendingUserId === userId) {
        sessionStorage.removeItem("novelhub_profile_setup_user");
        setProfileSetupRequired(false);
      }
      return me;
    } catch (e) {
      // 401/403 = bad or revoked token — clear and allow guest re-login
      const status = e?.status;
      if (status === 401 || status === 403 || !status) {
        clearToken();
      }
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await initializeWebSession();
        let token = getToken();
        if (token) {
          const me = await refreshUser();
          if (me) {
            setBootLoading(false);
            return;
          }
        }
        try {
          const g = await guestLogin();
          const t = g?.cookie_session ? "cookie-session" : (g?.access_token || g?.token);
          if (t) {
            setToken(t);
            await refreshUser();
          }
        } catch {
          /* guest optional if backend down */
        }
      } finally {
        setBootLoading(false);
      }
    })();
  }, [refreshUser]);

  useEffect(() => {
    document.body.classList.toggle("focus-workspace", focusWorkspace);
    document.body.classList.toggle("guest-landing-mode", guestLanding);
    return () => {
      document.body.classList.remove("focus-workspace", "guest-landing-mode");
    };
  }, [focusWorkspace, guestLanding]);

  async function handleLogout() {
    try {
      if (getToken()) await revokeCurrentSession();
    } catch {
      // Local logout must still complete when the API is temporarily unavailable.
    } finally {
      clearToken();
      setUser(null);
      setProfileSetupRequired(false);
      sessionStorage.removeItem("novelhub_profile_setup_user");
    }
  }

  async function handleLoginSuccess(token, authResult) {
    if (token) setToken(token);
    const authUserId = String(authResult?.id || authResult?.user_id || "");
    if (authResult?.is_new_user && authUserId) {
      sessionStorage.setItem("novelhub_profile_setup_user", authUserId);
      setProfileSetupRequired(true);
    } else {
      sessionStorage.removeItem("novelhub_profile_setup_user");
      setProfileSetupRequired(false);
    }
    await refreshUser();
    if (authResult?.is_new_user) {
      navigate("/profile?setup=1", { replace: true });
    }
  }



  return (
    <div className="app-shell">
      <div ref={cursorAuraRef} className="site-cursor-aura" aria-hidden="true" />
      <ToastViewport />
      {!focusWorkspace && !guestLanding && <Header user={user} onLogout={handleLogout} onAuthSuccess={handleLoginSuccess} />}
      <main className={`main${guestLanding ? " main--guest-landing" : ""}`}>
        {bootLoading ? (
          <div className="page-loading">Loading…</div>
        ) : (
          <>
            {showSiteChrome && !searchingHome && !minimalHome && <SiteChrome pathname={path} />}
            <Suspense fallback={<div className="page-loading" role="status">Loading page…</div>}>
              <Routes>
                <Route path="/" element={<HomePage user={user} />} />
                <Route path="/discover" element={<Navigate to="/" replace />} />
                <Route path="/genres/Stories" element={<Navigate to="/" replace />} />
                <Route path="/genres/:genre" element={<GenrePage />} />
                <Route path="/tags/*" element={<TagPage user={user} />} />
                <Route path="/stories/:id" element={<StoryPage user={user} />} />
                <Route path="/stories/:id/review" element={<ReviewPage user={user} />} />
                <Route path="/stories/:id/reviews" element={<ReviewsPage user={user} />} />
                <Route path="/stories/:id/chapters/:chapterId" element={<ChapterPage user={user} />} />
                <Route path="/authors/:authorId" element={<AuthorPage user={user} />} />
                <Route path="/library" element={<LibraryPage user={user} />} />
                <Route path="/write" element={<WritePage user={user} />} />
                <Route path="/write/analytics" element={<WriterAnalyticsPage user={user} />} />
                <Route path="/write/new" element={<StoryDetailsPage user={user} />} />
                <Route path="/write/:storyId" element={<StoryEditorPage user={user} />} />
                <Route path="/edit/:storyId" element={<StoryEditorPage user={user} />} />
                <Route path="/write/stories/:storyId" element={<StoryEditorPage user={user} />} />
                <Route path="/manage-stories" element={<ManageStoriesPage user={user} />} />
                <Route path="/login" element={<LoginPage onSuccess={handleLoginSuccess} />} />
                <Route
                  path="/profile"
                  element={
                    <ProfilePage
                      user={user}
                      onLogout={handleLogout}
                      setupRequired={profileSetupRequired}
                      onProfileComplete={() => {
                        sessionStorage.removeItem("novelhub_profile_setup_user");
                        setProfileSetupRequired(false);
                        navigate("/", { replace: true });
                      }}
                    />
                  }
                />
                <Route path="/notifications" element={<NotificationsPage user={user} />} />
                <Route path="/account" element={<AccountPage user={user} onLogout={handleLogout} />} />
                <Route path="/account/help" element={<AccountHelp />} />
                <Route path="/account/contact" element={<AccountContact user={user} />} />
                <Route path="/account/stats" element={<AccountStats user={user} />} />
                <Route path="/account/notifications" element={<AccountNotifications />} />
                <Route path="/account/language" element={<AccountLanguage />} />
                <Route path="/account/genres" element={<AccountGenres />} />
                <Route path="/account/warnings" element={<AccountWarnings />} />
                <Route path="/account/terms" element={<AccountLegal kind="terms" />} />
                <Route path="/account/privacy" element={<AccountLegal kind="privacy" />} />
                <Route path="/account/cookies" element={<AccountLegal kind="cookies" />} />

                <Route path="/audiobooks" element={<AudiobooksPage />} />
                <Route path="/galatea" element={<Navigate to="/genres/Stories" replace />} />
                <Route path="/contests" element={<ContestsPage user={user} />} />
                <Route path="/subscription" element={<SubscriptionPage user={user} />} />
                <Route path="/community" element={<CommunityPage user={user} />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </>
        )}
      </main>
      {!bootLoading && !recommendationsExcluded ? <YouMayAlsoLike excludeId={currentStoryId} title={readingFocus || storyReviewForm ? "Browse stories" : "Recommended for your next read"} compact={readingFocus} /> : null}
      {!bootLoading && minimalHome && !guestLanding ? <HomePageCTA /> : null}
      {!bootLoading && !guestLanding && <Footer />}
    </div>
  );
}
