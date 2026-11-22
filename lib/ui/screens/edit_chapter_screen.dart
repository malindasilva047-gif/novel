import 'dart:async';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/theme/app_theme.dart';
import '../../data/services/api_service.dart';
import 'root_shell.dart';
import 'create_story_screen.dart';

class EditChapterScreen extends StatefulWidget {
  const EditChapterScreen({
    super.key,
    required this.apiService,
    required this.storyId,
    this.chapterId,
    this.chapterNumber,
    this.chapterTitle = 'Chapter 1',
    this.initialContent = '',
    this.createNew = false,
  });

  final ApiService apiService;
  final int storyId;

  /// When set, load/update this specific chapter.
  final int? chapterId;
  final int? chapterNumber;
  final String chapterTitle;
  final String initialContent;

  /// When true, start blank and POST a new chapter on save.
  final bool createNew;

  @override
  State<EditChapterScreen> createState() => _EditChapterScreenState();
}

class _EditChapterScreenState extends State<EditChapterScreen> {
  late TextEditingController _titleController;
  late TextEditingController _textController;
  final List<TextEditingValue> _undoHistory = [];
  final List<TextEditingValue> _redoHistory = [];
  late TextEditingValue _lastHistoryValue;
  bool _applyingHistory = false;

  bool _isLoading = true;
  bool _isSaving = false;
  bool _isPublishing = false;
  bool _isDeleting = false;

  int? _chapterId;
  int _chapterNumber = 1;
  String _chapterNotes = '';
  String _initialTitle = '';
  String _initialContent = '';
  String _initialNotes = '';
  String _submissionStatus = 'draft';
  DateTime? _scheduledFor;
  Timer? _autosaveTimer;
  bool _autosaving = false;

  int get _wordCount {
    final text = _textController.text.trim();
    if (text.isEmpty) return 0;
    return text.split(RegExp(r'\s+')).length;
  }

  @override
  void initState() {
    super.initState();
    _titleController = TextEditingController(text: widget.chapterTitle);
    _textController = TextEditingController(text: widget.initialContent);
    _lastHistoryValue = _textController.value;
    _textController.addListener(_trackTextHistory);
    _titleController.addListener(_scheduleAutosave);
    _textController.addListener(_scheduleAutosave);
    _loadChapter();
  }

  void _trackTextHistory() {
    final next = _textController.value;
    if (!_applyingHistory && next.text != _lastHistoryValue.text) {
      _undoHistory.add(_lastHistoryValue);
      if (_undoHistory.length > 100) _undoHistory.removeAt(0);
      _redoHistory.clear();
    }
    _lastHistoryValue = next;
    if (mounted) setState(() {});
  }

  void _undoText() {
    if (_undoHistory.isEmpty) return;
    final previous = _undoHistory.removeLast();
    _redoHistory.add(_textController.value);
    _applyingHistory = true;
    _textController.value = previous;
    _applyingHistory = false;
    _lastHistoryValue = previous;
  }

  void _redoText() {
    if (_redoHistory.isEmpty) return;
    final next = _redoHistory.removeLast();
    _undoHistory.add(_textController.value);
    _applyingHistory = true;
    _textController.value = next;
    _applyingHistory = false;
    _lastHistoryValue = next;
  }

  @override
  void dispose() {
    _autosaveTimer?.cancel();
    _titleController.removeListener(_scheduleAutosave);
    _textController.removeListener(_scheduleAutosave);
    _titleController.dispose();
    _textController.dispose();
    super.dispose();
  }

  void _scheduleAutosave() {
    if (_isLoading || !mounted) return;
    _autosaveTimer?.cancel();
    _autosaveTimer = Timer(const Duration(seconds: 2), _autosaveDraft);
  }

  Future<void> _autosaveDraft() async {
    if (!mounted || _isLoading || _isSaving || _isPublishing || _autosaving) {
      return;
    }
    if (_titleController.text.trim().isEmpty ||
        _textController.text.trim().isEmpty) {
      return;
    }
    if (_titleController.text.trim() == _initialTitle &&
        _textController.text.trim() == _initialContent) {
      return;
    }
    _autosaving = true;
    try {
      await _saveChapter(submissionStatus: _submissionStatus, quiet: true);
    } finally {
      _autosaving = false;
      if (mounted &&
          (_titleController.text.trim() != _initialTitle ||
              _textController.text.trim() != _initialContent)) {
        _scheduleAutosave();
      }
    }
  }

