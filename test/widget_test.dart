import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:novel_mobile_app/data/models/app_bootstrap.dart';
import 'package:novel_mobile_app/ui/screens/edit_chapter_screen.dart';
import 'package:novel_mobile_app/ui/screens/discover_screen.dart';
import 'package:novel_mobile_app/ui/screens/hashtag_detail_screen.dart';
import 'package:novel_mobile_app/ui/screens/more_settings_pages.dart';
import 'package:novel_mobile_app/ui/screens/profile_screen.dart';
import 'package:novel_mobile_app/ui/screens/write_screen.dart';
import 'package:novel_mobile_app/data/services/api_service.dart';
import 'package:novel_mobile_app/ui/widgets/app_notice.dart';
import 'package:novel_mobile_app/ui/widgets/wingsaga_loading_screen.dart';

void main() {
  testWidgets('search landing shows five searches for the selected scope', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({
      'auth_id': 77,
      'search_hist_title_v1_u77': [
        'Title one',
        'Title two',
        'Title three',
        'Title four',
        'Title five',
      ],
      'search_hist_tag_v1_u77': ['Tag one', 'Tag two', 'Tag three'],
      'search_hist_profile_v1_u77': ['Profile one', 'Profile two'],
    });
    addTearDown(() => SharedPreferences.setMockInitialValues({}));
    tester.view.physicalSize = const Size(420, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(home: SearchScreen(apiService: ApiService())),
    );
    await tester.pumpAndSettle();

    for (final term in [
      'Title one',
      'Title two',
      'Title three',
      'Title four',
      'Title five',
    ]) {
      expect(find.text(term), findsOneWidget);
    }
    expect(find.text('Tag one'), findsNothing);
    expect(find.text('Profile one'), findsNothing);
    expect(find.text('No recent searches yet'), findsNothing);
    await tester.tap(find.text('Tag'));
    await tester.pumpAndSettle();
    expect(find.text('Tag one'), findsOneWidget);
    expect(find.text('Tag two'), findsOneWidget);
    expect(find.text('Tag three'), findsOneWidget);
    expect(find.text('Title one'), findsNothing);
    await tester.tap(find.text('Profile'));
    await tester.pumpAndSettle();
    expect(find.text('Profile one'), findsOneWidget);
    expect(find.text('Profile two'), findsOneWidget);
    expect(find.text('Title one'), findsNothing);
    expect(find.text('Tag one'), findsNothing);
  });

  testWidgets('viewing an author loads that user’s stories, not my stories', (
    tester,
  ) async {
    final apiService = _ViewedAuthorApiService();
    await tester.pumpWidget(
      MaterialApp(
        home: ProfileScreen(
          profile: const ProfileModel(
            id: 22,
            displayName: 'Author Owner',
            username: 'authorowner',
            photoUrl: '',
            coverUrl: '',
            following: 0,
            followers: 0,
            blocked: 0,
            chaptersRead: 0,
            socialKarma: 0,
            dayStreak: 0,
            readingLists: [],
          ),
          apiService: apiService,
          achievements: const [],
          viewingUserId: 22,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(apiService.requestedPublicUserIds, contains(22));
    expect(apiService.fetchWriterStoriesCount, 0);
    expect(find.text('Follow'), findsOneWidget);
  });

  testWidgets('branded loading state uses light welcome art and spinner', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(const MaterialApp(home: WingsagaLoadingScreen()));

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    final lightArtwork = tester.widget<Image>(find.byType(Image).first);
    expect(
      (lightArtwork.image as AssetImage).assetName,
      'assets/images/wingsaga_welcome_light.jpeg',
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Theme(
          data: ThemeData(brightness: Brightness.dark),
          child: const WingsagaLoadingScreen(),
        ),
      ),
    );
    final darkArtwork = tester.widget<Image>(find.byType(Image).first);
    expect(
      (darkArtwork.image as AssetImage).assetName,
      'assets/images/wingsaga_welcome_dark.jpeg',
    );
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('app notice can be shown and dismissed', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () => showAppNotice(
                  context,
                  'Upload failed',
                  type: AppNoticeType.error,
                ),
                child: const Text('Show notice'),
              ),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Show notice'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 350));
    expect(find.text('Upload failed'), findsOneWidget);

    await tester.tap(find.byTooltip('Dismiss notification'));
    await tester.pump();
    expect(find.text('Upload failed'), findsNothing);
  });

  testWidgets('account deactivation requires password and signs out', (
    WidgetTester tester,
  ) async {
    final apiService = _LifecycleApiService();
    var signedOut = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => ProfileManagementScreen(
                    apiService: apiService,
                    onSignOut: () async => signedOut = true,
                  ),
                ),
              ),
              child: const Text('Open profile management'),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Open profile management'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Deactivate account'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'correct-password');
    await tester.tap(find.widgetWithText(FilledButton, 'Deactivate'));
    await tester.pumpAndSettle();

    expect(apiService.deactivationPassword, 'correct-password');
    expect(signedOut, isTrue);
    expect(find.text('Open profile management'), findsOneWidget);
  });

  testWidgets('account deletion is scheduled, then the user is signed out', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(320, 600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final apiService = _LifecycleApiService();
    var signedOut = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => ProfileManagementScreen(
                    apiService: apiService,
                    onSignOut: () async => signedOut = true,
                  ),
                ),
              ),
              child: const Text('Open profile management'),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Open profile management'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete account'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.enterText(find.byType(TextField), 'correct-password');
    await tester.tap(find.widgetWithText(FilledButton, 'Delete account'));
    await tester.pumpAndSettle();

    expect(apiService.deletionPassword, 'correct-password');
    expect(signedOut, isTrue);
    expect(find.text('Open profile management'), findsOneWidget);
  });

  testWidgets('account lifecycle API failures stop the busy indicator', (
    WidgetTester tester,
  ) async {
    final apiService = _LifecycleApiService()
      ..deactivationError = const ApiRequestException(
        401,
        'Incorrect password',
      );
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => ProfileManagementScreen(
                    apiService: apiService,
                    onSignOut: () async {},
                  ),
                ),
              ),
              child: const Text('Open profile management'),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Open profile management'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Deactivate account'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'wrong-password');
    await tester.tap(find.widgetWithText(FilledButton, 'Deactivate'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Incorrect password'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(find.text('Deactivate account'), findsOneWidget);
  });

  testWidgets('username save finishes without a profile menu assertion', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(360, 1200);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final apiService = _LifecycleApiService();
    await tester.pumpWidget(
      MaterialApp(
        home: ProfileScreen(
          profile: const ProfileModel(
            id: 7,
            displayName: 'Reader',
            username: 'reader',
            photoUrl: '',
            coverUrl: '',
            following: 0,
            followers: 0,
            blocked: 0,
            chaptersRead: 0,
            socialKarma: 0,
            dayStreak: 0,
            readingLists: [],
          ),
          apiService: apiService,
          achievements: const <AchievementGroupModel>[],
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    final initialMeRequests = apiService.fetchMeCount;
    final initialReadingListRequests = apiService.fetchReadingListsCount;

    await tester.tap(find.byIcon(Icons.more_vert));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.tap(find.text('Profile settings'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);

    expect(find.text('Profile settings'), findsOneWidget);
    final usernameField = find.byWidgetPredicate(
      (widget) =>
          widget is TextField && widget.decoration?.labelText == 'Username *',
    );
    await tester.enterText(usernameField, 'reader_new');
    await tester.ensureVisible(find.text('Save'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(find.text('Change username?'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Confirm'));
    await tester.pumpAndSettle();

    expect(apiService.updatedProfile?['username'], 'reader_new');
    expect(apiService.fetchMeCount, initialMeRequests);
    expect(apiService.fetchReadingListsCount, initialReadingListRequests);
    expect(tester.takeException(), isNull);
    await tester.pump(const Duration(seconds: 6));
  });

  testWidgets('profile and editor fit a compact viewport', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        home: ProfileScreen(
          profile: const ProfileModel(
            id: 7,
            displayName: 'Reader',
            username: 'reader',
            photoUrl: '',
            coverUrl: '',
            following: 0,
            followers: 0,
            blocked: 0,
            chaptersRead: 0,
            socialKarma: 0,
            dayStreak: 0,
            readingLists: [],
          ),
          apiService: _LifecycleApiService(),
          achievements: const <AchievementGroupModel>[],
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);

    await tester.tap(find.byIcon(Icons.more_vert));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Profile settings'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('Save'), findsOneWidget);

    await tester.scrollUntilVisible(
      find.text('Save'),
      200,
      scrollable: find
          .descendant(
            of: find.byType(SingleChildScrollView).last,
            matching: find.byType(Scrollable),
          )
          .first,
    );
    expect(tester.getRect(find.text('Save')).bottom, lessThanOrEqualTo(640));
    expect(tester.takeException(), isNull);
  });

  test('story with any published chapters appears only in Published tab', () {
    final story = <String, dynamic>{
      'id': 42,
      'title': 'Mixed story',
      'status_text': 'Ongoing',
      'published_chapter_count': 2,
      'draft_chapter_count': 1,
    };

    expect(storyMatchesWriteTab(story, 0), isTrue);
    expect(storyMatchesWriteTab(story, 1), isFalse);
  });

  test('chapter publishing requires every earlier chapter to be published', () {
    expect(
      firstUnpublishedChapterNumber(chapters: const [], chapterNumber: 2),
      1,
    );
    expect(
      firstUnpublishedChapterNumber(
        chapters: [
          {'chapter_number': 1, 'submission_status': 'draft'},
          {'chapter_number': 2, 'submission_status': 'published'},
        ],
        chapterNumber: 3,
      ),
      1,
    );
    expect(
      firstUnpublishedChapterNumber(
        chapters: [
          {'chapter_number': 1, 'submission_status': 'published'},
          {'chapter_number': 2, 'submission_status': 'submitted'},
        ],
        chapterNumber: 3,
      ),
      2,
    );
    expect(
      firstUnpublishedChapterNumber(
        chapters: [
          {'chapter_number': 1, 'submission_status': 'published'},
          {'chapter_number': 2, 'submission_status': 'scheduled'},
        ],
        chapterNumber: 3,
      ),
      2,
    );
    expect(
      firstUnpublishedChapterNumber(
        chapters: [
          {'chapter_number': 1, 'submission_status': 'published'},
          {'chapter_number': 2, 'submission_status': 'ongoing'},
        ],
        chapterNumber: 3,
      ),
      isNull,
    );
  });

  test('hashtag cover prefers admin tag artwork when available', () {
    final tagMeta = <String, dynamic>{
      'name': 'romance',
      'cover_path': '/uploads/tag-cover.jpg',
      'description': 'Popular romance stories',
    };
    final books = [
      <String, dynamic>{'cover_path': '/uploads/book-cover.jpg'},
    ];

    expect(
      HashtagDetailScreen.resolveTagCover(tagMeta, books),
      '/uploads/tag-cover.jpg',
    );
  });

  test(
    'hashtag cover falls back to first story cover when tag book art is empty',
    () {
      final tagMeta = <String, dynamic>{'name': 'romance', 'cover_path': ''};
      final books = [
        <String, dynamic>{'cover_path': '/uploads/fallback-book.jpg'},
      ];

      expect(
        HashtagDetailScreen.resolveTagCover(tagMeta, books),
        '/uploads/fallback-book.jpg',
      );
    },
  );
}

class _LifecycleApiService extends ApiService {
  String? deactivationPassword;
  String? deletionPassword;
  Map<String, dynamic>? updatedProfile;
  Object? deactivationError;
  int fetchMeCount = 0;
  int fetchReadingListsCount = 0;

  @override
  Future<Map<String, dynamic>> fetchMe() async {
    fetchMeCount++;
    return {'display_name': 'Reader', 'username': 'reader'};
  }

  @override
  Future<List<Map<String, dynamic>>> fetchWriterStories() async => [];

  @override
  Future<List<Map<String, dynamic>>> fetchUserWall(int userId) async => [];

  @override
  Future<List<Map<String, dynamic>>> fetchMyReviews() async => [];

  @override
  Future<List<Map<String, dynamic>>> fetchReadingLists() async {
    fetchReadingListsCount++;
    return [];
  }

  @override
  Future<List<Map<String, dynamic>>> fetchMyActivity() async => [];

  @override
  Future<Map<String, dynamic>> updateMe(Map<String, dynamic> payload) async {
    updatedProfile = Map<String, dynamic>.from(payload);
    return {...payload, 'username_change_count': 1};
  }

  @override
  Future<void> deactivateMyAccount({required String password}) async {
    deactivationPassword = password;
    if (deactivationError != null) throw deactivationError!;
  }

  @override
  Future<Map<String, dynamic>> deleteMyAccount({
    required String password,
  }) async {
    deletionPassword = password;
    return const {'deletion_scheduled': true};
  }
}

class _ViewedAuthorApiService extends ApiService {
  final requestedPublicUserIds = <int>[];
  int fetchWriterStoriesCount = 0;

  @override
  Future<Map<String, dynamic>> fetchMe() async => {
    'id': 11,
    'display_name': 'Logged In Reader',
    'username': 'reader11',
  };

  @override
  Future<Map<String, dynamic>> fetchProfile(int userId) async => {
    'id': userId,
    'display_name': 'Author Owner',
    'username': 'authorowner',
    'photo_url': '',
    'cover_url': '',
    'is_author': true,
  };

  @override
  Future<List<Map<String, dynamic>>> fetchUserStories(int userId) async {
    requestedPublicUserIds.add(userId);
    return [
      {'id': 90, 'title': 'Author owner story', 'status_text': 'Ongoing'},
    ];
  }

  @override
  Future<List<Map<String, dynamic>>> fetchWriterStories() async {
    fetchWriterStoriesCount++;
    return [
      {'id': 91, 'title': 'Logged-in reader story', 'status_text': 'Ongoing'},
    ];
  }

  @override
  Future<List<Map<String, dynamic>>> fetchUserWall(int userId) async => [];

  @override
  Future<List<Map<String, dynamic>>> fetchUserReviews(int userId) async => [];

  @override
  Future<List<Map<String, dynamic>>> fetchUserReadingLists(int userId) async =>
      [];

  @override
  Future<List<Map<String, dynamic>>> fetchUserActivity(int userId) async => [];

  @override
  Future<bool> fetchBlockStatus(int userId) async => false;

  @override
  Future<Map<String, dynamic>> fetchAuthorFollowStatus(int authorId) async => {
    'following': false,
  };
}
