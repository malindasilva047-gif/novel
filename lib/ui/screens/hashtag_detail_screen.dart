import 'package:flutter/material.dart';
import '../../core/constants/responsive.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/app_bootstrap.dart';
import '../../data/services/api_service.dart';
import 'story_detail_screen.dart';

/// Hashtag / genre hub — UI aligned with Inkitt-style tag pages.
class HashtagDetailScreen extends StatefulWidget {
  const HashtagDetailScreen({
    super.key,
    required this.tag,
    required this.apiService,
  });

  final String tag;
  final ApiService apiService;

  static String resolveTagCover(
    Map<String, dynamic> tagMeta,
    List<Map<String, dynamic>> books,
  ) {
    final direct =
        (tagMeta['cover_path'] ??
                tagMeta['cover_url'] ??
                tagMeta['cover'] ??
                tagMeta['image_url'] ??
                '')
            .toString()
            .trim();
    if (direct.isNotEmpty) return direct;
    for (final book in books) {
      final cover =
          (book['cover_path'] ??
                  book['cover_url'] ??
                  book['cover'] ??
                  book['image_url'] ??
                  '')
              .toString()
              .trim();
      if (cover.isNotEmpty) return cover;
    }
    return '';
  }

  @override
  State<HashtagDetailScreen> createState() => _HashtagDetailScreenState();
}

