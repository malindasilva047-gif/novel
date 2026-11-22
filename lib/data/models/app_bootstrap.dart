class AppBootstrap {
  const AppBootstrap({
    required this.discoverTabs,
    required this.recentlyUpdated,
    required this.recentlyCompleted,
    required this.discoverBooks,
    this.recommendations = const [],
    required this.featuredBook,
    required this.exploreTopics,
    required this.libraryEntries,
    required this.writeScreen,
    required this.notifications,
    required this.menuSections,
    required this.profile,
    required this.achievements,
  });

  final List<String> discoverTabs;
  final List<BookCardModel> recentlyUpdated;
  final List<BookCardModel> recentlyCompleted;
  final List<BookCardModel> discoverBooks;
  final List<BookCardModel> recommendations;
  final BookDetailModel featuredBook;
  final List<ExploreTopicModel> exploreTopics;
  final List<LibraryEntryModel> libraryEntries;
  final WriteScreenModel writeScreen;
  final List<NotificationModel> notifications;
  final List<MenuSectionModel> menuSections;
  final ProfileModel profile;
  final List<AchievementGroupModel> achievements;

  factory AppBootstrap.fromMap(Map<String, dynamic> data) {
    List<dynamic> asList(String key) {
      final v = data[key];
      if (v is List) return v;
      return const <dynamic>[];
    }

    Map<String, dynamic> asMap(String key) {
      final v = data[key];
      if (v is Map<String, dynamic>) return v;
      if (v is Map) return Map<String, dynamic>.from(v);
      return <String, dynamic>{};
    }

    final featuredRaw = asMap('featured_book');
    if (featuredRaw.isEmpty) {
      featuredRaw.addAll(<String, dynamic>{
        'id': 0,
        'title': '',
        'author': '',
        'description': '',
        'status_text': '',
        'rating': 0,
        'genre': '',
        'cta': 'Read now',
      });
    }

    return AppBootstrap(
      discoverTabs: List<String>.from(
        asList('discover_tabs').map((e) => e.toString()),
      ),
      recentlyUpdated: asList('recently_updated')
          .whereType<Map>()
          .map((item) => BookCardModel.fromMap(Map<String, dynamic>.from(item)))
          .toList(),
      recentlyCompleted: asList('recently_completed')
          .whereType<Map>()
          .map((item) => BookCardModel.fromMap(Map<String, dynamic>.from(item)))
          .toList(),
      discoverBooks: asList('discover_books')
          .whereType<Map>()
          .map((item) => BookCardModel.fromMap(Map<String, dynamic>.from(item)))
          .toList(),
      recommendations: asList('recommendations')
          .whereType<Map>()
          .map((item) => BookCardModel.fromMap(Map<String, dynamic>.from(item)))
          .toList(),
      featuredBook: BookDetailModel.fromMap(featuredRaw),
      exploreTopics: asList('explore_topics')
          .whereType<Map>()
          .map(
            (item) =>
                ExploreTopicModel.fromMap(Map<String, dynamic>.from(item)),
          )
          .toList(),
      libraryEntries: asList('library_entries')
          .whereType<Map>()
          .map(
            (item) =>
                LibraryEntryModel.fromMap(Map<String, dynamic>.from(item)),
          )
          .toList(),
      writeScreen: WriteScreenModel.fromMap(
        asMap('write_screen').isEmpty
            ? <String, dynamic>{
                'manage_tabs': <String>['Manage Stories', 'Analytics'],
                'story_tabs': <String>['Published', 'Drafts'],
                'filter_label': 'All stories',
                'sort_label': 'Recently Updated',
                'empty_title': "You haven't published any stories yet",
                'empty_cta': 'Write a Story',
              }
            : asMap('write_screen'),
      ),
      notifications: asList('notifications')
          .whereType<Map>()
          .map(
            (item) =>
                NotificationModel.fromMap(Map<String, dynamic>.from(item)),
          )
          .toList(),
      menuSections: asList('menu_sections')
          .whereType<Map>()
          .map(
            (item) => MenuSectionModel.fromMap(Map<String, dynamic>.from(item)),
          )
          .toList(),
      profile: ProfileModel.fromMap(
        asMap('profile').isEmpty
            ? <String, dynamic>{
                'display_name': 'Reader',
                'username': '@reader',
                'following': 0,
                'followers': 0,
                'blocked': 0,
                'chapters_read': 0,
                'social_karma': 0,
                'day_streak': 0,
                'reading_lists': <dynamic>[],
              }
            : asMap('profile'),
      ),
      achievements: asList('achievements')
          .whereType<Map>()
          .map(
            (item) =>
                AchievementGroupModel.fromMap(Map<String, dynamic>.from(item)),
          )
          .toList(),
    );
  }
}

