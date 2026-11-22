import 'package:flutter/material.dart';

import '../../data/models/app_bootstrap.dart';
import '../../data/services/api_service.dart';
import 'story_detail_screen.dart';

class GenreBooksScreen extends StatefulWidget {
  const GenreBooksScreen({
    super.key,
    required this.genre,
    required this.books,
    required this.apiService,
    this.onExploreMore,
  });

  final String genre;
  final List<Map<String, dynamic>> books;
  final ApiService apiService;
  final VoidCallback? onExploreMore;

  @override
  State<GenreBooksScreen> createState() => _GenreBooksScreenState();
}

class _GenreBooksScreenState extends State<GenreBooksScreen> {
  late List<Map<String, dynamic>> _books;
  List<Map<String, dynamic>> _sourceBooks = const [];
  bool _loading = false;
  String _sort = 'Popular';
  String _period = 'All time';

  static const _sortOptions = [
    'Popular',
    'Completed',
    'Unexplored',
    'Recently Updated',
  ];
  static const _periodOptions = ['All time', 'Last 30 days'];

  @override
  void initState() {
    super.initState();
    _books = List<Map<String, dynamic>>.from(widget.books);
    _loadFromApi();
  }

  Future<void> _loadFromApi() async {
    setState(() => _loading = true);
    try {
      final remote = await widget.apiService.searchStories(
        query: '',
        genre: widget.genre,
        minRating: 0,
      );
      if (!mounted) return;
      final base = remote.isNotEmpty
          ? remote
          : List<Map<String, dynamic>>.from(widget.books);
      setState(() {
        _sourceBooks = base;
        _applyFiltersLocal();
        _loading = false;
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          _applyFiltersLocal();
          _loading = false;
        });
      }
    }
  }

  void _applyFiltersLocal() {
    final g = widget.genre.toLowerCase().trim();
    var list = List<Map<String, dynamic>>.from(
      _sourceBooks.isNotEmpty
          ? _sourceBooks
          : (_books.isNotEmpty ? _books : widget.books),
    );
    // Exact genre only (primary or secondary)
    list = list.where((b) {
      final pg = (b['primary_genre'] ?? b['genre'] ?? '')
          .toString()
          .toLowerCase()
          .trim();
      final sg = (b['secondary_genre'] ?? '').toString().toLowerCase().trim();
      if (g.isEmpty) return true;
      return pg == g || sg == g;
    }).toList();

    if (_period == 'Last 30 days') {
      final cutoff = DateTime.now().subtract(const Duration(days: 30));
      list = list.where((b) {
        final raw =
            (b['updated_at'] ?? b['created_at'] ?? b['last_updated'] ?? '')
                .toString();
        if (raw.isEmpty) return true; // keep if unknown date
        try {
          final dt = DateTime.parse(raw);
          return dt.isAfter(cutoff);
        } catch (_) {
          return true;
        }
      }).toList();
    }

    if (_sort == 'Completed') {
      list = list.where((b) {
        final st = (b['status_text'] ?? '').toString().toLowerCase();
        final done = b['is_completed'] == true || b['is_completed'] == 1;
        return done || st.contains('complete') || st.contains('published');
      }).toList();
    } else if (_sort == 'Unexplored') {
      list = list.where((b) {
        final st = (b['status_text'] ?? '').toString().toLowerCase();
        final done = b['is_completed'] == true || b['is_completed'] == 1;
        return !done && !st.contains('complete');
      }).toList();
    } else if (_sort == 'Recently Updated') {
      list.sort((a, b) {
        final ar = (a['updated_at'] ?? a['created_at'] ?? '').toString();
        final br = (b['updated_at'] ?? b['created_at'] ?? '').toString();
        return br.compareTo(ar);
      });
    } else {
      // Popular
      list.sort((a, b) {
        final ar = (a['rating'] as num?)?.toDouble() ?? 0;
        final br = (b['rating'] as num?)?.toDouble() ?? 0;
        final al = (a['likes_count'] as num?)?.toInt() ?? 0;
        final bl = (b['likes_count'] as num?)?.toInt() ?? 0;
        final c = br.compareTo(ar);
        return c != 0 ? c : bl.compareTo(al);
      });
    }
    _books = list;
  }

  BookDetailModel _toBook(Map<String, dynamic> m) {
    return BookDetailModel.fromMap({
      'id': m['id'],
      'title': m['title'] ?? '',
      'author': m['author'] ?? '',
      'description': m['description'] ?? '',
      'cover_path': m['cover_path'] ?? '',
      'genre': m['genre'] ?? m['primary_genre'] ?? '',
      'primary_genre': m['primary_genre'] ?? m['genre'] ?? '',
      'secondary_genre': m['secondary_genre'] ?? '',
      'status_text': m['status_text'] ?? '',
      'rating': m['rating'] ?? 0,
      'tags': m['tags'] ?? [],
      'author_user_id': m['author_user_id'] ?? m['user_id'],
      'user_id': m['user_id'] ?? m['author_user_id'],
      'likes_count': m['likes_count'] ?? 0,
      'is_completed': m['is_completed'] ?? false,
    });
  }

  @override
  Widget build(BuildContext context) {
    final genre = widget.genre;
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      backgroundColor: scheme.surface,
      body: NestedScrollView(
        headerSliverBuilder: (context, inner) {
          return [
            SliverAppBar(
              expandedHeight: 180,
              pinned: true,
              backgroundColor: const Color(0xFF0D1914),
              iconTheme: const IconThemeData(color: Colors.white),
              flexibleSpace: FlexibleSpaceBar(
                centerTitle: true,
                title: Text(
                  genre,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 20,
                    shadows: [Shadow(blurRadius: 8, color: Colors.black54)],
                  ),
                ),
                background: Stack(
                  fit: StackFit.expand,
                  children: [
                    // Soft gradient hero (Inkitt-style)
                    Container(
                      decoration: const BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [Color(0xFF17211D), Color(0xFF0D1914)],
                        ),
                      ),
                    ),
                    // Decorative book covers from list if any
                    if (_books.isNotEmpty)
                      Opacity(
                        opacity: 0.35,
                        child: Image.network(
                          widget.apiService.resolveAssetUrl(
                            (_books.first['cover_path'] ?? '').toString(),
                          ),
                          fit: BoxFit.cover,
                          errorBuilder: (_, _, _) => const SizedBox.shrink(),
                        ),
                      ),
                    Container(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [
                            Colors.black.withValues(alpha: 0.15),
                            Colors.black.withValues(alpha: 0.55),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            SliverToBoxAdapter(
              child: Container(
                color: Colors.white,
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
                child: Row(
                  children: [
                    _FilterChipBtn(
                      label: _sort,
                      options: _sortOptions,
                      onSelected: (v) {
                        setState(() {
                          _sort = v;
                          _applyFiltersLocal();
                        });
                      },
                    ),
                    const SizedBox(width: 8),
                    _FilterChipBtn(
                      label: _period,
                      options: _periodOptions,
                      onSelected: (v) {
                        setState(() {
                          _period = v;
                          _applyFiltersLocal();
                        });
                      },
                    ),
                  ],
                ),
              ),
            ),
          ];
        },
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : _books.isEmpty
            ? Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('No stories in this genre yet'),
                    if (widget.onExploreMore != null)
                      TextButton(
                        onPressed: widget.onExploreMore,
                        child: const Text('Explore more'),
                      ),
                  ],
                ),
              )
            : ListView.separated(
                padding: const EdgeInsets.fromLTRB(12, 4, 12, 24),
                itemCount: _books.length,
                separatorBuilder: (_, _) => const Divider(height: 20),
                itemBuilder: (context, index) {
                  final item = _books[index];
                  final title = (item['title'] ?? 'Untitled').toString();
                  final author = (item['author'] ?? '').toString();
                  final desc = (item['description'] ?? '').toString();
                  final cover = (item['cover_path'] ?? '').toString();
                  final rating = (item['rating'] as num?)?.toDouble() ?? 0.0;
                  final genreLabel =
                      (item['primary_genre'] ?? item['genre'] ?? '')
                          .toString()
                          .isEmpty
                      ? widget.genre
                      : (item['primary_genre'] ?? item['genre'] ?? '')
                            .toString();
                  final status = (item['status_text'] ?? '').toString();
                  final completed =
                      item['is_completed'] == true ||
                      item['is_completed'] == 1 ||
                      status.toLowerCase().contains('complete') ||
                      status.toLowerCase().contains('published');
                  final chapters =
                      (item['chapters_count'] as num?)?.toInt() ??
                      (item['chapter_count'] as num?)?.toInt();

                  return InkWell(
                    onTap: () {
                      Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => StoryDetailScreen(
                            book: _toBook(item),
                            apiService: widget.apiService,
                          ),
                        ),
                      );
                    },
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(6),
                          child: SizedBox(
                            width: 78,
                            height: 110,
                            child: cover.isNotEmpty
                                ? Image.network(
                                    widget.apiService.resolveAssetUrl(cover),
                                    fit: BoxFit.cover,
                                    errorBuilder: (_, _, _) => Container(
                                      color: const Color(0xFFE8E8E8),
                                      child: const Icon(
                                        Icons.menu_book_rounded,
                                      ),
                                    ),
                                  )
                                : Container(
                                    color: const Color(0xFFE8E8E8),
                                    child: const Icon(Icons.menu_book_rounded),
                                  ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Expanded(
                                    child: Text(
                                      title,
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w700,
                                        fontSize: 15,
                                        height: 1.25,
                                      ),
                                    ),
                                  ),
                                  const Icon(
                                    Icons.bookmark_border_rounded,
                                    size: 20,
                                    color: Colors.black45,
                                  ),
                                ],
                              ),
                              if (desc.isNotEmpty) ...[
                                const SizedBox(height: 4),
                                Text(
                                  desc,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: 12.5,
                                    color: Color(0xFF666666),
                                    height: 1.35,
                                  ),
                                ),
                              ],
                              const SizedBox(height: 6),
                              Row(
                                children: [
                                  const Icon(
                                    Icons.star_rounded,
                                    size: 16,
                                    color: Color(0xFFF4CC2F),
                                  ),
                                  const SizedBox(width: 2),
                                  Text(
                                    rating > 0
                                        ? rating.toStringAsFixed(1)
                                        : '—',
                                    style: const TextStyle(
                                      fontSize: 12.5,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 8,
                                      vertical: 2,
                                    ),
                                    decoration: BoxDecoration(
                                      border: Border.all(
                                        color: const Color(0xFFDDDDDD),
                                      ),
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                    child: Text(
                                      genreLabel,
                                      style: const TextStyle(
                                        fontSize: 11,
                                        color: Color(0xFF555555),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 4),
                              Row(
                                children: [
                                  if (completed) ...[
                                    const Icon(
                                      Icons.check_circle,
                                      size: 14,
                                      color: Color(0xFF16856A),
                                    ),
                                    const SizedBox(width: 4),
                                    const Text(
                                      'Completed',
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: Color(0xFF16856A),
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ],
                                  if (chapters != null) ...[
                                    Text(
                                      completed
                                          ? ' · $chapters Chapters'
                                          : '$chapters Chapters',
                                      style: const TextStyle(
                                        fontSize: 12,
                                        color: Color(0xFF888888),
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                              if (author.isNotEmpty) ...[
                                const SizedBox(height: 2),
                                Text(
                                  'By $author',
                                  style: const TextStyle(
                                    fontSize: 12,
                                    color: Color(0xFF999999),
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
      ),
    );
  }
}

class _FilterChipBtn extends StatelessWidget {
  const _FilterChipBtn({
    required this.label,
    required this.options,
    required this.onSelected,
  });

  final String label;
  final List<String> options;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<String>(
      onSelected: onSelected,
      itemBuilder: (ctx) => options
          .map((o) => PopupMenuItem<String>(value: o, child: Text(o)))
          .toList(),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          border: Border.all(color: const Color(0xFFE0E0E0)),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
            ),
            const SizedBox(width: 4),
            const Icon(Icons.keyboard_arrow_down_rounded, size: 18),
          ],
        ),
      ),
    );
  }
}