class _HashtagDetailScreenState extends State<HashtagDetailScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;
  List<Map<String, dynamic>> _books = const [];
  List<Map<String, dynamic>> _related = const [];
  bool _loading = true;
  bool _following = false;
  bool _followBusy = false;
  int _followerCount = 0;
  int _storyCount = 0;
  int _booksRequestId = 0;
  String _tagDescription = '';
  String _tagCoverPath = '';

  String get _tagName {
    final t = widget.tag.trim();
    return t.startsWith('#') ? t.substring(1) : t;
  }

  String get _displayTag => '#$_tagName';

  String _coverPath(Map<String, dynamic> book) {
    return (book['cover_path'] ??
            book['cover_url'] ??
            book['cover'] ??
            book['image_url'] ??
            '')
        .toString()
        .trim();
  }

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 4, vsync: this);
    _tabs.addListener(() {
      if (!_tabs.indexIsChanging) {
        setState(() {});
        _loadBooksForSelectedSort();
      }
    });
    _load();
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final books = await widget.apiService.fetchBooksByTag(
        _tagName,
        sort: _selectedSort,
      );
      final tagList = await widget.apiService.fetchTags();
      final tagMeta = tagList.firstWhere(
        (t) {
          final n = (t['name'] ?? t['tag'] ?? '').toString().trim();
          return n.toLowerCase() == _tagName.toLowerCase();
        },
        orElse: () => <String, dynamic>{
          'name': _tagName,
          'book_count': books.length,
          'description': '',
          'cover_path': '',
          'followers_count': 0,
        },
      );
      final description =
          (tagMeta['description'] ??
                  tagMeta['summary'] ??
                  tagMeta['meta'] ??
                  '')
              .toString()
              .trim();
      final tagCover = HashtagDetailScreen.resolveTagCover(tagMeta, books);
      final tagFollowers = (tagMeta['followers_count'] as num?)?.toInt() ?? 0;
      final tagBooksCount = (tagMeta['book_count'] as num?)?.toInt();
      final related = tagList
          .where((t) {
            final n = (t['name'] ?? t['tag'] ?? '').toString().trim();
            return n.isNotEmpty && n.toLowerCase() != _tagName.toLowerCase();
          })
          .take(8)
          .toList();
      Map<String, dynamic> follow = const {};
      try {
        follow = await widget.apiService.checkTagFollow(_tagName);
      } catch (_) {}
      if (!mounted) return;
      setState(() {
        _books = books;
        _related = related;
        _following = (follow['following'] as bool?) ?? false;
        _tagCoverPath = tagCover;
        _storyCount = tagBooksCount ?? books.length;
        _followerCount =
            ((follow['followers'] as num?)?.toInt() ?? tagFollowers) > 0
            ? ((follow['followers'] as num?)?.toInt() ?? tagFollowers)
            : tagFollowers;
        _tagDescription = description.isNotEmpty
            ? description
            : 'Stories tagged #$_tagName from the live public catalog and community picks.';
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _books = const [];
        _related = const [];
        _storyCount = 0;
        _tagCoverPath = '';
        _tagDescription =
            'Stories tagged #$_tagName from the live public catalog.';
        _loading = false;
      });
    }
  }

  String get _selectedSort => switch (_tabs.index) {
    1 => 'recent',
    2 => 'trending',
    3 => 'liked',
    _ => 'top',
  };

  Future<void> _loadBooksForSelectedSort() async {
    final requestId = ++_booksRequestId;
    final books = await widget.apiService.fetchBooksByTag(
      _tagName,
      sort: _selectedSort,
    );
    if (!mounted || requestId != _booksRequestId) return;
    setState(() {
      _books = books;
      _tagCoverPath = HashtagDetailScreen.resolveTagCover({
        'cover_path': _tagCoverPath,
      }, books);
    });
  }

  List<Map<String, dynamic>> get _sorted {
    return List<Map<String, dynamic>>.from(_books);
  }

  void _openBook(Map<String, dynamic> m) {
    final id = (m['id'] as num?)?.toInt() ?? 0;
    if (id <= 0) return;
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => StoryDetailScreen(
          apiService: widget.apiService,
          book: BookDetailModel(
            id: id,
            title: (m['title'] ?? 'Story').toString(),
            author: (m['author'] ?? '').toString(),
            description: (m['description'] ?? '').toString(),
            statusText: (m['status_text'] ?? '').toString(),
            rating: (m['rating'] as num?)?.toDouble() ?? 0,
            genre: (m['genre'] ?? m['primary_genre'] ?? _tagName).toString(),
            cta: 'Read Now',
            coverPath: (m['cover_path'] ?? '').toString(),
          ),
        ),
      ),
    );
  }

  Future<void> _toggleFollow() async {
    if (_followBusy) return;
    setState(() => _followBusy = true);
    try {
      if (_following) {
        final res = await widget.apiService.unfollowTag(_tagName);
        if (!mounted) return;
        setState(() {
          _following = false;
          _followerCount =
              (res['followers'] as num?)?.toInt() ?? _followerCount;
        });
      } else {
        final res = await widget.apiService.followTag(_tagName);
        if (!mounted) return;
        setState(() {
          _following = true;
          _followerCount =
              (res['followers'] as num?)?.toInt() ?? _followerCount;
        });
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Could not update follow: $e')));
    } finally {
      if (mounted) setState(() => _followBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final sorted = _sorted;
    final featured = sorted.take(8).toList();
    final top = sorted.take(20).toList();
    final surfaceColor = AppTheme.bgOf(context);

    return Scaffold(
      backgroundColor: surfaceColor,
      body: SafeArea(
        child: _loading
            ? const Center(
                child: CircularProgressIndicator(color: AppTheme.brand),
              )
            : RefreshIndicator(
                color: AppTheme.brand,
                onRefresh: _load,
                child: CustomScrollView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  slivers: [
                    SliverToBoxAdapter(child: _header(isDark)),
                    SliverPersistentHeader(
                      pinned: true,
                      delegate: _HashtagTabDelegate(
                        child: Container(
                          color: surfaceColor,
                          child: TabBar(
                            controller: _tabs,
                            isScrollable: true,
                            labelColor: AppTheme.brand,
                            unselectedLabelColor: AppTheme.mutedOf(context),
                            indicatorColor: AppTheme.brand,
                            indicatorWeight: 3,
                            tabs: const [
                              Tab(text: 'Top'),
                              Tab(text: 'Recent'),
                              Tab(text: 'Trending'),
                              Tab(text: 'Most Liked'),
                            ],
                          ),
                        ),
                      ),
                    ),
                    if (featured.isNotEmpty)
                      ..._featuredSection(featured, isDark),
                    ..._topStoriesSection(top, isDark),
                    if (_related.isNotEmpty) ..._relatedSection(isDark),
                    const SliverToBoxAdapter(child: SizedBox(height: 24)),
                  ],
                ),
              ),
      ),
    );
  }

  Color _tagAccent() {
    return AppTheme.brand;
  }

  Widget _header(bool isDark) {
    final cover = _tagCoverPath.isNotEmpty
        ? _tagCoverPath
        : (_books.isNotEmpty ? _coverPath(_books.first) : '');
    final coverUrl = cover.isEmpty
        ? null
        : widget.apiService.resolveAssetUrl(cover);
    final count = _storyCount;
    final accent = _tagAccent();
    final deep = Color.alphaBlend(
      accent.withValues(alpha: isDark ? 0.18 : 0.08),
      AppTheme.bgOf(context),
    );
    final textColor = AppTheme.inkOf(context);
    final mutedText = AppTheme.mutedOf(context);
    final tileBg = AppTheme.surfaceOf(context);
    final tileBorder = AppTheme.borderOf(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Full-width cover photo from admin / tag meta
        if (coverUrl != null)
          Stack(
            children: [
              SizedBox(
                width: double.infinity,
                height: AppBreakpoints.heroCoverHeight(context),
                child: Image.network(
                  coverUrl,
                  fit: BoxFit.cover,
                  width: double.infinity,
                  errorBuilder: (_, _, _) => Container(
                    height: AppBreakpoints.heroCoverHeight(context),
                    color: accent.withValues(alpha: 0.3),
                  ),
                ),
              ),
              Positioned(
                top: 0,
                left: 0,
                right: 0,
                child: SafeArea(
                  bottom: false,
                  child: Row(
                    children: [
                      IconButton(
                        icon: const Icon(
                          Icons.arrow_back_ios_new_rounded,
                          size: 18,
                        ),
                        color: Colors.white,
                        onPressed: () => Navigator.of(context).maybePop(),
                      ),
                      const Spacer(),
                    ],
                  ),
                ),
              ),
            ],
          )
        else
          SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(4, 4, 4, 0),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(
                      Icons.arrow_back_ios_new_rounded,
                      size: 18,
                    ),
                    color: textColor,
                    onPressed: () => Navigator.of(context).maybePop(),
                  ),
                  const Spacer(),
                ],
              ),
            ),
          ),
        Container(
          width: double.infinity,
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                accent.withValues(alpha: isDark ? 0.95 : 0.18),
                deep,
                AppTheme.bgOf(context),
              ],
            ),
          ),
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      _displayTag,
                      style: TextStyle(
                        fontSize: 30,
                        fontWeight: FontWeight.w700,
                        letterSpacing: -0.5,
                        color: textColor,
                        height: 1.1,
                      ),
                    ),
                  ),
                  FilledButton.icon(
                    onPressed: _followBusy ? null : _toggleFollow,
                    style: FilledButton.styleFrom(
                      backgroundColor: _following
                          ? AppTheme.borderOf(context)
                          : AppTheme.brand,
                      foregroundColor: _following
                          ? AppTheme.inkOf(context)
                          : Colors.white,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 18,
                        vertical: 10,
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    icon: Icon(
                      _following ? Icons.favorite : Icons.favorite_border,
                      size: 18,
                    ),
                    label: Text(_following ? 'Following' : 'Follow'),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                '$count ${count == 1 ? 'story' : 'stories'} · $_followerCount ${_followerCount == 1 ? 'follower' : 'followers'}',
                style: TextStyle(
                  color: mutedText,
                  fontWeight: FontWeight.w600,
                  fontSize: 12.5,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                _tagDescription,
                style: TextStyle(color: mutedText, fontSize: 13, height: 1.5),
              ),
              const SizedBox(height: 18),
              // Stories + Followers only (no readers/writers, no notify)
              Container(
                decoration: BoxDecoration(
                  color: tileBg,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: tileBorder),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Center(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          child: Column(
                            children: [
                              Text(
                                '$count',
                                style: TextStyle(
                                  color: textColor,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 18,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                'Stories',
                                style: TextStyle(
                                  color: mutedText,
                                  fontSize: 10.5,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    Container(width: 1, height: 42, color: tileBorder),
                    Expanded(
                      child: Center(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          child: Column(
                            children: [
                              Text(
                                '$_followerCount',
                                style: TextStyle(
                                  color: textColor,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 18,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                'Followers',
                                style: TextStyle(
                                  color: mutedText,
                                  fontSize: 10.5,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  List<Widget> _featuredSection(List<Map<String, dynamic>> books, bool isDark) {
    return [
      SliverToBoxAdapter(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: Row(
            children: [
              Text(
                'Featured Stories',
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w800,
                  color: AppTheme.inkOf(context),
                ),
              ),
              const Spacer(),
              Text(
                'See All',
                style: TextStyle(
                  color: AppTheme.brand,
                  fontWeight: FontWeight.w600,
                  fontSize: 13,
                ),
              ),
            ],
          ),
        ),
      ),
      SliverToBoxAdapter(
        child: SizedBox(
          height: 210,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: books.length,
            separatorBuilder: (_, _) => const SizedBox(width: 12),
            itemBuilder: (context, i) {
              final m = books[i];
              final cover = _coverPath(m);
              final url = cover.isEmpty
                  ? null
                  : widget.apiService.resolveAssetUrl(cover);
              return GestureDetector(
                onTap: () => _openBook(m),
                child: SizedBox(
                  width: 120,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Stack(
                          children: [
                            ClipRRect(
                              borderRadius: BorderRadius.circular(12),
                              child: Container(
                                width: 120,
                                color: isDark
                                    ? const Color(0xFF2B3832)
                                    : const Color(0xFFF6F5FA),
                                child: url == null
                                    ? const Icon(Icons.menu_book)
                                    : Image.network(
                                        url,
                                        fit: BoxFit.cover,
                                        width: 120,
                                        height: double.infinity,
                                        errorBuilder: (_, _, _) =>
                                            const Icon(Icons.menu_book),
                                      ),
                              ),
                            ),
                            Positioned(
                              left: 8,
                              top: 8,
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 3,
                                ),
                                decoration: BoxDecoration(
                                  color: AppTheme.brand,
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: const Text(
                                  'Featured',
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontSize: 10,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        (m['title'] ?? '').toString(),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 12,
                        ),
                      ),
                      Text(
                        'by ${(m['author'] ?? '').toString()}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 11,
                          color: AppTheme.mutedOf(context),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ),
    ];
  }

  List<Widget> _topStoriesSection(
    List<Map<String, dynamic>> books,
    bool isDark,
  ) {
    return [
      SliverToBoxAdapter(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
          child: Row(
            children: [
              Text(
                'Top Stories',
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w800,
                  color: AppTheme.inkOf(context),
                ),
              ),
              const Spacer(),
              Text(
                'Sort by Top',
                style: TextStyle(
                  color: AppTheme.mutedOf(context),
                  fontSize: 12,
                ),
              ),
            ],
          ),
        ),
      ),
      SliverList(
        delegate: SliverChildBuilderDelegate((context, i) {
          final m = books[i];
          final cover = _coverPath(m);
          final url = cover.isEmpty
              ? null
              : widget.apiService.resolveAssetUrl(cover);
          final title = (m['title'] ?? 'Story').toString();
          final author = (m['author'] ?? '').toString();
          final desc = (m['description'] ?? '').toString();
          final status = (m['status_text'] ?? '').toString();
          final genre = (m['genre'] ?? m['primary_genre'] ?? _tagName)
              .toString();
          final views = (m['view_count'] as num?)?.toInt() ?? 0;
          final rating = (m['rating'] as num?)?.toDouble() ?? 0;
          return InkWell(
            onTap: () => _openBook(m),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 28,
                    height: 28,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: isDark
                          ? const Color(0xFF2B3832)
                          : const Color(0xFFF6F5FA),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      '${i + 1}',
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        color: AppTheme.brand,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: Container(
                      width: 56,
                      height: 72,
                      color: isDark
                          ? const Color(0xFF2B3832)
                          : const Color(0xFFF6F5FA),
                      child: url == null
                          ? const Icon(Icons.menu_book, size: 20)
                          : Image.network(
                              url,
                              fit: BoxFit.cover,
                              errorBuilder: (_, _, _) =>
                                  const Icon(Icons.menu_book, size: 20),
                            ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 14,
                            color: AppTheme.inkOf(context),
                          ),
                        ),
                        Text(
                          'by $author',
                          style: TextStyle(
                            fontSize: 12,
                            color: AppTheme.mutedOf(context),
                          ),
                        ),
                        if (desc.isNotEmpty)
                          Text(
                            desc,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 12,
                              color: AppTheme.mutedOf(context),
                              height: 1.25,
                            ),
                          ),
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            Expanded(
                              child: Wrap(
                                spacing: 6,
                                runSpacing: 4,
                                crossAxisAlignment: WrapCrossAlignment.center,
                                children: [
                                  if (genre.isNotEmpty)
                                    _chip(
                                      genre,
                                      AppTheme.brand.withValues(alpha: 0.15),
                                      AppTheme.mint,
                                    ),
                                  if (status.isNotEmpty)
                                    _chip(
                                      status,
                                      AppTheme.brandDeep.withValues(
                                        alpha: 0.18,
                                      ),
                                      AppTheme.mint,
                                    ),
                                ],
                              ),
                            ),
                            const SizedBox(width: 6),
                            Icon(
                              Icons.visibility_outlined,
                              size: 14,
                              color: Colors.grey.shade500,
                            ),
                            const SizedBox(width: 3),
                            Text(
                              '$views',
                              style: TextStyle(
                                fontSize: 11,
                                color: AppTheme.mutedOf(context),
                              ),
                            ),
                            const SizedBox(width: 8),
                            const Icon(
                              Icons.star_rounded,
                              size: 14,
                              color: AppTheme.amber,
                            ),
                            Text(
                              rating.toStringAsFixed(1),
                              style: TextStyle(
                                fontSize: 11,
                                color: AppTheme.mutedOf(context),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
        }, childCount: books.length),
      ),
    ];
  }

  Widget _chip(String label, Color bg, Color fg) {
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 120),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w700,
            color: fg,
          ),
        ),
      ),
    );
  }

  List<Widget> _relatedSection(bool isDark) {
    return [
      SliverToBoxAdapter(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
          child: const Text(
            'Related Hashtags',
            style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
          ),
        ),
      ),
      SliverToBoxAdapter(
        child: SizedBox(
          height: 72,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: _related.length,
            separatorBuilder: (_, _) => const SizedBox(width: 10),
            itemBuilder: (context, i) {
              final t = _related[i];
              final name = (t['name'] ?? t['tag'] ?? '').toString();
              final count = (t['book_count'] as num?)?.toInt() ?? 0;
              return InkWell(
                onTap: () {
                  Navigator.of(context).pushReplacement(
                    MaterialPageRoute<void>(
                      builder: (_) => HashtagDetailScreen(
                        tag: name,
                        apiService: widget.apiService,
                      ),
                    ),
                  );
                },
                borderRadius: BorderRadius.circular(14),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 10,
                  ),
                  decoration: BoxDecoration(
                    color: AppTheme.surfaceOf(context),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: AppTheme.borderOf(context)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        name.startsWith('#') ? name : '#$name',
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 13,
                        ),
                      ),
                      Text(
                        '$count stories',
                        style: TextStyle(
                          fontSize: 11,
                          color: AppTheme.mutedOf(context),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ),
      const SliverToBoxAdapter(child: SizedBox(height: 32)),
    ];
  }
}

class _HashtagTabDelegate extends SliverPersistentHeaderDelegate {
  _HashtagTabDelegate({required this.child});
  final Widget child;

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
    return child;
  }

  @override
  bool shouldRebuild(covariant _HashtagTabDelegate oldDelegate) =>
      oldDelegate.child != child;
}
