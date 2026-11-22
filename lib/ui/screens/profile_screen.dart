import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import 'package:flutter/gestures.dart';
import 'package:image_picker/image_picker.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/constants/responsive.dart';
import '../../data/models/app_bootstrap.dart';
import '../../data/services/api_service.dart';
import '../widgets/app_notice.dart';
import '../widgets/image_adjustment.dart';
import 'story_detail_screen.dart';

enum _ProfileMoreAction {
  share,
  profileSettings,
  logOut,
  toggleBlock,
  reportUser,
}

/// Galatea-style profile: cover, identity, stories first, then About and activity tabs.
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({
    super.key,
    required this.profile,
    required this.apiService,
    required this.achievements,
    this.viewingUserId,
    this.onSignOut,
    this.onProfilePhotoChanged,
  });

  final ProfileModel profile;
  final ApiService apiService;
  final List<AchievementGroupModel> achievements;
  final int? viewingUserId;
  final Future<void> Function()? onSignOut;
  final Future<void> Function(String photoUrl)? onProfilePhotoChanged;

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen>
    with SingleTickerProviderStateMixin {
  static const List<String> _profileGenders = [
    'Female',
    'Male',
    'Non-binary',
    'Prefer not to say',
  ];
  static const List<String> _profileCountries = [
    'Sri Lanka',
    'India',
    'United States',
    'United Kingdom',
    'Canada',
    'Australia',
    'Singapore',
    'Malaysia',
    'United Arab Emirates',
    'Germany',
    'France',
    'Japan',
    'Other',
  ];

  final ImagePicker _imagePicker = ImagePicker();
  late TabController _tabController;

  Map<String, dynamic>? _userProfile;
  bool _loadingProfile = true;
  bool _isFollowing = false;
  bool _followBusy = false;
  bool _authorNotificationsEnabled = false;
  bool _notificationBusy = false;
  bool _isOwnProfile = true;
  bool _isBlocked = false;
  bool _bioExpanded = false;
  final Set<int> _savedStoryIds = <int>{};
  final Map<int, int> _savedItemIds = <int, int>{};
  final Map<int, int> _savedListIds = <int, int>{};

  List<Map<String, dynamic>> _stories = const [];
  List<Map<String, dynamic>> _wall = const [];
  List<Map<String, dynamic>> _reviews = const [];
  List<Map<String, dynamic>> _readingLists = const [];
  List<Map<String, dynamic>> _activity = const [];
  String _storyQuery = '';
  String _storySort = 'Recently Updated';
  String _storyFilter = 'All stories';

  Color get brand => AppTheme.brand;
  Color get muted => AppTheme.mutedOf(context);
  Color get cardBg => AppTheme.surfaceOf(context);
  Color get border => AppTheme.borderOf(context);

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 5, vsync: this);
    _isOwnProfile = widget.viewingUserId == null;
    _userProfile = {
      'id': widget.profile.id,
      'display_name': widget.profile.displayName,
      'username': widget.profile.username,
      'photo_url': widget.profile.photoUrl,
      'cover_url': widget.profile.coverUrl,
      'following': widget.profile.following,
      'followers': widget.profile.followers,
      'chapters_read': widget.profile.chaptersRead,
      'social_karma': widget.profile.socialKarma,
      'day_streak': widget.profile.dayStreak,
      'bio': widget.profile.bio,
      'gender': widget.profile.gender,
      'birth_date': widget.profile.birthDate,
      'country': widget.profile.country,
      'facebook_url': widget.profile.facebookUrl,
      'youtube_url': widget.profile.youtubeUrl,
      'instagram_url': widget.profile.instagramUrl,
      'twitter_url': widget.profile.twitterUrl,
      'is_author': widget.profile.isAuthor,
    };
    _loadingProfile = false;
    _loadAll();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadAll({bool forceRefresh = false}) async {
    if (mounted && _userProfile == null) {
      setState(() => _loadingProfile = true);
    }
    try {
      // Render the known session identity even if a secondary profile request
      // is slow on a free-tier database.
      final viewId = widget.viewingUserId;
      final initialTargetId = viewId ?? widget.profile.id ?? 0;
      // A supplied ProfileModel describes the person being viewed, not the
      // signed-in user. Only an absent viewingUserId means "my profile" here;
      // when one is supplied, compare it with /api/me below.
      final initialIsOwnProfile = viewId == null;

      Future<List<dynamic>> loadProfileContent(int targetId, bool isOwn) {
        return Future.wait<dynamic>([
          (isOwn
                  ? widget.apiService.fetchWriterStories()
                  : widget.apiService.fetchUserStories(targetId))
              .catchError((_) => <Map<String, dynamic>>[]),
          widget.apiService
              .fetchUserWall(targetId)
              .catchError((_) => <Map<String, dynamic>>[]),
          (isOwn
                  ? widget.apiService.fetchMyReviews()
                  : widget.apiService.fetchUserReviews(targetId))
              .catchError((_) => <Map<String, dynamic>>[]),
          (isOwn
                  ? widget.apiService.fetchReadingLists()
                  : widget.apiService.fetchUserReadingLists(targetId))
              .catchError((_) => <Map<String, dynamic>>[]),
          (isOwn
                  ? widget.apiService.fetchMyActivity()
                  : widget.apiService.fetchUserActivity(targetId))
              .catchError((_) => <Map<String, dynamic>>[]),
        ]);
      }

      final earlyContentFuture = initialTargetId > 0
          ? loadProfileContent(initialTargetId, initialIsOwnProfile)
          : null;
      final viewedProfileFuture = viewId == null
          ? null
          : (forceRefresh
                    ? widget.apiService.refreshProfile(viewId)
                    : widget.apiService.fetchProfile(viewId))
                .timeout(const Duration(seconds: 12))
                .catchError((_) => <String, dynamic>{});
      final me =
          await (forceRefresh
                  ? widget.apiService.refreshMe()
                  : widget.apiService.fetchMe())
              .timeout(const Duration(seconds: 8))
              .catchError((_) => <String, dynamic>{});
      final meId = _asInt(me['id'] ?? me['user_id']);
      _isOwnProfile = viewId == null || (meId != 0 && viewId == meId);

      final int targetId = _isOwnProfile
          ? (meId != 0 ? meId : (widget.profile.id ?? 0))
          : (viewId ?? 0);

      if (_isOwnProfile) {
        if (me.isNotEmpty) {
          _userProfile = {
            ...me,
            'display_name': _firstNonEmpty([
              me['display_name'],
              me['name'],
              widget.profile.displayName,
            ]),
            'photo_url': _firstNonEmpty([
              me['photo_url'],
              me['avatar_url'],
              widget.profile.photoUrl,
            ]),
            'cover_url': _firstNonEmpty([
              me['cover_url'],
              me['coverUrl'],
              me['banner_url'],
              me['cover_path'],
              widget.profile.coverUrl,
            ]),
            'bio': _firstNonEmpty([me['bio'], me['about'], widget.profile.bio]),
            'gender': _firstNonEmpty([me['gender'], widget.profile.gender]),
            'birth_date': _firstNonEmpty([
              me['birth_date'],
              me['birthday'],
              widget.profile.birthDate,
            ]),
            'country': _firstNonEmpty([me['country'], widget.profile.country]),
            'username': _firstNonEmpty([
              me['username'],
              me['user_name'],
              widget.profile.username,
            ]),
          };
        } else {
          _userProfile = {
            'id': widget.profile.id,
            'display_name': widget.profile.displayName,
            'username': widget.profile.username,
            'following': widget.profile.following,
            'followers': widget.profile.followers,
            'chapters_read': widget.profile.chaptersRead,
            'social_karma': widget.profile.socialKarma,
            'day_streak': widget.profile.dayStreak,
            'photo_url': widget.profile.photoUrl,
            'cover_url': widget.profile.coverUrl,
            'bio': widget.profile.bio,
            'gender': widget.profile.gender,
            'birth_date': widget.profile.birthDate,
            'country': widget.profile.country,
            'facebook_url': widget.profile.facebookUrl,
            'youtube_url': widget.profile.youtubeUrl,
            'instagram_url': widget.profile.instagramUrl,
            'twitter_url': widget.profile.twitterUrl,
          };
        }
      } else {
        // These requests are independent. Starting them together avoids
        // making profile load wait through three sequential VPS round trips.
        final publicProfileFuture =
            viewedProfileFuture ??
            widget.apiService
                .fetchProfile(targetId)
                .timeout(const Duration(seconds: 12));
        final blockStatusFuture = widget.apiService
            .fetchBlockStatus(targetId)
            .catchError((_) => false);
        final followStatusFuture = widget.apiService
            .fetchAuthorFollowStatus(targetId)
            .catchError((_) => <String, dynamic>{});
        final publicProfile = await publicProfileFuture;
        _userProfile = {
          ...publicProfile,
          'display_name': _firstNonEmpty([
            publicProfile['display_name'],
            publicProfile['name'],
          ]),
          'username': _firstNonEmpty([
            publicProfile['username'],
            publicProfile['user_name'],
          ]),
          'photo_url': _firstNonEmpty([
            publicProfile['photo_url'],
            publicProfile['avatar_url'],
            publicProfile['photoUrl'],
            publicProfile['avatar'],
          ]),
          'cover_url': _firstNonEmpty([
            publicProfile['cover_url'],
            publicProfile['coverUrl'],
            publicProfile['banner_url'],
            publicProfile['bannerUrl'],
            publicProfile['cover_path'],
          ]),
          'bio': _firstNonEmpty([publicProfile['bio'], publicProfile['about']]),
          'gender': _firstNonEmpty([publicProfile['gender']]),
          'birth_date': _firstNonEmpty([
            publicProfile['birth_date'],
            publicProfile['birthday'],
            publicProfile['birthDate'],
          ]),
          'country': _firstNonEmpty([publicProfile['country']]),
        };
        _isBlocked = await blockStatusFuture;
        final followStatus = await followStatusFuture;
        _isFollowing = followStatus['following'] == true;
        _authorNotificationsEnabled =
            followStatus['notifications_enabled'] == true;
      }

      // The profile endpoints already include follower/following counts.
      // Avoid fetching both full user lists just to calculate those counts;
      // those endpoints are only needed when the user opens the lists.
      if (!mounted) return;
      setState(() => _loadingProfile = false);
      if (!_isOwnProfile && _isBlocked) {
        setState(() {
          _stories = const [];
          _wall = const [];
          _reviews = const [];
          _readingLists = const [];
          _activity = const [];
          _loadingProfile = false;
        });
        return;
      }

      // Always load from backend — never use bootstrap fake lists/stories
      List stories = const [];
      List wall = const [];
      List reviews = const [];
      List<Map<String, dynamic>> lists = const [];
      List activity = const [];

      if (targetId > 0) {
        final results =
            initialTargetId == targetId &&
                initialIsOwnProfile == _isOwnProfile &&
                earlyContentFuture != null
            ? await earlyContentFuture
            : await loadProfileContent(targetId, _isOwnProfile);
        final fetchedStories = List<Map<String, dynamic>>.from(
          results[0] as List,
        );
        // The public user-stories endpoint already limits results to stories
        // with public status or at least one published chapter. The parent
        // story can still say "Draft" when chapter status is authoritative;
        // filtering that response again here hid valid books from other authors.
        stories = _isOwnProfile
            ? fetchedStories.where(_isPublicStory).toList()
            : fetchedStories;
        wall = List<Map<String, dynamic>>.from(results[1] as List);
        reviews = List<Map<String, dynamic>>.from(results[2] as List);
        lists = List<Map<String, dynamic>>.from(results[3] as List);
        activity = List<Map<String, dynamic>>.from(results[4] as List);
      }

      if (!mounted) return;
      setState(() {
        _stories = stories.cast<Map<String, dynamic>>();
        _wall = wall.cast<Map<String, dynamic>>();
        _reviews = reviews.cast<Map<String, dynamic>>();
        _readingLists = lists.cast<Map<String, dynamic>>();
        _activity = activity.cast<Map<String, dynamic>>();
        _loadingProfile = false;
      });
      unawaited(_loadSavedStoryState(lists));
    } catch (e) {
      if (!mounted) return;
      setState(() => _loadingProfile = false);
    }
  }

  String _s(dynamic v) => v == null ? '' : '$v'.trim();

  String _firstNonEmpty(Iterable<dynamic> values) {
    for (final value in values) {
      final text = _s(value);
      if (text.isNotEmpty) return text;
    }
    return '';
  }

  int _asInt(dynamic v) {
    if (v is int) return v;
    if (v is num) return v.toInt();
    return int.tryParse('$v') ?? 0;
  }

  bool _isPublicStory(Map<String, dynamic> story) {
    final status = _s(story['status_text'] ?? story['status']).toLowerCase();
    if (status.isEmpty ||
        status.startsWith('draft') ||
        status.startsWith('unpublish') ||
        {'private', 'unlisted', 'hidden'}.contains(status)) {
      return false;
    }
    // Some older/imported public books store a label such as "45m ago" in
    // status_text. The public profile API already excludes private stories and
    // includes stories with live chapters, so do not hide those books here.
    return true;
  }

  bool get _isAuthor =>
      (_userProfile?['is_author'] as bool?) ?? widget.profile.isAuthor;

  String get _displayName {
    final n = _s(_userProfile?['display_name']);
    if (n.isNotEmpty) return n;
    if (widget.profile.displayName.trim().isNotEmpty) {
      return widget.profile.displayName;
    }
    return widget.profile.username;
  }

  String get _username {
    final u = _firstNonEmpty([
      _userProfile?['username'],
      _userProfile?['user_name'],
      widget.profile.username,
    ]);
    if (u.isNotEmpty) return u.replaceAll('@', '');
    return '';
  }

  String get _bio {
    return _firstNonEmpty([_userProfile?['bio'], widget.profile.bio]);
  }

  String get _facebookUrl {
    return _s(
      _userProfile?['facebook_url'] ??
          _userProfile?['facebook'] ??
          _userProfile?['fb_url'],
    );
  }

  String get _youtubeUrl =>
      _s(_userProfile?['youtube_url'] ?? widget.profile.youtubeUrl);
  String get _instagramUrl =>
      _s(_userProfile?['instagram_url'] ?? widget.profile.instagramUrl);
  String get _twitterUrl =>
      _s(_userProfile?['twitter_url'] ?? widget.profile.twitterUrl);

  String _normalizeSocialUrl(String input) {
    final value = input.trim();
    if (value.isEmpty ||
        value.startsWith('https://') ||
        value.startsWith('http://')) {
      return value;
    }
    return 'https://$value';
  }

  List<Map<String, Object>> get _socialLinks => [
    if (_youtubeUrl.isNotEmpty)
      {
        'label': 'YouTube',
        'url': _youtubeUrl,
        'icon': Icons.smart_display_outlined,
        'color': const Color(0xFFFF0000),
      },
    if (_facebookUrl.isNotEmpty)
      {
        'label': 'Facebook',
        'url': _facebookUrl,
        'icon': Icons.facebook,
        'color': const Color(0xFF1877F2),
      },
    if (_instagramUrl.isNotEmpty)
      {
        'label': 'Instagram',
        'url': _instagramUrl,
        'icon': Icons.camera_alt_outlined,
        'color': const Color(0xFFC13584),
      },
    if (_twitterUrl.isNotEmpty)
      {
        'label': 'X',
        'url': _twitterUrl,
        'icon': Icons.close,
        'color': AppTheme.brand,
      },
  ];

  Future<void> _loadSavedStoryState(
    List<Map<String, dynamic>> readingLists,
  ) async {
    if (!_isOwnProfile) return;
    try {
      final saved = <int>{};
      final itemIds = <int, int>{};
      final listItems = await Future.wait(
        readingLists.map((list) async {
          final listId = _asInt(list['id']);
          if (listId <= 0) return <Map<String, dynamic>>[];
          final items = await widget.apiService.fetchReadingListItems(listId);
          return items
              .map((item) => <String, dynamic>{...item, '_list_id': listId})
              .toList();
        }),
      );
      for (final items in listItems) {
        for (final item in items) {
          final listId = _asInt(item['_list_id']);
          final bookId = _asInt(item['book_id'] ?? item['book']?['id']);
          final itemId = _asInt(item['id']);
          if (bookId > 0) {
            saved.add(bookId);
            if (itemId > 0) itemIds[bookId] = itemId;
            _savedListIds[bookId] = listId;
          }
        }
      }
      if (!mounted) return;
      setState(() {
        _savedStoryIds
          ..clear()
          ..addAll(saved);
        _savedItemIds
          ..clear()
          ..addAll(itemIds);
      });
    } catch (_) {}
  }

  List<Map<String, dynamic>> get _nonEmptyReadingLists => _readingLists
      .where((list) {
        final rawCount = list['story_count'] ?? list['count'];
        if (rawCount != null) return _asInt(rawCount) > 0;
        final items = list['items'];
        return items is List && items.isNotEmpty;
      })
      .toList(growable: false);

  int get _following =>
      _asInt(_userProfile?['following'] ?? widget.profile.following);
  int get _followers =>
      _asInt(_userProfile?['followers'] ?? widget.profile.followers);

  Future<void> _openPeopleList({required bool following}) async {
    final profileId = _asInt(
      _userProfile?['id'] ?? widget.viewingUserId ?? widget.profile.id,
    );
    if (profileId <= 0 && !_isOwnProfile) return;

    final people = _isOwnProfile
        ? (following
              ? await widget.apiService.fetchMyFollowing()
              : await widget.apiService.fetchMyFollowers())
        : (following
              ? await widget.apiService.fetchUserFollowingList(profileId)
              : await widget.apiService.fetchUserFollowers(profileId));
    if (!mounted) return;

    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => _PeopleListScreen(
          title: following ? 'Following' : 'Followers',
          people: people,
          apiService: widget.apiService,
        ),
      ),
    );
  }

  Future<void> _shareProfile() async {
    await Share.share(
      'Check out $_displayName (@$_username) on Wingsaga.',
      subject: 'Wingsaga profile',
    );
  }

  String get _avatarUrl {
    final p = _firstNonEmpty([
      _userProfile?['avatar_url'],
      _userProfile?['photo_url'],
      _userProfile?['photoUrl'],
      _userProfile?['avatar'],
      widget.profile.photoUrl,
    ]);
    if (p.isEmpty) return '';
    return widget.apiService.resolveAssetUrl(p);
  }

  Widget _avatarFallback(double fontSize, Color color) {
    return Text(
      _displayName.isNotEmpty ? _displayName[0].toUpperCase() : '?',
      style: TextStyle(
        fontSize: fontSize,
        fontWeight: FontWeight.w700,
        color: color,
      ),
    );
  }

  String get _coverUrl {
    final p = _firstNonEmpty([
      _userProfile?['cover_url'],
      _userProfile?['coverUrl'],
      _userProfile?['banner_url'],
      _userProfile?['bannerUrl'],
      _userProfile?['cover_path'],
      widget.profile.coverUrl,
    ]);
    if (p.isEmpty) return '';
    return widget.apiService.resolveAssetUrl(p);
  }

  Future<void> _toggleFollow() async {
    if (_followBusy) return;
    final id = _asInt(
      _userProfile?['id'] ?? widget.viewingUserId ?? widget.profile.id,
    );
    if (id <= 0 || _isOwnProfile) return;
    final wasFollowing = _isFollowing;
    setState(() => _followBusy = true);
    try {
      final dynamic res = wasFollowing
          ? await widget.apiService.unfollowAuthor(id)
          : await widget.apiService.followAuthor(id);
      if (!mounted) return;
      int? followers;
      bool? following;
      if (res is Map) {
        followers = (res['followers'] as num?)?.toInt();
        following = res['following'] as bool?;
      }
      setState(() {
        _isFollowing = following ?? !wasFollowing;
        _authorNotificationsEnabled = false;
        if (_userProfile != null) {
          if (followers != null) {
            _userProfile = {..._userProfile!, 'followers': followers};
          } else {
            final cur = _asInt(_userProfile!['followers']);
            _userProfile = {
              ..._userProfile!,
              'followers': _isFollowing ? cur + 1 : (cur > 0 ? cur - 1 : 0),
            };
          }
        }
      });
      showAppNotice(
        context,
        _isFollowing ? 'Following $_displayName' : 'Unfollowed $_displayName',
      );
      if (widget.viewingUserId != null) {
        try {
          final refreshed = await widget.apiService.fetchProfile(
            widget.viewingUserId!,
          );
          if (mounted && refreshed.isNotEmpty) {
            setState(() => _userProfile = {...?_userProfile, ...refreshed});
          }
        } catch (_) {
          if (mounted) {
            showAppNotice(
              context,
              'Follow updated, but profile details could not refresh.',
              type: AppNoticeType.warning,
            );
          }
        }
      }
    } catch (e) {
      if (!mounted) return;
      final msg = e.toString().toLowerCase();
      final text = (msg.contains('timeout') || msg.contains('timed out'))
          ? 'Server busy — tap Follow again'
          : (msg.contains('401') || msg.contains('unauthorized'))
          ? 'Sign in to follow authors'
          : 'Could not update follow';
      showAppNotice(context, text, type: AppNoticeType.error);
    } finally {
      if (mounted) setState(() => _followBusy = false);
    }
  }

  Future<void> _toggleAuthorNotifications() async {
    if (_notificationBusy || !_isFollowing) return;
    final id = _asInt(
      _userProfile?['id'] ?? widget.viewingUserId ?? widget.profile.id,
    );
    if (id <= 0 || _isOwnProfile) return;
    setState(() => _notificationBusy = true);
    try {
      final result = await widget.apiService.setAuthorNotifications(
        id,
        enabled: !_authorNotificationsEnabled,
      );
      if (!mounted) return;
      setState(() {
        _authorNotificationsEnabled = result['notifications_enabled'] == true;
      });
      showAppNotice(
        context,
        _authorNotificationsEnabled
            ? 'Notifications enabled for $_displayName'
            : 'Notifications turned off for $_displayName',
      );
    } catch (e) {
      if (!mounted) return;
      showAppNotice(
        context,
        'Could not update notifications: $e',
        type: AppNoticeType.error,
      );
    } finally {
      if (mounted) setState(() => _notificationBusy = false);
    }
  }

  Future<void> _toggleBlockViewedUser() async {
    final id = _asInt(_userProfile?['id'] ?? widget.viewingUserId);
    if (id <= 0) return;
    final blocking = !_isBlocked;
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(blocking ? 'Block user?' : 'Unblock user?'),
        content: Text(
          blocking
              ? 'You will no longer see $_displayName\'s activity, and they will not be able to interact with you.'
              : '$_displayName will be able to interact with you again.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(blocking ? 'Block' : 'Unblock'),
          ),
        ],
      ),
    );
    if (confirm != true || !mounted) return;
    try {
      if (blocking) {
        await widget.apiService.blockUser(id);
      } else {
        await widget.apiService.unblockUser(id);
      }
      if (mounted) {
        setState(() => _isBlocked = blocking);
        if (blocking) Navigator.of(context).maybePop();
        if (!blocking) {
          // Blocking can leave this profile with stale/empty feature data.
          // Reload every profile section after unblocking so stories and the
          // other interactions available before the block are restored.
          await _loadAll();
        }
        if (mounted) {
          showAppNotice(context, blocking ? 'User blocked' : 'User unblocked');
        }
      }
    } catch (e) {
      if (mounted) {
        showAppNotice(
          context,
          'Could not block user: $e',
          type: AppNoticeType.error,
        );
      }
    }
  }

  Future<void> _reportViewedUser() async {
    final id = _asInt(_userProfile?['id'] ?? widget.viewingUserId);
    if (id <= 0) return;
    final reasonCtrl = TextEditingController();
    final reason = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Report user'),
        content: TextField(
          controller: reasonCtrl,
          maxLines: 3,
          decoration: const InputDecoration(
            hintText: 'Why are you reporting this user?',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, reasonCtrl.text.trim()),
            child: const Text('Report'),
          ),
        ],
      ),
    );
    reasonCtrl.dispose();
    if (reason == null || !mounted) return;
    try {
      await widget.apiService.reportUser(id, reason: reason);
      if (mounted) showAppNotice(context, 'Report submitted. Thank you.');
    } catch (e) {
      if (mounted) {
        showAppNotice(
          context,
          'Could not report user: $e',
          type: AppNoticeType.error,
        );
      }
    }
  }

  Future<void> _showMoreMenu() async {
    TransitionRoute<dynamic>? menuRoute;
    final action = await showModalBottomSheet<_ProfileMoreAction>(
      context: context,
      builder: (ctx) {
        menuRoute = ModalRoute.of(ctx);
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                title: const Text(
                  'Share profile',
                  style: TextStyle(color: Color(0xFF2B6CB0)),
                ),
                onTap: () => Navigator.pop(ctx, _ProfileMoreAction.share),
              ),
              if (_isOwnProfile) ...[
                ListTile(
                  leading: const Icon(Icons.settings_outlined),
                  title: const Text('Profile settings'),
                  onTap: () =>
                      Navigator.pop(ctx, _ProfileMoreAction.profileSettings),
                ),
                ListTile(
                  leading: const Icon(Icons.logout),
                  title: const Text('Log out'),
                  onTap: () => Navigator.pop(ctx, _ProfileMoreAction.logOut),
                ),
              ] else ...[
                ListTile(
                  leading: Icon(_isBlocked ? Icons.lock_open : Icons.block),
                  title: Text(_isBlocked ? 'Unblock user' : 'Block user'),
                  onTap: () =>
                      Navigator.pop(ctx, _ProfileMoreAction.toggleBlock),
                ),
                ListTile(
                  leading: const Icon(Icons.report_outlined),
                  title: const Text('Report user'),
                  onTap: () =>
                      Navigator.pop(ctx, _ProfileMoreAction.reportUser),
                ),
              ],
              ListTile(
                title: const Text('Cancel', textAlign: TextAlign.center),
                onTap: () => Navigator.pop(ctx),
              ),
            ],
          ),
        );
      },
    );
    await menuRoute?.completed;
    if (!mounted || action == null) return;
    switch (action) {
      case _ProfileMoreAction.share:
        await _shareProfile();
      case _ProfileMoreAction.profileSettings:
        await _editProfile();
      case _ProfileMoreAction.logOut:
        await widget.onSignOut?.call();
      case _ProfileMoreAction.toggleBlock:
        await _toggleBlockViewedUser();
      case _ProfileMoreAction.reportUser:
        await _reportViewedUser();
    }
  }

  Future<void> _editProfile() async {
    if (!_isOwnProfile) return;
    final nameCtrl = TextEditingController(text: _displayName);
    final usernameCtrl = TextEditingController(text: _username);
    final passwordCtrl = TextEditingController();
    final bioCtrl = TextEditingController(text: _bio);
    final facebookCtrl = TextEditingController(text: _facebookUrl);
    final youtubeCtrl = TextEditingController(text: _youtubeUrl);
    final instagramCtrl = TextEditingController(text: _instagramUrl);
    final twitterCtrl = TextEditingController(text: _twitterUrl);
    String? gender = _s(_userProfile?['gender']);
    if (gender.isEmpty) gender = null;
    DateTime? birthDate = _parseProfileDate(_userProfile?['birth_date']);
    String? country = _s(_userProfile?['country']);
    if (country.isEmpty) country = null;
    String photoUrl = _s(
      _userProfile?['photo_url'] ?? _userProfile?['avatar_url'],
    );
    String coverUrl = _s(_userProfile?['cover_url']);
    bool uploading = false;
    TransitionRoute<dynamic>? editorRoute;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      constraints: BoxConstraints(
        maxWidth: 680,
        maxHeight: MediaQuery.sizeOf(context).height * 0.9,
      ),
      builder: (ctx) {
        editorRoute = ModalRoute.of(ctx);
        return StatefulBuilder(
          builder: (ctx, setModal) {
            return SafeArea(
              child: Padding(
                padding: EdgeInsets.only(
                  left: 20,
                  right: 20,
                  top: 20,
                  bottom: MediaQuery.of(ctx).viewInsets.bottom + 40,
                ),
                child: SingleChildScrollView(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text(
                        'Profile settings',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: nameCtrl,
                        decoration: const InputDecoration(
                          labelText: 'Display name',
                        ),
                      ),
                      TextField(
                        controller: usernameCtrl,
                        autocorrect: false,
                        enableSuggestions: false,
                        spellCheckConfiguration:
                            const SpellCheckConfiguration.disabled(),
                        decoration: const InputDecoration(
                          labelText: 'Username *',
                          prefixText: '@',
                        ),
                      ),
                      TextField(
                        controller: passwordCtrl,
                        obscureText: true,
                        decoration: const InputDecoration(
                          labelText: 'New password (optional)',
                          helperText:
                              'Set this to enable username and password sign in',
                        ),
                      ),
                      TextField(
                        controller: bioCtrl,
                        maxLines: 3,
                        autocorrect: false,
                        enableSuggestions: false,
                        spellCheckConfiguration:
                            const SpellCheckConfiguration.disabled(),
                        decoration: const InputDecoration(labelText: 'Bio'),
                      ),
                      const SizedBox(height: 18),
                      Text(
                        'Social media links',
                        style: Theme.of(ctx).textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 6),
                      _socialLinkField(
                        label: 'YouTube',
                        icon: Icons.smart_display_outlined,
                        controller: youtubeCtrl,
                        setModal: setModal,
                      ),
                      _socialLinkField(
                        label: 'Facebook',
                        icon: Icons.facebook,
                        controller: facebookCtrl,
                        setModal: setModal,
                      ),
                      _socialLinkField(
                        label: 'Instagram',
                        icon: Icons.camera_alt_outlined,
                        controller: instagramCtrl,
                        setModal: setModal,
                      ),
                      _socialLinkField(
                        label: 'X (Twitter)',
                        icon: Icons.alternate_email,
                        controller: twitterCtrl,
                        setModal: setModal,
                      ),
                      DropdownButtonFormField<String>(
                        initialValue: gender,
                        isExpanded: true,
                        decoration: const InputDecoration(labelText: 'Gender'),
                        items:
                            [
                                  ..._profileGenders,
                                  if (gender != null &&
                                      !_profileGenders.contains(gender))
                                    gender!,
                                ]
                                .map(
                                  (value) => DropdownMenuItem(
                                    value: value,
                                    child: Text(value),
                                  ),
                                )
                                .toList(),
                        onChanged: (value) => setModal(() => gender = value),
                      ),
                      const SizedBox(height: 12),
                      InkWell(
                        borderRadius: BorderRadius.circular(12),
                        onTap: () async {
                          final now = DateTime.now();
                          final picked = await showDatePicker(
                            context: ctx,
                            initialDate:
                                birthDate ??
                                DateTime(now.year - 18, now.month, now.day),
                            firstDate: DateTime(1900),
                            lastDate: now,
                          );
                          if (picked != null) {
                            setModal(() => birthDate = picked);
                          }
                        },
                        child: InputDecorator(
                          decoration: const InputDecoration(
                            labelText: 'Birthday',
                            suffixIcon: Icon(Icons.calendar_month_outlined),
                          ),
                          child: Text(
                            birthDate == null
                                ? 'Select your birthday'
                                : _formatProfileDate(birthDate!),
                            style: TextStyle(
                              color: birthDate == null ? muted : null,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                      DropdownButtonFormField<String>(
                        initialValue: country,
                        isExpanded: true,
                        decoration: const InputDecoration(labelText: 'Country'),
                        items:
                            [
                                  ..._profileCountries,
                                  if (country != null &&
                                      !_profileCountries.contains(country))
                                    country!,
                                ]
                                .map(
                                  (value) => DropdownMenuItem(
                                    value: value,
                                    child: Text(value),
                                  ),
                                )
                                .toList(),
                        onChanged: (value) => setModal(() => country = value),
                      ),
                      const SizedBox(height: 12),
                      LayoutBuilder(
                        builder: (context, constraints) {
                          final buttonWidth = constraints.maxWidth < 360
                              ? constraints.maxWidth
                              : (constraints.maxWidth - 8) / 2;
                          return Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              SizedBox(
                                width: buttonWidth,
                                child: OutlinedButton.icon(
                                  onPressed: uploading
                                      ? null
                                      : () async {
                                          final picked = await _imagePicker
                                              .pickImage(
                                                source: ImageSource.gallery,
                                                maxWidth: 1600,
                                                maxHeight: 1200,
                                                imageQuality: 88,
                                              );
                                          if (!ctx.mounted) return;
                                          if (picked == null) return;
                                          final adjusted =
                                              await showImageAdjustmentDialog(
                                                ctx,
                                                picked,
                                                aspectRatio: 1,
                                                circular: true,
                                              );
                                          if (!ctx.mounted) return;
                                          if (adjusted == null) return;
                                          setModal(() => uploading = true);
                                          try {
                                            final res = await widget.apiService
                                                .uploadUserImage(
                                                  adjusted,
                                                  'profile-photo.png',
                                                );
                                            final path =
                                                (res['path'] ??
                                                        res['photo_url'] ??
                                                        res['url'] ??
                                                        '')
                                                    .toString();
                                            if (path.isNotEmpty) {
                                              if (ctx.mounted) {
                                                setModal(() => photoUrl = path);
                                                showAppNotice(
                                                  ctx,
                                                  'Profile photo updated — tap Save',
                                                );
                                              }
                                            } else if (ctx.mounted) {
                                              showAppNotice(
                                                ctx,
                                                'The server did not return a profile photo path.',
                                                type: AppNoticeType.error,
                                              );
                                            }
                                          } catch (e) {
                                            if (ctx.mounted) {
                                              showAppNotice(
                                                ctx,
                                                'Upload failed: $e',
                                                type: AppNoticeType.error,
                                              );
                                            }
                                          } finally {
                                            if (ctx.mounted) {
                                              setModal(() => uploading = false);
                                            }
                                          }
                                        },
                                  icon: const Icon(Icons.person),
                                  label: Text(
                                    uploading ? 'Uploading…' : 'Profile photo',
                                  ),
                                ),
                              ),
                              SizedBox(
                                width: buttonWidth,
                                child: OutlinedButton.icon(
                                  onPressed: uploading
                                      ? null
                                      : () async {
                                          final picked = await _imagePicker
                                              .pickImage(
                                                source: ImageSource.gallery,
                                                maxWidth: 2000,
                                                maxHeight: 1200,
                                                imageQuality: 88,
                                              );
                                          if (!ctx.mounted) return;
                                          if (picked == null) return;
                                          final adjusted =
                                              await showImageAdjustmentDialog(
                                                ctx,
                                                picked,
                                                aspectRatio: 2.8,
                                              );
                                          if (!ctx.mounted) return;
                                          if (adjusted == null) return;
                                          setModal(() => uploading = true);
                                          try {
                                            final res = await widget.apiService
                                                .uploadUserImage(
                                                  adjusted,
                                                  'profile-cover.png',
                                                );
                                            final path =
                                                (res['path'] ??
                                                        res['cover_url'] ??
                                                        res['photo_url'] ??
                                                        res['url'] ??
                                                        '')
                                                    .toString();
                                            if (path.isNotEmpty) {
                                              if (ctx.mounted) {
                                                setModal(() => coverUrl = path);
                                                showAppNotice(
                                                  ctx,
                                                  'Cover updated — tap Save',
                                                );
                                              }
                                            } else if (ctx.mounted) {
                                              showAppNotice(
                                                ctx,
                                                'The server did not return a cover image path.',
                                                type: AppNoticeType.error,
                                              );
                                            }
                                          } catch (e) {
                                            if (ctx.mounted) {
                                              showAppNotice(
                                                ctx,
                                                'Upload failed: $e',
                                                type: AppNoticeType.error,
                                              );
                                            }
                                          } finally {
                                            if (ctx.mounted) {
                                              setModal(() => uploading = false);
                                            }
                                          }
                                        },
                                  icon: const Icon(Icons.image),
                                  label: const Text('Cover'),
                                ),
                              ),
                            ],
                          );
                        },
                      ),
                      const SizedBox(height: 12),
                      const SizedBox(height: 8),
                      SizedBox(
                        width: double.infinity,
                        height: 48,
                        child: ElevatedButton(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: brand,
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          onPressed: uploading
                              ? null
                              : () async {
                                  final username = usernameCtrl.text
                                      .trim()
                                      .replaceFirst('@', '')
                                      .toLowerCase();
                                  final password = passwordCtrl.text;
                                  if (username.length < 3 ||
                                      username.length > 32 ||
                                      !RegExp(
                                        r'^[a-z0-9_]+$',
                                      ).hasMatch(username)) {
                                    showAppNotice(
                                      ctx,
                                      'Username is required: 3–32 letters, numbers, or underscores',
                                      type: AppNoticeType.error,
                                    );
                                    return;
                                  }
                                  if (password.isNotEmpty &&
                                      !RegExp(
                                        r'^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$',
                                      ).hasMatch(password)) {
                                    showAppNotice(
                                      ctx,
                                      'Password needs 8+ characters, a letter, a number, and a symbol',
                                      type: AppNoticeType.error,
                                    );
                                    return;
                                  }
                                  final usernameChanged =
                                      username != _username.toLowerCase();
                                  if (usernameChanged) {
                                    final previousChanges = _asInt(
                                      _userProfile?['username_change_count'],
                                    );
                                    final nextWait = previousChanges == 0
                                        ? '7 days'
                                        : '30 days';
                                    final confirmed = await showDialog<bool>(
                                      context: context,
                                      builder: (dialogContext) => AlertDialog(
                                        title: const Text('Change username?'),
                                        content: Text(
                                          'After this change, you must wait $nextWait before changing your username again.',
                                        ),
                                        actions: [
                                          TextButton(
                                            onPressed: () => Navigator.pop(
                                              dialogContext,
                                              false,
                                            ),
                                            child: const Text('Cancel'),
                                          ),
                                          FilledButton(
                                            onPressed: () => Navigator.pop(
                                              dialogContext,
                                              true,
                                            ),
                                            child: const Text('Confirm'),
                                          ),
                                        ],
                                      ),
                                    );
                                    if (confirmed != true) return;
                                    await WidgetsBinding.instance.endOfFrame;
                                    if (!mounted || !ctx.mounted) return;
                                  }
                                  setModal(() => uploading = true);
                                  try {
                                    final profilePayload = <String, dynamic>{
                                      'display_name': nameCtrl.text.trim(),
                                      'username': username,
                                      'bio': bioCtrl.text.trim(),
                                      'gender': gender ?? '',
                                      'birth_date': birthDate == null
                                          ? ''
                                          : _formatProfileDate(birthDate!),
                                      'country': country ?? '',
                                      'facebook_url': _normalizeSocialUrl(
                                        facebookCtrl.text,
                                      ),
                                      'youtube_url': _normalizeSocialUrl(
                                        youtubeCtrl.text,
                                      ),
                                      'instagram_url': _normalizeSocialUrl(
                                        instagramCtrl.text,
                                      ),
                                      'twitter_url': _normalizeSocialUrl(
                                        twitterCtrl.text,
                                      ),
                                      // Empty values intentionally clear an image or
                                      // social link when the author removes it.
                                      'photo_url': photoUrl,
                                      'cover_url': coverUrl,
                                    };
                                    Map<String, dynamic> savedProfile;
                                    String? usernameCooldownMessage;
                                    try {
                                      savedProfile = await widget.apiService
                                          .updateMe(profilePayload);
                                    } on ApiRequestException catch (error) {
                                      if (!usernameChanged ||
                                          error.statusCode != 429) {
                                        rethrow;
                                      }
                                      profilePayload.remove('username');
                                      savedProfile = await widget.apiService
                                          .updateMe(profilePayload);
                                      usernameCooldownMessage = error.message;
                                    }
                                    if (password.isNotEmpty) {
                                      await widget.apiService.linkEmailPassword(
                                        email: _s(_userProfile?['email']),
                                        username:
                                            usernameCooldownMessage == null
                                            ? username
                                            : _username,
                                        password: password,
                                      );
                                    }
                                    if (!ctx.mounted) return;
                                    final changedCount = _asInt(
                                      savedProfile['username_change_count'] ??
                                          _userProfile?['username_change_count'],
                                    );
                                    final nextWait = changedCount <= 1
                                        ? 'one week'
                                        : 'one month';
                                    final currentUsername = _username;
                                    final updatedProfile = <String, dynamic>{
                                      ...?_userProfile,
                                      ...profilePayload,
                                      ...savedProfile,
                                      'username':
                                          usernameCooldownMessage == null
                                          ? username
                                          : currentUsername,
                                    };
                                    setState(
                                      () => _userProfile = updatedProfile,
                                    );
                                    final savedPhotoUrl = _firstNonEmpty([
                                      savedProfile['photo_url'],
                                      savedProfile['avatar_url'],
                                      profilePayload['photo_url'],
                                    ]);
                                    if (savedPhotoUrl !=
                                        _s(widget.profile.photoUrl)) {
                                      await widget.onProfilePhotoChanged?.call(
                                        savedPhotoUrl,
                                      );
                                    }
                                    if (!ctx.mounted) return;
                                    FocusScope.of(ctx).unfocus();
                                    setModal(() => uploading = false);
                                    await WidgetsBinding.instance.endOfFrame;
                                    if (ctx.mounted) Navigator.pop(ctx);
                                    await WidgetsBinding.instance.endOfFrame;
                                    if (mounted) {
                                      showAppNotice(
                                        context,
                                        usernameCooldownMessage != null
                                            ? 'Profile details saved, but your username was not changed. $usernameCooldownMessage'
                                            : usernameChanged
                                            ? 'Profile saved. Next time you change your username, you will need to wait $nextWait.'
                                            : 'Profile saved',
                                        type:
                                            usernameCooldownMessage != null ||
                                                usernameChanged
                                            ? AppNoticeType.warning
                                            : AppNoticeType.success,
                                      );
                                    }
                                  } catch (e) {
                                    if (ctx.mounted) {
                                      setModal(() => uploading = false);
                                      showAppNotice(
                                        ctx,
                                        '$e',
                                        type: AppNoticeType.error,
                                      );
                                    }
                                  }
                                },
                          child: uploading
                              ? const SizedBox(
                                  width: 20,
                                  height: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : const Text(
                                  'Save',
                                  style: TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 16,
                                  ),
                                ),
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );
    await editorRoute?.completed;
    nameCtrl.dispose();
    usernameCtrl.dispose();
    passwordCtrl.dispose();
    bioCtrl.dispose();
    facebookCtrl.dispose();
    youtubeCtrl.dispose();
    instagramCtrl.dispose();
    twitterCtrl.dispose();
  }

  DateTime? _parseProfileDate(dynamic raw) {
    final value = _s(raw);
    if (value.isEmpty) return null;
    return DateTime.tryParse(value);
  }

  DateTime? _storyDate(Map<String, dynamic> story, List<String> keys) {
    for (final key in keys) {
      final parsed = _parseProfileDate(story[key]);
      if (parsed != null) return parsed;
    }
    return null;
  }

  int _storyPopularity(Map<String, dynamic> story) {
    final likes = _asInt(
      story['likes_count'] ?? story['like_count'] ?? story['likes'],
    );
    final views = _asInt(
      story['view_count'] ?? story['views_count'] ?? story['views'],
    );
    final reviews = _asInt(
      story['reviews_count'] ?? story['review_count'] ?? story['reviews'],
    );
    return likes * 3 + views + reviews * 2;
  }

  String _formatProfileDate(DateTime date) =>
      '${date.year.toString().padLeft(4, '0')}-'
      '${date.month.toString().padLeft(2, '0')}-'
      '${date.day.toString().padLeft(2, '0')}';

  List<Map<String, dynamic>> get _filteredStories {
    var list = List<Map<String, dynamic>>.from(_stories);
    final q = _storyQuery.toLowerCase();
    if (q.isNotEmpty) {
      list = list.where((s) {
        final title = _s(s['title']).toLowerCase();
        final desc = _s(s['description']).toLowerCase();
        return title.contains(q) || desc.contains(q);
      }).toList();
    }
    bool isCompleted(Map<String, dynamic> s) {
      final st = _s(s['status_text'] ?? s['status']).toLowerCase();
      // Only story-level Completed/Published — not chapter "submitted"
      return st.contains('complete') || st.contains('publish');
    }

    if (_storyFilter == 'Completed') {
      list = list.where(isCompleted).toList();
    } else if (_storyFilter == 'In progress') {
      list = list.where((s) => !isCompleted(s)).toList();
    }
    if (_storySort == 'Popular') {
      list.sort((a, b) {
        final popularity = _storyPopularity(b).compareTo(_storyPopularity(a));
        if (popularity != 0) return popularity;
        final aDate = _storyDate(a, const [
          'updated_at',
          'last_updated_at',
          'created_at',
        ]);
        final bDate = _storyDate(b, const [
          'updated_at',
          'last_updated_at',
          'created_at',
        ]);
        if (aDate == null || bDate == null) return 0;
        return bDate.compareTo(aDate);
      });
    } else if (_storySort == 'Oldest') {
      list.sort((a, b) {
        final aDate = _storyDate(a, const ['created_at', 'published_at']);
        final bDate = _storyDate(b, const ['created_at', 'published_at']);
        if (aDate == null && bDate == null) return 0;
        if (aDate == null) return 1;
        if (bDate == null) return -1;
        return aDate.compareTo(bDate);
      });
    } else {
      // Recently Updated: explicitly sort by the freshest available field.
      list.sort((a, b) {
        final aDate = _storyDate(a, const [
          'updated_at',
          'last_updated_at',
          'modified_at',
          'created_at',
        ]);
        final bDate = _storyDate(b, const [
          'updated_at',
          'last_updated_at',
          'modified_at',
          'created_at',
        ]);
        if (aDate == null && bDate == null) return 0;
        if (aDate == null) return 1;
        if (bDate == null) return -1;
        return bDate.compareTo(aDate);
      });
    }
    return list;
  }

  void _showStorySortSheet() {
    showModalBottomSheet<void>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: SingleChildScrollView(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Text(
                        'Sort by',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const Spacer(),
                      IconButton(
                        icon: const Icon(Icons.close),
                        onPressed: () => Navigator.pop(ctx),
                      ),
                    ],
                  ),
                  const Text(
                    'Sort by',
                    style: TextStyle(fontWeight: FontWeight.w600),
                  ),
                  for (final opt in ['Recently Updated', 'Popular', 'Oldest'])
                    RadioListTile<String>(
                      dense: true,
                      activeColor: brand,
                      title: Text(opt),
                      value: opt,
                      groupValue: _storySort,
                      onChanged: (v) {
                        setState(() => _storySort = v!);
                        Navigator.pop(ctx);
                      },
                    ),
                  const Text(
                    'Filter',
                    style: TextStyle(fontWeight: FontWeight.w600),
                  ),
                  for (final opt in ['All stories', 'Completed', 'In progress'])
                    RadioListTile<String>(
                      dense: true,
                      activeColor: brand,
                      title: Text(opt),
                      value: opt,
                      groupValue: _storyFilter,
                      onChanged: (v) {
                        setState(() => _storyFilter = v!);
                        Navigator.pop(ctx);
                      },
                    ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: _loadingProfile
          ? Center(child: CircularProgressIndicator(color: brand))
          : RefreshIndicator(
              onRefresh: () => _loadAll(forceRefresh: true),
              notificationPredicate: (notification) => notification.depth == 2,
              child: NestedScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                headerSliverBuilder: (context, innerBoxIsScrolled) {
                  return [
                    // Facebook-style: taller cover + avatar drawn ON TOP of cover (higher z-index)
                    // and still visible below the cover edge.
                    SliverAppBar(
                      expandedHeight: AppBreakpoints.isTablet(context)
                          ? 164
                          : 148,
                      pinned: true,
                      backgroundColor: isDark ? AppTheme.bgOf(context) : brand,
                      leading: IconButton(
                        icon: const Icon(Icons.arrow_back, color: Colors.white),
                        onPressed: () => Navigator.of(context).maybePop(),
                      ),
                      actions: [
                        IconButton(
                          icon: const Icon(
                            Icons.more_vert,
                            color: Colors.white,
                          ),
                          onPressed: _showMoreMenu,
                        ),
                      ],
                      // Stack directly (not FlexibleSpaceBar) so clipBehavior: Clip.none
                      // keeps the avatar painted above the cover and slightly below the bar.
                      flexibleSpace: Stack(
                        fit: StackFit.expand,
                        clipBehavior: Clip.none,
                        children: [
                          if (_coverUrl.isNotEmpty)
                            Image.network(
                              _coverUrl,
                              fit: BoxFit.cover,
                              errorBuilder: (context, error, stackTrace) =>
                                  _defaultCover(),
                            )
                          else
                            _defaultCover(),
                          Container(
                            decoration: BoxDecoration(
                              gradient: LinearGradient(
                                begin: Alignment.topCenter,
                                end: Alignment.bottomCenter,
                                colors: [
                                  Colors.black.withValues(alpha: 0.15),
                                  Colors.black.withValues(alpha: 0.45),
                                ],
                              ),
                            ),
                          ),
                          // Avatar sits on the bottom edge of the cover (above cover in z-order)
                          Positioned(
                            left: 0,
                            right: 0,
                            bottom: -44,
                            child: Center(
                              child: Container(
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  border: Border.all(
                                    color: Colors.white,
                                    width: 3,
                                  ),
                                  boxShadow: [
                                    BoxShadow(
                                      color: Colors.black.withValues(
                                        alpha: 0.25,
                                      ),
                                      blurRadius: 10,
                                      offset: const Offset(0, 3),
                                    ),
                                  ],
                                ),
                                child: CircleAvatar(
                                  radius: 48,
                                  backgroundColor: AppTheme.elevatedOf(context),
                                  child: _avatarUrl.isEmpty
                                      ? _avatarFallback(34, muted)
                                      : ClipOval(
                                          child: Image.network(
                                            _avatarUrl,
                                            width: 96,
                                            height: 96,
                                            fit: BoxFit.cover,
                                            errorBuilder: (_, _, _) =>
                                                _avatarFallback(34, muted),
                                          ),
                                        ),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    SliverToBoxAdapter(
                      child: _isBlocked
                          ? _buildBlockedProfileNotice()
                          : _buildIdentityBlock(),
                    ),
                    if (!_isBlocked)
                      SliverPersistentHeader(
                        pinned: true,
                        delegate: _TabBarDelegate(
                          TabBar(
                            controller: _tabController,
                            isScrollable: true,
                            tabAlignment: TabAlignment.start,
                            labelColor: brand,
                            unselectedLabelColor: muted,
                            indicatorColor: brand,
                            indicatorWeight: 3,
                            labelStyle: const TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 14,
                            ),
                            tabs: const [
                              Tab(text: 'Stories'),
                              Tab(text: 'About'),
                              Tab(text: 'Wall'),
                              Tab(text: 'Activity'),
                              Tab(text: 'Reviews'),
                            ],
                          ),
                        ),
                      ),
                  ];
                },
                body: _isBlocked
                    ? const SizedBox.shrink()
                    : TabBarView(
                        controller: _tabController,
                        children: [
                          _buildStoriesTab(),
                          _buildAboutTab(),
                          _buildWallTab(),
                          _buildActivityTab(),
                          _buildReviewsTab(),
                        ],
                      ),
              ),
            ),
    );
  }

  Widget _defaultCover() {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [AppTheme.brandDeep, brand],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: const Center(
        child: Icon(Icons.person, size: 64, color: Colors.white24),
      ),
    );
  }

  Widget _buildBlockedProfileNotice() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 72, 24, 32),
      child: Column(
        children: [
          Icon(Icons.block_rounded, size: 56, color: muted),
          const SizedBox(height: 16),
          const Text(
            'This account has been blocked by you.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          Text(
            'Unblock this account to view their profile details and stories.',
            textAlign: TextAlign.center,
            style: TextStyle(color: muted, height: 1.4),
          ),
          const SizedBox(height: 20),
          FilledButton.icon(
            onPressed: _toggleBlockViewedUser,
            icon: const Icon(Icons.lock_open_rounded),
            label: const Text('Unblock user'),
          ),
        ],
      ),
    );
  }

  /// Avatar overlaps cover; name / bio / stats / Follow sit on white below.
  Widget _buildIdentityBlock() {
    // Avatar is drawn inside SliverAppBar (higher z-index than cover).
    // Only leave top padding so name/bio sit below the overlapping avatar.
    return Padding(
      padding: const EdgeInsets.only(top: 56),
      child: Column(
        children: [
          // Name + verified
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Flexible(
                child: Text(
                  _displayName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.4,
                    color: Theme.of(context).colorScheme.onSurface,
                  ),
                ),
              ),
              // Verified-style badge for authors.
              if (_isAuthor) ...[
                const SizedBox(width: 6),
                Container(
                  width: 18,
                  height: 18,
                  decoration: BoxDecoration(
                    color: brand,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.check, size: 12, color: Colors.white),
                ),
              ],
            ],
          ),
          const SizedBox(height: 2),
          Text(
            '@$_username',
            style: TextStyle(
              fontSize: 14,
              color: Theme.of(context).brightness == Brightness.dark
                  ? Colors.white70
                  : muted,
            ),
          ),
          const SizedBox(height: 10),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 28),
            child: Column(
              children: [
                Text(
                  _bio,
                  maxLines: _bioExpanded ? null : 3,
                  overflow: _bioExpanded
                      ? TextOverflow.visible
                      : TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 14,
                    height: 1.35,
                    color: Theme.of(context).colorScheme.onSurface,
                  ),
                ),
                if (_bio.trim().length > 120)
                  TextButton(
                    onPressed: () =>
                        setState(() => _bioExpanded = !_bioExpanded),
                    child: Text(_bioExpanded ? 'Show less' : 'Show more'),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 16),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
            decoration: BoxDecoration(
              color: cardBg,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: border),
            ),
            child: Row(
              children: [
                Expanded(
                  child: _profileStat(
                    Icons.menu_book_outlined,
                    '${_stories.length}',
                    'Stories',
                  ),
                ),
                Container(width: 1, height: 36, color: border),
                Expanded(
                  child: InkWell(
                    onTap: () => _openPeopleList(following: false),
                    child: _profileStat(
                      Icons.people_outline,
                      '$_followers',
                      'Followers',
                    ),
                  ),
                ),
                Container(width: 1, height: 36, color: border),
                Expanded(
                  child: InkWell(
                    onTap: () => _openPeopleList(following: true),
                    child: _profileStat(
                      Icons.person_add_alt_1,
                      '$_following',
                      'Following',
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          if (!_isOwnProfile && _isFollowing)
            Wrap(
              alignment: WrapAlignment.center,
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 8,
              children: [
                OutlinedButton(
                  onPressed: _followBusy ? null : _toggleFollow,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: brand,
                    side: BorderSide(color: brand, width: 1.4),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 22,
                      vertical: 10,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(24),
                    ),
                  ),
                  child: const Text(
                    'Following',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
                IconButton(
                  onPressed: _notificationBusy
                      ? null
                      : _toggleAuthorNotifications,
                  tooltip: _authorNotificationsEnabled
                      ? 'Turn off author updates'
                      : 'Get new story and chapter updates',
                  icon: Icon(
                    _authorNotificationsEnabled
                        ? Icons.notifications_active_rounded
                        : Icons.notifications_none_rounded,
                    color: _authorNotificationsEnabled ? brand : muted,
                  ),
                ),
              ],
            )
          else if (!_isOwnProfile)
            ElevatedButton(
              onPressed: _toggleFollow,
              style: ElevatedButton.styleFrom(
                backgroundColor: brand,
                foregroundColor: Colors.white,
                elevation: 0,
                padding: const EdgeInsets.symmetric(
                  horizontal: 48,
                  vertical: 10,
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(24),
                ),
              ),
              child: const Text(
                'Follow',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
          const SizedBox(height: 8),
          _buildLocationSocialCard(),
        ],
      ),
    );
  }

  Widget _profileStat(IconData icon, String value, String label) => Column(
    children: [
      Icon(icon, color: brand, size: 20),
      const SizedBox(height: 4),
      Text(
        value,
        style: TextStyle(
          color: AppTheme.inkOf(context),
          fontWeight: FontWeight.w700,
        ),
      ),
      Text(
        label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        textAlign: TextAlign.center,
        style: TextStyle(color: muted, fontSize: 11),
      ),
    ],
  );

  Widget _buildLocationSocialCard() {
    final country = _firstNonEmpty([
      _userProfile?['country'],
      widget.profile.country,
    ]);
    final socialLinks = _socialLinks;
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 4),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: AppTheme.surfaceOf(context),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: border),
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final icons = Wrap(
            alignment: WrapAlignment.end,
            spacing: 2,
            runSpacing: 2,
            children: [
              for (final item in socialLinks)
                Tooltip(
                  message: '${item['label']}: ${item['url']}',
                  child: item['label'] == 'X'
                      ? _socialXIcon(
                          item['color']! as Color,
                          () => _openSocialLink(item['url']! as String),
                        )
                      : _socialIcon(
                          item['icon']! as IconData,
                          item['color']! as Color,
                          () => _openSocialLink(item['url']! as String),
                          label: item['label']! as String,
                        ),
                ),
            ],
          );
          final maxSocialWidth = constraints.maxWidth * .54;
          return Row(
            children: [
              Icon(Icons.location_on, color: brand, size: 23),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Location',
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        color: AppTheme.inkOf(context),
                      ),
                    ),
                    Text(
                      country.isEmpty ? 'Location not set' : country,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: muted, fontSize: 13),
                    ),
                  ],
                ),
              ),
              if (socialLinks.isNotEmpty) ...[
                const SizedBox(width: 8),
                ConstrainedBox(
                  constraints: BoxConstraints(maxWidth: maxSocialWidth),
                  child: icons,
                ),
              ],
            ],
          );
        },
      ),
    );
  }

  Widget _socialIcon(
    IconData icon,
    Color color,
    VoidCallback onTap, {
    required String label,
  }) {
    return IconButton(
      tooltip: 'Open $label',
      onPressed: onTap,
      visualDensity: VisualDensity.compact,
      constraints: const BoxConstraints.tightFor(width: 32, height: 32),
      padding: EdgeInsets.zero,
      icon: CircleAvatar(
        radius: 14,
        backgroundColor: color.withValues(alpha: 0.12),
        child: Icon(icon, size: 17, color: color),
      ),
    );
  }

  Widget _socialXIcon(Color color, VoidCallback onTap) {
    return IconButton(
      tooltip: 'Open X',
      onPressed: onTap,
      visualDensity: VisualDensity.compact,
      constraints: const BoxConstraints.tightFor(width: 32, height: 32),
      padding: EdgeInsets.zero,
      icon: CircleAvatar(
        radius: 14,
        backgroundColor: color.withValues(alpha: 0.12),
        child: Text(
          '𝕏',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w800,
            color: color,
          ),
        ),
      ),
    );
  }

  Future<void> _openSocialLink(String value) async {
    final uri = Uri.tryParse(_normalizeSocialUrl(value));
    if (uri == null ||
        !{'http', 'https'}.contains(uri.scheme) ||
        !uri.hasAuthority) {
      return;
    }
    try {
      final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!opened && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Could not open this social media link'),
          ),
        );
      }
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not open this social media link')),
      );
    }
  }

  Widget _socialLinkField({
    required String label,
    required IconData icon,
    required TextEditingController controller,
    required StateSetter setModal,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: TextField(
        controller: controller,
        keyboardType: TextInputType.url,
        textInputAction: TextInputAction.next,
        decoration: InputDecoration(
          labelText: '$label URL',
          hintText: 'https://',
          prefixIcon: Icon(icon),
          suffixIcon: IconButton(
            tooltip: 'Remove $label link',
            icon: const Icon(Icons.close_rounded),
            onPressed: () {
              controller.clear();
              setModal(() {});
            },
          ),
        ),
      ),
    );
  }

  // ─── About ───────────────────────────────────────────────
  Widget _buildAboutTab() {
    final gender = _firstNonEmpty([
      _userProfile?['gender'],
      widget.profile.gender,
    ]);
    final birth = _firstNonEmpty([
      _userProfile?['birth_date'],
      _userProfile?['birthday'],
      widget.profile.birthDate,
    ]);
    final country = _firstNonEmpty([
      _userProfile?['country'],
      widget.profile.country,
    ]);
    final username = _username;
    final lists = _nonEmptyReadingLists;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final labelStyle = TextStyle(
      fontSize: 12,
      color: isDark ? Colors.white70 : muted,
      fontWeight: FontWeight.w600,
    );
    final valueStyle = TextStyle(
      fontSize: 15,
      color: isDark ? Colors.white : Theme.of(context).colorScheme.onSurface,
    );

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
      children: [
        if (username.isNotEmpty)
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(
              Icons.alternate_email,
              size: 20,
              color: isDark ? Colors.white70 : null,
            ),
            title: Text('Username', style: labelStyle),
            subtitle: Text('@$username', style: valueStyle),
            dense: true,
          ),
        if (gender.isNotEmpty)
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(
              Icons.person_outline,
              size: 20,
              color: isDark ? Colors.white70 : null,
            ),
            title: Text('Gender', style: labelStyle),
            subtitle: Text(gender, style: valueStyle),
            dense: true,
          ),
        if (birth.isNotEmpty)
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(
              Icons.cake_outlined,
              size: 20,
              color: isDark ? Colors.white70 : null,
            ),
            title: Text('Birthday', style: labelStyle),
            subtitle: Text(birth, style: valueStyle),
            dense: true,
          ),
        if (country.isNotEmpty)
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(
              Icons.public,
              size: 20,
              color: isDark ? Colors.white70 : null,
            ),
            title: Text('Country', style: labelStyle),
            subtitle: Text(country, style: valueStyle),
            dense: true,
          ),
        if (gender.isEmpty &&
            birth.isEmpty &&
            country.isEmpty &&
            username.isEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 8, bottom: 8),
            child: Text(
              _isOwnProfile
                  ? 'No profile details yet. Use Profile settings to add them.'
                  : 'No profile details yet.',
              style: TextStyle(color: isDark ? Colors.white70 : muted),
            ),
          ),
        const SizedBox(height: 20),
        if (lists.isNotEmpty) ...[
          const SizedBox(height: 24),
          const Text(
            'Reading Lists',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.3,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'Public Reading Lists',
            style: TextStyle(fontSize: 12, color: muted),
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 210,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              physics: const BouncingScrollPhysics(),
              itemCount: lists.length,
              separatorBuilder: (context, index) => const SizedBox(width: 14),
              itemBuilder: (context, i) {
                final list = lists[i];
                final name = _s(list['name'] ?? list['title']);
                final count = _asInt(list['story_count'] ?? list['count']);
                // Multi-cover collage (Inkitt-style stacked book covers)
                final List<String> coverList = [];
                final dynamic rawCovers = list['covers'];
                if (rawCovers is List) {
                  for (final c in rawCovers) {
                    final s = _s(c);
                    if (s.isNotEmpty) coverList.add(s);
                  }
                }
                if (coverList.isEmpty) {
                  final single = _s(list['cover_path'] ?? list['cover_url']);
                  if (single.isNotEmpty) coverList.add(single);
                }
                final listId = _asInt(list['id']);
                return GestureDetector(
                  onTap: listId > 0
                      ? () async {
                          try {
                            final detail = await widget.apiService
                                .fetchReadingListDetail(listId);
                            if (!context.mounted) return;
                            final items = detail['items'];
                            final itemList = items is List
                                ? List<Map<String, dynamic>>.from(items)
                                : <Map<String, dynamic>>[];
                            await showModalBottomSheet<void>(
                              context: context,
                              isScrollControlled: true,
                              backgroundColor: Theme.of(
                                context,
                              ).colorScheme.surface,
                              shape: const RoundedRectangleBorder(
                                borderRadius: BorderRadius.vertical(
                                  top: Radius.circular(16),
                                ),
                              ),
                              builder: (ctx) {
                                return DraggableScrollableSheet(
                                  expand: false,
                                  initialChildSize: 0.7,
                                  maxChildSize: 0.95,
                                  minChildSize: 0.4,
                                  builder: (_, scrollCtrl) {
                                    return Column(
                                      children: [
                                        const SizedBox(height: 8),
                                        Container(
                                          width: 40,
                                          height: 4,
                                          decoration: BoxDecoration(
                                            color: Colors.grey.shade300,
                                            borderRadius: BorderRadius.circular(
                                              2,
                                            ),
                                          ),
                                        ),
                                        Padding(
                                          padding: const EdgeInsets.all(16),
                                          child: Row(
                                            children: [
                                              Expanded(
                                                child: Text(
                                                  name.isEmpty
                                                      ? 'Reading List'
                                                      : name,
                                                  style: const TextStyle(
                                                    fontWeight: FontWeight.w700,
                                                    fontSize: 16,
                                                  ),
                                                ),
                                              ),
                                              Text(
                                                '$count Stories',
                                                style: TextStyle(
                                                  color: muted,
                                                  fontSize: 13,
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                        const Divider(height: 1),
                                        Expanded(
                                          child: itemList.isEmpty
                                              ? const Center(
                                                  child: Text(
                                                    'No stories in this list yet.',
                                                  ),
                                                )
                                              : ListView.builder(
                                                  controller: scrollCtrl,
                                                  itemCount: itemList.length,
                                                  itemBuilder: (_, i) {
                                                    final it = itemList[i];
                                                    final book =
                                                        it['book'] is Map
                                                        ? Map<
                                                            String,
                                                            dynamic
                                                          >.from(
                                                            it['book'] as Map,
                                                          )
                                                        : it;
                                                    final title = _s(
                                                      book['title'],
                                                    );
                                                    final author = _s(
                                                      book['author'],
                                                    );
                                                    final cPath = _s(
                                                      book['cover_path'] ??
                                                          book['cover_url'],
                                                    );
                                                    final bookId = _asInt(
                                                      book['id'] ??
                                                          it['book_id'],
                                                    );
                                                    return Material(
                                                      color: Colors.transparent,
                                                      child: ListTile(
                                                        leading:
                                                            cPath.isNotEmpty
                                                            ? ClipRRect(
                                                                borderRadius:
                                                                    BorderRadius.circular(
                                                                      4,
                                                                    ),
                                                                child: Image.network(
                                                                  widget
                                                                      .apiService
                                                                      .resolveAssetUrl(
                                                                        cPath,
                                                                      ),
                                                                  width: 40,
                                                                  height: 56,
                                                                  fit: BoxFit
                                                                      .cover,
                                                                  errorBuilder:
                                                                      (
                                                                        _,
                                                                        _,
                                                                        _,
                                                                      ) => const Icon(
                                                                        Icons
                                                                            .menu_book,
                                                                      ),
                                                                ),
                                                              )
                                                            : const Icon(
                                                                Icons.menu_book,
                                                              ),
                                                        title: Text(
                                                          title.isEmpty
                                                              ? 'Story'
                                                              : title,
                                                          maxLines: 1,
                                                          overflow: TextOverflow
                                                              .ellipsis,
                                                        ),
                                                        subtitle: Text(
                                                          author,
                                                          maxLines: 1,
                                                          overflow: TextOverflow
                                                              .ellipsis,
                                                        ),
                                                        onTap: bookId > 0
                                                            ? () {
                                                                Navigator.pop(
                                                                  ctx,
                                                                );
                                                                Navigator.of(
                                                                  context,
                                                                ).push(
                                                                  MaterialPageRoute<
                                                                    void
                                                                  >(
                                                                    builder: (_) => StoryDetailScreen(
                                                                      apiService:
                                                                          widget
                                                                              .apiService,
                                                                      book: BookDetailModel(
                                                                        id: bookId,
                                                                        title:
                                                                            title,
                                                                        author:
                                                                            author,
                                                                        description: _s(
                                                                          book['description'],
                                                                        ),
                                                                        statusText: _s(
                                                                          book['status_text'],
                                                                        ),
                                                                        rating:
                                                                            (book['rating']
                                                                                    as num?)
                                                                                ?.toDouble() ??
                                                                            0,
                                                                        genre: _s(
                                                                          book['genre'] ??
                                                                              book['primary_genre'],
                                                                        ),
                                                                        cta:
                                                                            'Read',
                                                                        coverPath:
                                                                            cPath,
                                                                      ),
                                                                    ),
                                                                  ),
                                                                );
                                                              }
                                                            : null,
                                                      ),
                                                    );
                                                  },
                                                ),
                                        ),
                                      ],
                                    );
                                  },
                                );
                              },
                            );
                          } catch (e) {
                            if (!context.mounted) return;
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text('Could not open list: $e'),
                              ),
                            );
                          }
                        }
                      : null,
                  child: SizedBox(
                    width: 130,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(10),
                            child: coverList.isEmpty
                                ? Container(
                                    color: cardBg,
                                    child: Icon(
                                      Icons.collections_bookmark_outlined,
                                      color: muted,
                                    ),
                                  )
                                : _ReadingListCollage(
                                    covers: coverList
                                        .map(
                                          (c) => widget.apiService
                                              .resolveAssetUrl(c),
                                        )
                                        .toList(),
                                  ),
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          name.isEmpty ? 'List' : name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 13,
                          ),
                        ),
                        Text(
                          '$count Stories',
                          style: TextStyle(fontSize: 12, color: muted),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildStoriesTab() {
    final list = _filteredStories;
    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: TextField(
              onChanged: (v) => setState(() => _storyQuery = v),
              decoration: InputDecoration(
                hintText: 'Search',
                prefixIcon: Icon(Icons.search, color: muted),
                filled: true,
                fillColor: cardBg,
                contentPadding: const EdgeInsets.symmetric(vertical: 0),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 8),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _filterChip(_storyFilter, onTap: _showStorySortSheet),
                _filterChip(_storySort, onTap: _showStorySortSheet),
              ],
            ),
          ),
        ),
        if (list.isEmpty)
          SliverFillRemaining(
            hasScrollBody: false,
            child: Center(
              child: Text('No stories yet', style: TextStyle(color: muted)),
            ),
          )
        else
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
            sliver: SliverList(
              delegate: SliverChildBuilderDelegate(
                (context, index) => index.isEven
                    ? _storyRow(list[index ~/ 2])
                    : const Divider(height: 24),
                childCount: list.length * 2 - 1,
              ),
            ),
          ),
      ],
    );
  }

  Widget _filterChip(String label, {required VoidCallback onTap}) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          border: Border.all(color: border),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (label.contains('All') ||
                label.contains('Completed') ||
                label.contains('progress'))
              Icon(Icons.filter_list, size: 14, color: muted)
            else
              const SizedBox.shrink(),
            const SizedBox(width: 4),
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
            Icon(Icons.chevron_right, size: 16, color: muted),
          ],
        ),
      ),
    );
  }

  Widget _storyRow(Map<String, dynamic> s) {
    final title = _s(s['title']);
    final desc = _s(s['description']);
    final genre = _s(s['genre'] ?? s['primary_genre']);
    final rating = s['rating'];
    final status = _s(s['status_text']);
    final chapters = _asInt(s['chapter_count'] ?? s['chapters']);
    final cover = _s(s['cover_path'] ?? s['cover_url']);
    final completed =
        status.toLowerCase().contains('complete') ||
        status.toLowerCase().contains('publish');

    return InkWell(
      onTap: () {
        final id = _asInt(s['id']);
        if (id <= 0) return;
        Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (_) => StoryDetailScreen(
              apiService: widget.apiService,
              book: BookDetailModel(
                id: id,
                title: title,
                author: _s(s['author']),
                description: desc,
                statusText: status,
                rating: (rating is num)
                    ? rating.toDouble()
                    : double.tryParse('$rating') ?? 0,
                genre: genre,
                cta: _s(s['cta_label']).isEmpty
                    ? 'Read now'
                    : _s(s['cta_label']),
                coverPath: cover,
                authorUserId: _asInt(s['author_user_id'] ?? s['user_id']),
              ),
            ),
          ),
        );
      },
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: cover.isNotEmpty
                ? Image.network(
                    widget.apiService.resolveAssetUrl(cover),
                    width: 72,
                    height: 100,
                    fit: BoxFit.cover,
                    cacheWidth: 144,
                    cacheHeight: 200,
                    errorBuilder: (context, error, stackTrace) =>
                        Container(width: 72, height: 100, color: cardBg),
                  )
                : Container(width: 72, height: 100, color: cardBg),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 15,
                        ),
                      ),
                    ),
                    if (!_isOwnProfile)
                      IconButton(
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(
                          minWidth: 32,
                          minHeight: 32,
                        ),
                        icon: Icon(
                          _savedStoryIds.contains(_asInt(s['id']))
                              ? Icons.bookmark
                              : Icons.bookmark_border,
                          size: 20,
                          color: _savedStoryIds.contains(_asInt(s['id']))
                              ? const Color(0xFFF4CC2F)
                              : muted,
                        ),
                        onPressed: () => _toggleSavedStory(_asInt(s['id'])),
                      ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  desc.isEmpty ? 'No description' : desc,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 12, color: muted, height: 1.3),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: [
                    if (rating != null)
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: cardBg,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(
                              Icons.star,
                              size: 12,
                              color: Color(0xFFF4CC2F),
                            ),
                            const SizedBox(width: 2),
                            Text(
                              '$rating',
                              style: const TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    if (genre.isNotEmpty) _tagChip(genre),
                  ],
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Icon(
                      completed ? Icons.check_circle : Icons.timelapse,
                      size: 14,
                      color: completed ? brand : muted,
                    ),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        completed
                            ? 'Completed${chapters > 0 ? ' · $chapters Chapters' : ''}'
                            : (status.toLowerCase().contains('draft') ||
                                      status.isEmpty
                                  ? 'Draft${chapters > 0 ? ' · $chapters Chapters' : ''}'
                                  : 'Ongoing${chapters > 0 ? ' · $chapters Chapters' : ''}'),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 11,
                          color: completed ? brand : muted,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _tagChip(String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        border: Border.all(color: border),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        label,
        style: const TextStyle(fontSize: 11, color: Color(0xFF4A4A4A)),
      ),
    );
  }

  Future<void> _composeWallPost() async {
    int resolvedId = widget.viewingUserId ?? 0;
    if (resolvedId == 0) {
      resolvedId = _asInt(_userProfile?['id']);
    }
    if (resolvedId == 0) {
      resolvedId = widget.profile.id ?? 0;
    }
    // Last resort: ask /api/me for current user id
    if (resolvedId == 0) {
      try {
        final me = await widget.apiService.fetchMe();
        resolvedId = _asInt(me['id']);
        if (resolvedId > 0 && mounted) {
          setState(() {
            _userProfile = {...?_userProfile, ...me};
            _isOwnProfile = true;
          });
        }
      } catch (_) {}
    }
    if (resolvedId == 0) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Sign in to post on the wall')),
      );
      return;
    }

    final text = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppTheme.surfaceOf(context),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) {
        return _WallComposeSheet(
          username: _username,
          apiService: widget.apiService,
        );
      },
    );

    if (!mounted) return;
    final body = (text ?? '').trim();
    if (body.isEmpty) return;

    try {
      await widget.apiService.postUserWall(resolvedId, body);
      if (!mounted) return;
      final wall = await widget.apiService.fetchUserWall(resolvedId);
      if (!mounted) return;
      setState(() {
        _wall = wall;
      });
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Posted to wall')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Could not post: $e')));
    }
  }

  // ─── Wall ────────────────────────────────────────────────
  Widget _buildWallTab() {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      children: [
        // Composer — posts to backend wall
        InkWell(
          onTap: _composeWallPost,
          borderRadius: BorderRadius.circular(24),
          child: Row(
            children: [
              CircleAvatar(
                radius: 18,
                backgroundColor: cardBg,
                child: _avatarUrl.isEmpty
                    ? Text(
                        _displayName.isNotEmpty ? _displayName[0] : '?',
                        style: TextStyle(color: muted),
                      )
                    : ClipOval(
                        child: Image.network(
                          _avatarUrl,
                          width: 36,
                          height: 36,
                          fit: BoxFit.cover,
                          errorBuilder: (_, _, _) => Text(
                            _displayName.isNotEmpty
                                ? _displayName[0].toUpperCase()
                                : '?',
                            style: TextStyle(color: muted),
                          ),
                        ),
                      ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 10,
                  ),
                  decoration: BoxDecoration(
                    color: cardBg,
                    borderRadius: BorderRadius.circular(24),
                  ),
                  child: Text(
                    'Write something to $_username',
                    style: TextStyle(color: muted, fontSize: 13),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Icon(Icons.image_outlined, color: muted),
            ],
          ),
        ),
        const SizedBox(height: 16),
        if (_wall.isEmpty)
          Padding(
            padding: EdgeInsets.only(top: 40),
            child: Center(
              child: Text('No wall posts yet', style: TextStyle(color: muted)),
            ),
          )
        else
          ..._wall.map((m) {
            final name = _s(
              m['sender_name'] ?? m['username'] ?? m['display_name'] ?? 'User',
            );
            final body = _s(m['message'] ?? m['body'] ?? m['text']);
            final when = _s(m['created_at'] ?? m['time'] ?? '');
            final img = _s(
              m['image_url'] ?? m['image_path'] ?? m['attachment_path'] ?? '',
            );
            return Padding(
              padding: const EdgeInsets.only(bottom: 18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Builder(
                        builder: (context) {
                          final senderPhoto = _s(
                            m['photo_url'] ??
                                m['avatar_url'] ??
                                m['sender_photo'] ??
                                '',
                          );
                          final photoResolved = senderPhoto.isNotEmpty
                              ? widget.apiService.resolveAssetUrl(senderPhoto)
                              : '';
                          return CircleAvatar(
                            radius: 16,
                            backgroundColor: cardBg,
                            child: photoResolved.isEmpty
                                ? Text(
                                    name.isNotEmpty
                                        ? name[0].toUpperCase()
                                        : '?',
                                    style: const TextStyle(fontSize: 12),
                                  )
                                : ClipOval(
                                    child: Image.network(
                                      photoResolved,
                                      width: 32,
                                      height: 32,
                                      fit: BoxFit.cover,
                                      errorBuilder: (_, _, _) => Text(
                                        name.isNotEmpty
                                            ? name[0].toUpperCase()
                                            : '?',
                                        style: const TextStyle(fontSize: 12),
                                      ),
                                    ),
                                  ),
                          );
                        },
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              name,
                              style: const TextStyle(
                                fontWeight: FontWeight.w600,
                                fontSize: 13,
                              ),
                            ),
                            if (when.isNotEmpty)
                              Text(
                                when,
                                style: TextStyle(fontSize: 11, color: muted),
                              ),
                          ],
                        ),
                      ),
                      Icon(Icons.more_horiz, color: muted, size: 18),
                    ],
                  ),
                  if (body.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    _WallPostText(body: body, apiService: widget.apiService),
                  ],
                  if (img.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: Image.network(
                        widget.apiService.resolveAssetUrl(img),
                        fit: BoxFit.cover,
                        errorBuilder: (context, error, stackTrace) =>
                            const SizedBox.shrink(),
                      ),
                    ),
                  ],
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      InkWell(
                        onTap: () async {
                          final postId = (m['id'] as num?)?.toInt();
                          if (postId == null) return;
                          try {
                            final res = await widget.apiService.likeWallPost(
                              postId,
                            );
                            if (!mounted) return;
                            final likes = (res['likes'] as num?)?.toInt() ?? 0;
                            final liked = res['liked'] == true;
                            setState(() {
                              m['likes'] = likes;
                              m['liked'] = liked;
                            });
                          } catch (e) {
                            if (!mounted) return;
                            ScaffoldMessenger.of(
                              context,
                            ).showSnackBar(SnackBar(content: Text('$e')));
                          }
                        },
                        child: Row(
                          children: [
                            Icon(
                              m['liked'] == true
                                  ? Icons.favorite
                                  : Icons.favorite_border,
                              size: 18,
                              color: m['liked'] == true
                                  ? Colors.redAccent
                                  : muted,
                            ),
                            const SizedBox(width: 4),
                            Text(
                              '${m['likes'] ?? 0}',
                              style: TextStyle(
                                fontSize: 12,
                                color: m['liked'] == true
                                    ? Colors.redAccent
                                    : muted,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 16),
                      InkWell(
                        onTap: () async {
                          final postId = (m['id'] as num?)?.toInt();
                          if (postId == null) return;
                          final ctrl = TextEditingController();
                          final ok = await showDialog<bool>(
                            context: context,
                            builder: (ctx) => AlertDialog(
                              title: const Text('Comment'),
                              content: TextField(
                                controller: ctrl,
                                maxLines: 3,
                                decoration: const InputDecoration(
                                  hintText: 'Write a comment…',
                                ),
                              ),
                              actions: [
                                TextButton(
                                  onPressed: () => Navigator.pop(ctx, false),
                                  child: const Text('Cancel'),
                                ),
                                TextButton(
                                  onPressed: () => Navigator.pop(ctx, true),
                                  child: const Text('Post'),
                                ),
                              ],
                            ),
                          );
                          final text = (ctrl.text).trim();
                          Future.delayed(
                            const Duration(milliseconds: 300),
                            ctrl.dispose,
                          );
                          if (ok != true || text.isEmpty || !mounted) return;
                          try {
                            await widget.apiService.commentWallPost(
                              postId,
                              text,
                            );
                            if (!mounted) return;
                            await _loadAll();
                            if (!mounted) return;
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('Comment posted')),
                            );
                          } catch (e) {
                            if (!mounted) return;
                            ScaffoldMessenger.of(
                              context,
                            ).showSnackBar(SnackBar(content: Text('$e')));
                          }
                        },
                        child: Icon(
                          Icons.chat_bubble_outline,
                          size: 18,
                          color: muted,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            );
          }),
      ],
    );
  }

  Future<void> _toggleSavedStory(int bookId) async {
    if (bookId <= 0) return;
    if (_savedStoryIds.contains(bookId)) {
      final listId = _savedListIds[bookId];
      final itemId = _savedItemIds[bookId];
      if (listId == null || itemId == null) return;
      try {
        await widget.apiService.removeReadingListItem(listId, itemId);
        if (!mounted) return;
        setState(() {
          _savedStoryIds.remove(bookId);
          _savedItemIds.remove(bookId);
          _savedListIds.remove(bookId);
        });
        showAppNotice(context, 'Removed from saved stories');
      } catch (e) {
        if (mounted) {
          showAppNotice(
            context,
            'Could not remove saved story: $e',
            type: AppNoticeType.error,
          );
        }
      }
      return;
    }
    await _saveBookToReadingList(bookId);
  }

  Future<void> _saveBookToReadingList(int bookId) async {
    if (bookId <= 0) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Story not available')));
      return;
    }
    try {
      final lists = await widget.apiService.fetchReadingLists();
      if (!mounted) return;
      if (lists.isEmpty) {
        // Create a default list then add
        final created = await widget.apiService.createReadingList({
          'name': 'My List',
        });
        final listId = (created['id'] as num?)?.toInt() ?? 0;
        if (listId > 0) {
          final itemId = await widget.apiService.addReadingListItem(
            listId,
            bookId,
          );
          _savedListIds[bookId] = listId;
          _savedItemIds[bookId] = itemId;
        }
        if (!mounted) return;
        if (mounted) setState(() => _savedStoryIds.add(bookId));
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Saved to My List')));
        return;
      }
      final chosen = await showModalBottomSheet<Map<String, dynamic>>(
        context: context,
        builder: (ctx) {
          return SafeArea(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const ListTile(title: Text('Save to reading list')),
                ...lists.map((l) {
                  return ListTile(
                    leading: const Icon(Icons.collections_bookmark_outlined),
                    title: Text('${l['name'] ?? 'List'}'),
                    subtitle: Text(
                      '${l['story_count'] ?? l['storyCount'] ?? 0} stories',
                    ),
                    onTap: () => Navigator.pop(ctx, l),
                  );
                }),
              ],
            ),
          );
        },
      );
      if (chosen == null || !mounted) return;
      final listId = (chosen['id'] as num?)?.toInt() ?? 0;
      if (listId <= 0) return;
      final itemId = await widget.apiService.addReadingListItem(listId, bookId);
      if (!mounted) return;
      _savedListIds[bookId] = listId;
      _savedItemIds[bookId] = itemId;
      setState(() => _savedStoryIds.add(bookId));
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Saved to ${chosen['name'] ?? 'list'}')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  Widget _buildReviewsTab() {
    if (_reviews.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            _isOwnProfile
                ? 'You have not reviewed any stories yet. Open a story and tap Review.'
                : 'No reviews yet.',
            textAlign: TextAlign.center,
            style: TextStyle(color: muted),
          ),
        ),
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      itemCount: _reviews.length,
      separatorBuilder: (context, index) => const Divider(height: 28),
      itemBuilder: (context, i) {
        final r = _reviews[i];
        final bookMap = (r['book'] is Map)
            ? Map<String, dynamic>.from(r['book'] as Map)
            : <String, dynamic>{};
        final bookTitle = _s(
          r['book_title'] ?? bookMap['title'] ?? r['title'] ?? 'Story',
        );
        final author = _s(
          r['reviewer_name'] ??
              r['book_author'] ??
              bookMap['author'] ??
              r['author'] ??
              '',
        );
        final cover = _s(
          r['cover_path'] ?? bookMap['cover_path'] ?? r['book_cover'] ?? '',
        );
        final bid = _asInt(
          r['book_id'] ?? bookMap['id'] ?? r['story_id'] ?? r['id'],
        );
        final stars = _asInt(r['rating'] ?? r['stars'] ?? 0);
        final plot = _asInt(r['plot_score'] ?? r['plot'] ?? stars);
        final writing = _asInt(
          r['writing_score'] ?? r['writing_style'] ?? stars,
        );
        final grammar = _asInt(r['grammar_score'] ?? r['grammar'] ?? stars);
        final headline = _s(r['headline'] ?? r['reviewer_name'] ?? '');
        final body = _s(
          r['body'] ?? r['comment'] ?? r['review'] ?? r['text'] ?? '',
        );

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: cover.isNotEmpty
                      ? Image.network(
                          widget.apiService.resolveAssetUrl(cover),
                          width: 40,
                          height: 56,
                          fit: BoxFit.cover,
                          errorBuilder: (context, error, stackTrace) =>
                              Container(width: 40, height: 56, color: cardBg),
                        )
                      : Container(width: 40, height: 56, color: cardBg),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        bookTitle,
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 14,
                        ),
                      ),
                      if (author.isNotEmpty)
                        Text(
                          author.isEmpty ? '' : 'Review by $author',
                          style: TextStyle(fontSize: 12, color: muted),
                        ),
                    ],
                  ),
                ),
                OutlinedButton(
                  onPressed: () {
                    final bid = _asInt(r['book_id']);
                    if (bid <= 0) return;
                    Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => StoryDetailScreen(
                          apiService: widget.apiService,
                          book: BookDetailModel(
                            id: bid,
                            title: bookTitle,
                            author: author,
                            description: body,
                            statusText: '',
                            rating: stars.toDouble(),
                            genre: '',
                            cta: 'Read now',
                            coverPath: cover,
                          ),
                        ),
                      ),
                    );
                  },
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 0,
                    ),
                    minimumSize: const Size(0, 32),
                    side: BorderSide(color: border),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                  child: const Text('Read', style: TextStyle(fontSize: 12)),
                ),
                const SizedBox(width: 4),
                if (!_isOwnProfile)
                  IconButton(
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(
                      minWidth: 32,
                      minHeight: 32,
                    ),
                    icon: Icon(Icons.bookmark_border, size: 20, color: muted),
                    onPressed: () => _saveBookToReadingList(bid),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: List.generate(5, (j) {
                return Icon(
                  j < stars ? Icons.star : Icons.star_border,
                  size: 18,
                  color: const Color(0xFFF4CC2F),
                );
              }),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              children: [
                _scoreChip('Plot $plot'),
                _scoreChip('Writing Style $writing'),
                _scoreChip('Grammar & Punctuation $grammar'),
              ],
            ),
            if (headline.isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(
                headline,
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 14,
                ),
              ),
            ],
            if (body.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(
                body,
                style: TextStyle(
                  fontSize: 13,
                  height: 1.4,
                  color: AppTheme.inkOf(context),
                ),
              ),
            ],
          ],
        );
      },
    );
  }

  Widget _buildActivityTab() {
    if (_activity.isEmpty) {
      return Center(
        child: Text('No recent activity yet.', style: TextStyle(color: muted)),
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: _activity.length,
      separatorBuilder: (_, _) => Divider(color: border),
      itemBuilder: (context, index) {
        final item = _activity[index];
        final action = _s(
          item['title'] ?? item['action'] ?? item['message'] ?? 'Activity',
        );
        final kind = _s(item['type']);
        final created = _s(item['created_at'] ?? item['date']);
        return ListTile(
          contentPadding: EdgeInsets.zero,
          leading: CircleAvatar(
            backgroundColor: brand.withValues(alpha: .14),
            child: Icon(Icons.bolt_rounded, color: brand),
          ),
          title: Text(
            action,
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
          subtitle: Text(
            [
              if (kind.isNotEmpty) kind[0].toUpperCase() + kind.substring(1),
              created,
            ].where((v) => v.isNotEmpty).join(' · '),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: muted),
          ),
        );
      },
    );
  }

  Widget _scoreChip(String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: cardBg,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Text(
        label,
        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w500),
      ),
    );
  }
}

