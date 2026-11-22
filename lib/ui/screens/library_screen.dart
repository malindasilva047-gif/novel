import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../core/constants/responsive.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/app_bootstrap.dart';
import '../../data/services/api_service.dart';
import 'chapter_reader_screen.dart';
import 'discover_screen.dart' show SearchScreen;
import 'notifications_screen.dart';
import 'story_detail_screen.dart';

/// Library: Ongoing Reading (in-progress) + Reading Lists + History (completed).
class LibraryScreen extends StatefulWidget {
  const LibraryScreen({
    super.key,
    required this.data,
    required this.apiService,
    required this.onOpenDiscover,
  });

  final AppBootstrap data;
  final ApiService apiService;
  final VoidCallback onOpenDiscover;

  @override
  State<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends State<LibraryScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  List<LibraryEntryModel> _entries = [];
  List<ReadingListModel> _readingLists = [];
  bool _loading = false;
  bool _listsLoading = false;
  int? _myUserId;

  /// Completed = user finished the book (all chapters read / marked complete).
  bool _isCompleted(LibraryEntryModel e) {
    final s = e.readingStatus.toLowerCase().trim();
    if (const {
      'completed',
      'complete',
      'finished',
      'done',
      'history',
    }.contains(s)) {
      return true;
    }
    // Do not infer completion from a nearly full progress bar.
    if (e.chapters > 0 && e.chaptersRead >= e.chapters) return true;
    return false;
  }

  /// Ongoing = started (opened chapters / scrolled) but not fully completed.
  bool _isOngoing(LibraryEntryModel e) {
    if (_isCompleted(e)) return false;
    // Must have real progress: chapters read, or paragraph position, or "Reading" status
    if (e.chaptersRead > 0) return true;
    if (e.lastParagraphIndex > 0) return true;
    if (e.lastChapterNumber > 1) return true;
    final s = e.readingStatus.toLowerCase().trim();
    if (s == 'reading' ||
        s == 'ongoing' ||
        s == 'in progress' ||
        s.contains('read')) {
      return true;
    }
    // Any library entry with updated text from reader counts as ongoing
    if (e.updatedText.toLowerCase().contains('ch.') ||
        e.updatedText.toLowerCase().contains('para')) {
      return true;
    }
    return true; // keep entry visible in Ongoing until marked Completed
  }

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _entries = [];
    _readingLists = [];
    _loadEntries();
    _loadLists();
    // Retry after auth token settles (fixes empty library on first open after login)
    Future<void>.delayed(const Duration(milliseconds: 600), () {
      if (!mounted) return;
      if (_entries.isEmpty) _loadEntries();
      if (_readingLists.isEmpty) _loadLists();
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadEntries() async {
    setState(() => _loading = true);
    try {
      // Retry once — token may still be settling after login
      List<Map<String, dynamic>> rows = [];
      Object? lastErr;
      for (var attempt = 0; attempt < 2; attempt++) {
        try {
          rows = await widget.apiService.fetchLibraryEntries();
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          await Future<void>.delayed(const Duration(milliseconds: 400));
        }
      }
      if (lastErr != null) throw lastErr;
      int? myId;
      try {
        final prefs = await SharedPreferences.getInstance();
        myId = prefs.getInt('auth_id');
      } catch (_) {}
      if (!mounted) return;
      final mapped = rows
          .map(LibraryEntryModel.fromMap)
          .where((e) => e.book.id > 0)
          .toList();
      setState(() {
        _myUserId = myId;
        _entries = mapped;
        _loading = false;
      });
    } catch (e) {
      if (mounted) {
        setState(() => _loading = false);
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Could not load library: $e')));
      }
    }
  }

  Future<void> _loadLists() async {
    setState(() => _listsLoading = true);
    try {
      final rows = await widget.apiService.fetchReadingLists();
      if (!mounted) return;
      setState(() {
        _readingLists = rows.map(ReadingListModel.fromMap).toList();
        _listsLoading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _listsLoading = false);
    }
  }

  void _openBookSearch() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => SearchScreen(apiService: widget.apiService),
      ),
    );
  }

