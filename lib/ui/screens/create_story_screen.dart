import 'dart:async';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../data/services/api_service.dart';
import '../../core/theme/app_styles.dart';
import '../widgets/app_notice.dart';
import '../widgets/image_adjustment.dart';
import 'edit_chapter_screen.dart';
import 'root_shell.dart';

/// Mobile "New Story" screen matching the dark HTML prototype:
/// cover upload, draft readiness meter, title/summary counters,
/// genre + New, Ongoing/Completed status, language, audience,
/// content-warning chips, max-3 hashtags, sticky Save Draft / Publish.
class CreateStoryScreen extends StatefulWidget {
  const CreateStoryScreen({
    super.key,
    required this.apiService,
    this.story,
    this.authorDisplayName,
  });

  final ApiService apiService;
  final Map<String, dynamic>? story;
  final String? authorDisplayName;

  @override
  State<CreateStoryScreen> createState() => _CreateStoryScreenState();
}

class _CreateStoryScreenState extends State<CreateStoryScreen> {
  // Theme-aware colors resolved in build() via AppStyles (dark default OK)
  Color _ink = Color(0xFFF6F5FA);
  Color _panel = Color(0xFFFFFFFF);
  Color _panelAlt = Color(0xFFF6F5FA);
  Color _border = Color(0xFFE8E8E8);
  Color _borderSoft = Color(0xFFDDE2DF);
  Color _textHi = Color(0xFF202020);
  Color _textLo = Color(0xFF767676);
  Color _textFaint = Color(0xFF9A9A9A);
  Color _magenta = Color(0xFF16856A);
  Color _violet = Color(0xFF35A486);
  Color _amber = Color(0xFFF4CC2F);
  Color _green = Color(0xFF16856A);

  void _applyThemeColors(BuildContext context) {
    final c = AppStyles.colors(context);
    _ink = c.bg;
    _panel = c.card;
    _panelAlt = c.field;
    _border = c.border;
    _borderSoft = c.borderSoft;
    _textHi = c.textPrimary;
    _textLo = c.textMuted;
    _textFaint = c.textFaint;
    _magenta = c.brand;
    _violet = AppStyles.purpleBright;
    _amber = Color(0xFFF4CC2F);
    _green = c.brand;
  }

  static final List<String> _defaultGenres = [
    'Romance',
    'Fantasy',
    'Drama',
    'Horror',
    'Mystery',
    'Adventure',
    'Poetry',
    'Slice of Life',
    'Fanfiction',
    'Thriller',
    'Sci-Fi',
    'Young Adult',
    'Humor',
    'Paranormal',
    'Action',
    'Other',
  ];
  static final List<String> _languages = ['Sinhala', 'English', 'Tamil'];
  static final List<String> _audiences = [
    'All Ages',
    'Teen (16+)',
    'Mature (18+)',
  ];
  static final List<String> _warningOptions = [
    'Violence',
    'Strong Language',
    'Sexual Content',
    'Drug/Alcohol Use',
    'Death',
    'Other',
  ];

  final _titleController = TextEditingController();
  final _summaryController = TextEditingController();
  final _authorController = TextEditingController();
  final _tagInputController = TextEditingController();
  final _otherWarningController = TextEditingController();
  final _customGenreController = TextEditingController();
  final _tagFocus = FocusNode();
  final _summaryFocus = FocusNode();
  final ImagePicker _imagePicker = ImagePicker();

  bool _saving = false;
  Timer? _draftDebounce;
  bool _dirty = false;
  String _coverPath = '';
  final List<String> _selectedTags = [];
  List<String> _availableTags = [];
  bool _loadingTags = false;

  List<String> _genres = List<String>.from(_defaultGenres);
  String? _selectedGenre;
  bool _loadingGenres = false;
  final bool _showCustomGenre = false;

  String _status = 'Draft';
  String? _language;
  String? _audience = 'All Ages';
  int? _savedStoryId;
  final Set<String> _selectedWarnings = {};

  bool get _isEditing => widget.story != null;

  int get _readinessDone {
    var n = 0;
    if (_titleController.text.trim().isNotEmpty) n++;
    if (_summaryController.text.trim().isNotEmpty) n++;
    if ((_selectedGenre ?? '').trim().isNotEmpty) n++;
    if (_coverPath.trim().isNotEmpty) n++;
    return n;
  }

  int get _readinessPct => ((_readinessDone / 4) * 100).round();

  String get _readinessCaption {
    if (_readinessPct == 0) return 'A blank page. Where does it begin?';
    if (_readinessPct < 100) return 'Still filling in the details';
    return 'Ready for readers';
  }

  @override
  void initState() {
    super.initState();
    if (_isEditing) {
      _titleController.text = widget.story!['title']?.toString() ?? '';
      _summaryController.text = widget.story!['description']?.toString() ?? '';
      _savedStoryId = (widget.story!['id'] as num?)?.toInt();
      final warningsRaw =
          (widget.story!['content_warnings'] ??
                  widget.story!['contentWarnings'] ??
                  '')
              .toString();
      if (warningsRaw.isNotEmpty) {
        for (final part in warningsRaw.split(RegExp(r'[,;]'))) {
          final t = part.trim();
          if (t.isEmpty) continue;
          final match = _warningOptions.firstWhere(
            (w) => w.toLowerCase() == t.toLowerCase(),
            orElse: () => '',
          );
          if (match.isNotEmpty) {
            _selectedWarnings.add(match);
          } else {
            _selectedWarnings.add('Other');
            _otherWarningController.text = t;
          }
        }
      }
      final g = (widget.story!['genre'] ?? widget.story!['primary_genre'] ?? '')
          .toString()
          .trim();
      if (g.isNotEmpty) {
        _selectedGenre = g;
        if (!_genres.any((x) => x.toLowerCase() == g.toLowerCase())) {
          _genres = [..._genres, g];
        }
      }
      final st = (widget.story!['status_text'] ?? '').toString().toLowerCase();
      if (st.contains('complete') || st.contains('finished')) {
        _status = 'Completed';
      }
      final lang = (widget.story!['language'] ?? '').toString().trim();
      if (lang.isNotEmpty) _language = lang;
      final aud = (widget.story!['audience'] ?? '').toString().trim();
      if (aud.isNotEmpty) _audience = aud;
      _coverPath = widget.story!['cover_path']?.toString() ?? '';
      final rawTags = widget.story!['tags'];
      List<String> existing = <String>[];
      if (rawTags is List) {
        existing = rawTags
            .map((e) => e.toString().replaceFirst('#', '').trim())
            .where((t) => t.isNotEmpty)
            .toList();
      } else if (rawTags != null && rawTags.toString().trim().isNotEmpty) {
        existing = rawTags
            .toString()
            .split(RegExp(r'[,;]'))
            .map((e) => e.replaceFirst('#', '').trim())
            .where((t) => t.isNotEmpty)
            .toList();
      }
      _selectedTags.addAll(existing.take(3));
    }
    _titleController.addListener(() => setState(() {}));
    _summaryController.addListener(() => setState(() {}));
    // Length counter uses ValueListenableBuilder — avoid setState (was stealing focus)
    _resolveAuthorName();
    _loadAvailableTags();
    if (_isEditing) {
      unawaited(_hydrateFromServer());
    }
    _loadGenres();
  }

