import 'dart:async';
import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/theme/app_theme.dart';

import '../../core/constants/responsive.dart';
import '../../data/models/app_bootstrap.dart';
import '../../data/services/api_service.dart';
import 'chapter_reader_screen.dart';
import 'hashtag_detail_screen.dart';
import 'profile_screen.dart';
import 'genre_stories_screen.dart';

/// Story detail page modeled after the Inkitt video:
/// centered cover, title, stats (Chapters / Last Updated / Reviews),
/// summary + Read More, Likes / Save / Reviews row, genres, tags,
/// author + Follow, chapter list, sticky green Read Now.
class StoryDetailScreen extends StatefulWidget {
  const StoryDetailScreen({
    super.key,
    required this.book,
    required this.apiService,
  });

  final BookDetailModel book;
  final ApiService apiService;

  @override
  State<StoryDetailScreen> createState() => _StoryDetailScreenState();
}

String _chapterDisplayTitle(String rawTitle, int number) {
  final title = rawTitle.trim();
  if (title.isEmpty) return 'Chapter $number';
  final chapterPrefix = RegExp(
    '^chapter\\s*$number(?:\\s*[:.\\-]?\\s*)',
    caseSensitive: false,
  );
  final remainder = title.replaceFirst(chapterPrefix, '').trim();
  return remainder.isEmpty ? 'Chapter $number' : 'Chapter $number: $remainder';
}

class _StoryDetailScreenState extends State<StoryDetailScreen> {
  late BookDetailModel _book;
  bool _isFollowing = false;
  bool _loadingFollow = false;
  bool _loadingChapters = true;
  String? _chapterLoadError;
  bool _summaryExpanded = false;
  List<Map<String, dynamic>> _chapters = const [];
  List<String> _tags = const [];
  List<Map<String, dynamic>> _reviews = const [];
  bool _loadingReviews = true;
  int _reviewCount = 0;
  int _viewCount = 0;
  String? _error;
  int _likesCount = 0;
  bool _liked = false;
  bool _likeBusy = false;
  bool _saved = false;
  bool _hasMyReview = false;
  List<Map<String, dynamic>> _storyComments = const [];
  bool _loadingStoryComments = true;
  int _storyCommentCount = 0;

  int? _currentUserId;

  bool get _isOwner {
    final aid = _book.authorUserId;
    final me = _currentUserId;
    return aid != null && me != null && aid == me;
  }

  List<Map<String, dynamic>> _authorStories = const [];
  List<Map<String, dynamic>> _youMayAlsoLike = const [];
  String? _authorPhotoUrl;
  String _contentWarningsExtra = '';

  @override
  void initState() {
    super.initState();
    _book = widget.book;
    _tags = List<String>.from(widget.book.tags);
    _viewCount = widget.book.viewCount;
    _bootstrap();
    unawaited(_checkSavedAndReviewed());
  }

  Future<void> _bootstrap() async {
    setState(() {
      _loadingChapters = true;
      _error = null;
    });
    // Resolve current user immediately so owner self-actions stay disabled
    try {
      final me = await widget.apiService.fetchMe();
      final uid =
          (me['id'] as num?)?.toInt() ?? (me['user_id'] as num?)?.toInt();
      if (mounted && uid != null) setState(() => _currentUserId = uid);
    } catch (_) {}
    try {
      final detailFuture = widget.apiService.fetchPublicBook(_book.id);
      final chaptersFuture = widget.apiService
          .fetchPublicStoryChapters(_book.id)
          .catchError((Object chapterError) {
            _chapterLoadError =
                chapterError.toString().contains('TimeoutException')
                ? 'Loading chapters took too long. Check your connection and try again.'
                : 'Chapters could not be loaded. Please try again.';
            return <Map<String, dynamic>>[];
          });
      final detail = await detailFuture;
      if (detail != null && mounted) {
        setState(() {
          _book = BookDetailModel.fromMap(detail);
          _tags = List<String>.from(_book.tags);
          _likesCount =
              (detail['likes_count'] as num?)?.toInt() ??
              (detail['likes'] as num?)?.toInt() ??
              0;
          _reviewCount =
              (detail['reviews_count'] as num?)?.toInt() ??
              (detail['review_count'] as num?)?.toInt() ??
              _reviewCount;
          _viewCount =
              (detail['view_count'] as num?)?.toInt() ??
              (detail['views'] as num?)?.toInt() ??
              _viewCount;
          final photo =
              (detail['author_photo_url'] ??
                      detail['author_photo'] ??
                      detail['photo_url'] ??
                      detail['authorPhotoUrl'] ??
                      '')
                  .toString();
          if (photo.isNotEmpty) {
            _authorPhotoUrl = photo;
          }
          final cw =
              (detail['content_warnings'] ??
                      detail['content_warning'] ??
                      detail['contentWarnings'] ??
                      '')
                  .toString()
                  .trim();
          if (cw.isNotEmpty) {
            _contentWarningsExtra = cw;
          }
        });
      }
      final chapters = await chaptersFuture;
      if (chapters.isNotEmpty) _chapterLoadError = null;
      if (!mounted) return;
      setState(() {
        _chapters = chapters;
        _loadingChapters = false;
      });
      final aid = _book.authorUserId;
      if (aid != null) {
        try {
          final following = await widget.apiService.fetchAuthorFollowing(aid);
          if (mounted) setState(() => _isFollowing = following);
        } catch (_) {}
        try {
          final others = await widget.apiService.fetchAuthorBooks(
            aid,
            excludeBookId: _book.id,
          );
          if (mounted) setState(() => _authorStories = others);
        } catch (_) {}
        // Resolve author profile photo for reader header + detail avatar
        if (_authorPhotoUrl == null || _authorPhotoUrl!.isEmpty) {
          try {
            final profile = await widget.apiService.fetchProfile(aid);
            final photo =
                (profile['photo_url'] ??
                        profile['photoUrl'] ??
                        profile['avatar_url'] ??
                        '')
                    .toString();
            if (photo.isNotEmpty && mounted) {
              setState(() => _authorPhotoUrl = photo);
            }
          } catch (_) {}
        }
      }
      final reviews = await widget.apiService.fetchBookReviews(_book.id);
      if (mounted) {
        setState(() {
          _reviews = _dedupeReviews(reviews);
          _reviewCount = _reviews.length;
          _hasMyReview = _viewerHasReview(reviews, _currentUserId);
          _loadingReviews = false;
        });
      }
      try {
        // Whole-story book comments removed per product request.
        // Chapter + paragraph comments remain available in the reader.
        if (mounted) {
          setState(() {
            _storyComments = const [];
            _storyCommentCount = 0;
            _loadingStoryComments = false;
          });
        }
      } catch (_) {
        if (mounted) setState(() => _loadingStoryComments = false);
      }

      try {
        final likeState = await widget.apiService.fetchBookLike(_book.id);
        if (mounted) {
          setState(() {
            _liked = (likeState['liked'] as bool?) ?? false;
            final c = (likeState['likes_count'] as num?)?.toInt();
            if (c != null) _likesCount = c;
          });
        }
      } catch (_) {}
      // Prefer story-specific server recommendations; use local discovery
      // sources only to fill gaps when the personalized rail is short.
      try {
        List<Map<String, dynamic>> related = [];
        Future<void> addFrom(List<Map<String, dynamic>> src) async {
          for (final b in src) {
            final id = (b['id'] as num?)?.toInt() ?? 0;
            if (id <= 0 || id == _book.id) continue;
            if (related.any((x) => (x['id'] as num?)?.toInt() == id)) continue;
            related.add(b);
            if (related.length >= 12) break;
          }
        }

        await addFrom(
          await widget.apiService.fetchRelatedRecommendations(_book.id),
        );
        if (_tags.isNotEmpty) {
          try {
            await addFrom(await widget.apiService.fetchBooksByTag(_tags.first));
          } catch (_) {}
        }
        if (related.length < 8 && _book.genre.isNotEmpty) {
          try {
            await addFrom(await widget.apiService.fetchBooksByTag(_book.genre));
          } catch (_) {}
          try {
            await addFrom(
              await widget.apiService.searchStories(query: _book.genre),
            );
          } catch (_) {}
        }
        if (related.length < 8) {
          try {
            final boot = await widget.apiService.loadDiskBootstrap();
            if (boot != null) {
              final maps = <Map<String, dynamic>>[];
              for (final b in [
                ...boot.discoverBooks,
                ...boot.recentlyUpdated,
              ]) {
                maps.add({
                  'id': b.id,
                  'title': b.title,
                  'author': b.author,
                  'cover_path': b.coverPath,
                  'description': b.description,
                  'genre': b.primaryGenre,
                  'rating': b.rating,
                  'status_text': b.statusText,
                });
              }
              await addFrom(maps);
            }
          } catch (_) {}
        }
        if (related.length < 6) {
          try {
            // Popular / broad search fallback so sections are rarely empty
            await addFrom(
              await widget.apiService.searchStories(
                query: _book.title.split(' ').first,
              ),
            );
          } catch (_) {}
        }

        if (mounted) {
          setState(() => _youMayAlsoLike = related.take(12).toList());
        }
      } catch (_) {}
    } catch (e) {
      if (mounted) {
        setState(() {
          _loadingChapters = false;
          _loadingReviews = false;
          _error = 'Unable to load story details.';
        });
      }
    }
  }