  Future<void> _createList() async {
    final c = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Create New List'),
        content: TextField(
          controller: c,
          autofocus: true,
          decoration: const InputDecoration(hintText: 'List name'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, c.text.trim()),
            child: const Text('Create'),
          ),
        ],
      ),
    );
    // Dispose after dialog fully closed
    await Future<void>.delayed(const Duration(milliseconds: 50));
    c.dispose();
    if (name == null || name.isEmpty) return;
    try {
      final created = await widget.apiService.createReadingList({
        'name': name,
        'story_count': 0,
        'cover_path': '',
        'sort_order': _readingLists.length + 1,
      });
      await _loadLists();
      if (!mounted) return;
      final newId = (created['id'] as num?)?.toInt();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            newId != null
                ? 'Created "$name"'
                : 'Created "$name". Pull to refresh if it is not visible.',
          ),
        ),
      );
      if (_readingLists.isEmpty || !_readingLists.any((l) => l.name == name)) {
        await Future<void>.delayed(const Duration(milliseconds: 400));
        await _loadLists();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              e.toString().contains('401') || e.toString().contains('403')
                  ? 'Please sign in to create a reading list'
                  : 'Could not create list: $e',
            ),
          ),
        );
      }
    }
  }

  Future<void> _openList(ReadingListModel list) async {
    if (list.id <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Pull to refresh lists first')),
      );
      return;
    }
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => _ListDetail(
          listId: list.id,
          listName: list.name,
          api: widget.apiService,
        ),
      ),
    );
    if (!mounted) return;
    await _loadLists();
  }

  Future<void> _toggle(LibraryEntryModel e) async {
    final next = _isCompleted(e) ? 'Reading' : 'Completed';
    try {
      await widget.apiService.updateLibraryEntry(e.id, {
        'reading_status': next,
        'updated_text': e.updatedText,
        'chapters': e.chapters,
        'primary_genre': e.primaryGenre,
        'secondary_genre': e.secondaryGenre,
      });
      await _loadEntries();
    } catch (err) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('$err')));
      }
    }
  }

  Future<void> _delete(LibraryEntryModel e) async {
    try {
      await widget.apiService.deleteLibraryEntry(e.id);
      await _loadEntries();
    } catch (err) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('$err')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final ongoing = _entries.where(_isOngoing).toList();
    final history = _entries.where(_isCompleted).toList();
    final muted = AppTheme.mutedOf(context);
    final fg = AppTheme.inkOf(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Header: title + Premium + bell
        Padding(
          padding: EdgeInsets.fromLTRB(
            AppBreakpoints.pagePadding(context),
            12,
            8,
            4,
          ),
          child: Row(
            children: [
              Text(
                'Library',
                style: TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.6,
                  color: fg,
                ),
              ),
              const Spacer(),
              // Premium button hidden per product request
              IconButton(
                tooltip: 'Notifications',
                icon: Icon(
                  Icons.notifications_none_rounded,
                  size: 26,
                  color: fg,
                ),
                onPressed: () {
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => NotificationsScreen(
                        apiService: widget.apiService,
                        onOpenDiscover: widget.onOpenDiscover,
                      ),
                    ),
                  );
                },
              ),
            ],
          ),
        ),
        // Open the shared English/Sinhala catalog search from the Library.
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 10),
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: _openBookSearch,
              borderRadius: BorderRadius.circular(28),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 11,
                ),
                decoration: BoxDecoration(
                  color: AppTheme.fieldOf(context),
                  borderRadius: BorderRadius.circular(28),
                ),
                child: Row(
                  children: [
                    Icon(
                      Icons.search_rounded,
                      size: 20,
                      color: Colors.grey.shade500,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Search books (English / Sinhala)…',
                        style: TextStyle(
                          color: Colors.grey.shade500,
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
        // Stats strip
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
          child: Row(
            children: [
              Expanded(
                child: _LibraryStatChip(
                  icon: Icons.menu_book_outlined,
                  value: '${_entries.length}',
                  label: 'Stories',
                  color: const Color(0xFF16856A),
                ),
              ),
              Expanded(
                child: _LibraryStatChip(
                  icon: Icons.timelapse_rounded,
                  value: '${ongoing.length}',
                  label: 'In Progress',
                  color: const Color(0xFFF59E0B),
                ),
              ),
              Expanded(
                child: _LibraryStatChip(
                  icon: Icons.check_circle_outline,
                  value: '${history.length}',
                  label: 'Completed',
                  color: const Color(0xFF16785F),
                ),
              ),
              Expanded(
                child: _LibraryStatChip(
                  icon: Icons.bookmark_border_rounded,
                  value: '${_readingLists.length}',
                  label: 'Lists',
                  color: const Color(0xFFEC4899),
                ),
              ),
            ],
          ),
        ),
        TabBar(
          controller: _tabController,
          labelColor: AppTheme.brand,
          unselectedLabelColor: muted,
          indicatorColor: AppTheme.brand,
          indicatorWeight: 3,
          labelStyle: const TextStyle(
            fontWeight: FontWeight.w700,
            fontSize: 13,
          ),
          tabs: const [
            Tab(text: 'Ongoing'),
            Tab(text: 'Reading Lists'),
            Tab(text: 'Completed'),
          ],
        ),
        Expanded(
          child: TabBarView(
            controller: _tabController,
            children: [
              _EntriesList(
                entries: ongoing,
                loading: _loading,
                api: widget.apiService,
                onToggle: _toggle,
                onDelete: _delete,
                onRefresh: () async {
                  await _loadEntries();
                  await _loadLists();
                },
                onDiscover: widget.onOpenDiscover,
              ),
              _ListsPane(
                lists: _readingLists,
                loading: _listsLoading,
                onCreate: _createList,
                onOpen: _openList,
                onRefresh: () async {
                  await _loadEntries();
                  await _loadLists();
                },
              ),
              _EntriesList(
                entries: history,
                loading: _loading,
                api: widget.apiService,
                onToggle: _toggle,
                onDelete: _delete,
                onRefresh: () async {
                  await _loadEntries();
                  await _loadLists();
                },
                onDiscover: widget.onOpenDiscover,
                history: true,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _LibraryStatChip extends StatelessWidget {
  const _LibraryStatChip({
    required this.icon,
    required this.value,
    required this.label,
    required this.color,
  });

  final IconData icon;
  final String value;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 4),
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
      decoration: BoxDecoration(
        color: isDark
            ? AppTheme.surfaceOf(context)
            : color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(height: 4),
          Text(
            value,
            style: TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 15,
              color: isDark ? Colors.white : const Color(0xFF1A1A1A),
            ),
          ),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w500,
              color: isDark ? Colors.white60 : Colors.grey.shade600,
            ),
          ),
        ],
      ),
    );
  }
}