/// Owns its own TextEditingController so dispose is safe (no parent crash).
class _WallComposeSheet extends StatefulWidget {
  const _WallComposeSheet({required this.username, required this.apiService});
  final String username;
  final ApiService apiService;

  @override
  State<_WallComposeSheet> createState() => _WallComposeSheetState();
}

class _WallComposeSheetState extends State<_WallComposeSheet> {
  late final TextEditingController _ctrl;
  List<Map<String, dynamic>> _suggestions = const [];

  @override
  void initState() {
    super.initState();
    _ctrl = TextEditingController();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _suggestBooks(String value) async {
    final match = RegExp(r'@([^\s@]*)$').firstMatch(value);
    if (match == null || match.group(1)!.isEmpty) {
      if (mounted) setState(() => _suggestions = const []);
      return;
    }
    final query = match.group(1)!;
    final rows = await widget.apiService.searchStories(query: query);
    if (!mounted || _ctrl.text != value) return;
    final normalizedQuery = query.toLowerCase();
    final titleMatches = rows
        .where((book) {
          final title = (book['title'] ?? '').toString().toLowerCase();
          return title.contains(normalizedQuery);
        })
        .take(5)
        .toList();
    setState(() => _suggestions = titleMatches);
  }

  void _selectBook(Map<String, dynamic> book) {
    final match = RegExp(r'@([^\s@]*)$').firstMatch(_ctrl.text);
    if (match == null) return;
    final title = (book['title'] ?? '').toString().trim();
    if (title.isEmpty) return;
    final replacement = '@[$title] ';
    _ctrl.value = _ctrl.value.copyWith(
      text: _ctrl.text.replaceRange(match.start, match.end, replacement),
      selection: TextSelection.collapsed(
        offset: match.start + replacement.length,
      ),
    );
    setState(() => _suggestions = const []);
  }

  @override
  Widget build(BuildContext context) {
    final brand = const Color(0xFF16856A);
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Write something to ${widget.username}',
            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _ctrl,
            maxLines: 4,
            autofocus: true,
            onChanged: _suggestBooks,
            decoration: const InputDecoration(
              hintText: 'Say something…',
              border: OutlineInputBorder(),
            ),
          ),
          if (_suggestions.isNotEmpty)
            ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 180),
              child: ListView.builder(
                shrinkWrap: true,
                itemCount: _suggestions.length,
                itemBuilder: (context, index) {
                  final book = _suggestions[index];
                  return ListTile(
                    dense: true,
                    leading: const Icon(Icons.menu_book_outlined, size: 18),
                    title: Text(book['title']?.toString() ?? ''),
                    subtitle: Text(book['author']?.toString() ?? ''),
                    onTap: () => _selectBook(book),
                  );
                },
              ),
            ),
          const SizedBox(height: 12),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: brand,
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.pop(context, _ctrl.text),
            child: const Text('Post'),
          ),
        ],
      ),
    );
  }
}