  Future<void> _retryLoadChapters() async {
    setState(() {
      _loadingChapters = true;
      _chapterLoadError = null;
    });
    try {
      final chapters = await widget.apiService.fetchStoryChapters(_book.id);
      if (!mounted) return;
      setState(() {
        _chapters = chapters;
        _loadingChapters = false;
        _chapterLoadError = null;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loadingChapters = false;
        _chapterLoadError = error.toString().contains('TimeoutException')
            ? 'Loading chapters took too long. Check your connection and try again.'
            : 'Chapters could not be loaded. Please try again.';
      });
    }
  }

  Future<void> _toggleLike() async {
    if (_isOwner || _likeBusy) return;
    setState(() => _likeBusy = true);
    try {
      final res = _liked
          ? await widget.apiService.unlikeBook(_book.id)
          : await widget.apiService.likeBook(_book.id);
      if (!mounted) return;
      setState(() {
        final wasLiked = _liked;
        if (res.containsKey('liked')) {
          _liked = res['liked'] == true;
        } else {
          _liked = !wasLiked;
        }
        final c =
            (res['likes_count'] as num?)?.toInt() ??
            (res['likes'] as num?)?.toInt();
        if (c != null) {
          _likesCount = c;
        } else if (_liked != wasLiked) {
          _likesCount = (_likesCount + (_liked ? 1 : -1)).clamp(0, 1 << 30);
        }
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Could not update like: $e')));
      }
    } finally {
      if (mounted) setState(() => _likeBusy = false);
    }
  }

  Future<void> _toggleFollow() async {
    final aid = _book.authorUserId;
    if (aid == null || _loadingFollow) return;
    if (_isOwner) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('You cannot follow yourself')),
        );
      }
      return;
    }
    setState(() => _loadingFollow = true);
    try {
      late final Map<String, dynamic> result;
      if (_isFollowing) {
        result = await widget.apiService.unfollowAuthor(aid);
      } else {
        result = await widget.apiService.followAuthor(aid);
      }
      if (!mounted) return;
      if (result['self'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('You cannot follow yourself')),
        );
        return;
      }
      setState(() => _isFollowing = result['following'] == true);
    } catch (e) {
      if (mounted) {
        final msg = e.toString().toLowerCase();
        final text = (msg.contains('timeout') || msg.contains('timed out'))
            ? 'Server busy — tap Follow again in a moment'
            : (msg.contains('401') ||
                  msg.contains('unauthorized') ||
                  msg.contains('sign'))
            ? 'Please sign in to follow authors'
            : 'Could not update follow — try again';
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(text)));
      }
    } finally {
      if (mounted) setState(() => _loadingFollow = false);
    }
  }

  Future<void> _openAuthorProfile() async {
    final authorId = _book.authorUserId;
    if (authorId == null || authorId <= 0) return;
    try {
      final data = await widget.apiService.fetchProfile(authorId);
      if (!mounted) return;
      if (data.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Author profile is unavailable.')),
        );
        return;
      }
      Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => ProfileScreen(
            profile: ProfileModel.fromMap(data),
            apiService: widget.apiService,
            achievements: const [],
            viewingUserId: authorId,
          ),
        ),
      );
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not open author profile: $error')),
        );
      }
    }
  }

  Future<void> _openStoryCommentsSheet() async {
    // Whole-story book comments disabled. Use chapter / paragraph comments in the reader.
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
          'Story comments are disabled. Comment on chapters or paragraphs while reading.',
        ),
      ),
    );
  }

  String _formatLastUpdated() {
    final raw = _book.lastUpdated.trim();
    if (raw.isEmpty) {
      // Fallback: try status or a short relative label
      if (_book.statusText.isNotEmpty) return _book.statusText;
      return '—';
    }
    // Keep short for the stats cell (e.g. "Sep 11, 2026" or ISO → readable)
    try {
      final dt = DateTime.tryParse(raw);
      if (dt != null) {
        const months = [
          'Jan',
          'Feb',
          'Mar',
          'Apr',
          'May',
          'Jun',
          'Jul',
          'Aug',
          'Sep',
          'Oct',
          'Nov',
          'Dec',
        ];
        return '${months[dt.month - 1]} ${dt.day}, ${dt.year}';
      }
    } catch (_) {}
    // Already human text
    if (raw.length > 16) return raw.substring(0, 16);
    return raw;
  }

  Future<void> _openReviewsPage() async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (_) => _BookReviewsPage(
          book: _book,
          apiService: widget.apiService,
          isOwner: _isOwner,
          hasMyReview: _hasMyReview,
          onHasMyReviewChanged: (hasMine) async {
            if (!mounted) return;
            setState(() => _hasMyReview = hasMine);
            try {
              final reviews = await widget.apiService.fetchBookReviews(
                _book.id,
              );
              if (mounted) {
                setState(() {
                  _reviews = _dedupeReviews(reviews);
                  _reviewCount = _reviews.length;
                });
              }
            } catch (_) {}
          },
        ),
      ),
    );
    // Refresh when returning from reviews page
    try {
      final reviews = await widget.apiService.fetchBookReviews(_book.id);
      if (!mounted) return;
      final mine = _viewerHasReview(reviews, _currentUserId);
      setState(() {
        _reviews = _dedupeReviews(reviews);
        _reviewCount = _reviews.length;
        _hasMyReview = mine;
      });
    } catch (_) {}
  }

  bool _viewerHasReview(List<Map<String, dynamic>> reviews, int? viewerId) {
    return reviews.any(
      (r) =>
          _asTruthy(r['is_mine'] ?? r['mine']) ||
          (viewerId != null && (r['user_id'] as num?)?.toInt() == viewerId),
    );
  }

  void _onWriteReviewPressed() {
    if (_isOwner) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text("Author can't make reviews on their own book"),
        ),
      );
      return;
    }
    if (_hasMyReview) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'You already reviewed this story. Delete it to write again.',
          ),
        ),
      );
      return;
    }
    Navigator.of(context)
        .push<bool>(
          MaterialPageRoute<bool>(
            builder: (_) => _WriteReviewScreen(
              apiService: widget.apiService,
              bookId: _book.id,
            ),
          ),
        )
        .then((ok) async {
          if (ok == true && mounted) {
            setState(() => _hasMyReview = true);
            try {
              final reviews = await widget.apiService.fetchBookReviews(
                _book.id,
              );
              if (mounted) {
                setState(() {
                  _reviews = _dedupeReviews(reviews);
                  _reviewCount = _reviews.length;
                });
              }
            } catch (_) {}
            if (mounted) {
              await _openReviewsPage();
            }
          }
        });
  }

  Future<void> _checkSavedAndReviewed() async {
    try {
      final lib = await widget.apiService.fetchLibraryEntries();
      final saved = lib.any((e) {
        final bid =
            (e['book_id'] as num?)?.toInt() ??
            ((e['book'] as Map?)?['id'] as num?)?.toInt() ??
            0;
        return bid == _book.id;
      });
      if (mounted) setState(() => _saved = saved);
    } catch (_) {}
  }

  bool _asTruthy(dynamic value) {
    if (value == true || value == 1 || value == '1') return true;
    return value?.toString().toLowerCase() == 'true';
  }

  List<Map<String, dynamic>> _dedupeReviews(List<Map<String, dynamic>> list) {
    final seen = <String>{};
    final out = <Map<String, dynamic>>[];
    for (final r in list) {
      final id =
          (r['id'] ?? r['review_id'] ?? '${r['user_id']}_${r['created_at']}')
              .toString();
      if (seen.contains(id)) continue;
      seen.add(id);
      out.add(r);
    }
    return out;
  }

  bool _isDraftStory() {
    final s = (_book.statusText).toLowerCase().trim();
    return s == 'draft' || s.contains('draft');
  }

  Future<void> _openReadingListPicker() async {
    if (_isOwner) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('You cannot save your own story')),
        );
      }
      return;
    }
    try {
      var lists = await widget.apiService.fetchReadingLists();
      if (!mounted) return;
      final choice = await showModalBottomSheet<Map<String, dynamic>>(
        context: context,
        isScrollControlled: true,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
        ),
        builder: (ctx) {
          return SafeArea(
            child: ListView(
              shrinkWrap: true,
              children: [
                const ListTile(
                  title: Text(
                    'Save to reading list',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
                ListTile(
                  leading: const Icon(Icons.add),
                  title: const Text('Create new list'),
                  onTap: () =>
                      Navigator.pop(ctx, <String, dynamic>{'_create': true}),
                ),
                if (lists.isEmpty)
                  const Padding(
                    padding: EdgeInsets.all(16),
                    child: Text('No lists yet — create one above.'),
                  ),
                ...lists.map((list) {
                  final name = list['name'] as String? ?? 'List';
                  return ListTile(
                    leading: const Icon(Icons.playlist_add_check),
                    title: Text(name),
                    onTap: () => Navigator.pop(ctx, list),
                  );
                }),
              ],
            ),
          );
        },
      );
      if (choice == null) return;

      if (choice['_create'] == true) {
        final nameCtrl = TextEditingController();
        final name = await showDialog<String>(
          context: context,
          builder: (dCtx) => AlertDialog(
            title: const Text('Create reading list'),
            content: TextField(
              controller: nameCtrl,
              autofocus: true,
              decoration: const InputDecoration(hintText: 'List name'),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dCtx),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(dCtx, nameCtrl.text.trim()),
                child: const Text('Create'),
              ),
            ],
          ),
        );
        if (name == null || name.isEmpty) return;
        final created = await widget.apiService.createReadingList({
          'name': name,
          'story_count': 0,
          'cover_path': '',
          'sort_order': lists.length + 1,
        });
        var newId = (created['id'] as num?)?.toInt() ?? 0;
        if (newId == 0) {
          lists = await widget.apiService.fetchReadingLists();
          for (final l in lists) {
            if ((l['name'] as String?) == name) {
              newId = (l['id'] as num?)?.toInt() ?? 0;
              break;
            }
          }
        }
        if (newId != 0) {
          await widget.apiService.addReadingListItem(newId, _book.id);
        }
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              newId != 0
                  ? 'Created "$name" and saved this story'
                  : 'Created "$name". Open Library to confirm.',
            ),
          ),
        );
        if (mounted) setState(() => _saved = true);
        return;
      }

      final listId = (choice['id'] as num?)?.toInt() ?? 0;
      if (listId == 0) return;
      await widget.apiService.addReadingListItem(listId, _book.id);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Saved to ${choice['name'] ?? 'reading list'}')),
      );
      if (mounted) setState(() => _saved = true);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            e.toString().contains('401') || e.toString().contains('403')
                ? 'Please sign in to use reading lists'
                : 'Could not save to reading list',
          ),
        ),
      );
    }
  }

  Future<void> _shareBook() async {
    final link = 'https://wingsaga.com/stories/${_book.id}';
    await Share.share(
      '${_book.title} by ${_book.author}\n$link',
      subject: _book.title,
    );
    try {
      await widget.apiService.recordBookShare(_book.id);
    } catch (error) {
      debugPrint('Could not record story share: $error');
    }
  }

  Future<void> _trackReadingInLibrary({bool completed = false}) async {
    try {
      await widget.apiService.addLibraryEntry({
        'book_id': _book.id,
        'reading_status': completed ? 'Completed' : 'Reading',
        'updated_text': completed ? 'Finished' : 'Reading',
        'chapters': _chapters.length,
        'primary_genre': _book.genre,
        'secondary_genre': '',
        'sort_order': 0,
      });
    } catch (_) {
      // ignore if not signed in
    }
  }

  void _openChapter(Map<String, dynamic> chapter, {int? index}) {
    final chapterNumber = (chapter['chapter_number'] as num?)?.toInt() ?? 1;
    final chapterTitle = _chapterDisplayTitle(
      chapter['title'] as String? ?? '',
      chapterNumber,
    );
    final chapterContent = chapter['content'] as String? ?? '';
    final idx =
        index ??
        _chapters.indexWhere(
          (c) =>
              identical(c, chapter) ||
              ((c['chapter_number'] as num?)?.toInt() == chapterNumber &&
                  (c['title'] as String?) == chapterTitle),
        );
    // Always track as Ongoing when a chapter is opened
    unawaited(_trackReadingInLibrary(completed: false));
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ChapterReaderScreen(
          apiService: widget.apiService,
          title: _book.title,
          author: _book.author,
          coverPath: _book.coverPath,
          chapterNumber: chapterNumber,
          chapterTitle: chapterTitle,
          chapterContent: chapterContent,
          bookId: _book.id,
          tags: _tags,
          authorUserId: _book.authorUserId,
          authorPhotoUrl: _authorPhotoUrl,
          chapters: _chapters,
          initialChapterIndex: idx < 0 ? 0 : idx,
          isOwnerBook:
              _currentUserId != null &&
              _book.authorUserId != null &&
              _currentUserId == _book.authorUserId,
        ),
      ),
    );
  }

  Future<void> _readNow() async {
    if (_isDraftStory() && !_isOwner) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'This story is still a draft and not available to read yet.',
          ),
        ),
      );
      return;
    }
    if (_chapters.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No chapters available yet')),
      );
      return;
    }
    await _trackReadingInLibrary(completed: false);
    if (!mounted) return;
    _openChapter(_chapters.first);
  }

  Future<void> _openTag(String tag) async {
    if (!mounted) return;
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) =>
            HashtagDetailScreen(tag: tag, apiService: widget.apiService),
      ),
    );
  }

  Widget _statCell(String label, String value) {
    // IMPORTANT: do not return Expanded here — callers may wrap in GestureDetector.
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          value,
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final bg = isDark ? const Color(0xFF0D1914) : AppTheme.bgOf(context);
    final fg = isDark ? Colors.white : AppTheme.inkOf(context);
    final muted = isDark ? Colors.white70 : Colors.black54;
    const inkittGreen = AppTheme.brand;

    final coverUrl = _book.coverPath.trim().isEmpty
        ? null
        : widget.apiService.resolveAssetUrl(_book.coverPath);
    final summary = _book.description.trim().isEmpty
        ? 'No summary available.'
        : _book.description.trim();
    final needsExpand = summary.length > 180;
    final authorName = _book.author.trim().isEmpty
        ? 'Author'
        : _book.author.trim();

    return Scaffold(
      backgroundColor: bg,
      body: RefreshIndicator(
        color: inkittGreen,
        onRefresh: () async {
          await _bootstrap();
        },
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            // App bar
            SliverAppBar(
              pinned: true,
              backgroundColor: bg,
              foregroundColor: fg,
              elevation: 0,
              leading: IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: () {
                  // Always return to home (Discover) shell
                  Navigator.of(context).popUntil((route) => route.isFirst);
                },
              ),
              actions: [
                IconButton(
                  icon: const Icon(Icons.ios_share_outlined),
                  tooltip: 'Share story',
                  onPressed: _shareBook,
                ),
                IconButton(
                  icon: const Icon(Icons.more_vert),
                  onPressed: () async {
                    final action = await showMenu<String>(
                      context: context,
                      position: const RelativeRect.fromLTRB(1000, 80, 16, 0),
                      items: const [
                        PopupMenuItem(
                          value: 'list',
                          child: Text('Save to reading list'),
                        ),
                        PopupMenuItem(
                          value: 'review',
                          child: Text('Write a review'),
                        ),
                        PopupMenuItem(
                          value: 'report',
                          child: Text('Report story'),
                        ),
                      ],
                    );
                    if (!mounted) return;
                    if (action == 'list') {
                      await _openReadingListPicker();
                    } else if (action == 'review') {
                      if (_isOwner || _hasMyReview) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text(
                              _isOwner
                                  ? "Author can't make reviews on their own book"
                                  : 'You already reviewed this story. Delete it to write again.',
                            ),
                          ),
                        );
                      } else {
                        _onWriteReviewPressed();
                      }
                    } else if (action == 'report') {
                      try {
                        await widget.apiService.reportBook(_book.id);
                        if (!mounted) return;
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Report submitted. Thank you.'),
                          ),
                        );
                      } catch (e) {
                        if (!mounted) return;
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('Report failed: $e')),
                        );
                      }
                    }
                  },
                ),
              ],
            ),

            // Cover — fixed size so it never becomes a full-screen gray block
            // title
            SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.fromLTRB(
                  AppBreakpoints.pagePadding(context) + 4,
                  8,
                  AppBreakpoints.pagePadding(context) + 4,
                  0,
                ),
                child: Column(
                  children: [
                    Builder(
                      builder: (context) {
                        final coverW = AppBreakpoints.isTablet(context)
                            ? 200.0
                            : (AppBreakpoints.isLargePhone(context)
                                  ? 180.0
                                  : 160.0);
                        final coverH = coverW * 1.4375;
                        return ClipRRect(
                          borderRadius: BorderRadius.circular(16),
                          child: SizedBox(
                            width: coverW,
                            height: coverH,
                            child: coverUrl == null
                                ? ColoredBox(
                                    color: Colors.grey.shade300,
                                    child: const Icon(
                                      Icons.menu_book,
                                      size: 48,
                                    ),
                                  )
                                : Image.network(
                                    coverUrl,
                                    width: coverW,
                                    height: coverH,
                                    fit: BoxFit.cover,
                                    loadingBuilder: (context, child, progress) {
                                      if (progress == null) return child;
                                      return ColoredBox(
                                        color: Colors.grey.shade200,
                                        child: const Center(
                                          child: SizedBox(
                                            width: 28,
                                            height: 28,
                                            child: CircularProgressIndicator(
                                              strokeWidth: 2,
                                            ),
                                          ),
                                        ),
                                      );
                                    },
                                    errorBuilder: (_, _, _) => ColoredBox(
                                      color: Colors.grey.shade300,
                                      child: const Icon(
                                        Icons.broken_image,
                                        size: 40,
                                      ),
                                    ),
                                  ),
                          ),
                        );
                      },
                    ),
                    const SizedBox(height: 16),
                    Text(
                      _book.title,
                      textAlign: TextAlign.center,
                      style: theme.textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w800,
                        height: 1.25,
                        color: fg,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'by $authorName',
                      style: theme.textTheme.bodyMedium?.copyWith(color: muted),
                    ),
                  ],
                ),
              ),
            ),

            // Stats — match product screenshots: Chapters / Last Updated / Reviews
            const SliverToBoxAdapter(child: SizedBox(height: 18)),
            SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.symmetric(
                  horizontal: AppBreakpoints.pagePadding(context),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: _statCell(
                        'Chapters',
                        _loadingChapters ? '…' : '${_chapters.length}',
                      ),
                    ),
                    Expanded(
                      child: _statCell('Last Updated', _formatLastUpdated()),
                    ),
                    Expanded(
                      child: GestureDetector(
                        onTap: _openReviewsPage,
                        child: _statCell(
                          'Reviews',
                          _loadingReviews ? '…' : '${_reviews.length}',
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // Summary
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 22, 20, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Summary',
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: fg,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      summary,
                      maxLines: _summaryExpanded || !needsExpand ? null : 5,
                      overflow: _summaryExpanded || !needsExpand
                          ? TextOverflow.visible
                          : TextOverflow.ellipsis,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        height: 1.45,
                        color: isDark
                            ? Colors.white70
                            : const Color(0xFF444444),
                      ),
                    ),
                    if (needsExpand)
                      TextButton(
                        onPressed: () => setState(
                          () => _summaryExpanded = !_summaryExpanded,
                        ),
                        style: TextButton.styleFrom(
                          foregroundColor: inkittGreen,
                          padding: EdgeInsets.zero,
                        ),
                        child: Text(
                          _summaryExpanded ? 'Show less' : 'Read More',
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                      ),
                  ],
                ),
              ),
            ),

            // Like / Save / Reviews
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                child: Row(
                  children: [
                    Expanded(
                      child: TextButton.icon(
                        onPressed: (_likeBusy || _isOwner) ? null : _toggleLike,
                        icon: Icon(
                          _liked ? Icons.favorite : Icons.favorite_border,
                          color: _isOwner
                              ? Colors.grey
                              : (_liked
                                    ? const Color(
                                        0xFFFF4757,
                                      ) // solid red/pink when liked
                                    : fg),
                        ),
                        label: Text(
                          '$_likesCount',
                          style: TextStyle(
                            color: fg,
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ),
                    Expanded(
                      child: TextButton.icon(
                        onPressed: _isOwner ? null : _openReadingListPicker,
                        icon: Icon(
                          _saved ? Icons.bookmark : Icons.bookmark_border,
                          color: _isOwner
                              ? Colors.grey
                              : (_saved
                                    ? const Color(
                                        0xFF16856A,
                                      ) // primary purple when saved
                                    : fg),
                        ),
                        label: const FittedBox(
                          fit: BoxFit.scaleDown,
                          child: Text(
                            'Save',
                            maxLines: 1,
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ),
                    ),
                    Expanded(
                      child: TextButton.icon(
                        onPressed: _openReviewsPage,
                        style: TextButton.styleFrom(
                          padding: const EdgeInsets.symmetric(horizontal: 4),
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        ),
                        icon: Icon(
                          _hasMyReview ? Icons.star : Icons.star_border,
                          // Gold/yellow so users instantly recognize Reviews/Rating
                          color: const Color(0xFFF4CC2F),
                          size: 20,
                        ),
                        label: FittedBox(
                          fit: BoxFit.scaleDown,
                          child: Text(
                            'Reviews ($_reviewCount)',
                            maxLines: 1,
                            style: TextStyle(
                              color: fg,
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // Genre
            if (_book.genre.trim().isNotEmpty)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 4),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Genres',
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 16,
                          color: fg,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        children: [
                          for (final g in _book.genre.split(RegExp(r'[,/|]')))
                            if (g.trim().isNotEmpty)
                              ActionChip(
                                label: Text(g.trim()),
                                backgroundColor: AppTheme.fieldOf(context),
                                side: BorderSide.none,
                                onPressed: () {
                                  Navigator.of(context).push(
                                    MaterialPageRoute<void>(
                                      builder: (_) => GenreBooksScreen(
                                        genre: g.trim(),
                                        books: const [],
                                        apiService: widget.apiService,
                                      ),
                                    ),
                                  );
                                },
                              ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),

            // Tags
            if (_tags.isNotEmpty)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 4),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Tags',
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 16,
                          color: fg,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 6,
                        children: [
                          for (final t in _tags)
                            ActionChip(
                              label: Text(
                                t.startsWith('#') ? t.substring(1) : t,
                                style: const TextStyle(
                                  color: AppTheme.brand,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              onPressed: () => _openTag(t),
                              backgroundColor: const Color(0xFFF6F5FA),
                              side: BorderSide.none,
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),

            // Author row
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Author',
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 16,
                        color: fg,
                      ),
                    ),
                    const SizedBox(height: 10),
                    InkWell(
                      onTap: (_book.authorUserId ?? 0) > 0
                          ? _openAuthorProfile
                          : null,
                      borderRadius: BorderRadius.circular(12),
                      child: Row(
                        children: [
                          CircleAvatar(
                            radius: 22,
                            backgroundColor: Colors.grey.shade300,
                            backgroundImage:
                                (_authorPhotoUrl != null &&
                                    _authorPhotoUrl!.isNotEmpty)
                                ? NetworkImage(
                                    widget.apiService.resolveAssetUrl(
                                      _authorPhotoUrl!,
                                    ),
                                  )
                                : null,
                            child:
                                (_authorPhotoUrl == null ||
                                    _authorPhotoUrl!.isEmpty)
                                ? Text(
                                    authorName.isNotEmpty
                                        ? authorName[0].toUpperCase()
                                        : 'A',
                                  )
                                : null,
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              authorName,
                              style: TextStyle(
                                fontWeight: FontWeight.w600,
                                fontSize: 15,
                                color: fg,
                              ),
                            ),
                          ),
                          if (!_isOwner && (_book.authorUserId ?? 0) > 0)
                            TextButton(
                              onPressed: _loadingFollow ? null : _toggleFollow,
                              style: TextButton.styleFrom(
                                backgroundColor: inkittGreen,
                                foregroundColor: Colors.white,
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 18,
                                  vertical: 8,
                                ),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(20),
                                ),
                              ),
                              child: Text(
                                _isFollowing ? 'Following' : 'Follow',
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // Chapters
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
                child: Text(
                  'Chapters',
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                    color: fg,
                  ),
                ),
              ),
            ),
            if (_loadingChapters)
              const SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: Center(child: CircularProgressIndicator()),
                ),
              )
            else if (_chapters.isEmpty)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: _chapterLoadError == null
                      ? Text(
                          'No chapters published yet.',
                          style: TextStyle(color: muted),
                        )
                      : Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _chapterLoadError!,
                              style: TextStyle(color: muted),
                            ),
                            const SizedBox(height: 8),
                            TextButton.icon(
                              onPressed: _retryLoadChapters,
                              icon: const Icon(Icons.refresh_rounded),
                              label: const Text('Try again'),
                            ),
                          ],
                        ),
                ),
              )
            else
              // ignore: prefer_const_constructors - dynamic list
              SliverList(
                delegate: SliverChildBuilderDelegate((context, index) {
                  final chapter = _chapters[index];
                  final rawTitle = (chapter['title'] as String? ?? '').trim();
                  final number =
                      (chapter['chapter_number'] as num?)?.toInt() ?? index + 1;
                  final label = _chapterDisplayTitle(rawTitle, number);
                  return Material(
                    color: Colors.transparent,
                    child: ListTile(
                      title: Text(
                        label,
                        style: TextStyle(
                          color: inkittGreen,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      onTap: () => _openChapter(chapter, index: index),
                    ),
                  );
                }, childCount: _chapters.length),
              ),

            // More stories by this author
            if (_authorStories.isNotEmpty)
              SliverToBoxAdapter(
                child: _HorizontalBookRail(
                  title: 'More stories by author',
                  books: _authorStories,
                  apiService: widget.apiService,
                ),
              ),

            if (_youMayAlsoLike.isNotEmpty)
              SliverToBoxAdapter(
                child: _HorizontalBookRail(
                  title: 'You May Also Like',
                  books: _youMayAlsoLike,
                  apiService: widget.apiService,
                ),
              ),
            if (_youMayAlsoLike.length > 6)
              SliverToBoxAdapter(
                child: _HorizontalBookRail(
                  title: 'Recommended for You',
                  books: _youMayAlsoLike.skip(6).take(6).toList(),
                  apiService: widget.apiService,
                ),
              ),
            const SliverToBoxAdapter(child: SizedBox(height: 100)),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        top: false,
        minimum: const EdgeInsets.only(bottom: 8),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
          child: Container(
            width: double.infinity,
            height: 54,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              gradient: const LinearGradient(
                colors: [AppTheme.brand, AppTheme.brandDeep],
              ),
              boxShadow: [
                BoxShadow(
                  color: AppTheme.brand.withValues(alpha: 0.42),
                  blurRadius: 20,
                  offset: const Offset(0, 10),
                ),
              ],
            ),
            child: Material(
              color: Colors.transparent,
              child: InkWell(
                borderRadius: BorderRadius.circular(16),
                onTap: _readNow,
                child: const Center(
                  child: Text(
                    'Read Now',
                    maxLines: 1,
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                      fontSize: 16,
                      letterSpacing: 0.2,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _TagBooksScreen extends StatelessWidget {
  const _TagBooksScreen({
    required this.tag,
    required this.books,
    required this.apiService,
  });

  final String tag;
  final List<Map<String, dynamic>> books;
  final ApiService apiService;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(tag.startsWith('#') ? tag : '#$tag')),
      body: books.isEmpty
          ? const Center(child: Text('No stories with this tag yet.'))
          : ListView.separated(
              padding: const EdgeInsets.all(12),
              itemCount: books.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (context, index) {
                final b = books[index];
                final title = b['title'] as String? ?? 'Untitled';
                final author = b['author'] as String? ?? '';
                final cover = b['cover_path'] as String? ?? '';
                return ListTile(
                  leading: cover.isEmpty
                      ? const Icon(Icons.menu_book)
                      : Image.network(
                          apiService.resolveAssetUrl(cover),
                          width: 40,
                          height: 56,
                          fit: BoxFit.cover,
                          errorBuilder: (_, _, _) =>
                              const Icon(Icons.broken_image),
                        ),
                  title: Text(title),
                  subtitle: Text(author),
                  onTap: () {
                    Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => StoryDetailScreen(
                          apiService: apiService,
                          book: BookDetailModel.fromMap(b),
                        ),
                      ),
                    );
                  },
                );
              },
            ),
    );
  }
}

class _BookReviewsPage extends StatefulWidget {
  const _BookReviewsPage({
    required this.book,
    required this.apiService,
    required this.isOwner,
    required this.hasMyReview,
    required this.onHasMyReviewChanged,
  });

  final BookDetailModel book;
  final ApiService apiService;
  final bool isOwner;
  final bool hasMyReview;
  final Future<void> Function(bool hasMine) onHasMyReviewChanged;

  @override
  State<_BookReviewsPage> createState() => _BookReviewsPageState();
}

class _BookReviewsPageState extends State<_BookReviewsPage> {
  List<Map<String, dynamic>> _reviews = const [];
  bool _loading = true;
  int? _myUserId;
  late bool _hasMyReview;

  bool _asTruthyLocal(dynamic value) {
    if (value == true || value == 1 || value == '1') return true;
    return value?.toString().toLowerCase() == 'true';
  }

  bool _computeHasMine(List<Map<String, dynamic>> list, int? viewerId) {
    return list.any(
      (r) =>
          _asTruthyLocal(r['is_mine'] ?? r['mine']) ||
          (viewerId != null && (r['user_id'] as num?)?.toInt() == viewerId),
    );
  }

  @override
  void initState() {
    super.initState();
    _hasMyReview = widget.hasMyReview;
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      try {
        final me = await widget.apiService.fetchMe();
        _myUserId =
            (me['id'] as num?)?.toInt() ?? (me['user_id'] as num?)?.toInt();
      } catch (_) {}
      final list = await widget.apiService.fetchBookReviews(widget.book.id);
      if (mounted) {
        final mine = _computeHasMine(list, _myUserId);
        setState(() {
          _reviews = list;
          _hasMyReview = mine;
          _loading = false;
        });
        await widget.onHasMyReviewChanged(mine);
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _deleteMine() async {
    try {
      await widget.apiService.deleteMyBookReview(widget.book.id);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Review deleted. You can write again.')),
      );
      await _load(); // recomputes _hasMyReview = false and notifies parent
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Could not delete: $e')));
      }
    }
  }

  Future<void> _editMine(Map<String, dynamic> review) async {
    final ok = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (_) => _WriteReviewScreen(
          apiService: widget.apiService,
          bookId: widget.book.id,
          existing: review,
        ),
      ),
    );
    if (ok == true) {
      await _load();
      await widget.onHasMyReviewChanged(true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 100),
                children: [
                  Text(
                    '${_reviews.length} reviews for',
                    style: TextStyle(color: Colors.grey.shade600, fontSize: 14),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    widget.book.title,
                    style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      height: 1.25,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'By ${widget.book.author}',
                    style: const TextStyle(
                      color: AppTheme.brand,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 16),
                  if (widget.isOwner)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Text(
                        "Authors can't write reviews on their own books. You can still read reviews below.",
                        style: TextStyle(
                          color: Colors.grey.shade600,
                          fontSize: 13,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    )
                  else if (!widget.isOwner)
                    Center(
                      child: FilledButton(
                        style: FilledButton.styleFrom(
                          backgroundColor: AppTheme.brand,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 28,
                            vertical: 12,
                          ),
                        ),
                        onPressed: _hasMyReview
                            ? null
                            : () async {
                                final posted = await Navigator.of(context).push(
                                  MaterialPageRoute<bool>(
                                    builder: (_) => _WriteReviewScreen(
                                      bookId: widget.book.id,
                                      apiService: widget.apiService,
                                    ),
                                  ),
                                );

                                if (posted == true && mounted) {
                                  await _load();
                                  await widget.onHasMyReviewChanged(true);
                                  if (mounted) {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      const SnackBar(
                                        content: Text('Review added'),
                                      ),
                                    );
                                  }
                                }
                              },
                        child: Text(
                          _hasMyReview
                              ? 'You already reviewed'
                              : 'Write a Review',
                        ),
                      ),
                    ),
                  const SizedBox(height: 24),
                  if (_reviews.isEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 40),
                      child: Center(
                        child: Text(
                          'No reviews yet. Be the first!',
                          style: TextStyle(color: Colors.grey.shade600),
                        ),
                      ),
                    )
                  else
                    for (final r in _reviews) _reviewCard(r),
                ],
              ),
            ),
      bottomNavigationBar: const SafeArea(child: SizedBox.shrink()),
    );
  }

  Widget _reviewCard(Map<String, dynamic> r) {
    final name =
        (r['user_name'] ?? r['display_name'] ?? r['username'] ?? 'Reader')
            .toString();
    final body =
        (r['comment'] ??
                r['body'] ??
                r['review'] ??
                r['review_text'] ??
                r['text'] ??
                '')
            .toString()
            .trim();
    final title = (r['title'] ?? '').toString();
    final rating = (r['rating'] as num?)?.toDouble() ?? 0;
    final plotRating = (r['plot_rating'] ?? r['plot_score'] ?? rating) is num
        ? ((r['plot_rating'] ?? r['plot_score'] ?? rating) as num).toDouble()
        : rating;
    final styleRating =
        (r['style_rating'] ?? r['writing_score'] ?? rating) is num
        ? ((r['style_rating'] ?? r['writing_score'] ?? rating) as num)
              .toDouble()
        : rating;
    final techRating = (r['tech_rating'] ?? r['grammar_score'] ?? rating) is num
        ? ((r['tech_rating'] ?? r['grammar_score'] ?? rating) as num).toDouble()
        : rating;
    final created = (r['created_at'] ?? '').toString();
    final chaptersRead = r['chapters_read'];
    final reviewUserId = (r['user_id'] as num?)?.toInt();
    final isMine =
        _myUserId != null && reviewUserId != null && _myUserId == reviewUserId;

    Widget stars(double v) {
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: List.generate(5, (i) {
          return Icon(
            i < v.round() ? Icons.star : Icons.star_border,
            size: 16,
            color: const Color(0xFFF4CC2F),
          );
        }),
      );
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 18,
                backgroundColor: Colors.grey.shade300,
                child: Text(
                  name.isNotEmpty ? name[0].toUpperCase() : '?',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    if (chaptersRead != null)
                      Text(
                        '$chaptersRead chapters read',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey.shade600,
                        ),
                      ),
                  ],
                ),
              ),
              Text(
                created.length >= 10 ? created.substring(0, 10) : created,
                style: TextStyle(fontSize: 12, color: Colors.grey.shade500),
              ),
            ],
          ),
          if (title.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              title,
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
            ),
          ],
          if (body.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              '"$body"',
              style: TextStyle(
                color: Colors.grey.shade800,
                height: 1.4,
                fontSize: 13, // match Save / action row text size
              ),
            ),
          ],
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Overall Rating',
                      style: TextStyle(fontSize: 12),
                    ),
                    stars(rating),
                  ],
                ),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Plot', style: TextStyle(fontSize: 12)),
                    stars(plotRating),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Writing Style', style: TextStyle(fontSize: 12)),
                    stars(styleRating),
                  ],
                ),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Grammar & Punctuation',
                      style: TextStyle(fontSize: 12),
                    ),
                    stars(techRating),
                  ],
                ),
              ),
            ],
          ),
          if (isMine) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                TextButton.icon(
                  onPressed: () => _editMine(r),
                  icon: const Icon(Icons.edit_outlined, size: 18),
                  label: const Text('Edit'),
                ),
                TextButton.icon(
                  onPressed: () async {
                    final ok = await showDialog<bool>(
                      context: context,
                      builder: (ctx) => AlertDialog(
                        title: const Text('Delete review?'),
                        content: const Text('This cannot be undone.'),
                        actions: [
                          TextButton(
                            onPressed: () => Navigator.pop(ctx, false),
                            child: const Text('Cancel'),
                          ),
                          FilledButton(
                            onPressed: () => Navigator.pop(ctx, true),
                            child: const Text('Delete'),
                          ),
                        ],
                      ),
                    );
                    if (ok == true) await _deleteMine();
                  },
                  icon: const Icon(Icons.delete_outline, size: 18),
                  label: const Text('Delete'),
                ),
              ],
            ),
          ] else ...[
            const SizedBox(height: 8),
            Text(
              'Was this review helpful to you?',
              style: TextStyle(fontSize: 13, color: Colors.grey.shade700),
            ),
            const SizedBox(height: 4),
            Row(
              children: [
                TextButton(onPressed: () {}, child: const Text('Yes')),
                TextButton(onPressed: () {}, child: const Text('No')),
              ],
            ),
          ],
          const Divider(height: 1),
        ],
      ),
    );
  }
}

