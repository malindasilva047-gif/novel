import 'dart:async';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../data/models/app_bootstrap.dart';
import '../../data/services/api_service.dart';
import '../../data/services/auth_service.dart';
import '../../data/services/local_notification_service.dart';
import '../../data/services/firebase_push_service.dart';
import 'discover_screen.dart';
import 'library_screen.dart';
import 'login_screen.dart';
import 'signup_screen.dart';
import 'onboarding_profile_screen.dart';
import 'more_screen.dart';
import 'notifications_screen.dart';
import 'write_screen.dart';
import '../../core/theme/app_theme.dart';
import '../widgets/wingsaga_loading_screen.dart';

/// App shell.
///
/// **Read access without login:** Discover (and public story pages) work with no
/// account. Library / Write / Notifications / personal profile require sign-in.
/// Guest sign-in still available for light personalization.
class RootShell extends StatefulWidget {
  const RootShell({super.key});

  @override
  State<RootShell> createState() => _RootShellState();
}

class _RootShellState extends State<RootShell> with WidgetsBindingObserver {
  final ApiService _apiService = ApiService();
  late final AuthService _authService = AuthService(apiService: _apiService);
  int _selectedIndex = 1; // Discover after successful login
  AppBootstrap? _bootstrap;
  List<BookCardModel> _recommendations = const [];
  bool _loading = true;
  bool _initializing = true;
  bool _openingHome = false;
  String _contentVersion = '';
  Timer? _syncTimer;
  Timer? _notificationTimer;
  bool _pollingContentVersion = false;
  bool _refreshingNotificationCount = false;
  AuthSession? _session;
  int _authGeneration = 0;
  int _unreadNotificationCount = 0;
  bool _handlingAuthFailure = false;
  // Every fresh app launch starts at Login. Existing sessions are validated in
  // the background but do not bypass the explicit sign-in screen.
  bool _showLoginOverlay = true;

  bool get _isAuthenticated => _session != null && !_session!.isGuest;
  bool get _isGuestSession => _session != null && _session!.isGuest;