class BookCardModel {
  const BookCardModel({
    required this.id,
    required this.title,
    required this.author,
    this.authorUserId,
    this.authorPhotoUrl,
    required this.coverPath,
    required this.accentHex,
    required this.description,
    required this.statusText,
    required this.rating,
    required this.primaryGenre,
    required this.secondaryGenre,
    required this.sectionName,
    required this.isCompleted,
    required this.cta,
    this.viewCount = 0,
    this.likesCount = 0,
  });

  final int id;
  final String title;
  final String author;
  final int? authorUserId;
  final String? authorPhotoUrl;
  final String coverPath;
  final String accentHex;
  final String description;
  final String statusText;
  final double rating;
  final String primaryGenre;
  final String secondaryGenre;
  final String sectionName;
  final bool isCompleted;
  final String cta;
  final int viewCount;
  final int likesCount;

  factory BookCardModel.fromMap(Map<String, dynamic> map) {
    return BookCardModel(
      id: (map['id'] as num?)?.toInt() ?? 0,
      title: map['title']?.toString() ?? '',
      author: map['author'] as String? ?? '',
      authorUserId:
          (map['author_user_id'] as num?)?.toInt() ??
          (map['user_id'] as num?)?.toInt(),
      authorPhotoUrl:
          (map['author_photo_url'] as String?) ??
          (map['author_photo'] as String?) ??
          (map['photo_url'] as String?),
      coverPath: map['cover_path'] as String? ?? '',
      accentHex: map['accent_hex'] as String? ?? '#A1A1A1',
      description: map['description'] as String? ?? '',
      statusText: map['status_text'] as String? ?? '',
      rating: ((map['rating'] as num?) ?? 0).toDouble(),
      primaryGenre:
          map['primary_genre'] as String? ?? map['genre'] as String? ?? '',
      secondaryGenre: map['secondary_genre'] as String? ?? '',
      sectionName: map['section_name'] as String? ?? '',
      isCompleted:
          map['is_completed'] == true ||
          map['is_completed'] == 1 ||
          map['is_completed'] == '1' ||
          map['is_completed'] == 'true',
      cta: map['cta_label'] as String? ?? map['cta'] as String? ?? 'Read now',
      viewCount:
          (map['view_count'] as num?)?.toInt() ??
          (map['views'] as num?)?.toInt() ??
          0,
      likesCount:
          (map['likes_count'] as num?)?.toInt() ??
          (map['likes'] as num?)?.toInt() ??
          0,
    );
  }
}

class BookDetailModel {
  const BookDetailModel({
    required this.id,
    required this.title,
    required this.author,
    required this.description,
    required this.statusText,
    required this.rating,
    required this.genre,
    required this.cta,
    this.coverPath = '',
    this.tags = const [],
    this.authorUserId,
    this.contentWarnings = '',
    this.lastUpdated = '',
    this.viewCount = 0,
  });

  final int id;
  final String title;
  final String author;
  final String description;
  final String statusText;
  final double rating;
  final String genre;
  final String cta;
  final String coverPath;
  final List<String> tags;
  final int? authorUserId;
  final int viewCount;

  /// Free-text content warnings, e.g. "child abuse, drug use overdose".
  final String contentWarnings;
  final String lastUpdated;

