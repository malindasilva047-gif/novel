import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../../data/services/api_service.dart';
import 'create_story_screen.dart';
import 'edit_chapter_screen.dart';

/// Inkitt-style Manage Stories detail:
/// Open one story to manage its details and chapter list.
class StoryManageScreen extends StatefulWidget {
  const StoryManageScreen({
    super.key,
    required this.apiService,
    required this.story,
  });

  final ApiService apiService;
  final Map<String, dynamic> story;

  @override
  State<StoryManageScreen> createState() => _StoryManageScreenState();
}

class _StoryManageScreenState extends State<StoryManageScreen> {
  late Map<String, dynamic> _story;
  List<Map<String, dynamic>> _chapters = const [];
  bool _loading = true;
  bool _reordering = false;
  final Set<int> _deletingChapterIds = <int>{};
  String? _error;

  int get _storyId => (_story['id'] as num?)?.toInt() ?? 0;

  String get _statusRaw => (_story['status_text'] ?? 'Draft').toString().trim();

  bool get _isDraftStory {
    final s = _statusRaw.toLowerCase();
    return s.isEmpty ||
        s.contains('draft') ||
        s.contains('private') ||
        s.contains('unpublish');
  }

  @override
  void initState() {
    super.initState();
    _story = Map<String, dynamic>.from(widget.story);
    _reload();
  }

  Future<void> _reload() async {
    if (_storyId <= 0) {
      setState(() {
        _loading = false;
        _error = 'Invalid story';
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final latest = await widget.apiService.fetchWriterStory(_storyId);
      final chapters = await widget.apiService.fetchStoryChapters(_storyId);
      if (!mounted) return;
      setState(() {
        if (latest != null) _story = latest;
        _chapters = chapters;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  bool _detailsComplete(Map<String, dynamic> story) {
    final title = story['title']?.toString().trim() ?? '';
    final summary =
        (story['description'] ?? story['summary'])?.toString().trim() ?? '';
    final genre =
        (story['genre'] ?? story['primary_genre'])?.toString().trim() ?? '';
    final audience =
        (story['audience'] ?? story['age_rating'] ?? story['age'])
            ?.toString()
            .trim() ??
        '';
    final language = story['language']?.toString().trim() ?? '';
    return title.isNotEmpty &&
        summary.isNotEmpty &&
        genre.isNotEmpty &&
        audience.isNotEmpty &&
        language.isNotEmpty;
  }

  Future<bool> _requireCompleteDetails() async {
    if (_detailsComplete(_story)) return true;
    final edit = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Story details incomplete'),
        content: const Text(
          'Complete the required story details before publishing. You can save the chapter as a draft in the meantime.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Later'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Edit details'),
          ),
        ],
      ),
    );
    if (edit == true && mounted) await _editDetails();
    return false;
  }

  String _chapterLabel(Map<String, dynamic> c) {
    final raw = (c['submission_status'] ?? 'draft')
        .toString()
        .toLowerCase()
        .trim();
    if (raw == 'published' ||
        raw == 'submitted' ||
        raw == 'ongoing' ||
        raw == 'completed') {
      return 'Published';
    }
    if (raw == 'scheduled') return 'Scheduled';
    return 'Draft';
  }

  Color _chipBg(String label) {
    switch (label) {
      case 'Published':
        return const Color(0xFFD1FAE5);
      case 'Scheduled':
        return const Color(0xFFF6F5FA);
      default:
        return const Color(0xFFFEF3C7);
    }
  }

  Color _chipFg(String label) {
    switch (label) {
      case 'Published':
        return const Color(0xFF16856A);
      case 'Scheduled':
        return const Color(0xFF205B4C);
      default:
        return const Color(0xFFB45309);
    }
  }

  int _wordCount(Map<String, dynamic> c) {
    return (c['content'] ?? '')
        .toString()
        .trim()
        .split(RegExp(r'\s+'))
        .where((w) => w.isNotEmpty)
        .length;
  }

  Future<void> _editDetails() async {
    final result = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (_) =>
            CreateStoryScreen(apiService: widget.apiService, story: _story),
      ),
    );
    if (!mounted) return;
    await _reload();
    if (result == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Details updated — chapters unchanged')),
      );
    }
  }

