part of 'discover_screen.dart';

class _ExpandableDescription extends StatefulWidget {
  const _ExpandableDescription({required this.text, this.onReadMore});

  final String text;
  final VoidCallback? onReadMore;

  @override
  State<_ExpandableDescription> createState() => _ExpandableDescriptionState();
}

class _ExpandableDescriptionState extends State<_ExpandableDescription> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final text = widget.text.trim().isEmpty
        ? 'No description available yet.'
        : widget.text.trim();
    final needsToggle = text.length > 180;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          text,
          maxLines: _expanded || !needsToggle ? null : 4,
          overflow: _expanded || !needsToggle
              ? TextOverflow.visible
              : TextOverflow.ellipsis,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
            height: 1.6,
            color: const Color(0xFF555555),
          ),
        ),
        if (needsToggle)
          Padding(
            padding: const EdgeInsets.only(top: 4, bottom: 8),
            child: TextButton(
              onPressed: () {
                if (widget.onReadMore != null) {
                  widget.onReadMore!();
                  return;
                }
                setState(() => _expanded = !_expanded);
              },
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
                minimumSize: const Size(64, 40),
                tapTargetSize: MaterialTapTargetSize.padded,
                alignment: Alignment.centerLeft,
              ),
              child: Text(
                _expanded ? 'Show less' : 'Read more',
                style: const TextStyle(
                  color: AppTheme.brand,
                  fontWeight: FontWeight.w700,
                  fontSize: 14,
                ),
              ),
            ),
          ),
      ],
    );
  }
}

Color _hexToColor(String hex) {
  final normalized = hex.replaceAll('#', '');
  if (normalized.length < 6) return const Color(0xFFA1A1A1);
  return Color(int.parse('FF$normalized', radix: 16));
}

double _storyRailActiveWidth(BuildContext context) =>
    (MediaQuery.sizeOf(context).width * 0.34).clamp(120.0, 240.0).toDouble();

class _ExploreStoriesSection extends StatefulWidget {
  const _ExploreStoriesSection({
    required this.books,
    required this.topics,
    required this.apiService,
    required this.onOpenExplore,
  });

  final List<BookCardModel> books;
  final List<ExploreTopicModel> topics;
  final ApiService apiService;
  final VoidCallback onOpenExplore;

  @override
  State<_ExploreStoriesSection> createState() => _ExploreStoriesSectionState();
}

class _ExploreStoriesSectionState extends State<_ExploreStoriesSection> {
  late final PageController _pageController;
  int _activeIndex = 0;