  factory BookDetailModel.fromMap(Map<String, dynamic> map) {
    final warningsRaw =
        map['content_warnings'] ??
        map['content_warning'] ??
        map['warnings'] ??
        '';
    String warnings = '';
    if (warningsRaw is List) {
      warnings = warningsRaw
          .map((e) => e.toString())
          .where((e) => e.isNotEmpty)
          .join(', ');
    } else {
      warnings = warningsRaw.toString();
    }
    return BookDetailModel(
      id: (map['id'] as num?)?.toInt() ?? 0,
      title: map['title'] as String? ?? 'Untitled',
      author: () {
        final a = (map['author'] as String?)?.trim() ?? '';
        final d = (map['author_display_name'] as String?)?.trim() ?? '';
        if (d.isNotEmpty &&
            (a.isEmpty ||
                a.toLowerCase() == 'author' ||
                a.toLowerCase() == 'unknown')) {
          return d;
        }
        if (d.isNotEmpty) return d;
        return a.isEmpty ? 'Author' : a;
      }(),
      description: map['description'] as String? ?? '',
      statusText: map['status_text'] as String? ?? '',
      rating: (map['rating'] as num?)?.toDouble() ?? 0.0,
      genre: map['genre'] as String? ?? map['primary_genre'] as String? ?? '',
      cta: map['cta'] as String? ?? map['cta_label'] as String? ?? 'Read now',
      coverPath: map['cover_path'] as String? ?? '',
      tags: List<String>.from(map['tags'] as List<dynamic>? ?? <dynamic>[]),
      authorUserId:
          (map['author_user_id'] as num?)?.toInt() ??
          (map['user_id'] as num?)?.toInt(),
      contentWarnings: warnings,
      viewCount:
          (map['view_count'] as num?)?.toInt() ??
          (map['views'] as num?)?.toInt() ??
          0,
      lastUpdated:
          (map['last_updated'] ??
                  map['updated_at'] ??
                  map['updated_text'] ??
                  '')
              .toString(),
    );
  }
}

class ExploreTopicModel {
  const ExploreTopicModel({required this.name, required this.topicCount});

  final String name;
  final int topicCount;

  factory ExploreTopicModel.fromMap(Map<String, dynamic> map) {
    return ExploreTopicModel(
      name: map['name']?.toString() ?? '',
      topicCount: (map['topic_count'] as num?)?.toInt() ?? 0,
    );
  }
}

class LibraryEntryModel {
  const LibraryEntryModel({
    required this.id,
    required this.book,
    required this.readingStatus,
    required this.updatedText,
    required this.chapters,
    required this.primaryGenre,
    required this.secondaryGenre,
    this.lastChapterNumber = 1,
    this.lastParagraphIndex = 0,
    this.chaptersRead = 0,
  });

  final int id;
  final BookCardModel book;
  final String readingStatus;
  final String updatedText;
  final int chapters;
  final String primaryGenre;
  final String secondaryGenre;
  final int lastChapterNumber;
  final int lastParagraphIndex;
  final int chaptersRead;

  /// 0.0–1.0 progress through the book (chapters based).
  double get progressFraction {
    final t = chapters > 0 ? chapters : 0;
    if (t <= 0) {
      return lastChapterNumber > 0 ? 0.2 : 0.08;
    }
    double read = chaptersRead > 0
        ? chaptersRead.toDouble()
        : (lastChapterNumber > 0 ? (lastChapterNumber - 1).toDouble() : 0.0);
    if (lastParagraphIndex > 0) {
      read += (lastParagraphIndex.clamp(0, 20) / 20.0) * 0.85;
    } else if (lastChapterNumber > 0) {
      read += 0.25;
    }
    return (read / t).clamp(0.05, 1.0);
  }