  Future<void> _restoreWriteTabFromPrefs() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final openDrafts = prefs.getBool('write_open_drafts') ?? false;
      final openSubmitted = prefs.getBool('write_open_submitted') ?? false;
      if (!openDrafts && !openSubmitted) return;
      if (!mounted) return;
      setState(() {
        _selectedIndex = 2;
      });
      await prefs.setBool('write_open_drafts', false);
      await prefs.setBool('write_open_submitted', false);
    } catch (_) {}
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _apiService.onSessionRejected = _handleRejectedSession;
    unawaited(_initializePushNotifications());
    _bootstrapApp();
    unawaited(_restoreWriteTabFromPrefs());
    // The API is hosted on a serverless backend; polling more often than this
    // can overlap slow DB requests and leave screens stuck behind pending work.
    _syncTimer = Timer.periodic(const Duration(minutes: 2), (_) {
      unawaited(_pollContentVersion());
    });
    _notificationTimer = Timer.periodic(const Duration(seconds: 15), (_) {
      unawaited(_refreshNotificationCount());
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _syncTimer?.cancel();
    _notificationTimer?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      if (_isAuthenticated) unawaited(_initializePushNotifications());
      _syncTimer ??= Timer.periodic(const Duration(minutes: 2), (_) {
        unawaited(_pollContentVersion());
      });
      _notificationTimer ??= Timer.periodic(const Duration(seconds: 15), (_) {
        unawaited(_refreshNotificationCount());
      });
      unawaited(_pollContentVersion());
      unawaited(_refreshNotificationCount());
      unawaited(_restoreWriteTabFromPrefs());
    } else {
      _syncTimer?.cancel();
      _syncTimer = null;
      _notificationTimer?.cancel();
      _notificationTimer = null;
    }
  }

  Future<void> _initializePushNotifications() async {
    try {
      await FirebasePushService.instance.initialize(_apiService);
    } catch (error, stackTrace) {
      debugPrint('Could not initialize Wingsaga push notifications: $error');
      debugPrintStack(stackTrace: stackTrace);
    }
  }

  Future<void> _bootstrapApp() async {
    // Ignore an older restore result if the user signs in or signs out while
    // startup validation is still waiting on the backend.
    final restoreGeneration = _authGeneration;
    // Restore the local catalog before waiting on network authentication. A
    // slow /api/me must not keep an already-used app behind a spinner.
    try {
      final disk = await _apiService.loadDiskBootstrap();
      if (disk != null &&
          mounted &&
          (disk.discoverBooks.isNotEmpty || disk.recentlyUpdated.isNotEmpty)) {
        setState(() {
          _bootstrap = disk;
          _loading = false;
        });
      }
    } catch (_) {}

    // The home feed is public; fetch it while the saved session is restored.
    // This lets the first useful screen appear without serial network waits.
    final bootstrapFuture = _loadBootstrap(showLoading: _bootstrap == null);
    try {
      final restoredSession = await _authService.restoreSession();
      if (mounted && restoreGeneration == _authGeneration) {
        setState(() {
          _session = restoredSession;
          _showLoginOverlay = restoredSession == null;
          _initializing = false;
        });
        if (restoredSession != null && !restoredSession.isGuest) {
          unawaited(_initializePushNotifications());
          unawaited(
            _apiService.fetchUserPreferences().catchError((error) {
              debugPrint('Could not prefetch user preferences: $error');
              return <String, dynamic>{};
            }),
          );
        }
        unawaited(_refreshNotificationCount());
      }
    } catch (_) {
      if (mounted && restoreGeneration == _authGeneration) {
        setState(() {
          _session = null;
          _showLoginOverlay = true;
          _initializing = false;
        });
      }
    }
    await bootstrapFuture;
  }

  Future<void> _loadBootstrap({bool showLoading = true}) async {
    final isFirst = _bootstrap == null;
    // Only full-screen spinner on the very first load — never while data exists
    if (mounted && showLoading && isFirst && _bootstrap == null) {
      setState(() => _loading = true);
    }
    try {
      // These are independent requests. Don't keep the home screen waiting for
      // recommendation/version requests after the main catalog has arrived.
      final versionFuture = _apiService.fetchContentVersion();
      final recommendationsFuture = _apiService.fetchRecommendations();
      final bootstrap = await _apiService.fetchBootstrap();
      if (!mounted) return;
      // Never replace a full home with an empty shell
      final hasData =
          bootstrap.discoverBooks.isNotEmpty ||
          bootstrap.recentlyUpdated.isNotEmpty;
      setState(() {
        if (hasData || _bootstrap == null) {
          _bootstrap = bootstrap;
        }
        _loading = false;
      });
      unawaited(
        versionFuture.then((version) {
          if (mounted && version.isNotEmpty) {
            setState(() => _contentVersion = version);
          }
        }),
      );
      unawaited(
        recommendationsFuture.then((recommendations) {
          if (mounted && recommendations.isNotEmpty) {
            setState(() => _recommendations = recommendations);
          }
        }),
      );
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _pollContentVersion() async {
    if (_pollingContentVersion || _loading || _bootstrap == null) return;
    _pollingContentVersion = true;
    try {
      final latestVersion = await _apiService.fetchContentVersion();
      if (!mounted ||
          latestVersion.isEmpty ||
          latestVersion == _contentVersion) {
        return;
      }
      await _loadBootstrap(showLoading: false);
    } catch (error) {
      debugPrint('Could not check content updates: $error');
    } finally {
      _pollingContentVersion = false;
    }
  }

  String get _notificationStorageKey {
    final session = _session;
    final identity = session?.id?.toString() ?? session?.email ?? 'account';
    // v2 clears IDs saved by the earlier first-run behavior, which incorrectly
    // treated every existing review/comment/follow as already read.
    return 'notifications_seen_ids_v2_$identity';
  }

  String get _phoneNotificationStorageKey {
    final session = _session;
    final identity = session?.id?.toString() ?? session?.email ?? 'account';
    return 'phone_notifications_seen_ids_v1_$identity';
  }

  Future<void> _refreshNotificationCount() async {
    if (!_isAuthenticated) {
      if (mounted && _unreadNotificationCount != 0) {
        setState(() => _unreadNotificationCount = 0);
      }
      return;
    }

    if (_refreshingNotificationCount) return;
    _refreshingNotificationCount = true;

    try {
      final notifications = await _apiService.fetchNotifications();
      final ids = notifications
          .map((item) => item['id']?.toString() ?? '')
          .where((id) => id.isNotEmpty)
          .toSet();
      final prefs = await SharedPreferences.getInstance();
      final seen = prefs.getStringList(_notificationStorageKey);
      final phoneSeen = prefs.getStringList(_phoneNotificationStorageKey);
      if (seen == null) {
        // Treat existing activity as unread on first use so authors see their
        // review, comment, and new-follower count on the bell immediately.
        await prefs.setStringList(_notificationStorageKey, const []);
      }
      final deliveredPhoneIds = phoneSeen?.toSet() ?? <String>{};
      final newNotifications = phoneSeen == null
          ? notifications.take(3).toList()
          : notifications
                .where(
                  (item) =>
                      (item['id']?.toString() ?? '').isNotEmpty &&
                      !deliveredPhoneIds.contains(item['id'].toString()),
                )
                .toList();
      if (newNotifications.isNotEmpty) {
        var systemAlertsEnabled = true;
        try {
          final settings = await _apiService.fetchUserPreferences();
          final notificationSettings =
              (settings['notifications'] as Map?)?.cast<String, dynamic>() ??
              const <String, dynamic>{};
          systemAlertsEnabled = notificationSettings['system'] != false;
        } catch (error) {
          debugPrint('Could not check the system notification setting: $error');
        }
        if (!systemAlertsEnabled) {
          deliveredPhoneIds.addAll(
            newNotifications
                .map((item) => item['id']?.toString() ?? '')
                .where((id) => id.isNotEmpty),
          );
        } else {
          final permission = await LocalNotificationService.instance
              .requestPermission();
          if (permission) {
            for (final item in newNotifications) {
              final id = item['id']?.toString() ?? '';
              if (id.isEmpty) continue;
              final title = (item['title'] ?? item['actor_name'] ?? 'Wingsaga')
                  .toString()
                  .trim();
              final body = (item['message'] ?? 'You have new activity.')
                  .toString()
                  .trim();
              try {
                await LocalNotificationService.instance.show(
                  id: int.tryParse(id) ?? (id.hashCode & 0x7fffffff),
                  title: title.isEmpty ? 'Wingsaga' : title,
                  body: body.isEmpty ? 'You have new activity.' : body,
                );
                deliveredPhoneIds.add(id);
              } catch (error) {
                debugPrint('Could not display phone notification: $error');
              }
            }
          }
        }
      }
      final updatedPhoneIds = deliveredPhoneIds.toList();
      if (updatedPhoneIds.length != (phoneSeen?.length ?? 0)) {
        await prefs.setStringList(
          _phoneNotificationStorageKey,
          updatedPhoneIds.length > 500
              ? updatedPhoneIds.sublist(updatedPhoneIds.length - 500)
              : updatedPhoneIds,
        );
      }
      final unreadIds = ids.difference((seen ?? const <String>[]).toSet());
      if (mounted) {
        setState(() => _unreadNotificationCount = unreadIds.length);
      }
    } catch (error) {
      debugPrint('Could not refresh notification count: $error');
    } finally {
      _refreshingNotificationCount = false;
    }
  }

  Future<void> _markNotificationsSeen() async {
    if (!_isAuthenticated) return;
    try {
      final notifications = await _apiService.fetchNotifications();
      final ids = notifications
          .map((item) => item['id']?.toString() ?? '')
          .where((id) => id.isNotEmpty)
          .toSet();
      final prefs = await SharedPreferences.getInstance();
      final seen = prefs.getStringList(_notificationStorageKey) ?? const [];
      await prefs.setStringList(
        _notificationStorageKey,
        {...seen, ...ids}.toList(),
      );
      if (mounted) setState(() => _unreadNotificationCount = 0);
    } catch (error) {
      debugPrint('Could not mark notifications as seen: $error');
    }
  }

  Future<void> _continueLogin(
    String method, {
    String? email,
    String? password,
    String? mode,
    String? displayName,
    String? username,
  }) async {
    final loginGeneration = ++_authGeneration;
    try {
      final AuthSession session;
      if (method == 'google') {
        session = await _authService.signInWithGoogle();
      } else if (method == 'facebook') {
        session = await _authService.signInWithFacebook();
      } else if (method == 'email') {
        session = await _authService.signInWithEmail(
          email ?? username ?? '',
          password: password ?? '',
          mode: mode ?? 'login',
          displayName: displayName,
        );
      } else {
        session = await _authService.signInAsGuest();
      }
      if (!mounted || loginGeneration != _authGeneration) return;
      setState(() {
        _session = session;
      });
      if (!session.isGuest) {
        unawaited(_initializePushNotifications());
        unawaited(
          _apiService.fetchUserPreferences().catchError((error) {
            debugPrint('Could not prefetch user preferences: $error');
            return <String, dynamic>{};
          }),
        );
      }
      unawaited(_refreshNotificationCount());
      // First-time users only: complete profile BEFORE Discover (cannot skip).
      // Never again from More / Profile.
      // The profile gate is for first-time Google accounts only. Existing
      // users must never be sent back to onboarding because profile_complete
      // is missing or stale in their database row.
      if ((session.isGoogle || session.isFacebook) && session.isNewUser) {
        final completed = await _showOnboardingBlocking(session);
        if (!mounted || loginGeneration != _authGeneration) return;
        if (!completed) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Please complete your profile to continue'),
            ),
          );
          return;
        }
      }
      if (!mounted || loginGeneration != _authGeneration) return;
      setState(() {
        _showLoginOverlay = false;
        _openingHome = true;
      });
      // Keep the branded handoff visible briefly so the transition from sign-in
      // to Discover feels intentional even when the catalog is already cached.
      await Future<void>.delayed(const Duration(milliseconds: 650));
      if (!mounted || loginGeneration != _authGeneration) return;
      setState(() => _openingHome = false);
      // Persist "done" so Profile / More / next app open never re-open the form
      // after the user has already landed on home.
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            session.accountStatusMessage?.trim().isNotEmpty == true
                ? session.accountStatusMessage!
                : (session.isGoogle || session.isFacebook)
                ? 'Signed in as ${session.displayName}'
                : session.isGuest
                ? 'Continuing as guest (device-limited session)'
                : 'Signed in with ${session.email}',
          ),
        ),
      );
    } on AuthBlockedException catch (e) {
      if (!mounted || loginGeneration != _authGeneration) return;
      setState(() {
        _session = null;
        _showLoginOverlay = true;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.message),
          backgroundColor: Colors.red.shade700,
          duration: const Duration(seconds: 5),
        ),
      );
    } catch (e) {
      if (!mounted || loginGeneration != _authGeneration) return;
      final msg = e.toString().replaceFirst(RegExp(r'^Exception:\s*'), '');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(msg),
          backgroundColor:
              msg.toLowerCase().contains('banned') ||
                  msg.toLowerCase().contains('suspended')
              ? Colors.red.shade700
              : null,
          duration: const Duration(seconds: 5),
        ),
      );
    }
  }

  Widget _notificationNavIcon(IconData icon) {
    return SizedBox(
      width: 36,
      height: 32,
      child: Stack(
        clipBehavior: Clip.none,
        alignment: Alignment.center,
        children: [
          Icon(icon),
          if (_unreadNotificationCount > 0)
            Positioned(
              right: 0,
              top: 0,
              child: Container(
                constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                decoration: const BoxDecoration(
                  color: Color(0xFFE53935),
                  shape: BoxShape.circle,
                ),
                alignment: Alignment.center,
                child: Text(
                  _unreadNotificationCount > 99
                      ? '99+'
                      : '$_unreadNotificationCount',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  bool _isProfileCompleteFlag(dynamic completeRaw) {
    return completeRaw == true ||
        completeRaw == 1 ||
        completeRaw == '1' ||
        completeRaw == 'true' ||
        completeRaw == 'True';
  }

  String _profileDoneKey(AuthSession session) {
    // Prefer stable email so key does not change when server id arrives later
    final em = session.email.trim().toLowerCase();
    if (em.isNotEmpty) return 'profile_complete_local_$em';
    final id = session.id?.toString() ?? 'unknown';
    return 'profile_complete_local_$id';
  }

  Future<bool> _showOnboardingBlocking(AuthSession session) async {
    try {
      final me = await _apiService.fetchMe();
      if (_isProfileCompleteFlag(me['profile_complete'])) {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setBool(_profileDoneKey(session), true);
        await prefs.setBool('profile_complete_local_done', true);
        return true;
      }
      final name = (me['display_name'] ?? '').toString().trim();
      final display = name.isNotEmpty && name.toLowerCase() != 'reader'
          ? name
          : session.displayName.toString().trim();
      final photo =
          (me['photo_url'] ?? me['avatar_url'] ?? session.photoUrl ?? '')
              .toString();
      if (!mounted) return false;
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          fullscreenDialog: true,
          builder: (_) => PopScope(
            canPop: false,
            child: OnboardingProfileScreen(
              apiService: _apiService,
              initialDisplayName: display.toLowerCase() == 'reader'
                  ? ''
                  : display,
              initialPhotoUrl: photo,
              initialEmail: session.email,
              onDone: () {
                if (Navigator.of(context).canPop()) {
                  Navigator.of(context).pop();
                }
              },
            ),
          ),
        ),
      );
      try {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setBool(_profileDoneKey(session), true);
        await prefs.setBool('profile_complete_local_done', true);
        final em = (session.email).trim().toLowerCase();
        if (em.isNotEmpty) {
          await prefs.setBool('profile_complete_local_$em', true);
        }
      } catch (_) {}
      return true;
    } catch (_) {}
    return false;
  }

  Future<void> _signOut() async {
    _authGeneration++;
    await FirebasePushService.instance.unregisterCurrentToken();
    await _authService.signOut();
    if (!mounted) return;
    setState(() {
      _session = null;
      _selectedIndex = 1;
      _showLoginOverlay = true;
    });
    await _loadBootstrap();
  }

  Future<void> _updateProfilePhoto(String photoUrl) async {
    await _authService.updateProfilePhoto(photoUrl);
    if (!mounted || _session == null) return;
    setState(() => _session = _session!.copyWith(photoUrl: photoUrl));
  }

  Future<void> _handleRejectedSession(String message) async {
    if (_handlingAuthFailure || _session == null) return;
    _handlingAuthFailure = true;
    try {
      await FirebasePushService.instance.unregisterCurrentToken();
      await _authService.signOut();
    } catch (_) {
      _apiService.setAuthToken(null);
    }
    if (!mounted) {
      _handlingAuthFailure = false;
      return;
    }
    setState(() {
      _session = null;
      _selectedIndex = 1;
      _showLoginOverlay = true;
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          message.isEmpty
              ? 'Your session ended. Please sign in again.'
              : message,
        ),
      ),
    );
    _handlingAuthFailure = false;
  }

  void _requireAuth({int? afterLoginIndex}) {
    setState(() {
      _showLoginOverlay = true;
      if (afterLoginIndex != null) _selectedIndex = afterLoginIndex;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_initializing || _openingHome) {
      return const WingsagaLoadingScreen();
    }
    // Do not wait for bootstrap before showing Login. Public data can continue
    // loading behind the login screen and will be ready after sign-in.
    if (_showLoginOverlay && !_isAuthenticated) {
      return LoginScreen(
        onContinue: _continueLogin,
        onSkipAsReader: () {
          _continueLogin('guest');
        },
        onOpenSignUp: () {
          Navigator.of(context).push(
            MaterialPageRoute<void>(
              builder: (_) => SignUpScreen(
                apiService: _apiService,
                onContinue: _continueLogin,
              ),
            ),
          );
        },
      );
    }

    if (_loading || _bootstrap == null) {
      return const WingsagaLoadingScreen();
    }

    if (_bootstrap == null) {
      return Scaffold(
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Unable to load stories. Check connection.'),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: _loadBootstrap,
                child: const Text('Retry'),
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => _requireAuth(),
                child: const Text('Sign in'),
              ),
            ],
          ),
        ),
      );
    }

    final pages = <Widget>[
      // Library — requires auth
      _isAuthenticated
          ? LibraryScreen(
              data: _bootstrap!,
              apiService: _apiService,
              onOpenDiscover: () => setState(() => _selectedIndex = 1),
            )
          : _AuthGate(
              title: 'Your Library',
              message:
                  'Sign in to see Current Reads, History, and Reading Lists. You can still browse Discover without an account.',
              onSignIn: () => _requireAuth(afterLoginIndex: 0),
              onBrowse: () => setState(() => _selectedIndex = 1),
            ),
      DiscoverScreen(
        data: _bootstrap!,
        recommendedBooks: _recommendations,
        apiService: _apiService,
        onRefresh: () => _loadBootstrap(showLoading: false),
      ),
      // Write — requires auth
      _isAuthenticated
          ? WriteScreen(data: _bootstrap!, apiService: _apiService)
          : _AuthGate(
              title: 'Write',
              message: 'Sign in to create and manage your stories.',
              onSignIn: () => _requireAuth(afterLoginIndex: 2),
              onBrowse: () => setState(() => _selectedIndex = 1),
            ),
      _isAuthenticated
          ? NotificationsScreen(
              data: _bootstrap!,
              apiService: _apiService,
              onOpenDiscover: () => setState(() => _selectedIndex = 1),
            )
          : _AuthGate(
              title: 'Notifications',
              message: 'Sign in to receive updates about stories you follow.',
              onSignIn: () => _requireAuth(afterLoginIndex: 3),
              onBrowse: () => setState(() => _selectedIndex = 1),
            ),
      _isAuthenticated
          ? MoreScreen(
              data: _bootstrap!,
              apiService: _apiService,
              onSignOut: _signOut,
              onRefresh: () => _loadBootstrap(showLoading: false),
              session: _session!,
              onProfilePhotoChanged: _updateProfilePhoto,
            )
          : _AuthGate(
              title: 'Account',
              message: 'Sign in for profile, settings, and saved progress.',
              onSignIn: () => _requireAuth(afterLoginIndex: 4),
              onBrowse: () => setState(() => _selectedIndex = 1),
            ),
    ];

    // IndexedStack keeps Discover/Library state alive when switching tabs
    // (fixes empty Discover after leaving a story/comments).
    return Scaffold(
      body: SafeArea(
        child: IndexedStack(index: _selectedIndex, children: pages),
      ),
      bottomNavigationBar: NavigationBar(
        backgroundColor: Theme.of(context).brightness == Brightness.dark
            ? AppTheme.darkCard
            : Colors.white,
        surfaceTintColor: Colors.transparent,
        indicatorColor: AppTheme.brand.withValues(alpha: 0.14),
        elevation: 0,
        shadowColor: Colors.transparent,
        height: 70,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysHide,
        selectedIndex: _selectedIndex,
        onDestinationSelected: (value) {
          // Guests and logged-out users: Discover only; other tabs need real account
          if (!_isAuthenticated && value != 1) {
            if (_isGuestSession) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text(
                    'Guest can only read books. Sign in to use this feature.',
                  ),
                ),
              );
            }
            _requireAuth(afterLoginIndex: value);
            return;
          }
          if (value == 3) unawaited(_markNotificationsSeen());
          setState(() => _selectedIndex = value);
        },
        destinations: [
          NavigationDestination(
            icon: Icon(Icons.menu_book_outlined),
            selectedIcon: Icon(Icons.menu_book),
            label: 'Library',
          ),
          const NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home_rounded),
            label: 'Home',
          ),
          const NavigationDestination(
            icon: Icon(Icons.edit_outlined),
            selectedIcon: Icon(Icons.edit),
            label: 'Write',
          ),
          NavigationDestination(
            icon: _notificationNavIcon(Icons.notifications_none_outlined),
            selectedIcon: _notificationNavIcon(Icons.notifications),
            label: 'Notifications',
          ),
          const NavigationDestination(
            icon: Icon(Icons.menu_rounded),
            selectedIcon: Icon(Icons.menu),
            label: 'More',
          ),
        ],
      ),
    );
  }
}

class _AuthGate extends StatelessWidget {
  const _AuthGate({
    required this.title,
    required this.message,
    required this.onSignIn,
    required this.onBrowse,
  });

  final String title;
  final String message;
  final VoidCallback onSignIn;
  final VoidCallback onBrowse;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.lock_outline, size: 48, color: Colors.grey.shade400),
            const SizedBox(height: 16),
            Text(
              title,
              style: Theme.of(
                context,
              ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 10),
            Text(
              message,
              textAlign: TextAlign.center,
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: Colors.grey.shade600),
            ),
            const SizedBox(height: 24),
            FilledButton(onPressed: onSignIn, child: const Text('Sign in')),
            TextButton(
              onPressed: onBrowse,
              child: const Text('Continue reading on Discover'),
            ),
          ],
        ),
      ),
    );
  }
}