  @override
  void initState() {
    super.initState();
    _pageController = PageController(viewportFraction: 0.40, initialPage: 0);
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  List<BookCardModel> get _validBooks =>
      widget.books.where((e) => e.id > 0 && e.title.trim().isNotEmpty).toList();

  BookCardModel get _activeBook {
    final books = _validBooks.isNotEmpty ? _validBooks : widget.books;
    return books[_activeIndex.clamp(0, books.length - 1)];
  }

  void _openBook(BookCardModel item) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => StoryDetailScreen(
          apiService: widget.apiService,
          book: BookDetailModel(
            id: item.id,
            title: item.title,
            author: item.author,
            description: item.description,
            statusText: item.statusText,
            rating: item.rating,
            genre: item.primaryGenre,
            cta: item.cta,
            coverPath: item.coverPath,
          ),
        ),
      ),
    );
  }

  void _openSeeAll() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => _SectionBooksScreen(
          title: _activeBook.primaryGenre.isEmpty
              ? 'Stories'
              : _activeBook.primaryGenre,
          books: widget.books,
          apiService: widget.apiService,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (widget.books.isEmpty) return const SizedBox.shrink();
    final lead = _activeBook;
    final cardWidth = _storyRailActiveWidth(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                lead.primaryGenre.isEmpty
                    ? 'Portal Fantasy'
                    : lead.primaryGenre,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: isDark ? Colors.white70 : null,
                ),
              ),
            ),
            TextButton(
              onPressed: _openSeeAll,
              style: TextButton.styleFrom(
                foregroundColor: AppTheme.brand,
                padding: const EdgeInsets.only(left: 0, right: 8),
                minimumSize: const Size(0, 32),
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              child: const Text(
                'See all',
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        SizedBox(
          height: cardWidth * 1.42 + 16,
          child: PageView.builder(
            controller: _pageController,
            padEnds: false,
            itemCount: _validBooks.length + 1,
            onPageChanged: (index) {
              if (index >= _validBooks.length) return;
              setState(() => _activeIndex = index);
            },
            itemBuilder: (context, index) {
              if (index >= _validBooks.length) {
                return const SizedBox.shrink();
              }
              final item = _validBooks[index];
              return AnimatedScale(
                scale: index == _activeIndex ? 1 : .93,
                duration: const Duration(milliseconds: 340),
                curve: Curves.easeOutBack,
                child: AnimatedOpacity(
                  opacity: index == _activeIndex ? 1 : .82,
                  duration: const Duration(milliseconds: 280),
                  child: GestureDetector(
                    onTap: () {
                      if (index != _activeIndex) {
                        _pageController.animateToPage(
                          index,
                          duration: const Duration(milliseconds: 320),
                          curve: Curves.easeOutCubic,
                        );
                      } else {
                        _openBook(item);
                      }
                    },
                    child: Center(
                      child: _StoryCard(
                        book: item,
                        width: cardWidth,
                        apiService: widget.apiService,
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 10),
        // Description / details follow the currently centered cover
        _ActiveStoryDetail(
          book: lead,
          apiService: widget.apiService,
          onRead: () => _openBook(lead),
        ),
        const SizedBox(height: 16),
      ],
    );
  }
}

class _DiscoverRailSection {
  const _DiscoverRailSection({required this.title, required this.books});

  final String title;
  final List<BookCardModel> books;
}

class _DynamicStoryRail extends StatefulWidget {
  const _DynamicStoryRail({required this.section, required this.apiService});

  final _DiscoverRailSection section;
  final ApiService apiService;

  @override
  State<_DynamicStoryRail> createState() => _DynamicStoryRailState();
}

class _DynamicStoryRailState extends State<_DynamicStoryRail> {
  late final PageController _pageController;
  int _activeIndex = 0;

  @override
  void initState() {
    super.initState();
    // Match the first Discover slider format (no leading blank gap)
    _pageController = PageController(viewportFraction: 0.40, initialPage: 0);
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.section.books.isEmpty) {
      return const SizedBox.shrink();
    }

    final valid = widget.section.books
        .where((e) => e.id > 0 && e.title.trim().isNotEmpty)
        .toList();
    if (valid.isEmpty) return const SizedBox.shrink();
    final book = valid[_activeIndex.clamp(0, valid.length - 1)];
    final cardWidth = _storyRailActiveWidth(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                widget.section.title,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                  fontSize: 17,
                  letterSpacing: -0.2,
                ),
              ),
            ),
            TextButton(
              onPressed: () {
                Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => _SectionBooksScreen(
                      title: widget.section.title,
                      books: widget.section.books,
                      apiService: widget.apiService,
                    ),
                  ),
                );
              },
              style: TextButton.styleFrom(
                foregroundColor: AppTheme.brand,
                padding: const EdgeInsets.only(left: 0, right: 8),
                minimumSize: const Size(0, 32),
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              child: const Text(
                'See all',
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        SizedBox(
          height: cardWidth * 1.42 + 16,
          child: PageView.builder(
            controller: _pageController,
            // Same as first slider — no large leading blank space
            // Extra trailing page so the LAST book can fully slide into view
            padEnds: false,
            itemCount: valid.length + 1,
            onPageChanged: (index) {
              if (index >= valid.length) return;
              setState(() => _activeIndex = index);
            },
            itemBuilder: (context, index) {
              if (index >= valid.length) {
                return const SizedBox.shrink();
              }
              final item = valid[index];
              return AnimatedScale(
                scale: index == _activeIndex ? 1 : .93,
                duration: const Duration(milliseconds: 340),
                curve: Curves.easeOutBack,
                child: AnimatedOpacity(
                  opacity: index == _activeIndex ? 1 : .82,
                  duration: const Duration(milliseconds: 280),
                  child: GestureDetector(
                    onTap: () {
                      if (index != _activeIndex) {
                        _pageController.animateToPage(
                          index,
                          duration: const Duration(milliseconds: 320),
                          curve: Curves.easeOutCubic,
                        );
                      } else {
                        Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (_) => StoryDetailScreen(
                              apiService: widget.apiService,
                              book: BookDetailModel(
                                id: item.id,
                                title: item.title,
                                author: item.author,
                                description: item.description,
                                statusText: item.statusText,
                                rating: item.rating,
                                genre: item.primaryGenre,
                                cta: item.cta,
                                coverPath: item.coverPath,
                              ),
                            ),
                          ),
                        );
                      }
                    },
                    child: Center(
                      child: _StoryCard(
                        book: item,
                        width: cardWidth,
                        apiService: widget.apiService,
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 10),
        _ActiveStoryDetail(
          book: book,
          apiService: widget.apiService,
          onRead: () {
            Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => StoryDetailScreen(
                  apiService: widget.apiService,
                  book: BookDetailModel(
                    id: book.id,
                    title: book.title,
                    author: book.author,
                    description: book.description,
                    statusText: book.statusText,
                    rating: book.rating,
                    genre: book.primaryGenre,
                    cta: book.cta,
                    coverPath: book.coverPath,
                  ),
                ),
              ),
            );
          },
        ),
      ],
    );
  }
}

class _ActiveStoryDetail extends StatelessWidget {
  const _ActiveStoryDetail({required this.book, this.onRead, this.apiService});

  final BookCardModel book;
  final VoidCallback? onRead;
  final ApiService? apiService;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          book.title,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
            fontFamily: 'serif',
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 6),
        _ExpandableDescription(
          text: book.description,
          onReadMore: () {
            if (onRead != null) {
              onRead!();
              return;
            }
            if (apiService == null) return;
            Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => StoryDetailScreen(
                  apiService: apiService!,
                  book: BookDetailModel(
                    id: book.id,
                    title: book.title,
                    author: book.author,
                    description: book.description,
                    statusText: book.statusText,
                    rating: book.rating,
                    genre: book.primaryGenre,
                    cta: book.cta,
                    coverPath: book.coverPath,
                  ),
                ),
              ),
            );
          },
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 10,
          runSpacing: 4,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.schedule_rounded,
                  size: 14,
                  color: AppTheme.mutedOf(context),
                ),
                const SizedBox(width: 4),
                Text(
                  book.statusText.isEmpty
                      ? 'Updated recently'
                      : book.statusText,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.visibility_outlined,
                  size: 14,
                  color: AppTheme.mutedOf(context),
                ),
                const SizedBox(width: 4),
                Text(
                  '${book.viewCount}',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
            if (book.rating > 0)
              Row(
                mainAxisSize: MainAxisSize.min,
                children: List.generate(
                  book.rating.round().clamp(0, 5),
                  (_) => const Padding(
                    padding: EdgeInsets.only(right: 2),
                    child: Icon(
                      Icons.star_rounded,
                      size: 15,
                      color: Color(0xFFF4CC2F),
                    ),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            if (book.isCompleted) ...[
              const Icon(
                Icons.check_circle_outline_rounded,
                size: 14,
                color: AppTheme.brand,
              ),
              Text(
                'Completed',
                style: Theme.of(
                  context,
                ).textTheme.bodySmall?.copyWith(color: AppTheme.brand),
              ),
            ],
            _GenreTag(
              label: book.primaryGenre.isEmpty ? 'Novel' : book.primaryGenre,
              apiService: apiService,
            ),
            if (book.secondaryGenre.isNotEmpty)
              _GenreTag(label: book.secondaryGenre, apiService: apiService),
            DecoratedBox(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                boxShadow: [
                  BoxShadow(
                    color: AppTheme.brand.withValues(alpha: 0.35),
                    blurRadius: 14,
                    offset: const Offset(0, 6),
                  ),
                ],
              ),
              child: ElevatedButton(
                onPressed: onRead,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.brand,
                  foregroundColor: Colors.white,
                  elevation: 0,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 20,
                    vertical: 8,
                  ),
                  minimumSize: const Size(0, 38),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: Text(
                  'Read Now',
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _GenreTag extends StatelessWidget {
  const _GenreTag({required this.label, this.apiService});

  final String label;
  final ApiService? apiService;

  @override
  Widget build(BuildContext context) {
    final text = label.trim().isEmpty ? 'Novel' : label.trim();
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: apiService == null
            ? null
            : () {
                Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) =>
                        HashtagDetailScreen(tag: text, apiService: apiService!),
                  ),
                );
              },
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
          decoration: BoxDecoration(
            border: Border.all(
              color: Theme.of(context).brightness == Brightness.dark
                  ? const Color(0xFF2C2C2C)
                  : const Color(0xFFE0E0E0),
            ),
            borderRadius: BorderRadius.circular(20),
            color: Theme.of(context).brightness == Brightness.dark
                ? const Color(0xFF1A1A1A)
                : const Color(0xFFF6F5FA),
          ),
          child: Text(
            text.startsWith('#') ? text : '#$text',
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
              fontWeight: FontWeight.w700,
              color: AppTheme.brand,
            ),
          ),
        ),
      ),
    );
  }
}

class _StoryCard extends StatefulWidget {
  const _StoryCard({
    required this.book,
    required this.apiService,
    this.width = 140,
  });

  final BookCardModel book;
  final ApiService apiService;
  final double width;

  @override
  State<_StoryCard> createState() => _StoryCardState();
}

class _StoryCardState extends State<_StoryCard> {
  void _openDetail() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => StoryDetailScreen(
          apiService: widget.apiService,
          book: BookDetailModel(
            id: widget.book.id,
            title: widget.book.title,
            author: widget.book.author,
            description: widget.book.description,
            statusText: widget.book.statusText,
            rating: widget.book.rating,
            genre: widget.book.primaryGenre,
            cta: widget.book.cta,
            coverPath: widget.book.coverPath,
          ),
        ),
      ),
    );
  }

  Widget _coverImage({required double width, required double height}) {
    final seed = widget.book.id > 0
        ? widget.book.id
        : widget.book.title.hashCode;
    final asset = CoverAssets.assetForSeed(seed);
    final coverPath = widget.book.coverPath;
    if (coverPath.isNotEmpty) {
      final url = widget.apiService.resolveAssetUrl(coverPath);
      return Image.network(
        url,
        fit: BoxFit.cover,
        width: width,
        height: height,
        cacheWidth: (width * 2).round().clamp(80, 600),
        cacheHeight: (height * 2).round().clamp(80, 800),
        errorBuilder: (_, _, _) =>
            Image.asset(asset, fit: BoxFit.cover, width: width, height: height),
      );
    }
    return Image.asset(asset, fit: BoxFit.cover, width: width, height: height);
  }

  @override
  Widget build(BuildContext context) {
    final color = _hexToColor(widget.book.accentHex);
    // Rails render the title and metadata in the detail panel below the card.
    // Keep the card cover-only so the scaled card fits the rail's fixed height.
    final compact = widget.width <= 190;

    if (compact) {
      return GestureDetector(
        onTap: _openDetail,
        child: SizedBox(
          width: widget.width,
          height: widget.width * 1.42,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: Stack(
              fit: StackFit.expand,
              children: [
                _coverImage(width: widget.width, height: widget.width * 1.42),
                const DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Color(0x00000000),
                        Color(0x16000000),
                        Color(0xE8000000),
                      ],
                      stops: [0.36, 0.6, 1],
                    ),
                  ),
                ),
                Positioned(
                  top: 8,
                  left: 8,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 7,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xD914765B),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      widget.book.statusText.toLowerCase().contains('complete')
                          ? 'COMPLETED'
                          : 'ONGOING',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 8,
                        fontWeight: FontWeight.w800,
                        letterSpacing: .35,
                      ),
                    ),
                  ),
                ),
                Positioned(
                  left: 9,
                  right: 9,
                  bottom: 9,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        widget.book.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          height: 1.15,
                          fontWeight: FontWeight.w800,
                          shadows: [
                            Shadow(color: Colors.black54, blurRadius: 5),
                          ],
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        'by ${widget.book.author}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Color(0xFFF6F5FA),
                          fontSize: 9,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return GestureDetector(
      onTap: _openDetail,
      child: Container(
        width: widget.width,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          color: Theme.of(context).brightness == Brightness.dark
              ? const Color(0xFF17211D)
              : Colors.white,
          boxShadow: [
            BoxShadow(
              color: color.withValues(alpha: 0.18),
              blurRadius: 12,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            ClipRRect(
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(16),
              ),
              child: AspectRatio(
                aspectRatio: 0.72,
                child: _coverImage(
                  width: widget.width,
                  height: widget.width / 0.72,
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.book.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'by ${widget.book.author}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: AppTheme.mutedOf(context),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AuthorsStrip extends StatefulWidget {
  const _AuthorsStrip({required this.books, required this.apiService});

  final List<BookCardModel> books;
  final ApiService apiService;

  @override
  State<_AuthorsStrip> createState() => _AuthorsStripState();
}

class _AuthorsStripState extends State<_AuthorsStrip> {
  Map<int, bool> _following = {};

  @override
  void initState() {
    super.initState();
    _loadFollowStates();
  }

  Future<void> _loadFollowStates() async {
    final ids = <int>[];
    final seenNames = <String>{};
    for (final book in widget.books) {
      final name = book.author.trim().isEmpty ? 'Unknown' : book.author;
      if (seenNames.contains(name)) continue;
      seenNames.add(name);
      final aid = book.authorUserId;
      if (aid != null) ids.add(aid);
      if (seenNames.length >= 8) break;
    }
    if (ids.isEmpty) return;
    final map = await widget.apiService.fetchAuthorsFollowing(ids);
    if (!mounted) return;
    setState(() => _following = map);
  }

  Future<void> _toggleFollowFor(int authorId) async {
    final currently = _following[authorId] ?? false;
    try {
      if (currently) {
        await widget.apiService.unfollowAuthor(authorId);
      } else {
        await widget.apiService.followAuthor(authorId);
      }
      if (!mounted) return;
      setState(() => _following[authorId] = !currently);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    // Prefer authors of Completed / Published / recently_updated stories
    // so a writer who finishes + saves a story appears under New Authors.
    final ranked = List<BookCardModel>.from(widget.books);
    ranked.sort((a, b) {
      int score(BookCardModel x) {
        final st = x.statusText.toLowerCase();
        var s = 0;
        if (st.contains('complete') || st.contains('publish')) s += 3;
        if (x.sectionName == 'recently_updated' ||
            x.sectionName == 'recently_completed') {
          s += 2;
        }
        if (x.authorUserId != null && x.authorUserId! > 0) s += 1;
        if (x.isCompleted) s += 2;
        return s;
      }

      return score(b).compareTo(score(a));
    });

    final byAuthor = <String, BookCardModel>{};
    for (final book in ranked) {
      final name = book.author.trim().isEmpty ? 'Unknown' : book.author;
      byAuthor.putIfAbsent(name, () => book);
      if (byAuthor.length >= 5) break;
    }

    final authors = byAuthor.entries.toList();
    if (authors.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                'New Authors',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                  color: Theme.of(context).brightness == Brightness.dark
                      ? Colors.white
                      : null,
                ),
              ),
            ),
            TextButton(
              onPressed: () {
                Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => _AuthorsSeeAllScreen(
                      books: widget.books,
                      apiService: widget.apiService,
                    ),
                  ),
                );
              },
              style: TextButton.styleFrom(
                foregroundColor: AppTheme.brand,
                padding: const EdgeInsets.only(left: 0, right: 8),
                minimumSize: const Size(0, 32),
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              child: const Text(
                'See all',
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        SizedBox(
          height: 124,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            // Extra trailing space so last author is fully tappable
            padding: const EdgeInsets.only(right: 24),
            itemCount: authors.length,
            separatorBuilder: (_, _) => const SizedBox(width: 9),
            itemBuilder: (context, index) {
              final author = authors[index].key;
              final book = authors[index].value;
              final letter = author.isNotEmpty ? author[0].toUpperCase() : 'A';
              final authorId = book.authorUserId;
              final rawPhoto = (book.authorPhotoUrl ?? '').trim();
              final photoUrl = rawPhoto.isNotEmpty
                  ? widget.apiService.resolveAssetUrl(rawPhoto)
                  : '';
              final isFollowing = authorId != null
                  ? (_following[authorId] ?? false)
                  : false;
              return Column(
                children: [
                  GestureDetector(
                    onTap: authorId != null
                        ? () {
                            Navigator.of(context).push(
                              MaterialPageRoute<void>(
                                builder: (_) => ProfileScreen(
                                  apiService: widget.apiService,
                                  viewingUserId: authorId,
                                  achievements: const [],
                                  profile: ProfileModel(
                                    id: authorId,
                                    displayName: author,
                                    username: author.toLowerCase().replaceAll(
                                      ' ',
                                      '',
                                    ),
                                    photoUrl: rawPhoto,
                                    coverUrl: '',
                                    following: 0,
                                    followers: 0,
                                    blocked: 0,
                                    chaptersRead: 0,
                                    socialKarma: 0,
                                    dayStreak: 0,
                                    readingLists: const [],
                                  ),
                                ),
                              ),
                            );
                          }
                        : null,
                    onLongPress: authorId != null
                        ? () => _toggleFollowFor(authorId)
                        : null,
                    child: Stack(
                      clipBehavior: Clip.none,
                      children: [
                        CircleAvatar(
                          radius: 28,
                          backgroundColor:
                              Theme.of(context).brightness == Brightness.dark
                              ? const Color(0xFF2A3344)
                              : const Color(0xFFF6F5FA),
                          backgroundImage: photoUrl.isNotEmpty
                              ? NetworkImage(photoUrl)
                              : null,
                          onBackgroundImageError: photoUrl.isNotEmpty
                              ? (_, _) {}
                              : null,
                          child: photoUrl.isEmpty
                              ? Text(
                                  letter,
                                  style: const TextStyle(
                                    color: AppTheme.brand,
                                    fontWeight: FontWeight.w700,
                                    fontSize: 18,
                                  ),
                                )
                              : null,
                        ),
                        if (authorId != null)
                          Positioned(
                            right: -4,
                            bottom: -2,
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 6,
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: isFollowing
                                    ? Colors.white
                                    : Colors.black.withValues(alpha: 0.6),
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(
                                  color: Theme.of(
                                    context,
                                  ).scaffoldBackgroundColor,
                                  width: 1.5,
                                ),
                              ),
                              child: Text(
                                isFollowing ? 'Following' : 'Follow',
                                style: TextStyle(
                                  color: isFollowing
                                      ? AppTheme.brand
                                      : Colors.white,
                                  fontSize: 9,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: 72,
                    child: Column(
                      children: [
                        Text(
                          author,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                              ),
                        ),
                        Text(
                          book.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(
                                fontSize: 9,
                                color: AppTheme.mutedOf(context),
                              ),
                        ),
                      ],
                    ),
                  ),
                ],
              );
            },
          ),
        ),
      ],
    );
  }
}

class _GenrePillRow extends StatelessWidget {
  const _GenrePillRow({
    required this.topics,
    required this.books,
    required this.apiService,
  }) : onOpenExplore = null;

  final List<ExploreTopicModel> topics;
  final List<BookCardModel> books;
  final ApiService apiService;
  final VoidCallback? onOpenExplore;

  @override
  Widget build(BuildContext context) {
    final genres = <String>{};
    for (final b in books) {
      if (b.primaryGenre.isNotEmpty) genres.add(b.primaryGenre);
      if (genres.length >= 8) break;
    }
    final items = genres.toList();
    if (items.isEmpty) return const SizedBox.shrink();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return SizedBox(
      height: 40,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: items.length + (onOpenExplore != null ? 1 : 0),
        separatorBuilder: (context, index) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          if (onOpenExplore != null && index == items.length) {
            return ActionChip(
              label: Text(
                'Explore more',
                style: TextStyle(
                  color: isDark ? Colors.white : AppTheme.brand,
                  fontWeight: FontWeight.w600,
                ),
              ),
              backgroundColor: isDark
                  ? const Color(0xFF2A3344)
                  : const Color(0xFFF6F5FA),
              onPressed: onOpenExplore,
            );
          }
          final label = items[index];
          return ActionChip(
            label: Text(
              label,
              style: TextStyle(color: isDark ? Colors.white : null),
            ),
            onPressed: () async {
              // Only related hashtag/genre books — never jump to Explore
              var tagged = await apiService.fetchBooksByTag(label);
              if (tagged.isEmpty) {
                // Client-side filter from current discover books
                tagged = books
                    .where((b) {
                      final g = label.toLowerCase();
                      return b.primaryGenre.toLowerCase().contains(g) ||
                          b.secondaryGenre.toLowerCase().contains(g);
                    })
                    .map(
                      (b) => {
                        'id': b.id,
                        'title': b.title,
                        'author': b.author,
                        'description': b.description,
                        'status_text': b.statusText,
                        'rating': b.rating,
                        'genre': b.primaryGenre,
                        'primary_genre': b.primaryGenre,
                        'cover_path': b.coverPath,
                        'cta_label': b.cta,
                        'author_user_id': b.authorUserId,
                      },
                    )
                    .toList();
              }
              if (!context.mounted) return;
              await Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => GenreBooksScreen(
                    genre: label,
                    books: tagged,
                    apiService: apiService,
                    onExploreMore: onOpenExplore,
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

/// Horizontal "Browse genres" carousel (video-style genre cards).

/// Wattpad-style Continue reading strip (always visible).
class _ContinueReadingSection extends StatefulWidget {
  const _ContinueReadingSection({
    required this.entries,
    required this.apiService,
    this.onBrowse,
  });

  final List<LibraryEntryModel> entries;
  final ApiService apiService;
  final VoidCallback? onBrowse;

  @override
  State<_ContinueReadingSection> createState() =>
      _ContinueReadingSectionState();
}

class _ContinueReadingSectionState extends State<_ContinueReadingSection> {
  List<LibraryEntryModel> _items = const [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _items = _filterOngoing(widget.entries);
    _refresh();
  }

  @override
  void didUpdateWidget(covariant _ContinueReadingSection oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.entries != widget.entries) {
      _items = _filterOngoing(widget.entries);
    }
  }

  List<LibraryEntryModel> _filterOngoing(
    List<LibraryEntryModel> list, {
    int? myUserId,
  }) {
    return list.where((e) {
      if (e.book.id <= 0) return false;
      // Hide books the current user authored (own books never go to Continue Reading).
      final aid = e.book.authorUserId;
      if (myUserId != null &&
          myUserId > 0 &&
          aid != null &&
          aid > 0 &&
          aid == myUserId) {
        return false;
      }
      final st = e.readingStatus.toLowerCase().trim();
      // Only hide when explicitly marked completed (not by chapters math —
      // 1-chapter books were incorrectly treated as finished).
      if (st == 'completed' || st == 'finished' || st == 'done') return false;
      return true;
    }).toList();
  }

  Future<String> _continueReadingKey() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final id = prefs.getInt('auth_id');
      if (id != null && id > 0) return 'continue_reading_v1_u$id';
      final device = prefs.getString('auth_device_id');
      if (device != null && device.isNotEmpty) {
        return 'continue_reading_v1_d${device.hashCode}';
      }
    } catch (_) {}
    return 'continue_reading_v1_guest';
  }

  Future<void> _refresh() async {
    final merged = <int, LibraryEntryModel>{};

    // 1) Bootstrap seed
    for (final e in widget.entries) {
      if (e.book.id > 0) merged[e.book.id] = e;
    }

    // 2) Local cache (always works offline / even if API 401)
    try {
      final prefs = await SharedPreferences.getInstance();
      final key = await _continueReadingKey();
      var raw = prefs.getString(key) ?? '{}';
      // One-time migrate from legacy unscoped cache
      if ((raw == '{}' || raw.isEmpty) &&
          prefs.containsKey('continue_reading_v1')) {
        final legacy = prefs.getString('continue_reading_v1') ?? '{}';
        if (legacy != '{}' && legacy.isNotEmpty) {
          await prefs.setString(key, legacy);
          raw = legacy;
        }
      }
      final map = Map<String, dynamic>.from(
        (jsonDecode(raw) as Map?) ?? const {},
      );
      for (final entry in map.values) {
        if (entry is! Map) continue;
        final m = Map<String, dynamic>.from(entry);
        final model = LibraryEntryModel.fromMap(m);
        if (model.book.id > 0) {
          merged[model.book.id] = model;
        }
      }
    } catch (_) {}

    // 3) Live API
    try {
      final remote = await widget.apiService.fetchLibraryEntries();
      for (final row in remote) {
        final model = LibraryEntryModel.fromMap(row);
        if (model.book.id > 0) {
          merged[model.book.id] = model;
        }
      }
    } catch (_) {}

    int? myId;
    try {
      final prefs = await SharedPreferences.getInstance();
      myId = prefs.getInt('auth_id');
    } catch (_) {}
    if (!mounted) return;
    setState(() {
      _items = _filterOngoing(merged.values.toList(), myUserId: myId);
      _loading = false;
    });
  }

  Widget _continueCover(BookCardModel b, {double w = 110, double h = 150}) {
    final asset = CoverAssets.assetForSeed(b.id > 0 ? b.id : b.title.hashCode);
    if (b.coverPath.isNotEmpty) {
      return Image.network(
        widget.apiService.resolveAssetUrl(b.coverPath),
        fit: BoxFit.cover,
        width: w,
        height: h,
        cacheWidth: (w * 2).round(),
        cacheHeight: (h * 2).round(),
        errorBuilder: (_, _, _) =>
            Image.asset(asset, fit: BoxFit.cover, width: w, height: h),
      );
    }
    return Image.asset(asset, fit: BoxFit.cover, width: w, height: h);
  }

  Future<void> _openResume(
    BuildContext context,
    LibraryEntryModel entry,
  ) async {
    final b = entry.book;
    int chapterNumber = entry.lastChapterNumber > 0
        ? entry.lastChapterNumber
        : 1;
    int paragraphIndex = entry.lastParagraphIndex >= 0
        ? entry.lastParagraphIndex
        : 0;
    // Prefer freshest local cache for chapter/paragraph (written on every scroll)
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(await _continueReadingKey()) ?? '{}';
      final map = Map<String, dynamic>.from(
        (jsonDecode(raw) as Map?) ?? const {},
      );
      final cached = map['${b.id}'] ?? map['$b.id'];
      if (cached is Map) {
        final c = Map<String, dynamic>.from(cached);
        final cn = (c['last_chapter_number'] as num?)?.toInt();
        final pi = (c['last_paragraph_index'] as num?)?.toInt();
        if (cn != null && cn > 0) chapterNumber = cn;
        if (pi != null && pi >= 0) paragraphIndex = pi;
      }
    } catch (_) {}

    List<Map<String, dynamic>> chapters = const [];
    try {
      chapters = await widget.apiService.fetchStoryChapters(b.id);
    } catch (_) {}
    if (!context.mounted) return;

    int chapterIndex = 0;
    String chapterTitle = 'Chapter $chapterNumber';
    String chapterContent = '';

    if (chapters.isNotEmpty) {
      final idx = chapters.indexWhere(
        (c) => (c['chapter_number'] as num?)?.toInt() == chapterNumber,
      );
      chapterIndex = idx >= 0 ? idx : 0;
      final ch = chapters[chapterIndex];
      chapterNumber = (ch['chapter_number'] as num?)?.toInt() ?? chapterNumber;
      chapterTitle = (ch['title'] ?? chapterTitle).toString();
      chapterContent = (ch['content'] ?? '').toString();
    }

    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ChapterReaderScreen(
          apiService: widget.apiService,
          title: b.title,
          author: b.author,
          coverPath: b.coverPath,
          chapterNumber: chapterNumber,
          chapterTitle: chapterTitle,
          chapterContent: chapterContent,
          bookId: b.id,
          chapters: chapters,
          initialChapterIndex: chapterIndex,
          initialParagraphIndex: paragraphIndex,
          authorUserId: b.authorUserId,
        ),
      ),
    );
    // Refresh list after returning from reader
    if (mounted) _refresh();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    // Hide books the user already finished (all chapters / progress complete)
    final books = _items.where((e) {
      if (e.book.id <= 0) return false;
      final st = e.readingStatus.toLowerCase().trim();
      if (st == 'completed' || st == 'finished' || st == 'done') return false;
      if (st.contains('complete') || st.contains('finish')) return false;
      return true;
    }).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                'Continue Reading',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  fontSize: 18,
                  letterSpacing: -0.3,
                  color: isDark ? Colors.white : const Color(0xFF1A1A1A),
                ),
              ),
            ),
            if (_loading)
              const SizedBox(
                width: 14,
                height: 14,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            else
              IconButton(
                tooltip: 'Refresh',
                icon: const Icon(Icons.refresh_rounded, size: 18),
                onPressed: _refresh,
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
              ),
          ],
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 120,
          child: books.isEmpty
              ? Container(
                  width: double.infinity,
                  alignment: Alignment.centerLeft,
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: Text(
                    _loading
                        ? 'Loading your reading progress…'
                        : 'Start reading a story — it will show up here so you can continue later.',
                    style: TextStyle(
                      color: isDark ? Colors.white54 : Colors.black54,
                      fontSize: 13.5,
                      height: 1.35,
                    ),
                  ),
                )
              : ListView(
                  scrollDirection: Axis.horizontal,
                  children: [
                    for (final entry in books)
                      Padding(
                        padding: const EdgeInsets.only(right: 12),
                        child: GestureDetector(
                          onTap: () => _openResume(context, entry),
                          child: Container(
                            width: 260,
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: isDark
                                  ? const Color(0xFF17211D)
                                  : Colors.white,
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(
                                color: isDark
                                    ? const Color(0xFF2B3832)
                                    : const Color(0xFFDDE2DF),
                              ),
                              boxShadow: isDark
                                  ? const []
                                  : [
                                      BoxShadow(
                                        color: const Color(
                                          0xFF16856A,
                                        ).withValues(alpha: 0.06),
                                        blurRadius: 12,
                                        offset: const Offset(0, 4),
                                      ),
                                    ],
                            ),
                            child: Row(
                              children: [
                                ClipRRect(
                                  borderRadius: BorderRadius.circular(10),
                                  child: SizedBox(
                                    width: 64,
                                    height: 88,
                                    child: _continueCover(
                                      entry.book,
                                      w: 64,
                                      h: 88,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Text(
                                        entry.book.title,
                                        maxLines: 2,
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(
                                          fontSize: 14,
                                          fontWeight: FontWeight.w700,
                                          color: isDark
                                              ? Colors.white
                                              : const Color(0xFF1A1A1A),
                                          height: 1.2,
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        entry.updatedText.isNotEmpty
                                            ? entry.updatedText
                                            : 'Chapter ${entry.lastChapterNumber}',
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(
                                          fontSize: 12,
                                          color: isDark
                                              ? Colors.white60
                                              : Colors.grey.shade600,
                                        ),
                                      ),
                                      const SizedBox(height: 10),
                                      ClipRRect(
                                        borderRadius: BorderRadius.circular(4),
                                        child: LinearProgressIndicator(
                                          value: entry.progressFraction.clamp(
                                            0.05,
                                            1.0,
                                          ),
                                          minHeight: 6,
                                          backgroundColor: isDark
                                              ? Colors.white12
                                              : const Color(0xFFDDE2DF),
                                          color: const Color(0xFF16856A),
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Align(
                                        alignment: Alignment.centerRight,
                                        child: Text(
                                          '${(entry.progressFraction.clamp(0.0, 1.0) * 100).round()}%',
                                          style: const TextStyle(
                                            fontSize: 11,
                                            fontWeight: FontWeight.w600,
                                            color: Color(0xFF16856A),
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: Container(
                        width: 160,
                        height: 108,
                        decoration: BoxDecoration(
                          color: isDark
                              ? const Color(0xFF17211D)
                              : const Color(0xFFF6F5FA),
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(
                            color: isDark
                                ? const Color(0xFF2B3832)
                                : const Color(0xFFDDE2DF),
                          ),
                        ),
                        padding: const EdgeInsets.all(12),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              books.isEmpty
                                  ? "Stories you're reading will appear here"
                                  : 'Find more stories',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                fontSize: 12,
                                color: isDark ? Colors.white70 : Colors.black54,
                              ),
                            ),
                            const SizedBox(height: 10),
                            ElevatedButton.icon(
                              onPressed: widget.onBrowse,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFF1A1A1A),
                                foregroundColor: Colors.white,
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 8,
                                ),
                                minimumSize: const Size(0, 36),
                              ),
                              icon: const Icon(Icons.search, size: 16),
                              label: const Text(
                                'Browse stories',
                                style: TextStyle(fontSize: 12),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
        ),
      ],
    );
  }
}

class _BrowseGenresSection extends StatelessWidget {
  const _BrowseGenresSection({
    required this.books,
    required this.topics,
    required this.apiService,
  }) : onOpenExplore = null;

  final List<BookCardModel> books;
  final List<ExploreTopicModel> topics;
  final ApiService apiService;
  final VoidCallback? onOpenExplore;

  static const _palette = <Color>[
    Color(0xFFE14FA0),
    Color(0xFF16856A),
    Color(0xFF16856A),
    Color(0xFFF4CC2F),
    Color(0xFF5B9BD5),
    Color(0xFFE85D4C),
    Color(0xFF16856A),
    Color(0xFF2ECC71),
  ];

  @override
  Widget build(BuildContext context) {
    final genres = <String>[];
    final seen = <String>{};
    for (final b in books) {
      for (final g in [b.primaryGenre, b.secondaryGenre]) {
        final s = g.trim();
        if (s.isEmpty) continue;
        final key = s.toLowerCase();
        if (seen.contains(key)) continue;
        seen.add(key);
        genres.add(s);
        if (genres.length >= 12) break;
      }
      if (genres.length >= 12) break;
    }
    for (final t in topics) {
      final s = t.name.trim();
      if (s.isEmpty) continue;
      final key = s.toLowerCase();
      if (seen.contains(key)) continue;
      seen.add(key);
      genres.add(s);
      if (genres.length >= 12) break;
    }
    if (genres.isEmpty) return const SizedBox.shrink();

    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                'Browse genres',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                  fontSize: 17,
                  letterSpacing: -0.2,
                  color: isDark ? Colors.white : null,
                ),
              ),
            ),
            if (onOpenExplore != null)
              TextButton(
                onPressed: onOpenExplore,
                style: TextButton.styleFrom(
                  foregroundColor: AppTheme.brand,
                  padding: const EdgeInsets.only(left: 0, right: 8),
                  minimumSize: const Size(0, 32),
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: const Text(
                  'See all',
                  style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                ),
              ),
          ],
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 120,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: genres.length,
            separatorBuilder: (_, _) => const SizedBox(width: 10),
            itemBuilder: (context, index) {
              final label = genres[index];
              final color = _palette[index % _palette.length];
              // Prefer a cover from a book in this genre for Inkitt-style cards
              String coverPath = '';
              for (final b in books) {
                if (b.primaryGenre.toLowerCase().contains(
                      label.toLowerCase(),
                    ) ||
                    b.secondaryGenre.toLowerCase().contains(
                      label.toLowerCase(),
                    )) {
                  if (b.coverPath.isNotEmpty) {
                    coverPath = b.coverPath;
                    break;
                  }
                }
              }
              return GestureDetector(
                onTap: () async {
                  // Prefer API genre search, then local books filter
                  var tagged = <Map<String, dynamic>>[];
                  try {
                    tagged = await apiService.fetchBooksByGenre(label);
                  } catch (_) {}
                  if (tagged.isEmpty) {
                    try {
                      tagged = await apiService.searchStories(
                        query: '',
                        genre: label,
                      );
                    } catch (_) {}
                  }
                  if (tagged.isEmpty) {
                    try {
                      tagged = await apiService.fetchBooksByTag(label);
                    } catch (_) {}
                  }
                  if (tagged.isEmpty) {
                    tagged = books
                        .where((b) {
                          final g = label.toLowerCase();
                          return b.primaryGenre.toLowerCase().contains(g) ||
                              b.secondaryGenre.toLowerCase().contains(g);
                        })
                        .map(
                          (b) => {
                            'id': b.id,
                            'title': b.title,
                            'author': b.author,
                            'description': b.description,
                            'status_text': b.statusText,
                            'rating': b.rating,
                            'genre': b.primaryGenre,
                            'primary_genre': b.primaryGenre,
                            'cover_path': b.coverPath,
                            'cta_label': b.cta,
                            'author_user_id': b.authorUserId,
                          },
                        )
                        .toList();
                  }
                  if (!context.mounted) return;
                  await Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => GenreBooksScreen(
                        genre: label,
                        books: tagged,
                        apiService: apiService,
                        onExploreMore: onOpenExplore,
                      ),
                    ),
                  );
                },
                child: Container(
                  width: 160,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.12),
                        blurRadius: 8,
                        offset: const Offset(0, 3),
                      ),
                    ],
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      if (coverPath.isNotEmpty)
                        Image.network(
                          apiService.resolveAssetUrl(coverPath),
                          fit: BoxFit.cover,
                          errorBuilder: (_, _, _) => Container(color: color),
                        )
                      else
                        Container(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                              colors: [color, color.withValues(alpha: 0.7)],
                            ),
                          ),
                        ),
                      Container(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [
                              Colors.black.withValues(alpha: 0.2),
                              Colors.black.withValues(alpha: 0.7),
                            ],
                          ),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(12),
                        child: Align(
                          alignment: Alignment.bottomLeft,
                          child: Text(
                            label,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w800,
                              fontSize: 16,
                              height: 1.2,
                              shadows: [
                                Shadow(blurRadius: 6, color: Colors.black54),
                              ],
                            ),
                          ),
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
    );
  }
}

class _CategoryTabs extends StatelessWidget {
  const _CategoryTabs({required this.labels, required this.tabController});

  final List<String> labels;
  final TabController tabController;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 48,
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 12),
        scrollDirection: Axis.horizontal,
        itemCount: labels.length,
        separatorBuilder: (_, _) => const SizedBox(width: 20),
        itemBuilder: (context, index) {
          final isSelected = tabController.index == index;
          return GestureDetector(
            onTap: () => tabController.animateTo(index),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.end,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  labels[index],
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: isSelected
                        ? AppTheme.brand
                        : (Theme.of(context).brightness == Brightness.dark
                              ? Colors.white70
                              : AppTheme.mutedOf(context)),
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 6),
                AnimatedContainer(
                  duration: const Duration(milliseconds: 300),
                  height: 3,
                  width: isSelected
                      ? math.max(labels[index].length * 11.0, 60)
                      : 0,
                  color: isSelected ? AppTheme.brand : Colors.transparent,
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _TabBarDelegate extends SliverPersistentHeaderDelegate {
  final Widget child;

  _TabBarDelegate({required this.child});

  @override
  double get maxExtent => 64;

  @override
  double get minExtent => 64;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) {
    return child;
  }

  @override
  bool shouldRebuild(_TabBarDelegate oldDelegate) => false;
}

class _SectionBooksScreen extends StatelessWidget {
  const _SectionBooksScreen({
    required this.title,
    required this.books,
    required this.apiService,
  });

  final String title;
  final List<BookCardModel> books;
  final ApiService apiService;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0D1914) : null,
      appBar: AppBar(
        title: Text(
          title,
          style: TextStyle(color: isDark ? Colors.white : null),
        ),
        backgroundColor: isDark ? const Color(0xFF0D1914) : null,
        iconTheme: IconThemeData(color: isDark ? Colors.white : null),
      ),
      body: books.isEmpty
          ? Center(
              child: Text(
                'No stories in this section yet',
                style: TextStyle(color: isDark ? Colors.white70 : null),
              ),
            )
          : ListView.separated(
              padding: const EdgeInsets.all(12),
              itemCount: books.length,
              separatorBuilder: (_, _) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final item = books[index];
                final cover = item.coverPath;
                return ListTile(
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10),
                    side: BorderSide(
                      color: isDark
                          ? const Color(0xFF2C2C2C)
                          : const Color(0xFFE8E8E8),
                    ),
                  ),
                  onTap: () {
                    Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => StoryDetailScreen(
                          apiService: apiService,
                          book: BookDetailModel(
                            id: item.id,
                            title: item.title,
                            author: item.author,
                            description: item.description,
                            statusText: item.statusText,
                            rating: item.rating,
                            genre: item.primaryGenre,
                            cta: item.cta,
                            coverPath: item.coverPath,
                          ),
                        ),
                      ),
                    );
                  },
                  leading: SizedBox(
                    width: 40,
                    height: 56,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: cover.isNotEmpty
                          ? Image.network(
                              apiService.resolveAssetUrl(cover),
                              fit: BoxFit.cover,
                              errorBuilder: (_, _, _) => Image.asset(
                                CoverAssets.assetForSeed(item.id),
                                fit: BoxFit.cover,
                              ),
                            )
                          : Image.asset(
                              CoverAssets.assetForSeed(item.id),
                              fit: BoxFit.cover,
                            ),
                    ),
                  ),
                  title: Text(
                    item.title,
                    style: TextStyle(color: isDark ? Colors.white : null),
                  ),
                  subtitle: Text(
                    item.author,
                    style: TextStyle(color: isDark ? Colors.white70 : null),
                  ),
                );
              },
            ),
    );
  }
}