class _EntriesList extends StatelessWidget {
  const _EntriesList({
    required this.entries,
    required this.loading,
    required this.api,
    required this.onToggle,
    required this.onDelete,
    required this.onRefresh,
    required this.onDiscover,
    this.history = false,
  });

  final List<LibraryEntryModel> entries;
  final bool loading;
  final ApiService api;
  final ValueChanged<LibraryEntryModel> onToggle;
  final ValueChanged<LibraryEntryModel> onDelete;
  final Future<void> Function() onRefresh;
  final VoidCallback onDiscover;
  final bool history;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? const Color(0xFFA0A0A0) : AppTheme.mutedOf(context);

    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(24, 14, 24, 30),
        children: [
          Text(
            history ? 'Completed' : 'Continue Reading',
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.3,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            history
                ? 'Books you finished (all chapters read or marked completed).'
                : 'Books you started but have not finished yet.',
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: muted),
          ),
          const SizedBox(height: 18),
          if (loading)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(40),
                child: CircularProgressIndicator(),
              ),
            )
          else if (entries.isEmpty)
            Center(
              child: Text(
                history
                    ? 'No completed books yet.\nFinish the last chapter of a story to move it here.'
                    : 'No ongoing books yet.\nOpen a chapter to start tracking.',
                style: TextStyle(color: muted),
              ),
            )
          else
            ...entries.map((e) {
              final coverUrl = e.book.coverPath.isNotEmpty
                  ? api.resolveAssetUrl(e.book.coverPath)
                  : '';
              final desc = e.book.description.trim();
              final progress = e.progressFraction.clamp(0.0, 1.0);
              return Padding(
                padding: const EdgeInsets.only(bottom: 14),
                child: Material(
                  color: isDark ? AppTheme.surfaceOf(context) : Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  elevation: 0,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: () async {
                      // Ongoing: resume at last chapter + paragraph
                      // History: open story detail
                      if (history) {
                        Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (_) => StoryDetailScreen(
                              apiService: api,
                              book: BookDetailModel(
                                id: e.book.id,
                                title: e.book.title,
                                author: e.book.author,
                                description: e.book.description,
                                statusText: e.book.statusText,
                                rating: e.book.rating,
                                genre: e.book.primaryGenre,
                                cta: e.book.cta,
                                coverPath: e.book.coverPath,
                                authorUserId: e.book.authorUserId,
                              ),
                            ),
                          ),
                        );
                        return;
                      }
                      List<Map<String, dynamic>> chapters = const [];
                      try {
                        chapters = await api.fetchStoryChapters(e.book.id);
                      } catch (_) {}
                      if (!context.mounted) return;
                      if (chapters.isEmpty) {
                        Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (_) => StoryDetailScreen(
                              apiService: api,
                              book: BookDetailModel(
                                id: e.book.id,
                                title: e.book.title,
                                author: e.book.author,
                                description: e.book.description,
                                statusText: e.book.statusText,
                                rating: e.book.rating,
                                genre: e.book.primaryGenre,
                                cta: e.book.cta,
                                coverPath: e.book.coverPath,
                                authorUserId: e.book.authorUserId,
                              ),
                            ),
                          ),
                        );
                        return;
                      }
                      var idx = chapters.indexWhere(
                        (c) =>
                            (c['chapter_number'] as num?)?.toInt() ==
                            e.lastChapterNumber,
                      );
                      if (idx < 0) idx = 0;
                      final ch = chapters[idx];
                      final chapterNo =
                          (ch['chapter_number'] as num?)?.toInt() ??
                          e.lastChapterNumber;
                      final chapterTitle = (ch['title'] ?? 'Chapter $chapterNo')
                          .toString();
                      final content = (ch['content'] ?? '').toString();
                      await Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => ChapterReaderScreen(
                            apiService: api,
                            title: e.book.title,
                            author: e.book.author,
                            coverPath: e.book.coverPath,
                            chapterNumber: chapterNo,
                            chapterTitle: chapterTitle,
                            chapterContent: content,
                            bookId: e.book.id,
                            authorUserId: e.book.authorUserId,
                            chapters: chapters,
                            initialChapterIndex: idx,
                            initialParagraphIndex: e.lastParagraphIndex,
                          ),
                        ),
                      );
                    },
                    child: Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: isDark ? const Color(0xFF1A1A1A) : Colors.white,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: isDark
                              ? const Color(0xFF2C2C2C)
                              : const Color(0xFFDDE2DF),
                        ),
                        boxShadow: isDark
                            ? const []
                            : [
                                BoxShadow(
                                  color: const Color(
                                    0xFF16856A,
                                  ).withValues(alpha: 0.05),
                                  blurRadius: 10,
                                  offset: const Offset(0, 3),
                                ),
                              ],
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          ClipRRect(
                            borderRadius: BorderRadius.circular(8),
                            child: SizedBox(
                              width: 72,
                              height: 102,
                              child: coverUrl.isNotEmpty
                                  ? Image.network(
                                      coverUrl,
                                      fit: BoxFit.cover,
                                      errorBuilder: (_, _, _) => ColoredBox(
                                        color: isDark
                                            ? const Color(0xFF2C2C2C)
                                            : const Color(0xFFE4E4E4),
                                        child: const Icon(
                                          Icons.menu_book_rounded,
                                        ),
                                      ),
                                    )
                                  : ColoredBox(
                                      color: isDark
                                          ? const Color(0xFF2C2C2C)
                                          : const Color(0xFFE4E4E4),
                                      child: const Icon(
                                        Icons.menu_book_rounded,
                                      ),
                                    ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  e.book.title,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 15,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  () {
                                    final genre = e.primaryGenre.isNotEmpty
                                        ? e.primaryGenre
                                        : e.book.primaryGenre;
                                    if (genre.isNotEmpty &&
                                        e.book.author.isNotEmpty) {
                                      return '$genre · ${e.book.author}';
                                    }
                                    if (genre.isNotEmpty) return genre;
                                    if (e.book.author.isNotEmpty) {
                                      return 'By ${e.book.author}';
                                    }
                                    return e.readingStatus;
                                  }(),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    fontSize: 12.5,
                                    color: muted,
                                  ),
                                ),
                                if (desc.isNotEmpty) ...[
                                  const SizedBox(height: 4),
                                  Text(
                                    desc,
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      fontSize: 12,
                                      height: 1.3,
                                      color: muted,
                                    ),
                                  ),
                                ],
                                const SizedBox(height: 6),
                                Row(
                                  children: [
                                    if (e.book.rating > 0) ...[
                                      const Icon(
                                        Icons.star_rounded,
                                        size: 14,
                                        color: Color(0xFFF4CC2F),
                                      ),
                                      const SizedBox(width: 2),
                                      Text(
                                        e.book.rating.toStringAsFixed(1),
                                        style: const TextStyle(
                                          fontSize: 12,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                    ],
                                    if (e.primaryGenre.isNotEmpty ||
                                        e.book.primaryGenre.isNotEmpty)
                                      Flexible(
                                        child: Text(
                                          e.primaryGenre.isNotEmpty
                                              ? e.primaryGenre
                                              : e.book.primaryGenre,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: TextStyle(
                                            fontSize: 11.5,
                                            color: muted,
                                          ),
                                        ),
                                      ),
                                  ],
                                ),
                                if (!history) ...[
                                  const SizedBox(height: 8),
                                  ClipRRect(
                                    borderRadius: BorderRadius.circular(3),
                                    child: LinearProgressIndicator(
                                      value: progress < 0.05 ? 0.05 : progress,
                                      minHeight: 6,
                                      backgroundColor: isDark
                                          ? const Color(0xFF333333)
                                          : const Color(0xFFDDE2DF),
                                      color: const Color(0xFF16856A),
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Row(
                                    children: [
                                      Expanded(
                                        child: Text(
                                          e.chapters > 0
                                              ? 'Ch. ${e.lastChapterNumber} of ${e.chapters} · para ${e.lastParagraphIndex + 1}'
                                              : (e.updatedText.isNotEmpty
                                                    ? e.updatedText
                                                    : 'Ch. ${e.lastChapterNumber} · para ${e.lastParagraphIndex + 1}'),
                                          style: TextStyle(
                                            fontSize: 11,
                                            color: muted,
                                          ),
                                        ),
                                      ),
                                      Text(
                                        '${(progress.clamp(0.0, 1.0) * 100).round()}%',
                                        style: const TextStyle(
                                          fontSize: 11,
                                          fontWeight: FontWeight.w700,
                                          color: Color(0xFF16856A),
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ],
                            ),
                          ),
                          PopupMenuButton<String>(
                            onSelected: (v) {
                              if (v == 'status') onToggle(e);
                              if (v == 'delete') onDelete(e);
                            },
                            itemBuilder: (_) => [
                              PopupMenuItem(
                                value: 'status',
                                child: Text(
                                  history
                                      ? 'Mark as Ongoing'
                                      : 'Mark as Completed',
                                ),
                              ),
                              const PopupMenuItem(
                                value: 'delete',
                                child: Text('Delete'),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              );
            }),
          if (!history) ...[
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: onDiscover,
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFF16856A),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                icon: const Icon(Icons.auto_stories_outlined),
                label: const Text('Discover more stories'),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _ListsPane extends StatelessWidget {
  const _ListsPane({
    required this.lists,
    required this.loading,
    required this.onCreate,
    required this.onOpen,
    required this.onRefresh,
  });

  final List<ReadingListModel> lists;
  final bool loading;
  final Future<void> Function() onCreate;
  final ValueChanged<ReadingListModel> onOpen;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? const Color(0xFFA0A0A0) : AppTheme.mutedOf(context);

    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(24, 14, 24, 30),
        children: [
          Text(
            'My Collections',
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.3,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Tap a list to open, add, or remove stories.',
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: muted),
          ),
          const SizedBox(height: 18),
          if (loading)
            const Center(child: CircularProgressIndicator())
          else if (lists.isEmpty)
            Center(
              child: Text('No lists yet', style: TextStyle(color: muted)),
            )
          else
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 1.15,
              children: [
                for (final l in lists)
                  GestureDetector(
                    onTap: () => onOpen(l),
                    child: Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: isDark
                            ? const Color(0xFF1A1A1A)
                            : const Color(0xFFF6F5FA),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: isDark
                              ? const Color(0xFF2C2C2C)
                              : const Color(0xFFDDE2DF),
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            width: 40,
                            height: 40,
                            decoration: BoxDecoration(
                              color: const Color(
                                0xFF16856A,
                              ).withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: const Icon(
                              Icons.collections_bookmark_outlined,
                              color: Color(0xFF16856A),
                            ),
                          ),
                          const Spacer(),
                          Text(
                            l.name,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 14,
                              color: isDark
                                  ? Colors.white
                                  : const Color(0xFF1A1A1A),
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            '${l.storyCount} stories',
                            style: TextStyle(fontSize: 12, color: muted),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: () => onCreate(),
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF16856A),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              icon: const Icon(Icons.add),
              label: const Text('Create New List'),
            ),
          ),
          const SizedBox(height: 8),
          // keep spacer for layout parity
          const SizedBox.shrink(),
        ],
      ),
    );
  }
}

class _ListDetail extends StatefulWidget {
  const _ListDetail({
    required this.listId,
    required this.listName,
    required this.api,
  });

  final int listId;
  final String listName;
  final ApiService api;

  @override
  State<_ListDetail> createState() => _ListDetailState();
}

class _ListDetailState extends State<_ListDetail> {
  bool _loading = true;
  List<Map<String, dynamic>> _items = [];
  String _name = '';

  @override
  void initState() {
    super.initState();
    _name = widget.listName;
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final data = await widget.api.fetchReadingListDetail(widget.listId);
      if (!mounted) return;
      setState(() {
        _name = data['name']?.toString() ?? widget.listName;
        _items = List<Map<String, dynamic>>.from(data['items'] as List? ?? []);
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _add() async {
    // Prefer search; fall back to writer stories / library entries so lists
    // can always receive books even when /api/search is empty.
    List<Map<String, dynamic>> rows = [];
    try {
      rows = await widget.api.searchStories(query: '');
    } catch (_) {}
    if (rows.isEmpty) {
      try {
        rows = await widget.api.fetchWriterStories();
      } catch (_) {}
    }
    if (rows.isEmpty) {
      try {
        final lib = await widget.api.fetchLibraryEntries();
        rows = lib
            .map((e) {
              final book = e['book'];
              if (book is Map) {
                return Map<String, dynamic>.from(book);
              }
              return <String, dynamic>{
                'id': e['book_id'] ?? e['id'],
                'title': e['title'] ?? 'Story',
                'author': e['author'] ?? '',
              };
            })
            .where((m) => ((m['id'] as num?)?.toInt() ?? 0) > 0)
            .toList();
      } catch (_) {}
    }
    if (!mounted) return;
    if (rows.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('No stories available to add. Browse Discover first.'),
        ),
      );
      return;
    }
    final picked = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        child: SizedBox(
          height: MediaQuery.of(ctx).size.height * 0.6,
          child: Column(
            children: [
              const Padding(
                padding: EdgeInsets.fromLTRB(16, 14, 16, 8),
                child: Text(
                  'Add story to list',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                ),
              ),
              const Divider(height: 1),
              Expanded(
                child: ListView.builder(
                  itemCount: rows.length,
                  itemBuilder: (ctx, i) {
                    final r = rows[i];
                    return ListTile(
                      title: Text('${r['title'] ?? 'Untitled'}'),
                      subtitle: Text('${r['author'] ?? ''}'),
                      onTap: () => Navigator.pop(ctx, r),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
    if (picked == null) return;
    final id =
        (picked['id'] as num?)?.toInt() ?? (picked['book_id'] as num?)?.toInt();
    if (id == null || id <= 0) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Invalid story — could not add')),
        );
      }
      return;
    }
    try {
      await widget.api.addReadingListItem(widget.listId, id);
      await _load();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Story saved to reading list')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Could not save: $e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_name),
        actions: [
          IconButton(icon: const Icon(Icons.add), onPressed: _add),
          IconButton(
            icon: const Icon(Icons.delete_outline),
            onPressed: () async {
              try {
                await widget.api.deleteReadingList(widget.listId);
                if (mounted) Navigator.pop(context);
              } catch (e) {
                if (mounted) {
                  ScaffoldMessenger.of(
                    context,
                  ).showSnackBar(SnackBar(content: Text('$e')));
                }
              }
            },
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView.separated(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 24),
              itemCount: _items.length,
              separatorBuilder: (_, _) => const SizedBox(height: 8),
              itemBuilder: (ctx, i) {
                final it = _items[i];
                final title = '${it['title'] ?? ''}';
                final author = '${it['author'] ?? ''}';
                final cover = '${it['cover_path'] ?? it['coverPath'] ?? ''}';
                final bookId =
                    (it['book_id'] as num?)?.toInt() ??
                    (it['id'] as num?)?.toInt() ??
                    0;
                // Prefer explicit book_id; item id is list-item id
                final resolvedBookId = (it['book_id'] as num?)?.toInt() ?? 0;
                final coverUrl = cover.isNotEmpty
                    ? widget.api.resolveAssetUrl(cover)
                    : '';
                return Material(
                  color: Theme.of(ctx).cardColor,
                  borderRadius: BorderRadius.circular(12),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: () {
                      final bid = resolvedBookId > 0 ? resolvedBookId : bookId;
                      if (bid <= 0) return;
                      Navigator.of(ctx).push(
                        MaterialPageRoute<void>(
                          builder: (_) => StoryDetailScreen(
                            apiService: widget.api,
                            book: BookDetailModel(
                              id: bid,
                              title: title,
                              author: author,
                              description: '',
                              coverPath: cover,
                              statusText: '',
                              rating: 0,
                              genre: '${it['genre'] ?? ''}',
                              cta: 'Read now',
                            ),
                          ),
                        ),
                      );
                    },
                    child: Padding(
                      padding: const EdgeInsets.all(10),
                      child: Row(
                        children: [
                          ClipRRect(
                            borderRadius: BorderRadius.circular(8),
                            child: SizedBox(
                              width: 52,
                              height: 72,
                              child: coverUrl.isNotEmpty
                                  ? Image.network(
                                      coverUrl,
                                      fit: BoxFit.cover,
                                      errorBuilder: (_, _, _) => ColoredBox(
                                        color: Theme.of(ctx).dividerColor,
                                        child: const Icon(
                                          Icons.menu_book,
                                          size: 22,
                                        ),
                                      ),
                                    )
                                  : ColoredBox(
                                      color: Theme.of(ctx).dividerColor,
                                      child: const Icon(
                                        Icons.menu_book,
                                        size: 22,
                                      ),
                                    ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  title.isEmpty ? 'Untitled' : title,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w600,
                                    fontSize: 14,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  author.isEmpty
                                      ? 'Unknown author'
                                      : 'by $author',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: Theme.of(ctx).hintColor,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          IconButton(
                            icon: const Icon(Icons.remove_circle_outline),
                            onPressed: () async {
                              final itemId = (it['id'] as num?)?.toInt();
                              if (itemId == null) return;
                              await widget.api.removeReadingListItem(
                                widget.listId,
                                itemId,
                              );
                              await _load();
                            },
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
    );
  }
}
