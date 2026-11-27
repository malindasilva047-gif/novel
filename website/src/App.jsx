import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import Header from "./components/Header";
import Footer from "./components/Footer";
import HomePageCTA from "./components/HomePageCTA";
import ToastViewport from "./components/ToastViewport";
import SiteChrome from "./components/SiteChrome";
import YouMayAlsoLike from "./components/YouMayAlsoLike";
import { getMe, guestLogin, setToken, getToken, clearToken, revokeCurrentSession, initializeWebSession } from "./api";
import { isGuestUser, setGuestSession } from "./utils/guest";
import RequireAuth from "./components/RequireAuth";

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

  // Every page change starts at the top of the document (nav links, cards, browser back).
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    const frame = window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
    return () => window.cancelAnimationFrame(frame);
  }, [path]);
  const readingFocus = /^\/stories\/\d+\/chapters\/\d+$/.test(path);
  const writingFocus = /^\/(?:write|edit)\/\d+$/.test(path) || /^\/write\/stories\/\d+$/.test(path);
  const focusWorkspace = readingFocus || writingFocus;
  const guestLanding = isGuestUser(user) && path === "/"
    && !new URLSearchParams(location.search).get("q")?.trim();
  const authPage = path === "/login";
  const showSiteChrome = !focusWorkspace;
  const searchingHome = path === "/"
    && Boolean(new URLSearchParams(location.search).get("q")?.trim());
  const minimalHome = path === "/" && !searchingHome;
  const currentStoryId = path.match(/^\/stories\/(\d+)/)?.[1];
  const storyReviewsFocus = /^\/stories\/\d+\/reviews$/.test(path);
  const storyReviewForm = /^\/stories\/\d+\/review$/.test(path);
  const recommendationsExcluded = path === "/" || path === "/discover" || path === "/login" || path === "/profile" || path === "/library" || path === "/community" || path === "/notifications" || path === "/contests" || path.startsWith("/write") || path.startsWith("/manage-stories") || path.startsWith("/account") || path.startsWith("/authors/") || path.startsWith("/tags/") || path.startsWith("/genres/") || path === "/subscription" || /^\/stories\/\d+$/.test(path) || storyReviewsFocus;

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
    setGuestSession(isGuestUser(user));
  }, [user]);

  useEffect(() => {
    document.body.classList.toggle("focus-workspace", focusWorkspace);
    document.body.classList.toggle("guest-landing-mode", guestLanding);
    document.body.classList.toggle("login-page-mode", authPage);
    document.documentElement.classList.toggle("guest-landing-mode", guestLanding);
    return () => {
      document.body.classList.remove("focus-workspace", "guest-landing-mode", "login-page-mode");
      document.documentElement.classList.remove("guest-landing-mode");
    };
  }, [focusWorkspace, guestLanding, authPage]);

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
      {!focusWorkspace && !authPage && <Header user={user} onLogout={handleLogout} onAuthSuccess={handleLoginSuccess} />}
      <main className={`main${guestLanding ? " main--guest-landing" : ""}`}>
        {bootLoading ? (
          <div className="page-loading">Loading…</div>
        ) : (
          <>
            {showSiteChrome && !authPage && !searchingHome && !minimalHome && <SiteChrome pathname={path} />}
            <Suspense fallback={<div className="page-loading" role="status">Loading page…</div>}>
              <Routes>
                <Route path="/" element={<HomePage user={user} />} />
                <Route path="/discover" element={<Navigate to="/" replace />} />
                <Route path="/genres/Stories" element={<Navigate to="/" replace />} />
                <Route path="/genres/:genre" element={<GenrePage />} />
                <Route path="/tags/*" element={<TagPage user={user} />} />
                <Route path="/stories/:id" element={<StoryPage user={user} />} />
                <Route path="/stories/:id/review" element={<RequireAuth user={user}><ReviewPage user={user} /></RequireAuth>} />
                <Route path="/stories/:id/reviews" element={<ReviewsPage user={user} />} />
                <Route path="/stories/:id/chapters/:chapterId" element={<RequireAuth user={user}><ChapterPage user={user} /></RequireAuth>} />
                <Route path="/authors/:authorId" element={<AuthorPage user={user} />} />
                <Route path="/library" element={<RequireAuth user={user}><LibraryPage user={user} /></RequireAuth>} />
                <Route path="/write" element={<RequireAuth user={user}><WritePage user={user} /></RequireAuth>} />
                <Route path="/write/analytics" element={<RequireAuth user={user}><WriterAnalyticsPage user={user} /></RequireAuth>} />
                <Route path="/write/new" element={<RequireAuth user={user}><StoryDetailsPage user={user} /></RequireAuth>} />
                <Route path="/write/:storyId" element={<RequireAuth user={user}><StoryEditorPage user={user} /></RequireAuth>} />
                <Route path="/edit/:storyId" element={<RequireAuth user={user}><StoryEditorPage user={user} /></RequireAuth>} />
                <Route path="/write/stories/:storyId" element={<RequireAuth user={user}><StoryEditorPage user={user} /></RequireAuth>} />
                <Route path="/manage-stories" element={<RequireAuth user={user}><ManageStoriesPage user={user} /></RequireAuth>} />
                <Route path="/login" element={<LoginPage onSuccess={handleLoginSuccess} />} />
                <Route
                  path="/profile"
                  element={
                    <RequireAuth user={user}>
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
                    </RequireAuth>
                  }
                />
                <Route path="/notifications" element={<RequireAuth user={user}><NotificationsPage user={user} /></RequireAuth>} />
                <Route path="/account" element={<RequireAuth user={user}><AccountPage user={user} onLogout={handleLogout} /></RequireAuth>} />
                <Route path="/account/help" element={<AccountHelp />} />
                <Route path="/account/contact" element={<AccountContact user={user} />} />
                <Route path="/account/stats" element={<RequireAuth user={user}><AccountStats user={user} /></RequireAuth>} />
                <Route path="/account/notifications" element={<RequireAuth user={user}><AccountNotifications /></RequireAuth>} />
                <Route path="/account/language" element={<RequireAuth user={user}><AccountLanguage /></RequireAuth>} />
                <Route path="/account/genres" element={<RequireAuth user={user}><AccountGenres /></RequireAuth>} />
                <Route path="/account/warnings" element={<RequireAuth user={user}><AccountWarnings /></RequireAuth>} />
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
      {/* The reader keeps the page focused on the chapter, so no browse shelf there. */}
      {!bootLoading && !recommendationsExcluded && !readingFocus ? <YouMayAlsoLike excludeId={currentStoryId} title={storyReviewForm ? "Browse stories" : "Recommended for your next read"} /> : null}
      {!bootLoading && minimalHome && !guestLanding ? <HomePageCTA /> : null}
      {!bootLoading && !focusWorkspace && !authPage && <Footer user={user} />}
    </div>
  );
}