class _WallPostText extends StatelessWidget {
  const _WallPostText({required this.body, required this.apiService});

  final String body;
  final ApiService apiService;

  @override
  Widget build(BuildContext context) {
    final parts = RegExp(r'(@\[[^\]]+\]|@[A-Za-z0-9_-]+)').allMatches(body);
    if (parts.isEmpty) {
      return Text(body, style: const TextStyle(fontSize: 14, height: 1.35));
    }
    final spans = <TextSpan>[];
    var cursor = 0;
    for (final match in parts) {
      if (match.start > cursor) {
        spans.add(TextSpan(text: body.substring(cursor, match.start)));
      }
      final token = match.group(0)!;
      final query = token.startsWith('@[')
          ? token.substring(2, token.length - 1)
          : token.substring(1);
      final displayToken = token.startsWith('@[')
          ? '@${token.substring(2, token.length - 1)}'
          : token;
      spans.add(
        TextSpan(
          text: displayToken,
          style: const TextStyle(
            color: Color(0xFF16856A),
            fontWeight: FontWeight.w600,
          ),
          recognizer: TapGestureRecognizer()
            ..onTap = () async {
              final rows = await apiService.searchStories(query: query);
              if (rows.isEmpty || !context.mounted) return;
              Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => StoryDetailScreen(
                    apiService: apiService,
                    book: BookDetailModel.fromMap(rows.first),
                  ),
                ),
              );
            },
        ),
      );
      cursor = match.end;
    }
    if (cursor < body.length) spans.add(TextSpan(text: body.substring(cursor)));
    return RichText(
      text: TextSpan(
        style: DefaultTextStyle.of(
          context,
        ).style.copyWith(fontSize: 14, height: 1.35),
        children: spans,
      ),
    );
  }
}

