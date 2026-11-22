import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_mobile_app/data/services/api_service.dart';
import 'package:novel_mobile_app/ui/screens/story_manage_screen.dart';

class _StoryManageApiService extends ApiService {
  _StoryManageApiService({required this.chapters, this.storyStatus = 'Draft'});

  final List<Map<String, dynamic>> chapters;
  final String storyStatus;
  final deletedChapterIds = <int>[];
  int deletedStories = 0;

  @override
  Future<Map<String, dynamic>?> fetchWriterStory(int id) async => {
    'id': id,
    'title': 'Test Story',
    'status_text': storyStatus,
  };

  @override
  Future<List<Map<String, dynamic>>> fetchStoryChapters(int storyId) async =>
      List<Map<String, dynamic>>.from(chapters);

  @override
  Future<void> deleteStoryChapter(int chapterId) async {
    deletedChapterIds.add(chapterId);
    chapters.removeWhere((chapter) => chapter['id'] == chapterId);
  }

  @override
  Future<void> deleteWriterStory(int id) async {
    deletedStories++;
  }
}

void main() {
  Future<void> openChapterMenu(WidgetTester tester) async {
    await tester.tap(find.byIcon(Icons.more_vert).first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete Chapter'));
    await tester.pumpAndSettle();
  }

  testWidgets('draft chapters can be deleted from the chapter options menu', (
    tester,
  ) async {
    final apiService = _StoryManageApiService(
      chapters: [
        {
          'id': 12,
          'chapter_number': 1,
          'title': 'Chapter 1',
          'submission_status': 'draft',
          'content': 'Draft content',
        },
      ],
    );
    await tester.pumpWidget(
      MaterialApp(
        home: StoryManageScreen(
          apiService: apiService,
          story: const {'id': 4, 'title': 'Test Story', 'status_text': 'Draft'},
        ),
      ),
    );
    await tester.pumpAndSettle();

    await openChapterMenu(tester);
    expect(find.text('Delete chapter?'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Delete Chapter'));
    await tester.pumpAndSettle();

    expect(apiService.deletedChapterIds, [12]);
    expect(find.text('Chapter 1'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('published chapters show the required delete warning', (
    tester,
  ) async {
    final apiService = _StoryManageApiService(
      storyStatus: 'Ongoing',
      chapters: [
        {
          'id': 13,
          'chapter_number': 1,
          'title': 'Chapter 1',
          'submission_status': 'published',
          'content': 'Published content',
        },
      ],
    );
    await tester.pumpWidget(
      MaterialApp(
        home: StoryManageScreen(
          apiService: apiService,
          story: const {
            'id': 4,
            'title': 'Test Story',
            'status_text': 'Ongoing',
          },
        ),
      ),
    );
    await tester.pumpAndSettle();

    await openChapterMenu(tester);

    expect(
      find.text(
        'Published chapters cannot be deleted directly. Please unpublish the chapter first.',
      ),
      findsOneWidget,
    );
    expect(apiService.deletedChapterIds, isEmpty);
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets('story deletion is blocked until every chapter is removed', (
    tester,
  ) async {
    final apiService = _StoryManageApiService(
      chapters: [
        {
          'id': 14,
          'chapter_number': 1,
          'title': 'Chapter 1',
          'submission_status': 'draft',
          'content': 'Draft content',
        },
      ],
    );
    await tester.pumpWidget(
      MaterialApp(
        home: StoryManageScreen(
          apiService: apiService,
          story: const {'id': 4, 'title': 'Test Story', 'status_text': 'Draft'},
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.more_vert).last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete Story'));
    await tester.pumpAndSettle();

    expect(find.text('Delete chapters first'), findsOneWidget);
    expect(apiService.deletedStories, 0);
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets('story can be deleted after its final chapter is removed', (
    tester,
  ) async {
    final apiService = _StoryManageApiService(
      chapters: [
        {
          'id': 15,
          'chapter_number': 1,
          'title': 'Chapter 1',
          'submission_status': 'draft',
          'content': 'Draft content',
        },
      ],
    );
    await tester.pumpWidget(
      MaterialApp(
        home: StoryManageScreen(
          apiService: apiService,
          story: const {'id': 4, 'title': 'Test Story', 'status_text': 'Draft'},
        ),
      ),
    );
    await tester.pumpAndSettle();

    await openChapterMenu(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Delete Chapter'));
    await tester.pumpAndSettle();
    expect(apiService.deletedChapterIds, [15]);
    expect(find.text('Chapter 1'), findsNothing);

    await tester.tap(find.byIcon(Icons.more_vert).last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete Story'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Delete Story'));
    await tester.pumpAndSettle();

    expect(apiService.deletedStories, 1);
    expect(tester.takeException(), isNull);
  });
}
