import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/journal/public_journal_models.dart';

void main() {
  test('public journal entry parses photos, residents, and comments', () {
    final entry = PublicJournalEntry.fromMap({
      'id': 'entry-1',
      'title': '曬太陽',
      'body': '今天很放鬆',
      'journalDate': '2026-10-28T00:00:00.000Z',
      'authorId': 'author-1',
      'authorName': '小苔',
      'shareToken': 'token-1',
      'photos': [
        {'path': 'a.jpg', 'caption': '午后', 'url': 'https://example.com/a.jpg'},
        {'path': '', 'caption': 'ignored', 'url': null},
      ],
      'residents': [
        {'name': '阿龜', 'speciesLabel': '赫曼陸龜', 'avatarColor': '#7C9A76', 'token': 'resident-1'},
      ],
      'likeCount': 3,
      'liked': true,
      'following': false,
      'blocked': false,
      'commentCount': 1,
      'comments': [
        {
          'id': 'comment-1',
          'body': '好可愛',
          'createdAt': '2026-10-28T10:00:00.000Z',
          'authorName': '苔友',
        },
      ],
    });

    expect(entry.dateLabel, '2026-10-28');
    expect(entry.photos, hasLength(1));
    expect(entry.photos.single.caption, '午后');
    expect(entry.coverUrl, 'https://example.com/a.jpg');
    expect(entry.residents.single.speciesLabel, '赫曼陸龜');
    expect(entry.comments.single.body, '好可愛');
    expect(entry.publicUrl, contains('/s/token-1'));
  });

  test('copyWith updates social state without losing content', () {
    final entry = PublicJournalEntry.fromMap({
      'id': 'entry-1',
      'title': '標題',
      'journalDate': '2026-10-28',
      'authorId': 'author-1',
      'authorName': '小苔',
      'shareToken': 'token-1',
    });

    final updated = entry.copyWith(liked: true, likeCount: 4, following: true);
    expect(updated.liked, isTrue);
    expect(updated.likeCount, 4);
    expect(updated.following, isTrue);
    expect(updated.title, '標題');
    expect(updated.authorName, '小苔');
  });

  test('moderation report labels and fallback title', () {
    final report = ModerationReport.fromMap({
      'id': 'report-1',
      'reason': '不當內容',
      'status': 'reviewed',
      'createdAt': '2026-10-28T10:00:00.000Z',
      'reporterName': '苔友',
    });

    expect(report.statusLabel, '已處理');
    expect(report.displayTitle, '已刪除的旅程');
  });
}