class _TabBarDelegate extends SliverPersistentHeaderDelegate {
  _TabBarDelegate(this.tabBar);
  final TabBar tabBar;

  @override
  double get minExtent => 48;
  @override
  double get maxExtent => 48;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) {
    return Container(
      color: Theme.of(context).scaffoldBackgroundColor,
      child: tabBar,
    );
  }

  @override
  bool shouldRebuild(covariant _TabBarDelegate oldDelegate) => false;
}

/// Inkitt-style multi-cover collage for reading list cards (2x2 grid of covers).
class _ReadingListCollage extends StatelessWidget {
  const _ReadingListCollage({required this.covers});

  final List<String> covers;

  @override
  Widget build(BuildContext context) {
    final urls = covers.take(4).toList();
    if (urls.length == 1) {
      return Image.network(
        urls.first,
        fit: BoxFit.cover,
        width: double.infinity,
        height: double.infinity,
        errorBuilder: (_, _, _) =>
            Container(color: AppTheme.elevatedOf(context)),
      );
    }
    // 2x2 grid
    while (urls.length < 4) {
      urls.add('');
    }
    return Column(
      children: [
        Expanded(
          child: Row(
            children: [
              Expanded(child: _cell(urls[0], context)),
              const SizedBox(width: 2),
              Expanded(child: _cell(urls[1], context)),
            ],
          ),
        ),
        const SizedBox(height: 2),
        Expanded(
          child: Row(
            children: [
              Expanded(child: _cell(urls[2], context)),
              const SizedBox(width: 2),
              Expanded(child: _cell(urls[3], context)),
            ],
          ),
        ),
      ],
    );
  }