  Future<void> _resolveAuthorName() async {
    String name = (widget.authorDisplayName ?? '').trim();
    if (name.isEmpty) {
      try {
        final me = await widget.apiService.fetchMe();
        name = (me['display_name'] ?? me['username'] ?? me['name'] ?? '')
            .toString()
            .trim();
      } catch (_) {}
    }
    if (name.isEmpty) {
      try {
        final prefs = await SharedPreferences.getInstance();
        name = (prefs.getString('auth_display_name') ?? '').trim();
      } catch (_) {}
    }
    if (name.isEmpty && _isEditing) {
      name = widget.story!['author']?.toString().trim() ?? '';
    }
    if (name.isEmpty) name = 'Author';
    if (!mounted) return;
    setState(() => _authorController.text = name);
  }

  Future<void> _loadAvailableTags() async {
    if (!mounted) return;
    setState(() => _loadingTags = true);
    try {
      final items = await widget.apiService.fetchTags().timeout(
        Duration(seconds: 8),
        onTimeout: () => <Map<String, dynamic>>[],
      );
      if (!mounted) return;
      setState(() {
        _availableTags = items
            .map((e) => (e['name'] ?? e['tag'] ?? e['label'] ?? '').toString())
            .where((t) => t.isNotEmpty)
            .map((t) => t.startsWith('#') ? t.substring(1) : t)
            .toList();
        _loadingTags = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loadingTags = false);
    }
  }

  Future<void> _loadGenres() async {
    if (!mounted) return;
    setState(() => _loadingGenres = true);
    try {
      final remote = await widget.apiService.fetchGenres().timeout(
        Duration(seconds: 8),
        onTimeout: () => <String>[],
      );
      if (!mounted) return;
      final merged = <String>{..._defaultGenres};
      for (final g in remote) {
        final s = g.trim();
        if (s.isNotEmpty) merged.add(s);
      }
      if (_selectedGenre != null && _selectedGenre!.isNotEmpty) {
        merged.add(_selectedGenre!);
      }
      final list = merged.toList()
        ..sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));
      setState(() {
        _genres = list;
        _loadingGenres = false;
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          // Keep defaults so genre picker always works
          _genres = List<String>.from(_defaultGenres);
          _loadingGenres = false;
        });
      }
    }
  }

  Future<void> _showCoverGuidelines() async {
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Cover guidelines'),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Inkitt-style tips for a strong cover:',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
              SizedBox(height: 10),
              Text('• Portrait orientation works best (roughly 2:3).'),
              Text('• Keep title text readable on small phones.'),
              Text('• Avoid heavy watermarks or logos.'),
              Text('• High contrast: light subject on dark / dark on light.'),
              Text('• Minimum ~600px on the short side recommended.'),
              Text('• JPG or PNG, under ~5MB preferred.'),
              SizedBox(height: 10),
              Text(
                'You can still change the cover later — editing details never removes chapters.',
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text('Got it'),
          ),
        ],
      ),
    );
  }

  Future<void> _pickCover() async {
    final picked = await _imagePicker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 1600,
      maxHeight: 2400,
      imageQuality: 90,
    );
    if (picked == null) return;
    try {
      final bytes = await showImageAdjustmentDialog(
        context,
        picked,
        aspectRatio: 2 / 3,
      );
      if (bytes == null) return;
      final result = await widget.apiService.uploadWriterImage(
        bytes,
        'story-cover.png',
      );
      final path =
          (result['path'] ??
                  result['cover_path'] ??
                  result['url'] ??
                  result['file_url'] ??
                  '')
              .toString();
      if (!mounted) return;
      if (path.isEmpty) {
        showAppNotice(
          context,
          'Cover upload returned empty path',
          type: AppNoticeType.error,
        );
        return;
      }
      setState(() => _coverPath = path);
      showAppNotice(context, 'Cover uploaded');
    } catch (e) {
      if (!mounted) return;
      showAppNotice(
        context,
        'Cover upload failed: $e',
        type: AppNoticeType.error,
      );
    }
  }

  Future<void> _hydrateFromServer() async {
    final id = _savedStoryId;
    if (id == null || id <= 0) return;
    try {
      final data = await widget.apiService.fetchWriterStory(id);
      if (data == null || !mounted) return;
      setState(() {
        if ((data['title'] ?? '').toString().trim().isNotEmpty) {
          _titleController.text = data['title'].toString();
        }
        if ((data['description'] ?? '').toString().trim().isNotEmpty) {
          _summaryController.text = data['description'].toString();
        }
        final genre = (data['genre'] ?? data['primary_genre'] ?? '').toString();
        if (genre.isNotEmpty) _selectedGenre = genre;
        final aud = (data['audience'] ?? '').toString();
        if (aud.isNotEmpty) {
          final a = aud.toLowerCase();
          if (a.contains('18') || a.contains('mature')) {
            _audience = 'Mature (18+)';
          } else if (a.contains('13') || a.contains('teen')) {
            _audience = 'Teen (16+)';
          } else if (a.contains('all')) {
            _audience = 'All Ages';
          } else {
            _audience = aud;
          }
        }
        final lang = (data['language'] ?? '').toString();
        if (lang.isNotEmpty) _language = lang;
        final cover = (data['cover_path'] ?? '').toString();
        if (cover.isNotEmpty) _coverPath = cover;
        final tags = data['tags'];
        if (tags is List) {
          _selectedTags
            ..clear()
            ..addAll(
              tags
                  .map((e) => e.toString().replaceFirst('#', '').trim())
                  .where((t) => t.isNotEmpty)
                  .take(3),
            );
        }
      });
    } catch (_) {}
  }

  void _scheduleDraftSave() {
    // Mark dirty only — no background network while filling form fields.
    _dirty = true;
    _draftDebounce?.cancel();
  }

  String _buildWarningsString() {
    final parts = <String>[];
    for (final w in _selectedWarnings) {
      if (w == 'Other') {
        final o = _otherWarningController.text.trim();
        if (o.isNotEmpty) parts.add(o);
      } else {
        parts.add(w);
      }
    }
    return parts.join(', ');
  }

  Iterable<String> _tagSuggestions(String text) {
    final q = text.trim().toLowerCase().replaceFirst('#', '');
    if (q.isEmpty) return Iterable<String>.empty();
    return _availableTags
        .where((t) => t.toLowerCase().contains(q))
        .where(
          (t) => !_selectedTags.any((s) => s.toLowerCase() == t.toLowerCase()),
        )
        .take(8);
  }

  void _addTag(String raw) {
    final name = raw.trim().replaceFirst('#', '');
    if (name.isEmpty) return;
    if (_selectedTags.any((t) => t.toLowerCase() == name.toLowerCase())) return;
    if (_selectedTags.length >= 3) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Maximum 3 tags')));
      return;
    }
    setState(() {
      _selectedTags.add(name);
      _tagInputController.clear();
    });
    _scheduleDraftSave();
  }

  void _removeTag(String name) {
    setState(() => _selectedTags.remove(name));
    _scheduleDraftSave();
  }

  /// Inkitt: never wipe the app stack — return to Write / previous route.
  Future<void> _softReturnToWrite({bool openDrafts = true}) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool('write_open_drafts', openDrafts);
      await prefs.setBool('write_open_submitted', !openDrafts);
    } catch (_) {}
    if (!mounted) return;
    final nav = Navigator.of(context);
    if (nav.canPop()) {
      nav.pop(true);
    } else {
      nav.pushAndRemoveUntil(
        MaterialPageRoute<void>(builder: (_) => RootShell()),
        (route) => false,
      );
    }
  }

  Future<bool> _confirmLeaveAndSaveDraft() async {
    final hasContent =
        _titleController.text.trim().isNotEmpty ||
        _summaryController.text.trim().isNotEmpty ||
        _coverPath.isNotEmpty ||
        _selectedWarnings.isNotEmpty ||
        _selectedTags.isNotEmpty ||
        (_selectedGenre ?? '').trim().isNotEmpty;
    // Empty new form — leave with no save
    if (!hasContent && !_dirty && _savedStoryId == null) {
      return true;
    }
    // Edit details with no local changes — leave, chapters untouched
    if (_isEditing && !_dirty) {
      return true;
    }

    final action = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(_isEditing ? 'Leave story details?' : 'Leave page?'),
        content: Text(
          _isEditing
              ? 'Save details only (chapters are never removed), discard changes, or keep editing.'
              : 'Save as Draft, discard, or keep editing.',
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
            onPressed: () => Navigator.pop(ctx, 'save'),
            child: Text(_isEditing ? 'Save details' : 'Save as Draft'),
          ),
        ],
      ),
    );
    if (action == null || action == 'stay') return false;
    if (action == 'discard') {
      // Inkitt: discard form changes only — existing chapters stay on server
      return true;
    }
    // save path — edit mode uses meta-only PATCH (no status_text force)
    await _save(asDraft: true, popAfter: true);
    return true;
  }

  Future<void> _save({
    required bool asDraft,
    bool popAfter = false,
    String? forceStatus,
    bool silent = false,
  }) async {
    if (_saving && silent) return;
    if (_saving && !silent) {
      for (var i = 0; i < 20 && _saving; i++) {
        await Future<void>.delayed(Duration(milliseconds: 100));
      }
    }
    if (_saving && silent) return;

    final title = _titleController.text.trim();
    final summary = _summaryController.text.trim();
    final author = _authorController.text.trim();
    final genre = (_selectedGenre ?? '').trim();
    if (title.isEmpty) {
      if (!silent && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Please enter a story title to start writing'),
          ),
        );
      }
      return;
    }
    final safeTitle = title.isEmpty ? 'Untitled Story' : title;

    _draftDebounce?.cancel();
    if (silent) return;

    if (mounted) {
      setState(() => _saving = true);
    } else {
      _saving = true;
    }

    try {
      final warnings = _buildWarningsString();
      final payload = <String, dynamic>{
        'title': safeTitle,
        'description': summary,
        'author': author.isEmpty ? 'Author' : author,
        'genre': genre,
        'content_warnings': warnings,
        'tags': List<String>.from(_selectedTags.take(3)),
        'language': _language,
        'audience': ((_audience ?? '').trim().isEmpty
            ? 'All Ages'
            : _audience!.trim()),
        'cover_path': _coverPath,
      };
      // Editing details never changes story status. New stories remain Draft
      // until the author publishes a chapter or explicitly chooses a status.
      if (!_isEditing) {
        payload['status_text'] = forceStatus ?? 'Draft';
      } else if (forceStatus != null && forceStatus.isNotEmpty) {
        // Explicit status change only (rare from this screen)
        payload['status_text'] = forceStatus;
      }

      var storyId =
          _savedStoryId ??
          (_isEditing ? ((widget.story!['id'] as num?)?.toInt() ?? 0) : 0);

      Future<int> persist() async {
        // Inkitt-style CONTRACT: Edit details NEVER creates a new story
        // and NEVER touches chapters. Only books row is updated.
        if (_isEditing || storyId > 0) {
          final id = storyId > 0
              ? storyId
              : ((widget.story?['id'] as num?)?.toInt() ?? 0);
          if (id <= 0) {
            throw Exception('Missing story id — cannot update details');
          }
          await widget.apiService.updateWriterStory(id, payload);
          _savedStoryId = id;
          return id;
        }
        final id = await widget.apiService.createWriterStory(payload);
        if (id > 0) _savedStoryId = id;
        return id;
      }

      Object? lastErr;
      for (var attempt = 1; attempt <= 2; attempt++) {
        try {
          storyId = await persist();
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          final msg = e.toString().toLowerCase();
          final isSlow =
              msg.contains('timeout') ||
              msg.contains('timed out') ||
              msg.contains('socket') ||
              msg.contains('connection');
          if (!isSlow || attempt >= 2) break;
          await Future<void>.delayed(Duration(seconds: 2));
        }
      }

      // Never recover-by-title while editing an existing story —
      // that can attach chapters to the wrong book and look like a wipe.
      if (storyId <= 0 && !_isEditing) {
        await Future<void>.delayed(Duration(milliseconds: 600));
        final recovered = await widget.apiService.findWriterStoryIdByTitle(
          safeTitle,
        );
        if (recovered > 0) {
          storyId = recovered;
          _savedStoryId = recovered;
          lastErr = null;
        }
      }

      if (storyId <= 0 && lastErr != null) throw lastErr;
      if (!mounted) return;

      if (storyId <= 0) {
        if (!silent) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(SnackBar(content: Text('Could not save — try again')));
        }
        return;
      }

      _savedStoryId = storyId;
      _dirty = false;
      _saving = false;
      if (mounted && !silent) setState(() {});

      // ========== INKITT CONTRACT ==========
      // Editing existing story details MUST never open "Chapter 1" editor
      // and MUST never wipe / hide chapters. Only books meta was updated.
      if (_isEditing || (widget.story != null && storyId > 0 && asDraft)) {
        if (!silent && mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Details updated — chapters unchanged')),
          );
        }
        if (mounted) {
          // Prefer simple pop so StoryManageScreen / Write can reload chapters
          if (Navigator.of(context).canPop()) {
            Navigator.of(context).pop(true);
          } else {
            try {
              final prefs = await SharedPreferences.getInstance();
              final st = (forceStatus ?? (asDraft ? 'Draft' : 'Ongoing'))
                  .toString()
                  .toLowerCase();
              final isDraft =
                  st.contains('draft') ||
                  st.contains('private') ||
                  st.contains('unpublish');
              await prefs.setBool('write_open_drafts', isDraft);
              await prefs.setBool('write_open_submitted', !isDraft);
            } catch (_) {}
            // Inkitt: return to Write / previous screen — do not reset app stack
            if (Navigator.of(context).canPop()) {
              Navigator.of(context).pop(true);
            } else {
              if (Navigator.of(context).canPop()) {
                Navigator.of(context).pop(_isEditing ? true : true);
              } else {
                await _softReturnToWrite(openDrafts: true);
              }
            }
          }
        }
        return;
      }

      if (asDraft) {
        if (!popAfter && !silent) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(SnackBar(content: Text('Draft saved')));
        }
        if (popAfter && mounted) {
          try {
            final prefs = await SharedPreferences.getInstance();
            await prefs.setBool('write_open_drafts', true);
            await prefs.setBool('write_open_submitted', false);
          } catch (_) {}
          if (Navigator.of(context).canPop()) {
            Navigator.of(context).pop(_isEditing ? true : true);
          } else {
            await _softReturnToWrite(openDrafts: true);
          }
        }
        return;
      }

      // NEW story only: after first publish-style save, open chapter editor
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Story saved — add your first chapter')),
      );
      await Navigator.of(context).push<Object?>(
        MaterialPageRoute<Object?>(
          builder: (_) => EditChapterScreen(
            apiService: widget.apiService,
            storyId: storyId,
            createNew: true,
            chapterNumber: 1,
            chapterTitle: 'Chapter 1',
          ),
        ),
      );
      if (mounted) {
        if (Navigator.of(context).canPop()) {
          Navigator.of(context).pop(_isEditing ? true : true);
        } else {
          await _softReturnToWrite(openDrafts: true);
        }
      }
    } catch (e) {
      if (!mounted) return;
      final msg = e.toString().toLowerCase();
      final isSlow =
          msg.contains('timeout') ||
          msg.contains('timed out') ||
          msg.contains('socket');

      var existingId = _savedStoryId ?? 0;
      if (existingId <= 0 && isSlow) {
        try {
          existingId = await widget.apiService.findWriterStoryIdByTitle(
            safeTitle,
          );
          if (existingId > 0) _savedStoryId = existingId;
        } catch (_) {}
      }

      // If we were editing, never open Chapter 1 on error recovery
      if (existingId > 0 && _isEditing) {
        _saving = false;
        if (mounted) {
          setState(() {});
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Details may have saved — chapters unchanged'),
            ),
          );
          if (Navigator.of(context).canPop()) {
            Navigator.of(context).pop(true);
          }
        }
        return;
      }

      if (existingId > 0 && !asDraft && !popAfter && !_isEditing) {
        _saving = false;
        if (mounted) setState(() {});
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Story saved — opening chapter editor')),
        );
        await Navigator.of(context).push<Object?>(
          MaterialPageRoute<Object?>(
            builder: (_) => EditChapterScreen(
              apiService: widget.apiService,
              storyId: existingId,
              createNew: true,
              chapterNumber: 1,
              chapterTitle: 'Chapter 1',
            ),
          ),
        );
        if (mounted) {
          try {
            final prefs = await SharedPreferences.getInstance();
            await prefs.setBool('write_open_drafts', true);
            await prefs.setBool('write_open_submitted', false);
          } catch (_) {}
          if (Navigator.of(context).canPop()) {
            Navigator.of(context).pop(_isEditing ? true : true);
          } else {
            await _softReturnToWrite(openDrafts: true);
          }
        }
        return;
      }

      if (existingId > 0 && asDraft) {
        if (!silent) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(SnackBar(content: Text('Draft saved')));
        }
        if (popAfter && mounted) {
          if (Navigator.of(context).canPop()) {
            Navigator.of(context).pop(_isEditing ? true : true);
          } else {
            await _softReturnToWrite(openDrafts: true);
          }
        }
        return;
      }

      final text = isSlow
          ? 'Still saving on server. Wait 10 seconds, then open Drafts — or tap Save once more.'
          : (msg.contains('401') || msg.contains('unauthorized'))
          ? 'Please sign in again to save'
          : 'Save failed: $e';
      if (!silent) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(text)));
      }
    } finally {
      _saving = false;
      if (mounted && !silent) setState(() {});
    }
  }

  Future<void> _openPicker({
    required String title,
    required List<String> options,
    required String? current,
    required ValueChanged<String> onSelect,
  }) async {
    // Prevent cursor jumping back to Summary after selecting genre/language/audience
    FocusManager.instance.primaryFocus?.unfocus();
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: _panel,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(height: 10),
              Center(
                child: Container(
                  width: 36,
                  height: 4,
                  decoration: BoxDecoration(
                    color: _border,
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
              Padding(
                padding: EdgeInsets.fromLTRB(16, 14, 16, 8),
                child: Text(
                  title,
                  style: TextStyle(
                    fontSize: 15,
                    color: _textLo,
                    fontStyle: FontStyle.italic,
                  ),
                ),
              ),
              Flexible(
                child: ListView(
                  shrinkWrap: true,
                  children: options.map((opt) {
                    final selected = opt == current;
                    return ListTile(
                      title: Text(
                        opt,
                        style: TextStyle(
                          color: selected ? _magenta : _textHi,
                          fontSize: 15.5,
                        ),
                      ),
                      trailing: selected
                          ? Icon(Icons.check, color: _magenta, size: 18)
                          : null,
                      onTap: () {
                        onSelect(opt);
                        Navigator.pop(ctx);
                        FocusManager.instance.primaryFocus?.unfocus();
                      },
                    );
                  }).toList(),
                ),
              ),
              SizedBox(height: 12),
            ],
          ),
        );
      },
    );
  }

  @override
  void dispose() {
    _draftDebounce?.cancel();
    _titleController.dispose();
    _summaryController.dispose();
    _authorController.dispose();
    _tagInputController.dispose();
    _otherWarningController.dispose();
    _customGenreController.dispose();
    _tagFocus.dispose();
    _summaryFocus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    _applyThemeColors(context);

    final titleLen = _titleController.text.length;
    final saveDraftButton = OutlinedButton(
      onPressed: _saving ? null : () => _save(asDraft: true),
      style: OutlinedButton.styleFrom(
        foregroundColor: _textHi,
        side: BorderSide(color: _border),
        backgroundColor: _panelAlt,
        padding: const EdgeInsets.symmetric(vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      child: _saving
          ? SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(strokeWidth: 2, color: _textHi),
            )
          : const Text(
              'Save Draft',
              style: TextStyle(fontWeight: FontWeight.w500),
            ),
    );
    final saveDetailsButton = ElevatedButton(
      onPressed: _saving
          ? null
          : () => _isEditing
                ? _save(asDraft: true, popAfter: true)
                : _save(asDraft: false, forceStatus: 'Draft'),
      style: ElevatedButton.styleFrom(
        backgroundColor: _magenta,
        disabledBackgroundColor: _magenta.withValues(alpha: 0.4),
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(vertical: 14),
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      child: _saving
          ? const SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: Colors.white,
              ),
            )
          : Text(
              _isEditing ? 'Save details' : 'Create Story',
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
    );

    // Inherit app theme (dark default); only override scaffold surface colors
    final parent = Theme.of(context);
    return Theme(
      data: parent.copyWith(
        scaffoldBackgroundColor: _ink,
        colorScheme: parent.colorScheme.copyWith(
          primary: _magenta,
          secondary: _violet,
          surface: _panel,
          onSurface: _textHi,
        ),
        textTheme: parent.textTheme.copyWith(
          bodyLarge: parent.textTheme.bodyLarge?.copyWith(color: _textHi),
          bodyMedium: parent.textTheme.bodyMedium?.copyWith(color: _textLo),
          titleMedium: parent.textTheme.titleMedium?.copyWith(color: _textHi),
        ),
      ),
      child: PopScope(
        canPop: false,
        onPopInvokedWithResult: (didPop, result) async {
          if (didPop) return;
          if (_saving) {
            _saving = false;
          }
          final shouldLeave = await _confirmLeaveAndSaveDraft();
          if (shouldLeave && mounted) {
            try {
              final prefs = await SharedPreferences.getInstance();
              await prefs.setBool('write_open_drafts', true);
              await prefs.setBool('write_open_submitted', false);
            } catch (_) {}
            // Inkitt: return to Write / previous screen — do not reset app stack
            if (Navigator.of(context).canPop()) {
              Navigator.of(context).pop(true);
            } else {
              if (Navigator.of(context).canPop()) {
                Navigator.of(context).pop(_isEditing ? true : true);
              } else {
                await _softReturnToWrite(openDrafts: true);
              }
            }
          }
        },
        child: Scaffold(
          backgroundColor: _ink,
          body: SafeArea(
            child: Column(
              children: [
                Container(
                  padding: EdgeInsets.fromLTRB(8, 10, 16, 10),
                  decoration: BoxDecoration(
                    color: _ink,
                    border: Border(bottom: BorderSide(color: _borderSoft)),
                  ),
                  child: Row(
                    children: [
                      IconButton(
                        onPressed: () async {
                          if (_saving) {
                            _saving = false;
                            if (mounted) setState(() {});
                          }
                          final shouldLeave = await _confirmLeaveAndSaveDraft();
                          if (shouldLeave && mounted) {
                            try {
                              final prefs =
                                  await SharedPreferences.getInstance();
                              await prefs.setBool('write_open_drafts', true);
                              await prefs.setBool(
                                'write_open_submitted',
                                false,
                              );
                            } catch (_) {}
                            await _softReturnToWrite(openDrafts: true);
                          }
                        },
                        icon: Icon(Icons.arrow_back, color: _textHi),
                      ),
                      Text(
                        'New Story',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w600,
                          color: _textHi,
                          letterSpacing: 0.2,
                        ),
                      ),
                      Spacer(),
                    ],
                  ),
                ),
                Expanded(
                  child: ListView(
                    padding: EdgeInsets.fromLTRB(16, 18, 16, 24),
                    children: [
                      GestureDetector(
                        onTap: () async {
                          await _showCoverGuidelines();
                          await _pickCover();
                        },
                        child: Container(
                          width: double.infinity,
                          height: 180,
                          decoration: BoxDecoration(
                            color: _panel,
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: _border, width: 1.5),
                          ),
                          clipBehavior: Clip.antiAlias,
                          child: _coverPath.isNotEmpty
                              ? Stack(
                                  fit: StackFit.expand,
                                  children: [
                                    Image.network(
                                      widget.apiService.resolveAssetUrl(
                                        _coverPath,
                                      ),
                                      fit: BoxFit.cover,
                                      errorBuilder: (_, _, _) => Center(
                                        child: Icon(
                                          Icons.image_outlined,
                                          size: 40,
                                          color: _textLo,
                                        ),
                                      ),
                                    ),
                                    Positioned(
                                      right: 8,
                                      bottom: 8,
                                      child: Container(
                                        padding: EdgeInsets.symmetric(
                                          horizontal: 10,
                                          vertical: 4,
                                        ),
                                        decoration: BoxDecoration(
                                          color: Colors.black54,
                                          borderRadius: BorderRadius.circular(
                                            8,
                                          ),
                                        ),
                                        child: Text(
                                          'Change',
                                          style: TextStyle(
                                            color: Colors.white,
                                            fontSize: 11,
                                          ),
                                        ),
                                      ),
                                    ),
                                  ],
                                )
                              : Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Icon(
                                      Icons.upload_rounded,
                                      size: 28,
                                      color: _textLo,
                                    ),
                                    SizedBox(height: 8),
                                    Text(
                                      'Tap to upload a cover image',
                                      style: TextStyle(
                                        color: _textFaint,
                                        fontSize: 12,
                                      ),
                                    ),
                                  ],
                                ),
                        ),
                      ),
                      SizedBox(height: 8),
                      Text(
                        'Shown on Draft & Published lists',
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 11.5, color: _textFaint),
                      ),
                      SizedBox(height: 18),
                      Container(
                        padding: EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: _panel,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: _borderSoft),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Text('✒', style: TextStyle(fontSize: 14)),
                                SizedBox(width: 8),
                                Text(
                                  'Details Completion',
                                  style: TextStyle(
                                    fontSize: 13,
                                    color: _textLo,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                            SizedBox(height: 9),
                            ClipRRect(
                              borderRadius: BorderRadius.circular(999),
                              child: LinearProgressIndicator(
                                value: _readinessPct / 100,
                                minHeight: 7,
                                backgroundColor: _panelAlt,
                                valueColor: AlwaysStoppedAnimation<Color>(
                                  _magenta,
                                ),
                              ),
                            ),
                            SizedBox(height: 9),
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    _readinessCaption,
                                    style: TextStyle(
                                      fontSize: 12.5,
                                      fontStyle: FontStyle.italic,
                                      color: _textHi,
                                    ),
                                  ),
                                ),
                                Text(
                                  '$_readinessPct%',
                                  style: TextStyle(
                                    fontSize: 18,
                                    color: _textHi,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      SizedBox(height: 20),
                      _label('Title * (Required)'),
                      SizedBox(height: 7),
                      _darkField(
                        child: TextField(
                          controller: _titleController,
                          maxLength: 100,
                          style: TextStyle(color: _textHi, fontSize: 15),
                          decoration: InputDecoration(
                            hintText: 'My Story',
                            hintStyle: TextStyle(color: _textFaint),
                            border: InputBorder.none,
                            counterText: '',
                            contentPadding: EdgeInsets.symmetric(
                              horizontal: 14,
                              vertical: 13,
                            ),
                          ),
                        ),
                      ),
                      Align(
                        alignment: Alignment.centerRight,
                        child: Text(
                          '$titleLen / 100',
                          style: TextStyle(
                            fontSize: 11,
                            color: titleLen >= 100 ? _amber : _textFaint,
                          ),
                        ),
                      ),
                      SizedBox(height: 14),
                      _label('Author'),
                      SizedBox(height: 7),
                      Stack(
                        children: [
                          _darkField(
                            child: TextField(
                              controller: _authorController,
                              readOnly: true,
                              enabled: false,
                              style: TextStyle(color: _textFaint, fontSize: 15),
                              decoration: InputDecoration(
                                border: InputBorder.none,
                                contentPadding: EdgeInsets.symmetric(
                                  horizontal: 14,
                                  vertical: 13,
                                ),
                              ),
                            ),
                          ),
                          Positioned(
                            right: 14,
                            top: 14,
                            child: Icon(
                              Icons.lock,
                              size: 14,
                              color: _textFaint,
                            ),
                          ),
                        ],
                      ),
                      SizedBox(height: 14),
                      _label('Summary * (Required before publishing)'),
                      SizedBox(height: 7),
                      _darkField(
                        child: TextField(
                          controller: _summaryController,
                          focusNode: _summaryFocus,
                          maxLength: 500,
                          maxLines: 4,
                          style: TextStyle(
                            color: _textHi,
                            fontSize: 15,
                            height: 1.45,
                          ),
                          decoration: InputDecoration(
                            hintText: 'Short description of your story...',
                            hintStyle: TextStyle(color: _textFaint),
                            border: InputBorder.none,
                            counterText: '',
                            contentPadding: EdgeInsets.symmetric(
                              horizontal: 14,
                              vertical: 13,
                            ),
                          ),
                        ),
                      ),
                      Align(
                        alignment: Alignment.centerRight,
                        child: ValueListenableBuilder<TextEditingValue>(
                          valueListenable: _summaryController,
                          builder: (context, value, _) {
                            final len = value.text.length;
                            return Text(
                              '$len / 500',
                              style: TextStyle(
                                fontSize: 11,
                                color: len >= 500 ? _amber : _textFaint,
                              ),
                            );
                          },
                        ),
                      ),
                      SizedBox(height: 14),
                      _label('Genre * (Required before publishing)'),
                      SizedBox(height: 7),
                      GestureDetector(
                        onTap: () => _openPicker(
                          title: 'Select genre',
                          options: _genres.isEmpty ? _defaultGenres : _genres,
                          current: _selectedGenre,
                          onSelect: (v) => setState(() => _selectedGenre = v),
                        ),
                        child: _dropdownTrigger(
                          _selectedGenre ?? 'Select genre',
                          isPlaceholder: _selectedGenre == null,
                        ),
                      ),

                      SizedBox(height: 14),
                      Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                _label('Language *'),
                                SizedBox(height: 7),
                                GestureDetector(
                                  onTap: () => _openPicker(
                                    title: 'Select language',
                                    options: _languages,
                                    current: _language ?? 'Select language',
                                    onSelect: (v) {
                                      setState(() => _language = v);
                                      _scheduleDraftSave();
                                    },
                                  ),
                                  child: _dropdownTrigger(
                                    _language ?? 'Select language',
                                    isPlaceholder: _language == null,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                _label('Audience *'),
                                SizedBox(height: 7),
                                GestureDetector(
                                  onTap: () => _openPicker(
                                    title: 'Select audience',
                                    options: _audiences,
                                    current: _audience,
                                    onSelect: (v) {
                                      setState(() => _audience = v);
                                      _scheduleDraftSave();
                                    },
                                  ),
                                  child: _dropdownTrigger(
                                    _audience ?? 'Select audience',
                                    isPlaceholder: _audience == null,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      SizedBox(height: 14),
                      _label('Content Warnings (Optional)'),
                      SizedBox(height: 7),
                      GridView.count(
                        crossAxisCount: 2,
                        shrinkWrap: true,
                        physics: NeverScrollableScrollPhysics(),
                        mainAxisSpacing: 8,
                        crossAxisSpacing: 8,
                        childAspectRatio: 3.2,
                        children: _warningOptions.map((w) {
                          final checked = _selectedWarnings.contains(w);
                          return GestureDetector(
                            onTap: () {
                              setState(() {
                                if (checked) {
                                  _selectedWarnings.remove(w);
                                } else {
                                  _selectedWarnings.add(w);
                                }
                              });
                            },
                            child: Container(
                              padding: EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 11,
                              ),
                              decoration: BoxDecoration(
                                color: _panelAlt,
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(
                                  color: checked ? _magenta : _border,
                                ),
                              ),
                              child: Row(
                                children: [
                                  Container(
                                    width: 15,
                                    height: 15,
                                    decoration: BoxDecoration(
                                      borderRadius: BorderRadius.circular(5),
                                      border: Border.all(
                                        color: checked
                                            ? Colors.transparent
                                            : _textFaint,
                                        width: 1.5,
                                      ),
                                      gradient: checked
                                          ? LinearGradient(
                                              colors: [_magenta, _violet],
                                            )
                                          : null,
                                    ),
                                    child: checked
                                        ? Icon(
                                            Icons.check,
                                            size: 11,
                                            color: Colors.white,
                                          )
                                        : null,
                                  ),
                                  SizedBox(width: 8),
                                  Expanded(
                                    child: Text(
                                      w,
                                      style: TextStyle(
                                        fontSize: 13,
                                        color: checked ? _textHi : _textLo,
                                      ),
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                      if (_selectedWarnings.contains('Other')) ...[
                        SizedBox(height: 8),
                        _darkField(
                          child: TextField(
                            controller: _otherWarningController,
                            style: TextStyle(color: _textHi, fontSize: 15),
                            decoration: InputDecoration(
                              hintText: 'Describe the other warning...',
                              hintStyle: TextStyle(color: _textFaint),
                              border: InputBorder.none,
                              contentPadding: EdgeInsets.symmetric(
                                horizontal: 14,
                                vertical: 13,
                              ),
                            ),
                          ),
                        ),
                      ],
                      SizedBox(height: 14),
                      _label('Hashtags (Max 3)'),
                      SizedBox(height: 7),
                      Container(
                        padding: EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 10,
                        ),
                        decoration: BoxDecoration(
                          color: _panelAlt,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: _border),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (_selectedTags.isNotEmpty)
                              Padding(
                                padding: EdgeInsets.only(bottom: 8),
                                child: Wrap(
                                  spacing: 8,
                                  runSpacing: 8,
                                  children: _selectedTags.map((t) {
                                    return Container(
                                      padding: EdgeInsets.symmetric(
                                        horizontal: 10,
                                        vertical: 6,
                                      ),
                                      decoration: BoxDecoration(
                                        color: Color(0x1A6C3CE1),
                                        borderRadius: BorderRadius.circular(
                                          999,
                                        ),
                                        border: Border.all(
                                          color: Color(0x666C3CE1),
                                        ),
                                      ),
                                      child: Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Text(
                                            '#$t',
                                            style: TextStyle(
                                              color: Color(0xFF16856A),
                                              fontSize: 12.5,
                                            ),
                                          ),
                                          SizedBox(width: 6),
                                          GestureDetector(
                                            onTap: () => _removeTag(t),
                                            child: Icon(
                                              Icons.close,
                                              size: 12,
                                              color: Color(0xFF16856A),
                                            ),
                                          ),
                                        ],
                                      ),
                                    );
                                  }).toList(),
                                ),
                              ),
                            if (_selectedTags.length < 3)
                              RawAutocomplete<String>(
                                textEditingController: _tagInputController,
                                focusNode: _tagFocus,
                                optionsBuilder: (v) => _tagSuggestions(v.text),
                                onSelected: _addTag,
                                fieldViewBuilder:
                                    (
                                      context,
                                      controller,
                                      focusNode,
                                      onFieldSubmitted,
                                    ) {
                                      return TextField(
                                        controller: controller,
                                        focusNode: focusNode,
                                        style: TextStyle(
                                          color: _textHi,
                                          fontSize: 14.5,
                                        ),
                                        decoration: InputDecoration(
                                          hintText: 'Search admin hashtags…',
                                          hintStyle: TextStyle(
                                            color: _textFaint,
                                          ),
                                          prefixIcon: Icon(
                                            Icons.tag,
                                            size: 18,
                                            color: _textFaint,
                                          ),
                                          border: InputBorder.none,
                                          isDense: true,
                                          contentPadding: EdgeInsets.symmetric(
                                            vertical: 8,
                                          ),
                                        ),
                                        onSubmitted: (v) {
                                          // Only accept if it matches a suggestion
                                          final opts = _tagSuggestions(v);
                                          if (opts.isEmpty) {
                                            ScaffoldMessenger.of(
                                              context,
                                            ).showSnackBar(
                                              SnackBar(
                                                content: Text(
                                                  'Pick a hashtag from the suggestion list',
                                                ),
                                              ),
                                            );
                                          } else if (opts.any(
                                            (o) =>
                                                o.toLowerCase() ==
                                                v
                                                    .trim()
                                                    .toLowerCase()
                                                    .replaceFirst('#', ''),
                                          )) {
                                            _addTag(v);
                                            onFieldSubmitted();
                                          } else {
                                            // Autofill closest
                                            _addTag(opts.first);
                                            onFieldSubmitted();
                                          }
                                        },
                                      );
                                    },
                                optionsViewBuilder:
                                    (context, onSelected, options) {
                                      return Align(
                                        alignment: Alignment.topLeft,
                                        child: Material(
                                          color: _panel,
                                          elevation: 6,
                                          borderRadius: BorderRadius.circular(
                                            10,
                                          ),
                                          child: ConstrainedBox(
                                            constraints: BoxConstraints(
                                              maxHeight: 200,
                                              maxWidth: 320,
                                            ),
                                            child: ListView.builder(
                                              padding: EdgeInsets.zero,
                                              shrinkWrap: true,
                                              itemCount: options.length,
                                              itemBuilder: (context, index) {
                                                final option = options
                                                    .elementAt(index);
                                                return ListTile(
                                                  dense: true,
                                                  title: Text(
                                                    '#$option',
                                                    style: TextStyle(
                                                      color: _textHi,
                                                    ),
                                                  ),
                                                  onTap: () =>
                                                      onSelected(option),
                                                );
                                              },
                                            ),
                                          ),
                                        ),
                                      );
                                    },
                              ),
                            // Quick pick: show popular admin tags as chips
                            if (!_loadingTags &&
                                _availableTags.isNotEmpty &&
                                _selectedTags.length < 3)
                              Padding(
                                padding: EdgeInsets.only(top: 8),
                                child: Wrap(
                                  spacing: 6,
                                  runSpacing: 6,
                                  children: _availableTags
                                      .where(
                                        (t) => !_selectedTags.any(
                                          (s) =>
                                              s.toLowerCase() ==
                                              t.toLowerCase(),
                                        ),
                                      )
                                      .take(12)
                                      .map(
                                        (t) => ActionChip(
                                          label: Text(
                                            '#$t',
                                            style: TextStyle(fontSize: 12),
                                          ),
                                          onPressed: () => _addTag(t),
                                          visualDensity: VisualDensity.compact,
                                          materialTapTargetSize:
                                              MaterialTapTargetSize.shrinkWrap,
                                        ),
                                      )
                                      .toList(),
                                ),
                              ),
                            if (!_loadingTags && _availableTags.isEmpty)
                              Padding(
                                padding: EdgeInsets.only(top: 6),
                                child: Text(
                                  'No admin hashtags yet. Ask an admin to create tags.',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: Colors.black54,
                                  ),
                                ),
                              ),
                            if (_loadingTags)
                              Padding(
                                padding: EdgeInsets.only(top: 6),
                                child: LinearProgressIndicator(
                                  minHeight: 2,
                                  color: _magenta,
                                ),
                              ),
                          ],
                        ),
                      ),
                      SizedBox(height: 80),
                    ],
                  ),
                ),
                Container(
                  padding: EdgeInsets.fromLTRB(16, 12, 16, 16),
                  decoration: BoxDecoration(
                    color: _ink,
                    border: Border(top: BorderSide(color: _borderSoft)),
                  ),
                  child: LayoutBuilder(
                    builder: (context, constraints) {
                      if (constraints.maxWidth < 370) {
                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            saveDraftButton,
                            const SizedBox(height: 10),
                            saveDetailsButton,
                          ],
                        );
                      }
                      return Row(
                        children: [
                          Expanded(child: saveDraftButton),
                          const SizedBox(width: 10),
                          Expanded(flex: 2, child: saveDetailsButton),
                        ],
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _label(String text) {
    return Text(
      text,
      style: TextStyle(
        fontSize: 10.5,
        letterSpacing: 0.9,
        color: _textLo,
        fontWeight: FontWeight.w500,
      ),
    );
  }

  Widget _darkField({required Widget child}) {
    return Container(
      decoration: BoxDecoration(
        color: _panelAlt,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _border),
      ),
      child: child,
    );
  }

  Widget _dropdownTrigger(String text, {bool isPlaceholder = false}) {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: 14, vertical: 13),
      decoration: BoxDecoration(
        color: _panelAlt,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _border),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                color: isPlaceholder ? _textFaint : _textHi,
                fontSize: 15,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          Icon(Icons.keyboard_arrow_down, color: _textLo, size: 20),
        ],
      ),
    );
  }

  Widget _segmentBtn(
    String label, {
    required bool active,
    required Color activeColor,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: EdgeInsets.symmetric(vertical: 11),
        decoration: BoxDecoration(
          color: active ? _panel : Colors.transparent,
          borderRadius: BorderRadius.circular(9),
          border: active ? Border.all(color: _border) : null,
        ),
        alignment: Alignment.center,
        child: Text(
          label,
          style: TextStyle(
            color: active ? activeColor : _textLo,
            fontSize: 14,
            fontWeight: FontWeight.w500,
          ),
        ),
      ),
    );
  }
}