  factory LibraryEntryModel.fromMap(Map<String, dynamic> map) {
    final bookMap = Map<String, dynamic>.from(
      (map['book'] as Map?) ?? const <String, dynamic>{},
    );
    // Flatten API /api/library rows (book fields live at top level).
    if (bookMap['id'] == null && map['book_id'] != null) {
      bookMap['id'] = map['book_id'];
    }
    if (bookMap['id'] == null &&
        map['id'] != null &&
        map['book_id'] == null &&
        map['title'] != null) {
      // rare: id is book id
    }
    for (final k in [
      'title',
      'author',
      'cover_path',
      'accent_hex',
      'description',
      'status_text',
      'rating',
      'primary_genre',
      'secondary_genre',
      'author_user_id',
      'user_id',
    ]) {
      if ((bookMap[k] == null || '${bookMap[k]}'.isEmpty) && map[k] != null) {
        bookMap[k] = map[k];
      }
    }
    // Prefer author_user_id from join
    if (map['author_user_id'] != null) {
      bookMap['author_user_id'] = map['author_user_id'];
    }
    return LibraryEntryModel(
      id: (map['id'] as num?)?.toInt() ?? 0,
      book: BookCardModel.fromMap(bookMap),
      readingStatus: (map['reading_status'] ?? 'Reading').toString(),
      updatedText: (map['updated_text'] ?? '').toString(),
      chapters: (map['chapters'] as num?)?.toInt() ?? 0,
      primaryGenre: (map['primary_genre'] ?? '').toString(),
      secondaryGenre: (map['secondary_genre'] ?? '').toString(),
      lastChapterNumber: (map['last_chapter_number'] as num?)?.toInt() ?? 1,
      lastParagraphIndex: (map['last_paragraph_index'] as num?)?.toInt() ?? 0,
      chaptersRead: (map['chapters_read'] as num?)?.toInt() ?? 0,
    );
  }
}

class WriteScreenModel {
  const WriteScreenModel({
    required this.manageTabs,
    required this.storyTabs,
    required this.filterLabel,
    required this.sortLabel,
    required this.emptyTitle,
    required this.emptyCta,
  });

  final List<String> manageTabs;
  final List<String> storyTabs;
  final String filterLabel;
  final String sortLabel;
  final String emptyTitle;
  final String emptyCta;

  factory WriteScreenModel.fromMap(Map<String, dynamic> map) {
    return WriteScreenModel(
      manageTabs: List<String>.from(
        ((map['manage_tabs'] as List?) ?? const ['Manage Stories', 'Analytics'])
            .map((e) => e.toString()),
      ),
      storyTabs: List<String>.from(
        ((map['story_tabs'] as List?) ?? const ['Published', 'Drafts']).map(
          (e) => e.toString(),
        ),
      ),
      filterLabel: map['filter_label']?.toString() ?? 'All stories',
      sortLabel: map['sort_label']?.toString() ?? 'Recently Updated',
      emptyTitle:
          map['empty_title']?.toString() ??
          "You haven't published any stories yet",
      emptyCta: map['empty_cta']?.toString() ?? 'Write a Story',
    );
  }
}

class NotificationModel {
  const NotificationModel({
    required this.tab,
    required this.title,
    required this.message,
    required this.createdAt,
  });

  final String tab;
  final String title;
  final String message;
  final String createdAt;

  factory NotificationModel.fromMap(Map<String, dynamic> map) {
    return NotificationModel(
      tab: map['tab']?.toString() ?? 'all',
      title: map['title']?.toString() ?? '',
      message: map['message']?.toString() ?? '',
      createdAt: map['created_at']?.toString() ?? '',
    );
  }
}

class MenuSectionModel {
  const MenuSectionModel({required this.section, required this.items});

  final String section;
  final List<MenuItemModel> items;

  factory MenuSectionModel.fromMap(Map<String, dynamic> map) {
    return MenuSectionModel(
      section: map['section'] as String,
      items: (map['items'] as List<dynamic>)
          .map((item) => MenuItemModel.fromMap(item as Map<String, dynamic>))
          .toList(),
    );
  }
}

class MenuItemModel {
  const MenuItemModel({
    required this.label,
    required this.icon,
    required this.route,
  });

  final String label;
  final String icon;
  final String route;

  factory MenuItemModel.fromMap(Map<String, dynamic> map) {
    return MenuItemModel(
      label: map['label'] as String,
      icon: map['icon'] as String,
      route: map['route'] as String,
    );
  }
}

class ProfileModel {
  const ProfileModel({
    this.id,
    required this.displayName,
    required this.username,
    required this.photoUrl,
    required this.coverUrl,
    required this.following,
    required this.followers,
    required this.blocked,
    required this.chaptersRead,
    required this.socialKarma,
    required this.dayStreak,
    required this.readingLists,
    this.isAuthor = false,
    this.bio = '',
    this.gender = '',
    this.birthDate = '',
    this.country = '',
    this.facebookUrl = '',
    this.youtubeUrl = '',
    this.instagramUrl = '',
    this.twitterUrl = '',
  });