  Future<void> _addOrEditChapter({Map<String, dynamic>? chapter}) async {
    final result = await Navigator.of(context).push<Object?>(
      MaterialPageRoute<Object?>(
        builder: (_) => EditChapterScreen(
          apiService: widget.apiService,
          storyId: _storyId,
          chapterId: (chapter?['id'] as num?)?.toInt(),
          chapterNumber: (chapter?['chapter_number'] as num?)?.toInt(),
          chapterTitle:
              chapter?['title']?.toString() ??
              (chapter == null ? 'Chapter ${_chapters.length + 1}' : 'Chapter'),
          initialContent: chapter?['content']?.toString() ?? '',
          createNew: chapter == null,
        ),
      ),
    );
    if (!mounted) return;
    if (result is Map && result['chapterDeleted'] == true) {
      await _reload();
      return;
    }
    if (result is Map && result['returnToWriteManager'] == true) {
      Navigator.of(context).pop(result);
      return;
    }
    await _reload();
  }

  bool _isLiveChapter(Map<String, dynamic> chapter) {
    final status = (chapter['submission_status'] ?? 'draft')
        .toString()
        .trim()
        .toLowerCase();
    return {'published', 'submitted', 'ongoing', 'completed'}.contains(status);
  }

  Map<String, dynamic>? _latestLiveChapter() {
    final live = _chapters.where(_isLiveChapter).toList()
      ..sort((a, b) {
        final aNumber = (a['chapter_number'] as num?)?.toInt() ?? 0;
        final bNumber = (b['chapter_number'] as num?)?.toInt() ?? 0;
        return bNumber.compareTo(aNumber);
      });
    return live.isEmpty ? null : live.first;
  }