class _WriteReviewScreen extends StatefulWidget {
  const _WriteReviewScreen({
    required this.bookId,
    required this.apiService,
    this.existing,
  });

  final int bookId;
  final ApiService apiService;
  final Map<String, dynamic>? existing;

  @override
  State<_WriteReviewScreen> createState() => _WriteReviewScreenState();
}

class _WriteReviewScreenState extends State<_WriteReviewScreen> {
  final _titleCtrl = TextEditingController();
  final _bodyCtrl = TextEditingController();
  int _overall = 0;
  int _plot = 0;
  int _style = 0;
  int _tech = 0;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final e = widget.existing;
    if (e != null) {
      _overall = (e['rating'] as num?)?.toInt() ?? 0;
      _plot = (e['plot_rating'] as num?)?.toInt() ?? _overall;
      _style = (e['style_rating'] as num?)?.toInt() ?? _overall;
      _tech = (e['tech_rating'] as num?)?.toInt() ?? _overall;
      final comment = (e['comment'] ?? e['body'] ?? '').toString();
      final title = (e['title'] ?? '').toString();
      if (title.isNotEmpty) {
        _titleCtrl.text = title;
        _bodyCtrl.text = comment;
      } else {
        _bodyCtrl.text = comment;
      }
    }
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _bodyCtrl.dispose();
    super.dispose();
  }

  Widget _starRow(String label, int value, ValueChanged<int> onChanged) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500),
          ),
          const SizedBox(height: 6),
          Row(
            children: List.generate(5, (i) {
              final star = i + 1;
              return GestureDetector(
                onTap: () => onChanged(star),
                child: Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: Icon(
                    star <= value
                        ? Icons.star_rounded
                        : Icons.star_outline_rounded,
                    size: 34,
                    color: star <= value
                        ? const Color(0xFFF4CC2F)
                        : const Color(0xFFCCCCCC),
                  ),
                ),
              );
            }),
          ),
        ],
      ),
    );
  }

  Future<void> _submit() async {
    if (_overall < 1) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Please rate this novel')));
      return;
    }
    final body = _bodyCtrl.text.trim();
    // Any length allowed (including short) — rating is the only required field
    setState(() => _saving = true);
    try {
      final payload = {
        'rating': _overall,
        'title': _titleCtrl.text.trim(),
        'comment': body,
        'plot_rating': _plot > 0 ? _plot : _overall,
        'style_rating': _style > 0 ? _style : _overall,
        'tech_rating': _tech > 0 ? _tech : _overall,
      };
      if (widget.existing != null) {
        await widget.apiService.updateMyBookReview(widget.bookId, payload);
      } else {
        await widget.apiService.createBookReview(widget.bookId, payload);
      }
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      try {
        final reviews = await widget.apiService.fetchBookReviews(widget.bookId);
        final me = await widget.apiService.fetchMe();
        final userId =
            (me['id'] as num?)?.toInt() ?? (me['user_id'] as num?)?.toInt();
        final saved = reviews.any(
          (review) =>
              userId != null &&
              ((review['user_id'] as num?)?.toInt() == userId),
        );
        if (saved && mounted) {
          Navigator.of(context).pop(true);
          return;
        }
      } catch (_) {}
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Failed to post review: $e')));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        elevation: 0,
        foregroundColor: Colors.black87,
        title: Text(widget.existing != null ? 'Edit Review' : 'Write Review'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
          children: [
            Text(
              'Remember, we write reviews in order to help others find good novels. Keep this in mind when writing your review. Describe what you found special about this novel, and why you think someone else should read it.',
              style: TextStyle(
                fontSize: 13.5,
                height: 1.4,
                color: Colors.grey.shade600,
              ),
            ),
            const SizedBox(height: 20),
            _starRow(
              'How do you rate this novel so far?',
              _overall,
              (v) => setState(() => _overall = v),
            ),
            _starRow(
              'How do you rate the plot of this novel?',
              _plot,
              (v) => setState(() => _plot = v),
            ),
            _starRow(
              "How do you rate the author's writing style?",
              _style,
              (v) => setState(() => _style = v),
            ),
            _starRow(
              "How do you rate the author's technical writing skills?\n(Punctuation, Grammar etc.)",
              _tech,
              (v) => setState(() => _tech = v),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _bodyCtrl,
              maxLines: 6,
              style: const TextStyle(fontSize: 15, height: 1.4),
              decoration: InputDecoration(
                hintText:
                    'Write your review...\nWhat did you like? Who should read this?',
                hintStyle: TextStyle(
                  color: Colors.grey.shade500,
                  fontSize: 14,
                  height: 1.4,
                ),
                alignLabelWithHint: true,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                contentPadding: const EdgeInsets.all(14),
              ),
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              height: 50,
              child: FilledButton(
                onPressed: _saving ? null : _submit,
                style: FilledButton.styleFrom(
                  backgroundColor: AppTheme.brand,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(28),
                  ),
                ),
                child: _saving
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text(
                        'Post',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _HorizontalBookRail extends StatelessWidget {
  const _HorizontalBookRail({
    required this.title,
    required this.books,
    required this.apiService,
  });

  final String title;
  final List<Map<String, dynamic>> books;
  final ApiService apiService;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final fg = AppTheme.inkOf(context);
    final pad = AppBreakpoints.pagePadding(context);
    final cardW = AppBreakpoints.storyCardWidth(context);
    final coverH = cardW * 1.36;
    return Padding(
      padding: const EdgeInsets.only(top: 20, bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: EdgeInsets.symmetric(horizontal: pad),
            child: Text(
              title,
              style: TextStyle(
                fontWeight: FontWeight.w800,
                fontSize: 17,
                color: fg,
              ),
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: coverH + 50,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: EdgeInsets.symmetric(horizontal: pad),
              itemCount: books.length,
              separatorBuilder: (_, _) => const SizedBox(width: 12),
              itemBuilder: (context, i) {
                final b = books[i];
                final id = (b['id'] as num?)?.toInt() ?? 0;
                final title = (b['title'] ?? 'Story').toString();
                final author = (b['author'] ?? '').toString();
                final cover = (b['cover_path'] ?? b['cover_url'] ?? '')
                    .toString();
                final url = cover.isNotEmpty
                    ? apiService.resolveAssetUrl(cover)
                    : '';
                return GestureDetector(
                  onTap: () {
                    if (id <= 0) return;
                    Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => StoryDetailScreen(
                          apiService: apiService,
                          book: BookDetailModel(
                            id: id,
                            title: title,
                            author: author,
                            description: (b['description'] ?? '').toString(),
                            statusText: (b['status_text'] ?? '').toString(),
                            rating: (b['rating'] as num?)?.toDouble() ?? 0,
                            genre: (b['genre'] ?? b['primary_genre'] ?? '')
                                .toString(),
                            cta: 'Read now',
                            coverPath: cover,
                            authorUserId:
                                (b['author_user_id'] as num?)?.toInt() ??
                                (b['user_id'] as num?)?.toInt(),
                          ),
                        ),
                      ),
                    );
                  },
                  child: SizedBox(
                    width: cardW,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: url.isNotEmpty
                              ? Image.network(
                                  url,
                                  width: cardW,
                                  height: coverH,
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, _, _) => Container(
                                    width: cardW,
                                    height: coverH,
                                    color: const Color(0xFFF6F5FA),
                                  ),
                                )
                              : Container(
                                  width: cardW,
                                  height: coverH,
                                  color: const Color(0xFFF6F5FA),
                                ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: fg,
                          ),
                        ),
                      ],
                    ),
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
