import 'package:flutter/material.dart';
import 'dart:async';

import '../../core/theme/app_theme.dart';
import '../../data/models/app_bootstrap.dart';
import '../../data/services/api_service.dart';
import 'chapter_reader_screen.dart';
import 'profile_screen.dart';
import 'story_detail_screen.dart';

/// Bell icon screen:
/// - Activity: likes / comments / reviews / follows / saves / support replies
/// - Admin: system announcements
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({
    super.key,
    required this.apiService,
    this.onOpenDiscover,
    this.data,
  });

  final ApiService apiService;
  final VoidCallback? onOpenDiscover;
  final dynamic data;

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  late final TabController _tabs;
  late Future<List<Map<String, dynamic>>> _activityFuture;
  late Future<List<Map<String, dynamic>>> _adminFuture;
  Timer? _liveRefreshTimer;
  bool _refreshInProgress = false;
  bool _showAllActivity = false;
  bool _showAllAnnouncements = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _tabs = TabController(length: 2, vsync: this);
    _reload();
    _liveRefreshTimer = Timer.periodic(const Duration(minutes: 2), (_) {
      if (mounted) unawaited(_refresh());
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _liveRefreshTimer ??= Timer.periodic(const Duration(minutes: 2), (_) {
        if (mounted) unawaited(_refresh());
      });
    } else {
      _liveRefreshTimer?.cancel();
      _liveRefreshTimer = null;
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _liveRefreshTimer?.cancel();
    _tabs.dispose();
    super.dispose();
  }

  void _reload() {
    _activityFuture = widget.apiService.fetchNotifications();
    _adminFuture = widget.apiService.fetchAdminNotifications();
  }

  String _formatDate(dynamic value) {
    final raw = value?.toString().trim() ?? '';
    if (raw.isEmpty || num.tryParse(raw) != null) return '';
    final date = DateTime.tryParse(raw);
    return date == null
        ? ''
        : MaterialLocalizations.of(context).formatMediumDate(date.toLocal());
  }

  Future<void> _refresh() async {
    if (_refreshInProgress || !mounted) return;
    _refreshInProgress = true;
    try {
      setState(_reload);
      await Future.wait([
        _activityFuture.then<void>((_) {}, onError: (Object _) {}),
        _adminFuture.then<void>((_) {}, onError: (Object _) {}),
      ]);
    } finally {
      _refreshInProgress = false;
    }
  }

  IconData _iconFor(String type) {
    switch (type.toLowerCase()) {
      case 'like':
        return Icons.favorite;
      case 'review':
        return Icons.star;
      case 'comment':
        return Icons.chat_bubble_outline;
      case 'follow':
        return Icons.person_add_alt_1;
      case 'author_book':
        return Icons.menu_book_rounded;
      case 'author_chapter':
        return Icons.auto_stories_rounded;
      case 'save':
        return Icons.bookmark;
      case 'share':
        return Icons.ios_share;
      case 'support_reply':
        return Icons.support_agent;
      case 'admin':
      case 'system':
        return Icons.campaign_outlined;
      default:
        return Icons.notifications;
    }
  }

  void _openBook(Map<String, dynamic> n) {
    final bookId = (n['book_id'] as num?)?.toInt() ?? 0;
    if (bookId <= 0) return;
    final cover = (n['cover_path'] ?? '').toString();
    final title = (n['title'] ?? 'Story').toString();
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => StoryDetailScreen(
          apiService: widget.apiService,
          book: BookDetailModel(
            id: bookId,
            title: title,
            author: (n['actor_name'] ?? '').toString(),
            description: (n['message'] ?? '').toString(),
            statusText: '',
            rating: 0,
            genre: '',
            cta: 'Read Now',
            coverPath: cover,
          ),
        ),
      ),
    );
  }

  int _asInt(dynamic value) {
    if (value is num) return value.toInt();
    return int.tryParse(value?.toString() ?? '') ?? 0;
  }

  Future<void> _openNotification(Map<String, dynamic> n) async {
    final type = (n['type'] ?? '').toString().toLowerCase();
    final actorId = _asInt(n['actor_user_id']);
    final bookId = _asInt(n['book_id']);
    final chapterId = _asInt(n['chapter_id']);

    if (type == 'follow' && actorId > 0) {
      final bootstrap = widget.data is AppBootstrap
          ? widget.data as AppBootstrap
          : null;
      Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => ProfileScreen(
            profile: ProfileModel.fromMap({
              'id': actorId,
              'display_name': n['actor_name'] ?? 'Reader',
              'photo_url': n['actor_photo'] ?? '',
            }),
            apiService: widget.apiService,
            achievements: bootstrap?.achievements ?? const [],
            viewingUserId: actorId,
          ),
        ),
      );
      return;
    }

    if (bookId > 0 && chapterId > 0) {
      try {
        final chapters = await widget.apiService.fetchStoryChapters(bookId);
        final chapterIndex = chapters.indexWhere(
          (chapter) =>
              _asInt(chapter['id'] ?? chapter['chapter_id']) == chapterId,
        );
        if (chapterIndex >= 0 && mounted) {
          final chapter = chapters[chapterIndex];
          final book = await widget.apiService.fetchPublicBook(bookId) ?? n;
          if (!mounted) return;
          final tags = book['tags'];
          Navigator.of(context).push(
            MaterialPageRoute<void>(
              builder: (_) => ChapterReaderScreen(
                apiService: widget.apiService,
                title: (book['title'] ?? n['title'] ?? 'Story').toString(),
                author:
                    (book['author_display_name'] ??
                            book['author'] ??
                            n['actor_name'] ??
                            '')
                        .toString(),
                coverPath: (book['cover_path'] ?? n['cover_path'] ?? '')
                    .toString(),
                chapterNumber: _asInt(
                  chapter['chapter_number'] ?? chapter['number'],
                ),
                chapterTitle: (chapter['title'] ?? 'Chapter').toString(),
                chapterContent:
                    (chapter['content'] ??
                            chapter['chapter_content'] ??
                            chapter['body'] ??
                            '')
                        .toString(),
                bookId: bookId,
                tags: tags is List
                    ? tags.map((tag) => tag.toString()).toList()
                    : const [],
                authorUserId: _asInt(book['author_user_id'] ?? book['user_id']),
                authorPhotoUrl:
                    (book['author_photo_url'] ?? book['author_photo'] ?? '')
                        .toString(),
                chapters: chapters,
                initialChapterIndex: chapterIndex,
              ),
            ),
          );
          return;
        }
      } catch (error) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not open this notification: $error')),
        );
        return;
      }
    }

    if (bookId > 0) {
      _openBook(n);
    } else {
      _openNotificationMessage(n);
    }
  }

  void _openNotificationMessage(Map<String, dynamic> n) {
    final type = (n['type'] ?? '').toString().toLowerCase();
    final isAdmin = type == 'admin' || type == 'system';
    final title = (n['title'] ?? (isAdmin ? 'Announcement' : 'Support reply'))
        .toString();
    final message = (n['message'] ?? '').toString();
    final when = (n['created_at'] ?? '').toString();
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) {
        final isDark = Theme.of(ctx).brightness == Brightness.dark;
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Icon(
                      isAdmin ? Icons.campaign_outlined : Icons.support_agent,
                      color: AppTheme.brand,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        title,
                        style: TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 17,
                          color: isDark ? Colors.white : null,
                        ),
                      ),
                    ),
                    IconButton(
                      onPressed: () => Navigator.pop(ctx),
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
                if (when.isNotEmpty)
                  Text(
                    when,
                    style: TextStyle(
                      fontSize: 12,
                      color: isDark ? Colors.white70 : Colors.grey.shade600,
                    ),
                  ),
                const SizedBox(height: 12),
                Text(
                  message.isEmpty ? 'No message body.' : message,
                  style: TextStyle(
                    fontSize: 15,
                    height: 1.45,
                    color: isDark ? Colors.white : null,
                  ),
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('Close'),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _coverOrIcon(Map<String, dynamic> n, String type) {
    final cover = (n['cover_path'] ?? n['actor_photo'] ?? '').toString();
    if (cover.isNotEmpty) {
      final url = widget.apiService.resolveAssetUrl(cover);
      return ClipOval(
        child: Image.network(
          url,
          width: 40,
          height: 40,
          fit: BoxFit.cover,
          errorBuilder: (_, _, _) => _notificationIcon(type),
        ),
      );
    }
    return _notificationIcon(type);
  }

  Widget _notificationIcon(String type) {
    return CircleAvatar(
      backgroundColor: AppTheme.brand.withValues(alpha: 0.12),
      child: Icon(_iconFor(type), color: AppTheme.brand, size: 20),
    );
  }

  Widget _list({
    required Future<List<Map<String, dynamic>>> future,
    required String emptyTitle,
    required String emptyBody,
  }) {
    return RefreshIndicator(
      onRefresh: _refresh,
      child: FutureBuilder<List<Map<String, dynamic>>>(
        future: future,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                const SizedBox(height: 80),
                Icon(
                  Icons.cloud_off_outlined,
                  size: 48,
                  color: AppTheme.mutedOf(context),
                ),
                const SizedBox(height: 12),
                const Text(
                  'Notifications could not be loaded',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(32, 8, 32, 0),
                  child: Text(
                    '${snap.error}',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: AppTheme.mutedOf(context)),
                  ),
                ),
                Center(
                  child: TextButton.icon(
                    onPressed: () => setState(_reload),
                    icon: const Icon(Icons.refresh),
                    label: const Text('Retry'),
                  ),
                ),
              ],
            );
          }
          final rows = snap.data ?? const <Map<String, dynamic>>[];
          if (rows.isEmpty) {
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                const SizedBox(height: 80),
                Icon(
                  Icons.notifications_none,
                  size: 48,
                  color: AppTheme.mutedOf(context),
                ),
                const SizedBox(height: 12),
                Text(
                  emptyTitle,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(32, 8, 32, 0),
                  child: Text(
                    emptyBody,
                    textAlign: TextAlign.center,
                    style: TextStyle(color: AppTheme.mutedOf(context)),
                  ),
                ),
              ],
            );
          }
          final showAll = _tabs.index == 0
              ? _showAllActivity
              : _showAllAnnouncements;
          final visibleRows = showAll ? rows : rows.take(10).toList();
          final hasMore = rows.length > visibleRows.length;
          return ListView.separated(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
            itemCount: visibleRows.length + (hasMore ? 1 : 0),
            separatorBuilder: (_, _) => const Divider(height: 1),
            itemBuilder: (context, i) {
              if (i == visibleRows.length) {
                return Center(
                  child: TextButton(
                    onPressed: () => setState(() {
                      if (_tabs.index == 0) {
                        _showAllActivity = true;
                      } else {
                        _showAllAnnouncements = true;
                      }
                    }),
                    child: const Text('See more'),
                  ),
                );
              }
              final n = visibleRows[i];
              final type = (n['type'] ?? n['tab'] ?? '').toString();
              final title = (n['title'] ?? n['message'] ?? 'Update').toString();
              final message = (n['message'] ?? '').toString();
              final when = _formatDate(n['created_at']);
              final bookId = (n['book_id'] as num?)?.toInt() ?? 0;
              final actorId = _asInt(n['actor_user_id']);
              final chapterId = _asInt(n['chapter_id']);
              final isNavigable =
                  bookId > 0 ||
                  chapterId > 0 ||
                  actorId > 0 ||
                  message.isNotEmpty;
              return ListTile(
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 4,
                ),
                leading: _coverOrIcon(n, type),
                title: Text(
                  title,
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                  ),
                ),
                subtitle: Text(
                  [
                    if (message.isNotEmpty && message != title) message,
                    if (when.isNotEmpty) when,
                  ].join(' · '),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                trailing: isNavigable
                    ? const Icon(Icons.chevron_right, size: 20)
                    : null,
                onTap: () => _openNotification(n),
              );
            },
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      backgroundColor: isDark ? AppTheme.bgOf(context) : AppTheme.bgOf(context),
      appBar: AppBar(
        title: const Text('Notifications'),
        centerTitle: true,
        bottom: TabBar(
          controller: _tabs,
          labelColor: AppTheme.brand,
          unselectedLabelColor: isDark ? Colors.white70 : Colors.grey,
          indicatorColor: AppTheme.brand,
          tabs: const [
            Tab(text: 'Activity'),
            Tab(text: 'Announcements'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabs,
        children: [
          _list(
            future: _activityFuture,
            emptyTitle: 'No activity yet',
            emptyBody:
                'Likes, comments, follows, and support replies will appear here.',
          ),
          _list(
            future: _adminFuture,
            emptyTitle: 'No admin notices',
            emptyBody: 'System and admin announcements will appear here.',
          ),
        ],
      ),
    );
  }
}