  Future<void> _openDetailsToComplete(Map<String, dynamic> story) async {
    await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (_) =>
            CreateStoryScreen(apiService: widget.apiService, story: story),
      ),
    );
  }

  Future<bool> _ensureStoryDetailsForPublishing() async {
    final story = await widget.apiService.fetchWriterStory(widget.storyId);
    if (!mounted) return false;
    final title = (story?['title'] ?? '').toString().trim();
    final description = (story?['description'] ?? story?['summary'] ?? '')
        .toString()
        .trim();
    final genre = (story?['genre'] ?? story?['primary_genre'] ?? '')
        .toString()
        .trim();
    final audience =
        (story?['audience'] ?? story?['age_rating'] ?? story?['age'] ?? '')
            .toString()
            .trim();
    final language = (story?['language'] ?? '').toString().trim();
    if (title.isEmpty ||
        description.isEmpty ||
        genre.isEmpty ||
        audience.isEmpty ||
        language.isEmpty) {
      await _openDetailsToComplete(
        story ?? {'id': widget.storyId, 'title': 'Story'},
      );
      return false;
    }
    return true;
  }

  Future<void> _loadChapter() async {
    setState(() => _isLoading = true);
    try {
      // New chapter: open editor immediately (no network wait).
      if (widget.createNew) {
        int next = widget.chapterNumber ?? 1;
        try {
          final chapters = await widget.apiService.fetchStoryChapters(
            widget.storyId,
          );
          for (final c in chapters) {
            final n = (c['chapter_number'] as num?)?.toInt() ?? 0;
            if (n >= next) next = n + 1;
          }
        } catch (_) {
          // Keep default chapter number if listing fails
        }
        _chapterId = null;
        _chapterNumber = next;
        _titleController.text = widget.chapterTitle.isNotEmpty
            ? widget.chapterTitle
            : 'Chapter $_chapterNumber';
        _textController.text = widget.initialContent;
        _chapterNotes = '';
        _submissionStatus = 'draft';
        _scheduledFor = null;
        return;
      }

      final chapters = await widget.apiService.fetchStoryChapters(
        widget.storyId,
      );
      Map<String, dynamic>? chapter;
      if (widget.chapterId != null) {
        for (final c in chapters) {
          if ((c['id'] as num?)?.toInt() == widget.chapterId) {
            chapter = c;
            break;
          }
        }
      }
      // Fall back to requested number, else first chapter.
      if (chapter == null && widget.chapterNumber != null) {
        for (final c in chapters) {
          if ((c['chapter_number'] as num?)?.toInt() == widget.chapterNumber) {
            chapter = c;
            break;
          }
        }
      }
      if (chapter == null && chapters.isNotEmpty && !widget.createNew) {
        chapter = chapters.first;
      }

      if (chapter != null) {
        _chapterId = (chapter['id'] as num?)?.toInt();
        _chapterNumber =
            (chapter['chapter_number'] as num?)?.toInt() ??
            widget.chapterNumber ??
            1;
        _titleController.text =
            chapter['title']?.toString().trim().isNotEmpty == true
            ? chapter['title'].toString()
            : widget.chapterTitle;
        _textController.text = chapter['content']?.toString() ?? '';
        _chapterNotes = chapter['notes']?.toString() ?? '';
        _submissionStatus =
            chapter['submission_status']?.toString().trim().isNotEmpty == true
            ? chapter['submission_status'].toString()
            : 'draft';
        final scheduledFor = chapter['scheduled_for']?.toString();
        _scheduledFor = scheduledFor != null && scheduledFor.isNotEmpty
            ? DateTime.tryParse(scheduledFor)
            : null;
      } else {
        // No chapters yet — prepare chapter 1 as new.
        _chapterId = null;
        _chapterNumber = widget.chapterNumber ?? 1;
        _titleController.text = widget.chapterTitle;
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Could not load chapter. You can still write and save.',
            ),
          ),
        );
      }
    } finally {
      if (mounted) {
        _initialTitle = _titleController.text;
        _initialContent = _textController.text;
        _initialNotes = _chapterNotes;
        _undoHistory.clear();
        _redoHistory.clear();
        _lastHistoryValue = _textController.value;
        setState(() => _isLoading = false);
      }
    }
  }

  bool get _isDirty {
    return _titleController.text != _initialTitle ||
        _textController.text != _initialContent ||
        _chapterNotes != _initialNotes;
  }

  /// Open editor for next chapter on the SAME story (never pops back to create story).
  Future<void> _openNextChapterEditor() async {
    if (widget.storyId <= 0) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Missing story id — cannot add chapter')),
      );
      return;
    }
    // Prefer server-side next number so we never collide
    int nextNo = _chapterNumber + 1;
    try {
      final chapters = await widget.apiService.fetchStoryChapters(
        widget.storyId,
      );
      var maxN = 0;
      for (final c in chapters) {
        final n = (c['chapter_number'] as num?)?.toInt() ?? 0;
        if (n > maxN) maxN = n;
      }
      if (maxN + 1 > nextNo) nextNo = maxN + 1;
    } catch (_) {}
    if (!mounted) return;
    final result = await Navigator.of(context).push<Object?>(
      MaterialPageRoute<Object?>(
        builder: (_) => EditChapterScreen(
          apiService: widget.apiService,
          storyId: widget.storyId,
          createNew: true,
          chapterNumber: nextNo,
          chapterTitle: 'Chapter $nextNo',
        ),
      ),
    );
    if (result is Map && result['returnToWriteManager'] == true && mounted) {
      Navigator.of(context).pop(result);
    }
  }

  /// After leave/save: if story has any published chapter (or status Ongoing),
  /// land on Published tab so author still sees the story. Drafts only when
  /// the whole story is still Draft-only.
  Future<bool> _storyBelongsInDraftsTab() async {
    try {
      final chapters = await widget.apiService.fetchStoryChapters(
        widget.storyId,
      );
      final hasPublished = chapters.any((c) {
        final s = (c['submission_status'] ?? 'draft').toString().toLowerCase();
        return {'published', 'ongoing', 'completed'}.contains(s);
      });
      if (hasPublished) return false;
      final story = await widget.apiService.fetchWriterStory(widget.storyId);
      final st = (story?['status_text'] ?? 'Draft').toString().toLowerCase();
      if (st.contains('ongoing') ||
          st.contains('complete') ||
          st.contains('publish') ||
          st.contains('submitted')) {
        return false;
      }
      return true;
    } catch (_) {
      return true;
    }
  }

  /// Inkitt-style: pop back to Story Manage / Write — never wipe the whole stack.
  Future<void> _returnToWriteManager({bool openDrafts = true}) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool('write_open_drafts', openDrafts);
      await prefs.setBool('write_open_submitted', !openDrafts);
    } catch (_) {}

    if (!mounted) return;
    final nav = Navigator.of(context);
    if (nav.canPop()) {
      nav.pop(<String, dynamic>{
        'returnToWriteManager': true,
        'openDrafts': openDrafts,
        'refreshed': true,
      });
    } else {
      // Fallback only when editor was the only route
      nav.pushAndRemoveUntil(
        MaterialPageRoute<void>(builder: (_) => const RootShell()),
        (route) => false,
      );
    }
  }

  Future<void> _publishStoryAndChapter() async {
    if (_isSaving || _isPublishing) return;
    setState(() => _isPublishing = true);
    try {
      await _publishStoryAndChapterAfterOrderCheck();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not verify chapter order: $error')),
      );
    } finally {
      if (mounted) setState(() => _isPublishing = false);
    }
  }

  Future<int?> _firstUnpublishedChapterBeforeCurrent() async {
    if (_chapterNumber <= 1) return null;
    final chapters = await widget.apiService.fetchStoryChapters(widget.storyId);
    return firstUnpublishedChapterNumber(
      chapters: chapters,
      chapterNumber: _chapterNumber,
    );
  }

  Future<void> _publishStoryAndChapterAfterOrderCheck() async {
    if (!await _ensureStoryDetailsForPublishing()) return;
    final content = _textController.text.trim();
    final title = _titleController.text.trim();
    if (title.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter chapter title')),
      );
      return;
    }
    if (content.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("You can't publish an empty chapter")),
      );
      return;
    }
    final words = content
        .split(RegExp(r'\s+'))
        .where((w) => w.isNotEmpty)
        .length;
    if (words < 60) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Minimum 60 words required to publish this chapter. You have $words word${words == 1 ? '' : 's'}.',
          ),
        ),
      );
      return;
    }
    if (words > 10000) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Chapters must be 10,000 words or fewer.'),
        ),
      );
      return;
    }

    final saved = await _saveChapter(
      submissionStatus: 'published',
      scheduledFor: null,
      successMessage: 'Chapter published',
    );
    if (!saved || !mounted) return;
    // Publish as Ongoing (Complete later from Manage Story ⋮ menu)
    try {
      await widget.apiService.updateWriterStory(widget.storyId, {
        'status_text': 'Ongoing',
      });
    } catch (_) {
      try {
        await widget.apiService.updateWriterStory(widget.storyId, {
          'status_text': 'Published',
        });
      } catch (_) {}
    }
    if (!mounted) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool('write_open_submitted', true);
      await prefs.setBool('write_open_drafts', false);
    } catch (_) {}
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Chapter published — story is now Ongoing')),
    );
    await _returnToWriteManager(openDrafts: false);
  }

  /// Inkitt leave flow: Keep editing | Discard | Save as Draft
  /// - No changes → just leave
  /// - Discard → leave without saving (published chapters on same story stay)
  /// - Save draft → this chapter becomes draft; story stays Ongoing if others published
  Future<bool> _confirmLeaveAndSaveDraft() async {
    final title = _titleController.text.trim();
    final content = _textController.text.trim();
    if (title.isEmpty && content.isEmpty && _chapterId == null) {
      return true;
    }
    // Nothing changed → leave quietly (Inkitt does not nag)
    if (!_isDirty) {
      await _returnToWriteManager(openDrafts: true);
      return true;
    }

    final action = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Leave chapter?'),
        content: const Text(
          'You have unsaved changes.\n\n'
          '• Save as Draft — this chapter stays private; other published chapters stay on Published.\n'
          '• Discard — lose changes on this chapter only.\n'
          '• Keep editing — stay on this page.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, 'stay'),
            child: const Text('Keep editing'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, 'discard'),
            child: const Text('Discard', style: TextStyle(color: Colors.red)),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, 'draft'),
            child: const Text('Save as Draft'),
          ),
        ],
      ),
    );
    if (action == null || action == 'stay') return false;
    if (!mounted) return false;

    if (action == 'draft') {
      // Empty content cannot be saved — treat as discard of new empty chapter
      if (title.isEmpty && content.isEmpty) {
        await _returnToWriteManager(openDrafts: true);
        return true;
      }
      if (content.isEmpty) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text("Can't save an empty chapter as draft"),
            ),
          );
        }
        return false;
      }
      final saved = await _saveChapter(
        submissionStatus: 'draft',
        scheduledFor: null,
        successMessage: 'Saved as draft — other chapters unchanged',
      );
      if (!saved || !mounted) return false;
    }
    // discard: do not save; published siblings unchanged
    await _returnToWriteManager(openDrafts: true);
    return true;
  }

  Future<void> _saveAsDraftChapter() async {
    final saved = await _saveChapter(
      submissionStatus: 'draft',
      scheduledFor: null,
      successMessage: 'Saved as draft — other chapters unchanged',
    );
    if (!saved || !mounted) return;
    await _returnToWriteManager(openDrafts: true);
  }

  /// Convert Latin letters in [input] to Mathematical Bold / Italic code points
  /// so formatting is visible in a plain TextField (no **markers**).
  String _toStyledText(
    String input, {
    required bool bold,
    required bool italic,
    bool underline = false,
  }) {
    final buf = StringBuffer();
    for (final r in input.runes) {
      final ch = String.fromCharCode(r);
      // Already styled mathematical alphanumeric? leave as-is
      if (r >= 0x1D400 && r <= 0x1D7FF) {
        buf.write(ch);
        continue;
      }
      if (bold && !italic) {
        if (r >= 0x41 && r <= 0x5A) {
          buf.write(String.fromCharCode(0x1D400 + (r - 0x41)));
          continue;
        }
        if (r >= 0x61 && r <= 0x7A) {
          buf.write(String.fromCharCode(0x1D41A + (r - 0x61)));
          continue;
        }
      } else if (italic && !bold) {
        if (r >= 0x41 && r <= 0x5A) {
          buf.write(String.fromCharCode(0x1D434 + (r - 0x41)));
          continue;
        }
        if (r >= 0x61 && r <= 0x7A) {
          // h is special in mathematical italic
          if (r == 0x68) {
            buf.write(String.fromCharCode(0x210E));
          } else {
            buf.write(String.fromCharCode(0x1D44E + (r - 0x61)));
          }
          continue;
        }
      } else if (bold && italic) {
        if (r >= 0x41 && r <= 0x5A) {
          buf.write(String.fromCharCode(0x1D468 + (r - 0x41)));
          continue;
        }
        if (r >= 0x61 && r <= 0x7A) {
          buf.write(String.fromCharCode(0x1D482 + (r - 0x61)));
          continue;
        }
      }
      buf.write(ch);
    }
    final styled = buf.toString();
    return underline
        ? styled.runes.map((r) => '${String.fromCharCode(r)}\u0332').join()
        : styled;
  }

  void _applyInlineFormat({
    bool bold = false,
    bool italic = false,
    bool underline = false,
  }) {
    final sel = _textController.selection;
    final text = _textController.text;
    if (!sel.isValid ||
        sel.start < 0 ||
        sel.end > text.length ||
        sel.isCollapsed) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Select text first to format it')),
      );
      return;
    }
    final start = sel.start;
    final end = sel.end;
    final selected = text.substring(start, end);
    // Strip accidental markdown wrappers from older builds
    var cleaned = selected
        .replaceAll('**', '')
        .replaceAll(RegExp(r'(?<!\*)\*(?!\*)'), '');
    final styled = _toStyledText(
      cleaned,
      bold: bold,
      italic: italic,
      underline: underline,
    );
    final newText = text.replaceRange(start, end, styled);
    _textController.value = TextEditingValue(
      text: newText,
      selection: TextSelection.collapsed(offset: start + styled.length),
    );
  }

  Future<bool> _saveChapter({
    String? submissionStatus,
    DateTime? scheduledFor,
    String? successMessage,
    bool offerNextChapter = false,
    bool quiet = false,
  }) async {
    final title = _titleController.text.trim();
    final content = _textController.text.trim();
    if (title.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter chapter title')),
      );
      return false;
    }
    if (content.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("You can't save an empty chapter")),
      );
      return false;
    }
    // Block duplicate chapter titles on the same story
    if (!quiet) {
      try {
        final existing = await widget.apiService.fetchStoryChapters(
          widget.storyId,
        );
        for (final c in existing) {
          final cid = (c['id'] as num?)?.toInt();
          final ct = (c['title'] ?? '').toString().trim().toLowerCase();
          if (ct == title.toLowerCase() && cid != _chapterId) {
            if (!mounted) return false;
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('A chapter with this title already exists'),
              ),
            );
            return false;
          }
        }
      } catch (_) {}
    }
    // CRITICAL: chapters must attach to existing book — never create a new book here
    if (widget.storyId <= 0) {
      if (!mounted) return false;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Missing story id. Open the story again and retry.'),
        ),
      );
      return false;
    }

    // Enforce chapter order at the shared save boundary so Publish, Schedule,
    // and any future publishing action all follow the same rule.
    final targetStatus = (submissionStatus ?? _submissionStatus)
        .trim()
        .toLowerCase();
    const publishableStatuses = {
      'published',
      'submitted',
      'ongoing',
      'completed',
      'scheduled',
    };
    if (!quiet && publishableStatuses.contains(targetStatus)) {
      try {
        final firstUnpublished = await _firstUnpublishedChapterBeforeCurrent();
        if (!mounted) return false;
        if (firstUnpublished != null) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                'Publish Chapter $firstUnpublished before Chapter $_chapterNumber.',
              ),
            ),
          );
          return false;
        }
      } catch (error) {
        if (!mounted) return false;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not verify chapter order: $error')),
        );
        return false;
      }
    }

    setState(() => _isSaving = true);
    try {
      final nextSubmissionStatus = submissionStatus ?? _submissionStatus;
      final nextScheduledFor = scheduledFor ?? _scheduledFor;
      final payload = {
        'title': title,
        'content': content,
        'chapter_number': _chapterNumber,
        'notes': _chapterNotes,
        'submission_status': nextSubmissionStatus,
        'scheduled_for': nextScheduledFor?.toIso8601String(),
        // Explicit link — backend must use path story_id, not create a book
        'story_id': widget.storyId,
      };

      String? storyStatus;
      if (!quiet) {
        final allChapters = await widget.apiService.fetchStoryChapters(
          widget.storyId,
        );
        final publishedChapterCount = allChapters.where((chapter) {
          final status = (chapter['submission_status'] ?? 'draft')
              .toString()
              .toLowerCase();
          return {'ongoing', 'published', 'completed'}.contains(status);
        }).length;
        final thisWillBePublished = {
          'published',
          'ongoing',
          'completed',
        }.contains(nextSubmissionStatus.toLowerCase().trim());
        storyStatus = (publishedChapterCount > 0 || thisWillBePublished)
            ? 'Ongoing'
            : 'Draft';
      }

      if (_chapterId == null) {
        final newId = await widget.apiService.createStoryChapter(
          widget.storyId,
          payload,
        );
        if (newId == null) {
          throw Exception(
            'Could not save chapter for story #${widget.storyId}. '
            'Check network and try again.',
          );
        }
        _chapterId = newId;
      } else {
        await widget.apiService.updateStoryChapter(_chapterId!, payload);
      }

      if (storyStatus != null) {
        try {
          await widget.apiService.updateWriterStory(widget.storyId, {
            'status_text': storyStatus,
          });
        } catch (_) {}
      }

      _submissionStatus = nextSubmissionStatus;
      _scheduledFor = nextScheduledFor;

      if (!mounted) return false;
      _initialTitle = title;
      _initialContent = content;
      if (!quiet) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(successMessage ?? 'Chapter saved to database'),
          ),
        );
      }

      // Check/save action: ask whether to finish here or continue with the next chapter.
      if (offerNextChapter) {
        final addNext = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Chapter saved'),
            content: const Text('Do you want to add another chapter?'),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('Done'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text('Add another chapter'),
              ),
            ],
          ),
        );
        if (!mounted) return false;
        if (addNext == true) {
          await _openNextChapterEditor();
        } else if (addNext == false) {
          final openDrafts = await _storyBelongsInDraftsTab();
          if (!mounted) return false;
          await _returnToWriteManager(openDrafts: openDrafts);
        }
      }
      return true;
    } catch (e) {
      if (mounted && !quiet) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Failed to save chapter: $e')));
      }
      return false;
    } finally {
      if (mounted) {
        setState(() => _isSaving = false);
      }
    }
  }

  Future<void> _editChapterNotes() async {
    final controller = TextEditingController(text: _chapterNotes);
    String? updatedNotes;
    try {
      updatedNotes = await showModalBottomSheet<String>(
        context: context,
        isScrollControlled: true,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        builder: (context) => Padding(
          padding: EdgeInsets.only(
            left: 16,
            right: 16,
            top: 16,
            bottom: MediaQuery.of(context).viewInsets.bottom + 16,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Chapter Notes',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 12),
              TextField(
                controller: controller,
                maxLines: 5,
                decoration: const InputDecoration(
                  hintText: 'Add internal notes for this chapter...',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: () =>
                      Navigator.pop(context, controller.text.trim()),
                  child: const Text('Save Notes'),
                ),
              ),
            ],
          ),
        ),
      );
    } finally {
      // Dispose after the route is fully closed so TextField is not using it.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        controller.dispose();
      });
    }
    if (updatedNotes == null) return;

    setState(() => _chapterNotes = updatedNotes!);
    await _saveChapter(successMessage: 'Chapter notes updated');
  }

  Future<void> _publishChapter() async {
    final firstUnpublished = await _firstUnpublishedChapterBeforeCurrent();
    if (firstUnpublished != null) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Publish Chapter $firstUnpublished before Chapter $_chapterNumber.',
          ),
        ),
      );
      return;
    }
    if (!await _ensureStoryDetailsForPublishing()) return;
    final words = _wordCount;
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
    if (words > 10000) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Chapters must be 10,000 words or fewer.'),
        ),
      );
      return;
    }
    await _saveChapter(
      submissionStatus: 'published',
      scheduledFor: null,
      successMessage: 'Chapter published',
    );
    // Do NOT force-publish the parent story here.
    // Ongoing/Draft stories stay in Drafts; only stories marked Completed
    // (or already Published) become visible to readers via backend promote.
    // Backend `_promote_author_and_maybe_publish` handles Completed + 50+ words.
  }

  Future<void> _unpublishCurrentChapter() async {
    final chapterId = _chapterId;
    if (chapterId == null || _isSaving || _isPublishing || _isDeleting) return;
    try {
      final chapters = await widget.apiService.fetchStoryChapters(
        widget.storyId,
      );
      final live =
          chapters.where((chapter) {
            final status = (chapter['submission_status'] ?? 'draft')
                .toString()
                .trim()
                .toLowerCase();
            return {
              'published',
              'submitted',
              'ongoing',
              'completed',
            }.contains(status);
          }).toList()..sort((a, b) {
            final aNo = (a['chapter_number'] as num?)?.toInt() ?? 0;
            final bNo = (b['chapter_number'] as num?)?.toInt() ?? 0;
            return bNo.compareTo(aNo);
          });
      final latest = live.isEmpty ? null : live.first;
      final latestId = (latest?['id'] as num?)?.toInt();
      final latestNumber =
          (latest?['chapter_number'] as num?)?.toInt() ?? _chapterNumber;
      if (latestId != null && latestId != chapterId) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Please unpublish the latest chapter (Chapter $latestNumber) first.',
            ),
          ),
        );
        return;
      }
      if (!mounted) return;
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text('Unpublish Chapter $_chapterNumber?'),
          content: const Text(
            'This chapter will be hidden from readers and moved to Draft.',
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
      if (confirmed != true) return;
      await widget.apiService.updateStoryChapter(chapterId, {
        'submission_status': 'draft',
      });
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Chapter unpublished')));
      await _loadChapter();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not unpublish chapter: $error')),
      );
    }
  }

  Future<void> _scheduleChapterSubmission() async {
    final now = DateTime.now();
    final pickedDate = await showDatePicker(
      context: context,
      initialDate: _scheduledFor ?? now,
      firstDate: now,
      lastDate: DateTime(now.year + 2),
    );
    if (pickedDate == null || !mounted) return;

    final pickedTime = await showTimePicker(
      context: context,
      initialTime: _scheduledFor != null
          ? TimeOfDay.fromDateTime(_scheduledFor!)
          : TimeOfDay.fromDateTime(now.add(const Duration(hours: 1))),
    );
    if (pickedTime == null) return;

    final scheduled = DateTime(
      pickedDate.year,
      pickedDate.month,
      pickedDate.day,
      pickedTime.hour,
      pickedTime.minute,
    );

    await _saveChapter(
      submissionStatus: 'scheduled',
      scheduledFor: scheduled,
      successMessage: 'Chapter scheduled for publishing',
    );
  }

  Future<void> _showRevisions() async {
    if (_chapterId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Save this chapter first to view revisions'),
        ),
      );
      return;
    }

    final revisions = await widget.apiService.fetchStoryChapterRevisions(
      _chapterId!,
    );
    if (!mounted) return;

    showModalBottomSheet<void>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => SafeArea(
        child: revisions.isEmpty
            ? const Padding(
                padding: EdgeInsets.all(20),
                child: Text('No revisions yet.'),
              )
            : ListView.separated(
                shrinkWrap: true,
                padding: const EdgeInsets.symmetric(vertical: 8),
                itemBuilder: (context, index) {
                  final revision = revisions[index];
                  final createdAt = DateTime.tryParse(
                    revision['created_at']?.toString() ?? '',
                  );
                  final subtitleParts = <String>[
                    revision['submission_status']?.toString() ?? 'draft',
                    if (createdAt != null)
                      '${createdAt.year}-${createdAt.month.toString().padLeft(2, '0')}-${createdAt.day.toString().padLeft(2, '0')} ${createdAt.hour.toString().padLeft(2, '0')}:${createdAt.minute.toString().padLeft(2, '0')}',
                  ];
                  final revId = (revision['id'] as num?)?.toInt();
                  return ListTile(
                    leading: const Icon(Icons.history_rounded),
                    title: Text(revision['title']?.toString() ?? 'Untitled'),
                    subtitle: Text(subtitleParts.join(' • ')),
                    trailing: revId == null
                        ? null
                        : TextButton(
                            onPressed: () async {
                              Navigator.pop(context);
                              await _restoreRevision(revId, revision);
                            },
                            child: const Text('Restore'),
                          ),
                  );
                },
                separatorBuilder: (_, _) => const Divider(height: 1),
                itemCount: revisions.length,
              ),
      ),
    );
  }

  Future<void> _deleteCurrentChapter() async {
    final chapterId = _chapterId;
    if (chapterId == null || _isDeleting || _isSaving || _isPublishing) return;

    _autosaveTimer?.cancel();

    final chapterStatus = _submissionStatus.trim().toLowerCase();
    if ({
      'published',
      'submitted',
      'ongoing',
      'completed',
    }.contains(chapterStatus)) {
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

    late final List<Map<String, dynamic>> chapters;
    try {
      chapters = await widget.apiService.fetchStoryChapters(widget.storyId);
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not check the story chapters: $error')),
      );
      return;
    }

    final chapterExists = chapters.any(
      (chapter) => (chapter['id'] as num?)?.toInt() == chapterId,
    );
    if (!chapterExists) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('This chapter is no longer available.')),
      );
      return;
    }
    if (!mounted) return;

    if (chapterStatus == 'scheduled') {
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
    if (chapterStatus != 'draft') {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Only draft chapters can be deleted.')),
      );
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete chapter?'),
        content: Text(
          chapters.length == 1
              ? 'This is the last chapter. Deleting it will keep the story details page. You can delete the story from Manage Story after all chapters are removed.'
              : 'Are you sure you want to delete this chapter? This action cannot be undone.',
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

    setState(() => _isDeleting = true);
    try {
      await widget.apiService.deleteStoryChapter(chapterId);
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Chapter deleted')));
      Navigator.of(
        context,
      ).pop(const <String, dynamic>{'chapterDeleted': true});
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not delete chapter: $error')),
      );
    } finally {
      if (mounted) setState(() => _isDeleting = false);
    }
  }

  Future<void> _restoreRevision(
    int revisionId,
    Map<String, dynamic> revision,
  ) async {
    if (_chapterId == null) return;
    final approved = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Restore revision?'),
        content: const Text(
          'Current chapter content will be saved as a new revision, then replaced with the selected version. Other chapters are not changed.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Restore'),
          ),
        ],
      ),
    );
    if (approved != true) return;
    try {
      final result = await widget.apiService.restoreStoryChapterRevision(
        _chapterId!,
        revisionId,
      );
      if (!mounted) return;
      final chapter = result['chapter'];
      if (chapter is Map) {
        final title = chapter['title']?.toString();
        final content = chapter['content']?.toString();
        if (title != null) _titleController.text = title;
        if (content != null) _textController.text = content;
        final st = chapter['submission_status']?.toString();
        if (st != null && st.isNotEmpty) {
          setState(() => _submissionStatus = st);
        }
      } else {
        // Fallback: load fields from the revision map itself
        final title = revision['title']?.toString();
        final content = revision['content']?.toString();
        if (title != null) _titleController.text = title;
        if (content != null) _textController.text = content;
      }
      setState(() {});
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Revision restored — other chapters unchanged'),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Could not restore: $e')));
    }
  }

  String _statusLabel(String status) {
    switch (status.toLowerCase().trim()) {
      case 'submitted':
        return 'Published';
      case 'scheduled':
        return 'Scheduled';
      case 'published':
      case 'ongoing':
      case 'completed':
        return 'Published';
      default:
        return 'Draft';
    }
  }

  String _scheduledLabel() {
    final scheduledFor = _scheduledFor;
    if (scheduledFor == null) return 'Not scheduled';
    final localizations = MaterialLocalizations.of(context);
    return '${localizations.formatShortDate(scheduledFor)} ${localizations.formatTimeOfDay(TimeOfDay.fromDateTime(scheduledFor))}';
  }

  Future<bool?> _onWillPop() async {
    if (_isSaving || _isPublishing) return false;
    final title = _titleController.text.trim();
    final content = _textController.text.trim();
    if (title.isEmpty && content.isEmpty && _chapterId == null) {
      await _returnToWriteManager(openDrafts: true);
      return true;
    }
    if (title.isEmpty) {
      _titleController.text = 'Chapter $_chapterNumber';
    }
    return await _confirmLeaveAndSaveDraft();
  }

  Future<void> _showOptionsMenu() async {
    final status = _submissionStatus.trim().toLowerCase();
    final isPublishedChapter = {
      'published',
      'submitted',
      'ongoing',
      'completed',
    }.contains(status);
    int? latestLiveChapterId;
    int? latestLiveChapterNumber;
    var verifiedLatest = false;
    try {
      final chapters = await widget.apiService.fetchStoryChapters(
        widget.storyId,
      );
      final live =
          chapters.where((chapter) {
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
          }).toList()..sort((a, b) {
            final aNumber = (a['chapter_number'] as num?)?.toInt() ?? 0;
            final bNumber = (b['chapter_number'] as num?)?.toInt() ?? 0;
            return bNumber.compareTo(aNumber);
          });
      latestLiveChapterId = live.isEmpty
          ? null
          : (live.first['id'] as num?)?.toInt();
      latestLiveChapterNumber = live.isEmpty
          ? null
          : (live.first['chapter_number'] as num?)?.toInt();
      verifiedLatest = true;
    } catch (_) {
      // The backend still enforces this rule if the status check is offline.
    }
    if (!mounted) return;
    final canUnpublish = !verifiedLatest || latestLiveChapterId == _chapterId;
    showModalBottomSheet<void>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.sticky_note_2_outlined),
              title: const Text('Add Chapter Notes'),
              onTap: () async {
                Navigator.pop(context);
                await _editChapterNotes();
              },
            ),
            if (isPublishedChapter)
              ListTile(
                leading: Icon(
                  Icons.unpublished_outlined,
                  color: canUnpublish ? null : AppTheme.mutedOf(context),
                ),
                title: Text(
                  'Unpublish Chapter',
                  style: canUnpublish
                      ? null
                      : TextStyle(color: AppTheme.mutedOf(context)),
                ),
                subtitle: canUnpublish
                    ? null
                    : Text(
                        'Unpublish Chapter ${latestLiveChapterNumber ?? ''} first',
                        style: TextStyle(color: AppTheme.mutedOf(context)),
                      ),
                onTap: () async {
                  Navigator.pop(context);
                  if (canUnpublish) {
                    await _unpublishCurrentChapter();
                  } else {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text(
                          latestLiveChapterNumber == null
                              ? 'Please unpublish the latest chapter first.'
                              : 'Please unpublish the latest chapter (Chapter $latestLiveChapterNumber) first.',
                        ),
                      ),
                    );
                  }
                },
              ),
            ListTile(
              leading: const Icon(Icons.history_rounded),
              title: const Text('Revisions'),
              onTap: () async {
                Navigator.pop(context);
                await _showRevisions();
              },
            ),
            ListTile(
              leading: const Icon(Icons.schedule_rounded),
              title: const Text('Schedule Publishing'),
              onTap: () async {
                Navigator.pop(context);
                await _scheduleChapterSubmission();
              },
            ),
            if (_chapterId != null && !isPublishedChapter)
              ListTile(
                leading: const Icon(Icons.delete_outline, color: Colors.red),
                title: const Text('Delete Chapter'),
                onTap: () async {
                  Navigator.pop(context);
                  await _deleteCurrentChapter();
                },
              ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) async {
        if (didPop) return;
        // Tab choice is decided after draft save (_storyBelongsInDraftsTab)
        await _onWillPop();
      },
      child: Scaffold(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        appBar: AppBar(
          backgroundColor: Theme.of(context).scaffoldBackgroundColor,
          foregroundColor: Theme.of(context).colorScheme.onSurface,
          elevation: 0,
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20),
            onPressed: () => _onWillPop(),
          ),
          title: const Row(
            children: [
              Icon(Icons.menu_book_rounded, size: 21),
              SizedBox(width: 8),
              Flexible(
                child: Text('Edit Chapter', overflow: TextOverflow.ellipsis),
              ),
            ],
          ),
          actions: [
            IconButton(
              icon: const Icon(Icons.add_circle_outline_rounded),
              tooltip: 'Add chapter',
              onPressed: _isSaving || _isPublishing || _isDeleting
                  ? null
                  : () async {
                      // Save current chapter, then open Chapter N+1 on SAME book
                      final saved = await _saveChapter(
                        successMessage: 'Chapter saved',
                      );
                      if (!saved || !mounted) return;
                      await _openNextChapterEditor();
                    },
            ),
            IconButton(
              icon: _isSaving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.check_rounded, color: AppTheme.brand),
              tooltip: 'Save',
              onPressed: _isSaving || _isPublishing || _isDeleting
                  ? null
                  : () => _saveChapter(offerNextChapter: true),
            ),
            IconButton(
              icon: const Icon(Icons.more_horiz_rounded),
              tooltip: 'More chapter options',
              onPressed: _isSaving || _isPublishing || _isDeleting
                  ? null
                  : _showOptionsMenu,
            ),
          ],
        ),
        bottomNavigationBar: SafeArea(
          child: Container(
            color: AppTheme.bgOf(context),
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: _isSaving || _isPublishing || _isDeleting
                        ? null
                        : _saveAsDraftChapter,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppTheme.brand,
                      side: const BorderSide(color: AppTheme.brand),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    child: const FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text('Save Draft'),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    onPressed: _isSaving || _isPublishing || _isDeleting
                        ? null
                        : _publishStoryAndChapter,
                    style: FilledButton.styleFrom(
                      backgroundColor: AppTheme.brand,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    child: const FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text('Publish Chapter'),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        body: _isLoading
            ? const Center(child: CircularProgressIndicator())
            : Column(
                children: [
                  Container(
                    decoration: BoxDecoration(
                      border: Border(
                        bottom: BorderSide(color: AppTheme.borderOf(context)),
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                          child: Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 10,
                                  vertical: 4,
                                ),
                                decoration: BoxDecoration(
                                  color: AppTheme.brand.withValues(alpha: 0.12),
                                  borderRadius: BorderRadius.circular(999),
                                ),
                                child: Text(
                                  _statusLabel(_submissionStatus),
                                  style: const TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                    color: AppTheme.brand,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  _scheduledLabel(),
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: AppTheme.mutedOf(context),
                                  ),
                                  textAlign: TextAlign.right,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Padding(
                          padding: EdgeInsets.fromLTRB(16, 12, 16, 0),
                          child: Text(
                            'TITLE',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              color: AppTheme.mutedOf(context),
                              letterSpacing: 1.0,
                            ),
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 6, 16, 10),
                          child: TextField(
                            controller: _titleController,
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w500,
                              color: AppTheme.inkOf(context),
                            ),
                            decoration: InputDecoration(
                              filled: true,
                              fillColor: AppTheme.fieldOf(context),
                              contentPadding: const EdgeInsets.symmetric(
                                horizontal: 16,
                                vertical: 14,
                              ),
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(16),
                                borderSide: BorderSide(
                                  color: AppTheme.borderOf(context),
                                ),
                              ),
                              enabledBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(16),
                                borderSide: BorderSide(
                                  color: AppTheme.borderOf(context),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Padding(
                          padding: EdgeInsets.fromLTRB(16, 12, 16, 0),
                          child: Text(
                            'TEXT',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              color: AppTheme.mutedOf(context),
                              letterSpacing: 1.0,
                            ),
                          ),
                        ),
                        Expanded(
                          child: Padding(
                            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                            child: Container(
                              decoration: BoxDecoration(
                                color: AppTheme.fieldOf(context),
                                borderRadius: BorderRadius.circular(18),
                                border: Border.all(
                                  color: AppTheme.borderOf(context),
                                ),
                              ),
                              child: TextField(
                                controller: _textController,
                                maxLines: null,
                                expands: true,
                                textAlignVertical: TextAlignVertical.top,
                                keyboardType: TextInputType.multiline,
                                style: TextStyle(
                                  fontSize: 16,
                                  height: 1.5,
                                  color: AppTheme.inkOf(context),
                                  fontWeight: FontWeight.normal,
                                  fontStyle: FontStyle.normal,
                                ),
                                decoration: InputDecoration(
                                  contentPadding: const EdgeInsets.fromLTRB(
                                    16,
                                    14,
                                    16,
                                    12,
                                  ),
                                  border: InputBorder.none,
                                  hintText: 'Start writing your story here...',
                                  hintStyle: TextStyle(
                                    color: AppTheme.mutedOf(context),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  Container(
                    alignment: Alignment.centerRight,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 4,
                    ),
                    child: Text(
                      _wordCount >= 60
                          ? 'Word count: $_wordCount · ready to publish'
                          : 'Word count: $_wordCount · goal 60',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: _wordCount >= 60
                            ? AppTheme.brand
                            : AppTheme.mutedOf(context),
                      ),
                    ),
                  ),
                  Container(
                    decoration: BoxDecoration(
                      border: Border(
                        top: BorderSide(color: AppTheme.borderOf(context)),
                      ),
                      color: AppTheme.bgOf(context),
                    ),
                    child: SafeArea(
                      top: false,
                      child: Row(
                        children: [
                          _ToolbarButton(
                            icon: Icons.undo_rounded,
                            onPressed: _undoHistory.isEmpty ? null : _undoText,
                          ),
                          _ToolbarButton(
                            icon: Icons.redo_rounded,
                            onPressed: _redoHistory.isEmpty ? null : _redoText,
                          ),
                          _ToolbarButton(
                            icon: Icons.format_bold_rounded,
                            onPressed: () => _applyInlineFormat(bold: true),
                            isActive: false,
                          ),
                          _ToolbarButton(
                            icon: Icons.format_italic_rounded,
                            onPressed: () => _applyInlineFormat(italic: true),
                            isActive: false,
                          ),
                          _ToolbarButton(
                            icon: Icons.format_underlined_rounded,
                            onPressed: () =>
                                _applyInlineFormat(underline: true),
                          ),
                          Container(
                            width: 1,
                            height: 24,
                            color: AppTheme.borderOf(context),
                            margin: const EdgeInsets.symmetric(horizontal: 4),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}

int? firstUnpublishedChapterNumber({
  required List<Map<String, dynamic>> chapters,
  required int chapterNumber,
}) {
  // A chapter waiting for review/submission is not yet published. Scheduling
  // also does not make it eligible to unlock later chapters.
  const publishedStatuses = {'published', 'ongoing', 'completed'};
  for (var number = 1; number < chapterNumber; number++) {
    Map<String, dynamic>? previousChapter;
    for (final chapter in chapters) {
      if ((chapter['chapter_number'] as num?)?.toInt() == number) {
        previousChapter = chapter;
        break;
      }
    }
    final status = (previousChapter?['submission_status'] ?? 'draft')
        .toString()
        .trim()
        .toLowerCase();
    if (previousChapter == null || !publishedStatuses.contains(status)) {
      return number;
    }
  }
  return null;
}

class _ToolbarButton extends StatelessWidget {
  const _ToolbarButton({
    required this.icon,
    required this.onPressed,
    this.isActive = false,
  });

  final IconData icon;
  final VoidCallback? onPressed;
  final bool isActive;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      onPressed: onPressed,
      icon: Icon(
        icon,
        size: 22,
        color: onPressed == null
            ? AppTheme.mutedOf(context)
            : isActive
            ? AppTheme.brand
            : AppTheme.mutedOf(context),
      ),
      constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
    );
  }
}