class _AuthorsSeeAllScreen extends StatelessWidget {
  const _AuthorsSeeAllScreen({required this.books, required this.apiService});
  final List<BookCardModel> books;
  final ApiService apiService;

  @override
  Widget build(BuildContext context) {
    final ranked = List<BookCardModel>.from(
      books.where((b) => b.author.trim().isNotEmpty),
    );
    ranked.sort((a, b) {
      int score(BookCardModel x) {
        var s = 0;
        if (x.authorUserId != null && x.authorUserId! > 0) s += 1;
        if (x.isCompleted) s += 2;
        return s;
      }

      return score(b).compareTo(score(a));
    });
    final byAuthor = <String, BookCardModel>{};
    for (final book in ranked) {
      final name = book.author.trim().isEmpty ? 'Unknown' : book.author;
      byAuthor.putIfAbsent(name, () => book);
    }
    final authors = byAuthor.entries.toList();
    return Scaffold(
      appBar: AppBar(title: const Text('Authors')),
      body: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: authors.length,
        separatorBuilder: (_, _) => const Divider(height: 1),
        itemBuilder: (context, index) {
          final author = authors[index].key;
          final book = authors[index].value;
          final authorId = book.authorUserId;
          return ListTile(
            leading: CircleAvatar(
              child: Text(author.isNotEmpty ? author[0].toUpperCase() : 'A'),
            ),
            title: Text(author),
            subtitle: Text(
              book.title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            onTap: authorId == null
                ? null
                : () {
                    Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => ProfileScreen(
                          apiService: apiService,
                          viewingUserId: authorId,
                          achievements: const [],
                          profile: ProfileModel(
                            id: authorId,
                            displayName: author,
                            username: author.toLowerCase().replaceAll(' ', ''),
                            photoUrl: book.authorPhotoUrl ?? '',
                            coverUrl: '',
                            following: 0,
                            followers: 0,
                            blocked: 0,
                            chaptersRead: 0,
                            socialKarma: 0,
                            dayStreak: 0,
                            readingLists: const [],
                          ),
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

// ─── Home (Inkitt-style) UI-only sections ───────────────────────────────────

class _HomeSectionHeader extends StatelessWidget {
  const _HomeSectionHeader({required this.title, this.onSeeAll});

  final String title;
  final VoidCallback? onSeeAll;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Row(
      children: [
        Container(
          width: 4,
          height: 18,
          margin: const EdgeInsets.only(right: 10),
          decoration: BoxDecoration(
            color: AppTheme.brand,
            borderRadius: BorderRadius.circular(4),
          ),
        ),
        Expanded(
          child: Text(
            title,
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.3,
              color: isDark ? Colors.white : AppTheme.inkOf(context),
            ),
          ),
        ),
        if (onSeeAll != null)
          TextButton(
            onPressed: onSeeAll,
            style: TextButton.styleFrom(
              foregroundColor: AppTheme.brand,
              padding: const EdgeInsets.symmetric(horizontal: 8),
              minimumSize: Size.zero,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            child: const Text(
              'See All',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
            ),
          ),
      ],
    );
  }
}

class _HomeFeaturedBanner extends StatefulWidget {
  const _HomeFeaturedBanner({required this.books, required this.apiService});

  final List<BookCardModel> books;
  final ApiService apiService;

  @override
  State<_HomeFeaturedBanner> createState() => _HomeFeaturedBannerState();
}

class _HomeFeaturedBannerState extends State<_HomeFeaturedBanner> {
  Timer? _rotationTimer;
  int _currentIndex = 0;

  @override
  void initState() {
    super.initState();
    _startRotation();
  }

  @override
  void didUpdateWidget(covariant _HomeFeaturedBanner oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.books != widget.books) {
      _currentIndex = 0;
      _startRotation();
    }
  }

  void _startRotation() {
    _rotationTimer?.cancel();
    if (widget.books.length > 1) {
      _rotationTimer = Timer.periodic(const Duration(seconds: 6), (_) {
        if (!mounted || widget.books.length < 2) return;
        final next = (_currentIndex + 1) % widget.books.length;
        setState(() => _currentIndex = next);
      });
    }
  }

  @override
  void dispose() {
    _rotationTimer?.cancel();
    super.dispose();
  }

  void _open(BuildContext context, BookCardModel book) {
    if (book.id <= 0) return;
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => StoryDetailScreen(
          apiService: widget.apiService,
          book: BookDetailModel(
            id: book.id,
            title: book.title,
            author: book.author,
            description: book.description,
            statusText: book.statusText,
            rating: book.rating,
            genre: book.primaryGenre,
            cta: 'Read Now',
            coverPath: book.coverPath,
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final books = widget.books;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    if (books.isEmpty) return const SizedBox.shrink();
    final book = books[_currentIndex.clamp(0, books.length - 1)];

    final title = book.title;
    final desc = book.description;
    final cover = book.coverPath;
    final genre = book.primaryGenre;
    final coverUrl = cover.isEmpty
        ? null
        : widget.apiService.resolveAssetUrl(cover);

    final colors = AppStyles.colors(context);

    return Container(
      constraints: const BoxConstraints(minHeight: 192),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: colors.border),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: isDark
              ? const [Color(0xFF192A23), Color(0xFF0D1914)]
              : const [Color(0xFFFFFFFF), Color(0xFFF6F5FA)],
        ),
        boxShadow: [
          BoxShadow(
            color: const Color(
              0xFF16856A,
            ).withValues(alpha: isDark ? 0.2 : 0.08),
            blurRadius: 28,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          if (coverUrl != null)
            Positioned(
              right: -20,
              top: -10,
              bottom: -10,
              width: 160,
              child: Opacity(
                opacity: isDark ? 0.68 : 0.24,
                child: Image.network(
                  coverUrl,
                  fit: BoxFit.cover,
                  errorBuilder: (_, _, _) => const SizedBox.shrink(),
                ),
              ),
            ),
          // Soft fade over image
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.centerLeft,
                  end: Alignment.centerRight,
                  colors: [
                    colors.card.withValues(alpha: 0.98),
                    colors.card.withValues(alpha: 0.82),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 19),
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 450),
              child: Column(
                key: ValueKey<int>(book.id),
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'PICKED FOR YOU',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1.2,
                      color: colors.brand,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                      height: 1.15,
                      color: colors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 6),
                  if (desc.trim().isNotEmpty)
                    Text(
                      desc,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 13,
                        height: 1.3,
                        color: colors.textMuted,
                      ),
                    ),
                  const SizedBox(height: 12),
                  if (genre.trim().isNotEmpty) ...[
                    Wrap(
                      spacing: 6,
                      children: [
                        for (final g in genre.split(RegExp(r'[,/|]')))
                          if (g.trim().isNotEmpty)
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 4,
                              ),
                              decoration: BoxDecoration(
                                color: colors.brandSoft,
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: Text(
                                g.trim(),
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                  color: colors.brand,
                                ),
                              ),
                            ),
                      ],
                    ),
                    const SizedBox(height: 10),
                  ],
                  FilledButton(
                    onPressed: () => _open(context, book),
                    style: FilledButton.styleFrom(
                      backgroundColor: colors.brand,
                      foregroundColor: Colors.white,
                      minimumSize: const Size(0, 40),
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 18,
                        vertical: 10,
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(24),
                      ),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          'Read Now',
                          style: TextStyle(fontWeight: FontWeight.w700),
                        ),
                        SizedBox(width: 4),
                        Icon(Icons.arrow_forward_rounded, size: 16),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _HomeRecommendedRail extends StatefulWidget {
  const _HomeRecommendedRail({required this.books, required this.apiService});

  final List<BookCardModel> books;
  final ApiService apiService;

  @override
  State<_HomeRecommendedRail> createState() => _HomeRecommendedRailState();
}

class _HomeRecommendedRailState extends State<_HomeRecommendedRail> {
  late final PageController _pageController;
  int _activeIndex = 0;

  @override
  void initState() {
    super.initState();
    _pageController = PageController(viewportFraction: 0.40, initialPage: 0);
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  void _openBook(BookCardModel book) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => StoryDetailScreen(
          apiService: widget.apiService,
          book: BookDetailModel(
            id: book.id,
            title: book.title,
            author: book.author,
            description: book.description,
            statusText: book.statusText,
            rating: book.rating,
            genre: book.primaryGenre,
            cta: book.cta.isNotEmpty ? book.cta : 'Read Now',
            coverPath: book.coverPath,
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final valid = widget.books
        .where((b) => b.id > 0 && b.title.trim().isNotEmpty)
        .toList();
    if (valid.isEmpty) {
      return const SizedBox(
        height: 40,
        child: Center(child: Text('No recommendations yet')),
      );
    }
    final book = valid[_activeIndex.clamp(0, valid.length - 1)];
    final cardWidth = _storyRailActiveWidth(context);

    // Cover-only scale-up (like other section sliders).
    // Title, summary, genres, CTA live in _ActiveStoryDetail below — not on the card.
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          height: cardWidth * 1.42 + 16,
          child: PageView.builder(
            controller: _pageController,
            padEnds: false,
            itemCount: valid.length + 1,
            onPageChanged: (i) {
              if (i >= valid.length) return;
              setState(() => _activeIndex = i);
            },
            itemBuilder: (context, index) {
              if (index >= valid.length) return const SizedBox.shrink();
              final item = valid[index];
              return AnimatedScale(
                scale: index == _activeIndex ? 1 : .93,
                duration: const Duration(milliseconds: 340),
                curve: Curves.easeOutBack,
                child: AnimatedOpacity(
                  opacity: index == _activeIndex ? 1 : .82,
                  duration: const Duration(milliseconds: 280),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 300),
                    curve: Curves.easeOutCubic,
                    margin: EdgeInsets.symmetric(vertical: 0, horizontal: 4),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(14),
                      boxShadow: index == _activeIndex
                          ? [
                              BoxShadow(
                                color: AppTheme.brand.withValues(alpha: 0.28),
                                blurRadius: 22,
                                offset: const Offset(0, 10),
                              ),
                            ]
                          : [],
                    ),
                    child: GestureDetector(
                      onTap: () {
                        if (index != _activeIndex) {
                          _pageController.animateToPage(
                            index,
                            duration: const Duration(milliseconds: 320),
                            curve: Curves.easeOutCubic,
                          );
                        } else {
                          _openBook(item);
                        }
                      },
                      child: Center(
                        child: _StoryCard(
                          book: item,
                          width: cardWidth,
                          apiService: widget.apiService,
                        ),
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 12),
        _ActiveStoryDetail(
          book: book,
          apiService: widget.apiService,
          onRead: () => _openBook(book),
        ),
      ],
    );
  }
}

class _HomeTopGenresRow extends StatelessWidget {
  const _HomeTopGenresRow({
    required this.topics,
    required this.books,
    required this.apiService,
  });

  final List<ExploreTopicModel> topics;
  final List<BookCardModel> books;
  final ApiService apiService;

  static const _icons = <String, IconData>{
    'romance': Icons.favorite_border_rounded,
    'fantasy': Icons.castle_outlined,
    'werewolf': Icons.pets_outlined,
    'billionaire': Icons.diamond_outlined,
    'mystery': Icons.search_rounded,
    'young adult': Icons.auto_stories_outlined,
    'sci-fi': Icons.rocket_launch_outlined,
    'horror': Icons.nightlight_round,
    'thriller': Icons.bolt_outlined,
    'action': Icons.sports_martial_arts_outlined,
  };

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    // Prefer explore topics; else derive from books
    final names = <String>[];
    if (topics.isNotEmpty) {
      for (final t in topics) {
        if (t.name.trim().isNotEmpty) names.add(t.name.trim());
      }
    }
    if (names.isEmpty) {
      final seen = <String>{};
      for (final b in books) {
        final g = b.primaryGenre.trim();
        if (g.isNotEmpty && seen.add(g.toLowerCase())) names.add(g);
        if (names.length >= 8) break;
      }
    }
    if (names.isEmpty) {
      names.addAll([
        'Romance',
        'Fantasy',
        'Mystery',
        'Sci-Fi',
        'Horror',
        'Action',
      ]);
    }

    return ConstrainedBox(
      constraints: const BoxConstraints(maxHeight: 112),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final availableWidth = constraints.maxWidth.isFinite
              ? constraints.maxWidth
              : MediaQuery.sizeOf(context).width;
          final itemWidth = (availableWidth / names.length.clamp(1, 4)).clamp(
            72.0,
            94.0,
          );
          return SizedBox(
            height: 112,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: names.length.clamp(0, 10),
              separatorBuilder: (_, _) => const SizedBox(width: 10),
              itemBuilder: (context, index) {
                final name = names[index];
                final key = name.toLowerCase();
                IconData icon = Icons.menu_book_outlined;
                for (final e in _icons.entries) {
                  if (key.contains(e.key)) {
                    icon = e.value;
                    break;
                  }
                }
                return GestureDetector(
                  onTap: () {
                    final filtered = books
                        .where(
                          (b) =>
                              b.primaryGenre.toLowerCase().contains(
                                name.toLowerCase(),
                              ) ||
                              b.secondaryGenre.toLowerCase().contains(
                                name.toLowerCase(),
                              ),
                        )
                        .map(
                          (b) => {
                            'id': b.id,
                            'title': b.title,
                            'author': b.author,
                            'description': b.description,
                            'cover_path': b.coverPath,
                            'status_text': b.statusText,
                            'rating': b.rating,
                            'genre': b.primaryGenre,
                            'primary_genre': b.primaryGenre,
                            'author_user_id': b.authorUserId,
                            'cta_label': b.cta,
                          },
                        )
                        .toList();
                    Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => GenreBooksScreen(
                          genre: name,
                          books: filtered,
                          apiService: apiService,
                        ),
                      ),
                    );
                  },
                  child: Container(
                    width: itemWidth,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 6,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      color: isDark
                          ? const Color(0xFF17211D)
                          : const Color(0xFFF6F5FA),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: isDark
                            ? const Color(0xFF2B3832)
                            : const Color(0xFFDDE2DF),
                      ),
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(icon, color: const Color(0xFF16856A), size: 24),
                        const SizedBox(height: 8),
                        Text(
                          name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 10.5,
                            fontWeight: FontWeight.w600,
                            color: isDark
                                ? Colors.white70
                                : const Color(0xFF3A3A3A),
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}

class _HomeCategoryGrid extends StatelessWidget {
  const _HomeCategoryGrid({
    required this.topics,
    required this.books,
    required this.apiService,
  });

  final List<ExploreTopicModel> topics;
  final List<BookCardModel> books;
  final ApiService apiService;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final names = <String>[];

    if (topics.isNotEmpty) {
      for (final topic in topics) {
        final name = topic.name.trim();
        if (name.isNotEmpty && !names.contains(name)) {
          names.add(name);
        }
      }
    }

    if (names.length < 6) {
      final seed = <String>[
        'Fantasy',
        'Romance',
        'Mystery',
        'Sci-Fi',
        'Horror',
        'Adventure',
        'Young Adult',
        'Thriller',
        'Drama',
        'Action',
      ];
      for (final name in seed) {
        if (!names.contains(name)) {
          names.add(name);
        }
        if (names.length >= 8) break;
      }
    }

    if (names.isEmpty) {
      names.addAll(const [
        'Fantasy',
        'Romance',
        'Mystery',
        'Adventure',
        'Thriller',
        'Drama',
      ]);
    }

    return GridView.builder(
      itemCount: names.length.clamp(0, 8),
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        mainAxisSpacing: 10,
        crossAxisSpacing: 10,
        mainAxisExtent: 72,
      ),
      itemBuilder: (context, index) {
        final name = names[index];
        final genreBooks = books
            .where(
              (book) =>
                  book.primaryGenre.toLowerCase().contains(
                    name.toLowerCase(),
                  ) ||
                  book.secondaryGenre.toLowerCase().contains(
                    name.toLowerCase(),
                  ),
            )
            .toList();

        final icon = switch (name.toLowerCase()) {
          'romance' => Icons.favorite_border_rounded,
          'fantasy' => Icons.auto_awesome_outlined,
          'mystery' => Icons.search_rounded,
          'sci-fi' || 'scifi' => Icons.rocket_launch_outlined,
          'horror' => Icons.nightlight_round,
          'adventure' => Icons.explore_outlined,
          'thriller' => Icons.bolt_outlined,
          'drama' => Icons.theater_comedy_outlined,
          'action' => Icons.sports_martial_arts_outlined,
          'young adult' => Icons.school_outlined,
          _ => Icons.menu_book_rounded,
        };

        return GestureDetector(
          onTap: () {
            final booksForGenre = genreBooks.isNotEmpty
                ? genreBooks
                : books.where((book) => book.primaryGenre.isNotEmpty).toList();
            Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => GenreBooksScreen(
                  genre: name,
                  books: booksForGenre
                      .map(
                        (b) => {
                          'id': b.id,
                          'title': b.title,
                          'author': b.author,
                          'description': b.description,
                          'cover_path': b.coverPath,
                          'status_text': b.statusText,
                          'rating': b.rating,
                          'genre': b.primaryGenre,
                          'primary_genre': b.primaryGenre,
                          'author_user_id': b.authorUserId,
                          'cta_label': b.cta,
                        },
                      )
                      .toList(),
                  apiService: apiService,
                ),
              ),
            );
          },
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF1A1A1A) : const Color(0xFFF6F5FA),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: isDark
                    ? const Color(0xFF2B3832)
                    : const Color(0xFFF6F5FA),
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: const Color(0xFF16856A).withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(icon, size: 18, color: const Color(0xFF16856A)),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerLeft,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: isDark
                                ? Colors.white
                                : const Color(0xFF1A1A1A),
                          ),
                        ),
                        Text(
                          '${genreBooks.length} stories',
                          style: TextStyle(
                            fontSize: 11,
                            color: isDark
                                ? Colors.white60
                                : Colors.grey.shade600,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _HomeTrendingList extends StatelessWidget {
  const _HomeTrendingList({required this.books, required this.apiService});

  final List<BookCardModel> books;
  final ApiService apiService;

  @override
  Widget build(BuildContext context) {
    final valid = books
        .where((b) => b.id > 0 && b.title.trim().isNotEmpty)
        .toList();
    if (valid.isEmpty) return const SizedBox.shrink();
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Column(
      children: [
        for (var i = 0; i < valid.length && i < 5; i++) ...[
          if (i > 0) const SizedBox(height: 10),
          GestureDetector(
            onTap: () {
              final b = valid[i];
              Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => StoryDetailScreen(
                    apiService: apiService,
                    book: BookDetailModel(
                      id: b.id,
                      title: b.title,
                      author: b.author,
                      description: b.description,
                      statusText: b.statusText,
                      rating: b.rating,
                      genre: b.primaryGenre,
                      cta: b.cta,
                      coverPath: b.coverPath,
                      authorUserId: b.authorUserId,
                    ),
                  ),
                ),
              );
            },
            child: Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: isDark ? const Color(0xFF1A1A1A) : Colors.white,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: isDark
                      ? const Color(0xFF2B3832)
                      : const Color(0xFFDDE2DF),
                ),
              ),
              child: Row(
                children: [
                  // Rank badge
                  Container(
                    width: 28,
                    height: 28,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: const Color(0xFF16856A),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      '${i + 1}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 13,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: SizedBox(
                      width: 48,
                      height: 64,
                      child: valid[i].coverPath.isNotEmpty
                          ? Image.network(
                              apiService.resolveAssetUrl(valid[i].coverPath),
                              fit: BoxFit.cover,
                              errorBuilder: (_, _, _) => Container(
                                color: const Color(0xFFDDE2DF),
                                child: const Icon(Icons.menu_book, size: 20),
                              ),
                            )
                          : Container(
                              color: const Color(0xFFDDE2DF),
                              child: const Icon(Icons.menu_book, size: 20),
                            ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          valid[i].title,
                          maxLines: 1,
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
                        if (valid[i].primaryGenre.isNotEmpty)
                          Text(
                            valid[i].primaryGenre,
                            style: TextStyle(
                              fontSize: 12,
                              color: isDark
                                  ? Colors.white60
                                  : Colors.grey.shade600,
                            ),
                          ),
                        const SizedBox(height: 4),
                        if (valid[i].description.trim().isNotEmpty)
                          Text(
                            valid[i].description,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 12,
                              color: isDark
                                  ? Colors.white54
                                  : Colors.grey.shade500,
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 6),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Row(
                        children: [
                          Icon(
                            Icons.visibility_outlined,
                            size: 12,
                            color: isDark
                                ? Colors.white54
                                : Colors.grey.shade500,
                          ),
                          const SizedBox(width: 3),
                          Text(
                            valid[i].viewCount > 0
                                ? (valid[i].viewCount >= 1000
                                      ? '${(valid[i].viewCount / 1000).toStringAsFixed(1)}K'
                                      : '${valid[i].viewCount}')
                                : '—',
                            style: TextStyle(
                              fontSize: 11,
                              color: isDark
                                  ? Colors.white54
                                  : Colors.grey.shade500,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Icon(
                            Icons.star_rounded,
                            size: 13,
                            color: AppTheme.amber,
                          ),
                          const SizedBox(width: 2),
                          Text(
                            valid[i].rating > 0
                                ? valid[i].rating.toStringAsFixed(1)
                                : '—',
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }
}

/// Full list of genres/categories only (not hashtags).
/// Tap a genre → books for that genre → tap book → StoryDetailScreen.
class _AllGenresScreen extends StatefulWidget {
  const _AllGenresScreen({
    required this.topics,
    required this.books,
    required this.apiService,
  });

  final List<ExploreTopicModel> topics;
  final List<BookCardModel> books;
  final ApiService apiService;

  @override
  State<_AllGenresScreen> createState() => _AllGenresScreenState();
}

class _AllGenresScreenState extends State<_AllGenresScreen> {
  List<String> _genres = const [];
  bool _loading = true;

  static const _icons = <String, IconData>{
    'romance': Icons.favorite_border_rounded,
    'fantasy': Icons.castle_outlined,
    'werewolf': Icons.pets_outlined,
    'mystery': Icons.search_rounded,
    'young adult': Icons.auto_stories_outlined,
    'sci-fi': Icons.rocket_launch_outlined,
    'scifi': Icons.rocket_launch_outlined,
    'horror': Icons.nightlight_round,
    'thriller': Icons.bolt_outlined,
    'action': Icons.sports_martial_arts_outlined,
    'adventure': Icons.explore_outlined,
    'drama': Icons.theater_comedy_outlined,
    'poetry': Icons.menu_book_outlined,
    'humor': Icons.sentiment_satisfied_alt_outlined,
    'paranormal': Icons.auto_awesome_outlined,
    'historical': Icons.account_balance_outlined,
    'lgbtq': Icons.diversity_3_outlined,
  };

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final seen = <String>{};
    final names = <String>[];

    void add(String raw) {
      final n = raw.trim();
      if (n.isEmpty) return;
      final key = n.toLowerCase();
      if (seen.add(key)) names.add(n);
    }

    // 1) Explore categories from bootstrap (admin categories)
    for (final t in widget.topics) {
      add(t.name);
    }
    // 2) Genres present on books
    for (final b in widget.books) {
      add(b.primaryGenre);
      add(b.secondaryGenre);
    }
    // 3) Server genre list if available
    try {
      final remote = await widget.apiService.fetchGenres();
      for (final g in remote) {
        add(g);
      }
    } catch (_) {}

    if (names.isEmpty) {
      names.addAll([
        'Romance',
        'Fantasy',
        'Mystery',
        'SciFi',
        'Horror',
        'Action',
        'Adventure',
        'Drama',
        'Thriller',
      ]);
    }

    names.sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));
    if (!mounted) return;
    setState(() {
      _genres = names;
      _loading = false;
    });
  }

  int _countFor(String genre) {
    final g = genre.toLowerCase();
    return widget.books.where((b) {
      final pg = b.primaryGenre.toLowerCase().trim();
      final sg = b.secondaryGenre.toLowerCase().trim();
      return pg == g || sg == g || pg.contains(g) || sg.contains(g);
    }).length;
  }

  void _openGenre(String genre) {
    final g = genre.toLowerCase();
    final filtered = widget.books
        .where((b) {
          final pg = b.primaryGenre.toLowerCase().trim();
          final sg = b.secondaryGenre.toLowerCase().trim();
          return pg == g || sg == g || pg.contains(g) || sg.contains(g);
        })
        .map(
          (b) => {
            'id': b.id,
            'title': b.title,
            'author': b.author,
            'description': b.description,
            'status_text': b.statusText,
            'rating': b.rating,
            'genre': b.primaryGenre,
            'primary_genre': b.primaryGenre,
            'secondary_genre': b.secondaryGenre,
            'cover_path': b.coverPath,
            'is_completed': b.isCompleted,
          },
        )
        .toList();

    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => GenreBooksScreen(
          genre: genre,
          books: filtered,
          apiService: widget.apiService,
        ),
      ),
    );
  }

  IconData _iconFor(String name) {
    final key = name.toLowerCase();
    for (final e in _icons.entries) {
      if (key.contains(e.key)) return e.value;
    }
    return Icons.menu_book_outlined;
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0D1914) : Colors.white,
      appBar: AppBar(
        title: const Text(
          'Genres',
          style: TextStyle(fontWeight: FontWeight.w800),
        ),
        backgroundColor: isDark ? const Color(0xFF0D1914) : Colors.white,
        foregroundColor: isDark ? Colors.white : Colors.black87,
        elevation: 0,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
              itemCount: _genres.length,
              separatorBuilder: (_, _) => Divider(
                height: 1,
                color: isDark
                    ? const Color(0xFF2B3832)
                    : const Color(0xFFEEEEEE),
              ),
              itemBuilder: (context, index) {
                final name = _genres[index];
                final count = _countFor(name);
                return ListTile(
                  contentPadding: const EdgeInsets.symmetric(vertical: 6),
                  leading: Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: isDark
                          ? const Color(0xFF17211D)
                          : const Color(0xFFF6F5FA),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(
                      _iconFor(name),
                      color: const Color(0xFF16856A),
                      size: 22,
                    ),
                  ),
                  title: Text(
                    name,
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 16,
                      color: isDark ? Colors.white : const Color(0xFF1A1A1A),
                    ),
                  ),
                  subtitle: Text(
                    count > 0
                        ? '$count ${count == 1 ? 'story' : 'stories'}'
                        : 'Browse stories',
                    style: TextStyle(
                      fontSize: 13,
                      color: isDark ? Colors.white54 : Colors.grey.shade600,
                    ),
                  ),
                  trailing: Icon(
                    Icons.chevron_right_rounded,
                    color: isDark ? Colors.white38 : Colors.black38,
                  ),
                  onTap: () => _openGenre(name),
                );
              },
            ),
    );
  }
}