  Widget _cell(String url, BuildContext context) {
    if (url.isEmpty) {
      return Container(color: AppTheme.elevatedOf(context));
    }
    return Image.network(
      url,
      fit: BoxFit.cover,
      width: double.infinity,
      height: double.infinity,
      errorBuilder: (_, _, _) => Container(color: AppTheme.elevatedOf(context)),
    );
  }
}

class _PeopleListScreen extends StatelessWidget {
  const _PeopleListScreen({
    required this.title,
    required this.people,
    required this.apiService,
  });

  final String title;
  final List<Map<String, dynamic>> people;
  final ApiService apiService;

  int _userId(Map<String, dynamic> person) {
    final value = person['id'] ?? person['user_id'];
    if (value is num) return value.toInt();
    return int.tryParse('$value') ?? 0;
  }

  void _openProfile(BuildContext context, Map<String, dynamic> person) {
    final id = _userId(person);
    if (id <= 0) return;
    final name = (person['display_name'] ?? person['username'] ?? 'Reader')
        .toString();
    final photo = (person['photo_url'] ?? person['avatar_url'] ?? '')
        .toString();
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ProfileScreen(
          profile: ProfileModel(
            id: id,
            displayName: name,
            username: (person['username'] ?? name).toString(),
            photoUrl: photo,
            coverUrl: '',
            following: 0,
            followers: 0,
            blocked: 0,
            chaptersRead: 0,
            socialKarma: 0,
            dayStreak: 0,
            readingLists: const [],
          ),
          apiService: apiService,
          achievements: const [],
          viewingUserId: id,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final emptyLabel = title.toLowerCase();
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: people.isEmpty
          ? Center(child: Text('No $emptyLabel yet'))
          : ListView.separated(
              padding: const EdgeInsets.symmetric(vertical: 8),
              itemCount: people.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (context, index) {
                final person = people[index];
                final name =
                    (person['display_name'] ?? person['username'] ?? 'Reader')
                        .toString();
                final username = (person['username'] ?? '').toString();
                final bio = (person['bio'] ?? '').toString();
                final photo =
                    (person['photo_url'] ?? person['avatar_url'] ?? '')
                        .toString();
                final photoUrl = photo.isEmpty
                    ? ''
                    : apiService.resolveAssetUrl(photo);
                return ListTile(
                  onTap: () => _openProfile(context, person),
                  leading: CircleAvatar(
                    child: photoUrl.isEmpty
                        ? Text(name.isEmpty ? '?' : name[0].toUpperCase())
                        : ClipOval(
                            child: Image.network(
                              photoUrl,
                              width: 40,
                              height: 40,
                              fit: BoxFit.cover,
                              errorBuilder: (_, _, _) => Text(
                                name.isEmpty ? '?' : name[0].toUpperCase(),
                              ),
                            ),
                          ),
                  ),
                  title: Text(name),
                  subtitle: Text(
                    username.isNotEmpty
                        ? (username.startsWith('@') ? username : '@$username')
                        : (bio.isNotEmpty ? bio : 'Reader'),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  trailing: const Icon(Icons.chevron_right),
                );
              },
            ),
    );
  }
}