  final int? id;
  final String displayName;
  final String username;
  final String photoUrl;
  final String coverUrl;
  final int following;
  final int followers;
  final int blocked;
  final int chaptersRead;
  final int socialKarma;
  final int dayStreak;
  final List<ReadingListModel> readingLists;
  final bool isAuthor;
  final String bio;
  final String gender;
  final String birthDate;
  final String country;
  final String facebookUrl;
  final String youtubeUrl;
  final String instagramUrl;
  final String twitterUrl;

  factory ProfileModel.fromMap(Map<String, dynamic> map) {
    return ProfileModel(
      id: (map['id'] as num?)?.toInt(),
      displayName: map['display_name']?.toString() ?? 'Reader',
      username: map['username']?.toString() ?? '@reader',
      photoUrl: map['photo_url']?.toString() ?? '',
      coverUrl: map['cover_url']?.toString() ?? '',
      following: (map['following'] as num?)?.toInt() ?? 0,
      followers: (map['followers'] as num?)?.toInt() ?? 0,
      blocked: (map['blocked'] as num?)?.toInt() ?? 0,
      chaptersRead: (map['chapters_read'] as num?)?.toInt() ?? 0,
      socialKarma: (map['social_karma'] as num?)?.toInt() ?? 0,
      dayStreak: (map['day_streak'] as num?)?.toInt() ?? 0,
      readingLists: ((map['reading_lists'] as List?) ?? const <dynamic>[])
          .whereType<Map>()
          .map(
            (item) => ReadingListModel.fromMap(Map<String, dynamic>.from(item)),
          )
          .toList(),
      isAuthor:
          (map['is_author'] == true ||
          map['is_author'] == 1 ||
          map['is_author'] == '1'),
      bio: map['bio']?.toString() ?? '',
      gender: map['gender']?.toString() ?? '',
      birthDate:
          map['birth_date']?.toString() ?? map['birthDate']?.toString() ?? '',
      country: map['country']?.toString() ?? '',
      facebookUrl: map['facebook_url']?.toString() ?? '',
      youtubeUrl: map['youtube_url']?.toString() ?? '',
      instagramUrl: map['instagram_url']?.toString() ?? '',
      twitterUrl: map['twitter_url']?.toString() ?? '',
    );
  }
}

class ReadingListModel {
  const ReadingListModel({
    required this.id,
    required this.name,
    required this.storyCount,
    required this.coverPath,
  });

  final int id;
  final String name;
  final int storyCount;
  final String coverPath;

  factory ReadingListModel.fromMap(Map<String, dynamic> map) {
    return ReadingListModel(
      id: (map['id'] as num?)?.toInt() ?? 0,
      name: map['name'] as String,
      storyCount: (map['story_count'] as num?)?.toInt() ?? 0,
      coverPath: map['cover_path'] as String? ?? '',
    );
  }
}

class AchievementGroupModel {
  const AchievementGroupModel({required this.groupName, required this.items});

  final String groupName;
  final List<AchievementItemModel> items;

  factory AchievementGroupModel.fromMap(Map<String, dynamic> map) {
    return AchievementGroupModel(
      groupName: map['group_name'] as String,
      items: (map['items'] as List<dynamic>)
          .map(
            (item) =>
                AchievementItemModel.fromMap(item as Map<String, dynamic>),
          )
          .toList(),
    );
  }
}

class AchievementItemModel {
  const AchievementItemModel({
    required this.title,
    required this.subtitle,
    required this.progressLabel,
    required this.badgeValue,
    required this.style,
  });

  final String title;
  final String subtitle;
  final String progressLabel;
  final String badgeValue;
  final String style;

  factory AchievementItemModel.fromMap(Map<String, dynamic> map) {
    return AchievementItemModel(
      title: map['title'] as String,
      subtitle: map['subtitle'] as String,
      progressLabel: map['progress_label'] as String,
      badgeValue: map['badge_value'] as String,
      style: map['style'] as String,
    );
  }
}