  Future<void> _deleteChapter(Map<String, dynamic> chapter) async {
    final chapterId = (chapter['id'] as num?)?.toInt();
    if (chapterId == null) return;
    final status = (chapter['submission_status'] ?? 'draft')
        .toString()
        .trim()
        .toLowerCase();
    if (_isLiveChapter(chapter)) {
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Cannot delete chapter'),
          content: const Text(
            'Published chapters cannot be deleted directly. Please unpublish the chapter first.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('OK'),
            ),
          ],
        ),
      );
      return;
    }
    if (status == 'scheduled') {
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Cannot delete scheduled chapter'),
          content: const Text('Clear the chapter schedule before deleting it.'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('OK'),
            ),
          ],
        ),
      );
      return;
    }
    if (status != 'draft') {
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Cannot delete chapter'),
          content: const Text('Only draft chapters can be deleted.'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('OK'),
            ),
          ],
        ),
      );
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete chapter?'),
        content: const Text(
          'Are you sure you want to delete this chapter? This action cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete Chapter'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    if (!_deletingChapterIds.add(chapterId)) return;
    setState(() {});
    try {
      await widget.apiService.deleteStoryChapter(chapterId);
      if (!mounted) return;
      // Remove it immediately, then verify against the server's fresh list.
      // This keeps the manager responsive and prevents a stale chapter row
      // from looking like the delete succeeded when the API did not remove it.
      setState(() {
        _chapters = _chapters
            .where((item) => (item['id'] as num?)?.toInt() != chapterId)
            .toList();
      });
      await _reload();
      if (!mounted) return;
      if (_chapters.any((item) => (item['id'] as num?)?.toInt() == chapterId)) {
        throw StateError('The server still returned this chapter after deletion.');
      }
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Chapter deleted')));
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not delete chapter: $error')),
      );
      // Restore the server view after an unsuccessful delete or refresh.
      await _reload();
    } finally {
      _deletingChapterIds.remove(chapterId);
      if (mounted) setState(() {});
    }
  }

  Future<void> _deleteStory() async {
    if (_chapters.isNotEmpty) {
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Delete chapters first'),
          content: const Text(
            'Delete every chapter individually before deleting this story.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('OK'),
            ),
          ],
        ),
      );
      return;
    }
    if (!_isDraftStory) {
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Story must be a draft'),
          content: const Text('Move the story to Draft before deleting it.'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('OK'),
            ),
          ],
        ),
      );
      return;
    }
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete story?'),
        content: const Text(
          'All chapters have been deleted. Delete this story and its details page? This action cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete Story'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await widget.apiService.deleteWriterStory(_storyId);
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Story deleted')));
      Navigator.of(context).pop(const <String, dynamic>{'storyDeleted': true});
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Could not delete story: $error')));
    }
  }

  Future<void> _publishChapter(Map<String, dynamic> chapter) async {
    if (!await _requireCompleteDetails()) return;
    final chapterNumber = (chapter['chapter_number'] as num?)?.toInt() ?? 1;
    final ordered = [..._chapters]
      ..sort(
        (a, b) => ((a['chapter_number'] as num?)?.toInt() ?? 0).compareTo(
          (b['chapter_number'] as num?)?.toInt() ?? 0,
        ),
      );
    for (final previous in ordered) {
      final previousNumber = (previous['chapter_number'] as num?)?.toInt() ?? 0;
      if (previousNumber >= chapterNumber) break;
      if (!_isLiveChapter(previous)) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Publish Chapter $previousNumber before Chapter $chapterNumber.',
            ),
          ),
        );
        return;
      }
    }
    final words = _wordCount(chapter);
    if (words < 60) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'At least 60 words are required. Current count: $words.',
          ),
        ),
      );
      return;
    }
    try {
      final chapterId = (chapter['id'] as num?)?.toInt();
      if (chapterId == null) return;
      await widget.apiService.updateStoryChapter(chapterId, {
        'submission_status': 'published',
        'scheduled_for': null,
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Chapter $chapterNumber published')),
      );
      await _reload();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not publish chapter: $error')),
      );
    }
  }

  Future<void> _unpublishChapter(Map<String, dynamic> chapter) async {
    final latest = _latestLiveChapter();
    final latestId = (latest?['id'] as num?)?.toInt();
    final chapterId = (chapter['id'] as num?)?.toInt();
    final chapterNumber = (chapter['chapter_number'] as num?)?.toInt() ?? 1;
    final latestNumber =
        (latest?['chapter_number'] as num?)?.toInt() ?? chapterNumber;
    if (latestId != null && latestId != chapterId) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Please unpublish the latest chapter (Chapter $latestNumber) first.',
          ),
        ),
      );
      return;
    }
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Unpublish Chapter $chapterNumber?'),
        content: const Text(
          'This chapter will be hidden from readers. Other chapters stay unchanged.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Unpublish'),
          ),
        ],
      ),
    );
    if (confirmed != true || chapterId == null) return;
    try {
      await widget.apiService.updateStoryChapter(chapterId, {
        'submission_status': 'draft',
      });
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Chapter unpublished')));
      await _reload();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not unpublish chapter: $error')),
      );
    }
  }

  Future<void> _changeStoryStatus(String status) async {
    if (status == 'Draft') {
      final liveChapter = _chapters.any((chapter) {
        final chapterStatus = (chapter['submission_status'] ?? 'draft')
            .toString()
            .trim()
            .toLowerCase();
        return {
          'published',
          'submitted',
          'ongoing',
          'completed',
        }.contains(chapterStatus);
      });
      if (liveChapter) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Unpublish chapters from the latest chapter first. The story becomes Draft after all chapters are unpublished.',
            ),
          ),
        );
        return;
      }
    }
    if (status != 'Draft' && !await _requireCompleteDetails()) return;
    final confirmMsg = status == 'Ongoing'
        ? 'Readers will see this story. Continue?'
        : status == 'Completed'
        ? 'Mark as finished? Chapters stay available.'
        : 'Unpublish? Story will be hidden from readers. Chapters are kept.';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Change status'),
        content: Text(confirmMsg),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Confirm'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await widget.apiService.updateWriterStory(_storyId, {
        'status_text': status,
      });
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Status → $status')));
      await _reload();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Could not update status: $e')));
    }
  }

  Future<void> _unpublishAllChapters() async {
    final live = _chapters.where(_isLiveChapter).toList()
      ..sort((a, b) {
        final an = (a['chapter_number'] as num?)?.toInt() ?? 0;
        final bn = (b['chapter_number'] as num?)?.toInt() ?? 0;
        return bn.compareTo(an);
      });
    if (live.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('There are no published chapters to unpublish'),
        ),
      );
      return;
    }
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Unpublish all chapters?'),
        content: Text(
          'All ${live.length} published chapter(s) will be unpublished, starting from the latest chapter. The story will return to Draft.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Unpublish all'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      for (final chapter in live) {
        final chapterId = (chapter['id'] as num?)?.toInt();
        if (chapterId == null) continue;
        await widget.apiService.updateStoryChapter(chapterId, {
          'submission_status': 'draft',
          'scheduled_for': null,
        });
      }
      await widget.apiService.updateWriterStory(_storyId, {
        'status_text': 'Draft',
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('All chapters unpublished. Story moved to Draft.'),
        ),
      );
      await _reload();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not unpublish all chapters: $error')),
      );
      await _reload();
    }
  }

  Future<void> _onReorder(int oldIndex, int newIndex) async {
    if (oldIndex < newIndex) newIndex -= 1;
    final items = List<Map<String, dynamic>>.from(_chapters);
    final item = items.removeAt(oldIndex);
    items.insert(newIndex, item);
    setState(() {
      _chapters = items;
      _reordering = true;
    });
    final ids = items
        .map((c) => (c['id'] as num?)?.toInt() ?? 0)
        .where((id) => id > 0)
        .toList();
    try {
      await widget.apiService.reorderStoryChapters(_storyId, ids);
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Chapter order saved')));
      await _reload();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Could not reorder: $e')));
      await _reload();
    } finally {
      if (mounted) setState(() => _reordering = false);
    }
  }

  Future<void> _publishAllDrafts() async {
    if (!await _requireCompleteDetails()) return;
    final drafts = _chapters.where((c) {
      final s = (c['submission_status'] ?? 'draft')
          .toString()
          .toLowerCase()
          .trim();
      return s == 'draft' || s.isEmpty;
    }).toList();
    if (drafts.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No draft chapters to publish')),
      );
      return;
    }
    final orderedChapters = [..._chapters]
      ..sort((a, b) {
        final an = (a['chapter_number'] as num?)?.toInt() ?? 0;
        final bn = (b['chapter_number'] as num?)?.toInt() ?? 0;
        return an.compareTo(bn);
      });
    for (var index = 0; index < orderedChapters.length; index++) {
      final chapter = orderedChapters[index];
      final number = (chapter['chapter_number'] as num?)?.toInt() ?? index + 1;
      final status = (chapter['submission_status'] ?? 'draft')
          .toString()
          .trim()
          .toLowerCase();
      if ({'published', 'ongoing', 'completed'}.contains(status)) continue;
      final willBePublishedInThisBatch =
          (status.isEmpty || status == 'draft') && _wordCount(chapter) >= 60;
      if (willBePublishedInThisBatch) continue;
      final nextChapter = orderedChapters
          .skip(index + 1)
          .firstWhere(
            (item) => drafts.any((draft) => draft['id'] == item['id']),
            orElse: () => <String, dynamic>{},
          );
      if (nextChapter.isNotEmpty) {
        final nextNumber =
            (nextChapter['chapter_number'] as num?)?.toInt() ?? number + 1;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Chapter $number must be published before Chapter $nextNumber.',
            ),
          ),
        );
        return;
      }
    }
    final eligible = drafts.where((c) => _wordCount(c) >= 60).length;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Publish all drafts?'),
        content: Text(
          'Draft chapters: ${drafts.length}\n'
          'Ready (≥60 words): $eligible\n\n'
          'Eligible chapters become Published. '
          'Story stays meta-only (chapters not deleted).',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Publish all'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      final result = await widget.apiService.publishAllStoryChapters(_storyId);
      if (!mounted) return;
      final count = result['published_count'] ?? result['submitted_count'] ?? 0;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            result['message']?.toString() ??
                'Published $count chapter(s) — others unchanged',
          ),
        ),
      );
      await _reload();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Publish all failed: $e')));
    }
  }

  Future<void> _openScheduleManager() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        return DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.7,
          minChildSize: 0.4,
          maxChildSize: 0.95,
          builder: (_, scrollController) {
            return _ScheduleManagerSheet(
              apiService: widget.apiService,
              storyId: _storyId,
              chapters: _chapters,
              scrollController: scrollController,
              onChanged: () async {
                await _reload();
              },
            );
          },
        );
      },
    );
    if (mounted) await _reload();
  }

  @override
  Widget build(BuildContext context) {
    final title = _story['title']?.toString() ?? 'Story';
    final statusLabel = _isDraftStory
        ? 'Draft'
        : (_statusRaw.toLowerCase().contains('complete')
              ? 'Completed'
              : 'Ongoing');

    return Scaffold(
      backgroundColor: AppTheme.bgOf(context),
      appBar: AppBar(
        title: const Text('Manage story'),
        actions: [
          if (_reordering)
            const Padding(
              padding: EdgeInsets.only(right: 12),
              child: Center(
                child: SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            ),
          PopupMenuButton<String>(
            onSelected: (v) {
              if (v == 'schedule') {
                _openScheduleManager();
              } else if (v == 'status' && statusLabel != 'Draft') {
                _changeStoryStatus(
                  statusLabel == 'Completed' ? 'Ongoing' : 'Completed',
                );
              } else if (v == 'unpublish_all') {
                _unpublishAllChapters();
              } else if (v == 'delete_story') {
                _deleteStory();
              }
            },
            itemBuilder: (_) => [
              const PopupMenuItem(
                value: 'schedule',
                child: ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(Icons.schedule_outlined),
                  title: Text('Schedule'),
                ),
              ),
              if (statusLabel != 'Draft')
                PopupMenuItem(
                  value: 'status',
                  child: ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(
                      statusLabel == 'Completed'
                          ? Icons.play_circle_outline
                          : Icons.check_circle_outline,
                    ),
                    title: Text(
                      statusLabel == 'Completed'
                          ? 'Mark as Ongoing'
                          : 'Mark as Complete',
                    ),
                  ),
                ),
              PopupMenuItem(
                value: 'unpublish_all',
                enabled: _chapters.any(_isLiveChapter),
                child: ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(Icons.unpublished_outlined),
                  title: Text('Unpublish all chapters'),
                ),
              ),
              const PopupMenuItem(
                value: 'delete_story',
                child: ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(Icons.delete_outline, color: Colors.red),
                  title: Text(
                    'Delete Story',
                    style: TextStyle(color: Colors.red),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _addOrEditChapter(),
        icon: const Icon(Icons.add),
        label: const Text('Add chapter'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(_error!, textAlign: TextAlign.center),
                    const SizedBox(height: 12),
                    FilledButton(
                      onPressed: _reload,
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              ),
            )
          : RefreshIndicator(
              onRefresh: _reload,
              child: CustomScrollView(
                slivers: [
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            title,
                            style: const TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 10,
                                  vertical: 4,
                                ),
                                decoration: BoxDecoration(
                                  color: _isDraftStory
                                      ? const Color(0xFFFEF3C7)
                                      : const Color(0xFFD1FAE5),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Text(
                                  statusLabel,
                                  style: TextStyle(
                                    fontWeight: FontWeight.w600,
                                    fontSize: 12,
                                    color: _isDraftStory
                                        ? const Color(0xFFB45309)
                                        : const Color(0xFF16856A),
                                  ),
                                ),
                              ),
                              Text(
                                '${_chapters.length} chapter${_chapters.length == 1 ? '' : 's'}',
                                style: TextStyle(
                                  color: AppTheme.mutedOf(context),
                                  fontSize: 13,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              OutlinedButton.icon(
                                onPressed: _editDetails,
                                icon: const Icon(Icons.edit_outlined, size: 18),
                                label: const Text('Edit details'),
                              ),
                              OutlinedButton.icon(
                                onPressed: _openScheduleManager,
                                icon: const Icon(Icons.schedule, size: 18),
                                label: const Text('Schedule'),
                              ),
                              OutlinedButton.icon(
                                onPressed: _publishAllDrafts,
                                icon: const Icon(
                                  Icons.publish_outlined,
                                  size: 18,
                                ),
                                label: const Text('Publish all drafts'),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'Long-press a chapter to reorder. '
                            'Edit details never removes chapters.',
                            style: TextStyle(
                              fontSize: 12,
                              color: AppTheme.mutedOf(context),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  if (_chapters.isEmpty)
                    const SliverFillRemaining(
                      hasScrollBody: false,
                      child: Center(child: Text('No chapters yet — add one')),
                    )
                  else
                    SliverReorderableList(
                      itemCount: _chapters.length,
                      onReorder: _onReorder,
                      itemBuilder: (context, index) {
                        final c = _chapters[index];
                        final label = _chapterLabel(c);
                        final words = _wordCount(c);
                        final chTitle =
                            c['title']?.toString() ??
                            'Chapter ${c['chapter_number'] ?? index + 1}';
                        final scheduled = c['scheduled_for']?.toString() ?? '';
                        return ReorderableDelayedDragStartListener(
                          key: ValueKey('ch_${c['id']}_$index'),
                          index: index,
                          child: Card(
                            margin: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 4,
                            ),
                            child: ListTile(
                              leading: CircleAvatar(
                                radius: 14,
                                backgroundColor: AppTheme.surfaceOf(context),
                                child: Text(
                                  '${index + 1}',
                                  style: const TextStyle(fontSize: 12),
                                ),
                              ),
                              title: Text(
                                chTitle,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              subtitle: Padding(
                                padding: const EdgeInsets.only(top: 4),
                                child: Wrap(
                                  spacing: 8,
                                  runSpacing: 4,
                                  crossAxisAlignment: WrapCrossAlignment.center,
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 8,
                                        vertical: 2,
                                      ),
                                      decoration: BoxDecoration(
                                        color: _chipBg(label),
                                        borderRadius: BorderRadius.circular(6),
                                      ),
                                      child: Text(
                                        label,
                                        style: TextStyle(
                                          fontSize: 11,
                                          fontWeight: FontWeight.w600,
                                          color: _chipFg(label),
                                        ),
                                      ),
                                    ),
                                    if (words > 0)
                                      Text(
                                        '$words words',
                                        style: TextStyle(
                                          fontSize: 11,
                                          color: AppTheme.mutedOf(context),
                                        ),
                                      ),
                                    if (scheduled.isNotEmpty)
                                      Text(
                                        '⏱ ${scheduled.length > 16 ? scheduled.substring(0, 16) : scheduled}',
                                        style: const TextStyle(
                                          fontSize: 11,
                                          color: Color(0xFF205B4C),
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                              trailing: PopupMenuButton<String>(
                                enabled: !_deletingChapterIds.contains(
                                  (c['id'] as num?)?.toInt(),
                                ),
                                onSelected: (value) {
                                  if (value == 'edit') {
                                    _addOrEditChapter(chapter: c);
                                  } else if (value == 'publish') {
                                    _publishChapter(c);
                                  } else if (value == 'unpublish') {
                                    _unpublishChapter(c);
                                  } else if (value == 'delete') {
                                    _deleteChapter(c);
                                  }
                                },
                                itemBuilder: (_) {
                                  final live = _isLiveChapter(c);
                                  final latestId =
                                      (_latestLiveChapter()?['id'] as num?)
                                          ?.toInt();
                                  final chapterId = (c['id'] as num?)?.toInt();
                                  final canUnpublish =
                                      latestId == null || latestId == chapterId;
                                  return [
                                    const PopupMenuItem(
                                      value: 'edit',
                                      child: ListTile(
                                        contentPadding: EdgeInsets.zero,
                                        leading: Icon(Icons.edit_outlined),
                                        title: Text('Edit Chapter'),
                                      ),
                                    ),
                                    if (live)
                                      PopupMenuItem(
                                        value: 'unpublish',
                                        child: ListTile(
                                          contentPadding: EdgeInsets.zero,
                                          leading: Icon(
                                            Icons.unpublished_outlined,
                                            color: canUnpublish
                                                ? null
                                                : AppTheme.mutedOf(context),
                                          ),
                                          title: Text(
                                            'Unpublish Chapter',
                                            style: canUnpublish
                                                ? null
                                                : TextStyle(
                                                    color: AppTheme.mutedOf(
                                                      context,
                                                    ),
                                                  ),
                                          ),
                                        ),
                                      )
                                    else ...[
                                      const PopupMenuItem(
                                        value: 'publish',
                                        child: ListTile(
                                          contentPadding: EdgeInsets.zero,
                                          leading: Icon(Icons.publish_outlined),
                                          title: Text('Publish Chapter'),
                                        ),
                                      ),
                                    ],
                                    const PopupMenuItem(
                                      value: 'delete',
                                      child: ListTile(
                                        contentPadding: EdgeInsets.zero,
                                        leading: Icon(
                                          Icons.delete_outline,
                                          color: Colors.red,
                                        ),
                                        title: Text(
                                          'Delete Chapter',
                                          style: TextStyle(color: Colors.red),
                                        ),
                                      ),
                                    ),
                                  ];
                                },
                              ),
                              onTap: () => _addOrEditChapter(chapter: c),
                            ),
                          ),
                        );
                      },
                    ),
                  const SliverToBoxAdapter(child: SizedBox(height: 88)),
                ],
              ),
            ),
    );
  }
}

/// Full schedule manager — set / clear scheduled_for per chapter.
class _ScheduleManagerSheet extends StatefulWidget {
  const _ScheduleManagerSheet({
    required this.apiService,
    required this.storyId,
    required this.chapters,
    required this.scrollController,
    required this.onChanged,
  });

  final ApiService apiService;
  final int storyId;
  final List<Map<String, dynamic>> chapters;
  final ScrollController scrollController;
  final Future<void> Function() onChanged;

  @override
  State<_ScheduleManagerSheet> createState() => _ScheduleManagerSheetState();
}

class _ScheduleManagerSheetState extends State<_ScheduleManagerSheet> {
  late List<Map<String, dynamic>> _items;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _items = List<Map<String, dynamic>>.from(widget.chapters);
  }

  Future<void> _pickSchedule(Map<String, dynamic> chapter) async {
    final id = (chapter['id'] as num?)?.toInt();
    if (id == null) return;
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      initialDate: now.add(const Duration(days: 1)),
      firstDate: now,
      lastDate: now.add(const Duration(days: 365 * 2)),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: const TimeOfDay(hour: 9, minute: 0),
    );
    if (time == null || !mounted) return;
    final when = DateTime(
      date.year,
      date.month,
      date.day,
      time.hour,
      time.minute,
    );
    setState(() => _busy = true);
    try {
      await widget.apiService.updateStoryChapter(id, {
        'submission_status': 'scheduled',
        'scheduled_for': when.toIso8601String(),
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Scheduled for ${when.toLocal()}')),
      );
      await widget.onChanged();
      if (mounted) {
        setState(() {
          final idx = _items.indexWhere((c) => c['id'] == id);
          if (idx >= 0) {
            _items[idx] = {
              ..._items[idx],
              'submission_status': 'scheduled',
              'scheduled_for': when.toIso8601String(),
            };
          }
        });
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Schedule failed: $e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _clearSchedule(Map<String, dynamic> chapter) async {
    final id = (chapter['id'] as num?)?.toInt();
    if (id == null) return;
    setState(() => _busy = true);
    try {
      await widget.apiService.updateStoryChapter(id, {
        'submission_status': 'draft',
        'scheduled_for': null,
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Schedule cleared — back to Draft')),
      );
      await widget.onChanged();
      if (mounted) {
        setState(() {
          final idx = _items.indexWhere((c) => c['id'] == id);
          if (idx >= 0) {
            _items[idx] = {
              ..._items[idx],
              'submission_status': 'draft',
              'scheduled_for': null,
            };
          }
        });
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Clear failed: $e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppTheme.bgOf(context),
      borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
      child: Column(
        children: [
          const SizedBox(height: 8),
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: Colors.grey.shade400,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: Row(
              children: [
                const Expanded(
                  child: Text(
                    'Schedule manager',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                  ),
                ),
                if (_busy)
                  const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
              ],
            ),
          ),
          Padding(
            padding: EdgeInsets.symmetric(horizontal: 16),
            child: Text(
              'Pick a publish time per chapter. Other chapters stay unchanged.',
              style: TextStyle(fontSize: 12, color: AppTheme.mutedOf(context)),
            ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: ListView.builder(
              controller: widget.scrollController,
              itemCount: _items.length,
              itemBuilder: (context, index) {
                final c = _items[index];
                final title = c['title']?.toString() ?? 'Chapter ${index + 1}';
                final scheduled = c['scheduled_for']?.toString() ?? '';
                final status = (c['submission_status'] ?? 'draft')
                    .toString()
                    .toLowerCase();
                return ListTile(
                  title: Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  subtitle: Text(
                    scheduled.isNotEmpty
                        ? 'Scheduled: $scheduled'
                        : (status == 'published' || status == 'submitted'
                              ? 'Already published'
                              : 'Not scheduled'),
                    style: const TextStyle(fontSize: 12),
                  ),
                  trailing: Wrap(
                    spacing: 4,
                    children: [
                      IconButton(
                        tooltip: 'Set schedule',
                        icon: const Icon(Icons.schedule),
                        onPressed: _busy ? null : () => _pickSchedule(c),
                      ),
                      if (scheduled.isNotEmpty)
                        IconButton(
                          tooltip: 'Clear',
                          icon: const Icon(Icons.clear),
                          onPressed: _busy ? null : () => _clearSchedule(c),
                        ),
                    ],
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
